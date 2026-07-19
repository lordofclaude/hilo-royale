const crypto = require("node:crypto");
const { buildVoteTranscript, recordSolanaSettlement, verifyVoteProof } = require("../lib/settlement");

const ROOM_TTL_SECONDS = 24 * 60 * 60;
const SETTLEMENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const PLAYER_ACTIVE_MS = 15 * 60 * 1000;
const MAX_PLAYERS = 100;
const ALLOWED_ORIGINS = new Set([
  "https://hilo-royale.vercel.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

function cors(req, res) {
  const origin = req.headers?.origin;
  const previewOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  if (origin && !ALLOWED_ORIGINS.has(origin) && origin !== previewOrigin) return false;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return true;
}

function roomId(value) {
  const normalized = String(value || "");
  return /^[A-Za-z0-9_-]{1,64}$/.test(normalized) ? normalized : "";
}

function storageConfig() {
  const url = String(process.env.KV_REST_API_URL || "").replace(/\/$/, "");
  const token = String(process.env.KV_REST_API_TOKEN || "");
  const secret = String(process.env.ROOM_SIGNING_SECRET || "");
  return url && token && secret ? { url, token, secret } : null;
}

async function redis(config, args) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`storage-http-${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error("storage-command-failed");
  return body.result;
}

function hashEntries(value) {
  if (!value) return [];
  if (!Array.isArray(value)) return Object.entries(value);
  const entries = [];
  for (let i = 0; i < value.length; i += 2) entries.push([String(value[i]), value[i + 1]]);
  return entries;
}

function parseRecord(value) {
  try { return JSON.parse(String(value)); } catch { return null; }
}

function playersKey(id) { return `hilo:room:${id}:players`; }
function resultsKey(id) { return `hilo:room:${id}:results`; }
function picksKey(id, fixtureId, round) { return `hilo:room:${id}:picks:${fixtureId}:${round}`; }
function settlementsKey(id, fixtureId) { return `hilo:room:${id}:settlements:${fixtureId}`; }
function settlementLockKey(id, fixtureId, round) { return `hilo:room:${id}:settlement-lock:${fixtureId}:${round}`; }

async function snapshot(config, id) {
  const [rawPlayers, rawResults] = await Promise.all([
    redis(config, ["HGETALL", playersKey(id)]),
    redis(config, ["HGETALL", resultsKey(id)]),
  ]);
  const cutoff = Date.now() - PLAYER_ACTIVE_MS;
  const players = hashEntries(rawPlayers)
    .map(([, value]) => parseRecord(value))
    .filter(player => player && Number(player.lastSeen) >= cutoff)
    .map(({ lastSeen, ...player }) => player)
    .sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)))
    .slice(0, MAX_PLAYERS);
  const results = hashEntries(rawResults)
    .map(([, value]) => parseRecord(value))
    .filter(Boolean)
    .sort((a, b) => Number(b.pts) - Number(a.pts))
    .slice(0, MAX_PLAYERS);
  return { ok: true, roomId: id, players, results, updatedAt: new Date().toISOString() };
}

function signSession(config, value) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = crypto.createHmac("sha256", config.secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(config, token, expectedRoom) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", config.secret).update(payload).digest("base64url");
  const left = Buffer.from(signature), right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return value.roomId === expectedRoom && Number(value.exp) > Date.now() ? value : null;
  } catch { return null; }
}

async function rateLimit(config, req) {
  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim().slice(0, 80);
  const key = `hilo:rate:${ip}:${Math.floor(Date.now() / 60000)}`;
  const count = Number(await redis(config, ["INCR", key]));
  if (count === 1) await redis(config, ["EXPIRE", key, 90]);
  return count <= 120;
}

function requestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(String(req.body || "{}")); } catch { return null; }
}

async function join(config, req, res, body) {
  const id = roomId(body.roomId);
  const playerKey = String(body.playerKey || "").slice(0, 160);
  const name = String(body.name || "").trim().slice(0, 32);
  if (!id || !playerKey || !name) { send(res, 400, { ok: false, reason: "invalid-join" }); return; }
  if (!(await rateLimit(config, req))) { send(res, 429, { ok: false, reason: "rate-limited" }); return; }
  const playerId = crypto.createHash("sha256").update(`${id}\0${playerKey}`).digest("hex").slice(0, 20);
  const existing = parseRecord(await redis(config, ["HGET", playersKey(id), playerId]));
  const rawPlayers = await redis(config, ["HLEN", playersKey(id)]);
  if (!existing && Number(rawPlayers) >= MAX_PLAYERS) { send(res, 409, { ok: false, reason: "room-full" }); return; }
  const now = Date.now();
  const player = { id: playerId, name, joinedAt: existing?.joinedAt || new Date(now).toISOString(), lastSeen: now };
  await redis(config, ["HSET", playersKey(id), playerId, JSON.stringify(player)]);
  await redis(config, ["EXPIRE", playersKey(id), ROOM_TTL_SECONDS]);
  const sessionToken = signSession(config, { roomId: id, playerId, name, exp: now + ROOM_TTL_SECONDS * 1000 });
  send(res, 200, { ...(await snapshot(config, id)), sessionToken, playerId });
}

async function submitPick(config, req, res, body) {
  const id = roomId(body.roomId);
  const session = id && verifySession(config, body.sessionToken, id);
  const fixtureId = String(body.fixtureId || "");
  const round = Number(body.round);
  const questionId = String(body.questionId || "").slice(0, 120);
  const pick = body.pick === "hi" || body.pick === "lo" ? body.pick : "";
  if (!session || !/^\d{6,12}$/.test(fixtureId) || !Number.isInteger(round) || round < 1 || round > 64 || !questionId || !pick) {
    send(res, 400, { ok: false, reason: "invalid-pick" }); return;
  }
  if (!(await rateLimit(config, req))) { send(res, 429, { ok: false, reason: "rate-limited" }); return; }
  const record = {
    playerId: session.playerId,
    fixtureId,
    round,
    questionId,
    pick,
    msRemaining: Math.max(0, Math.min(60000, Number(body.msRemaining) || 0)),
    lockedAt: new Date().toISOString(),
  };
  const key = picksKey(id, fixtureId, round);
  const accepted = Number(await redis(config, ["HSETNX", key, session.playerId, JSON.stringify(record)])) === 1;
  await redis(config, ["EXPIRE", key, ROOM_TTL_SECONDS]);
  send(res, accepted ? 201 : 409, { ok: accepted, accepted, reason: accepted ? undefined : "pick-already-locked", lockedAt: record.lockedAt });
}

async function submitResult(config, req, res, body) {
  const id = roomId(body.roomId);
  const session = id && verifySession(config, body.sessionToken, id);
  const fixtureId = String(body.fixtureId || "");
  const result = body.result || {};
  if (!session || !/^\d{6,12}$/.test(fixtureId)) { send(res, 400, { ok: false, reason: "invalid-result" }); return; }
  if (!(await rateLimit(config, req))) { send(res, 429, { ok: false, reason: "rate-limited" }); return; }
  const record = {
    playerId: session.playerId,
    name: session.name,
    fixtureId,
    pts: Math.max(0, Math.min(20000, Number(result.pts) || 0)),
    streak: Math.max(0, Math.min(64, Number(result.streak) || 0)),
    outlivedCount: Math.max(0, Math.min(99, Number(result.outlivedCount) || 0)),
    won: Boolean(result.won),
    finishedAt: new Date().toISOString(),
  };
  await redis(config, ["HSET", resultsKey(id), session.playerId, JSON.stringify(record)]);
  await redis(config, ["EXPIRE", resultsKey(id), ROOM_TTL_SECONDS]);
  send(res, 201, { ok: true, result: record });
}

function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 64 ? round : 0;
}

async function storedSettlement(config, id, fixtureId, round) {
  return parseRecord(await redis(config, ["HGET", settlementsKey(id, fixtureId), String(round)]));
}

async function settleRound(config, req, res, body) {
  const id = roomId(body.roomId);
  const session = id && verifySession(config, body.sessionToken, id);
  const fixtureId = String(body.fixtureId || "");
  const round = validRound(body.round);
  const answer = body.answer === "hi" || body.answer === "lo" || body.answer === "push" ? body.answer : "";
  if (!session || !/^\d{6,12}$/.test(fixtureId) || !round || !answer) {
    send(res, 400, { ok: false, reason: "invalid-settlement" }); return;
  }
  if (!(await rateLimit(config, req))) { send(res, 429, { ok: false, reason: "rate-limited" }); return; }
  if (!process.env.SOLANA_SETTLEMENT_SECRET) { send(res, 503, { ok: false, reason: "solana-not-configured" }); return; }

  const existing = await storedSettlement(config, id, fixtureId, round);
  if (existing) {
    if (existing.answer !== answer) { send(res, 409, { ok: false, reason: "settlement-answer-conflict" }); return; }
    send(res, 200, { ok: true, settlement: existing, idempotent: true }); return;
  }

  const lockKey = settlementLockKey(id, fixtureId, round);
  const lockToken = crypto.randomBytes(16).toString("hex");
  const acquired = await redis(config, ["SET", lockKey, lockToken, "NX", "EX", "30"]);
  if (acquired !== "OK") {
    const raced = await storedSettlement(config, id, fixtureId, round);
    if (raced && raced.answer !== answer) { send(res, 409, { ok: false, reason: "settlement-answer-conflict" }); return; }
    send(res, raced ? 200 : 409, raced
      ? { ok: true, settlement: raced, idempotent: true }
      : { ok: false, reason: "settlement-in-progress" });
    return;
  }

  try {
    const rawPicks = await redis(config, ["HGETALL", picksKey(id, fixtureId, round)]);
    const picks = hashEntries(rawPicks).map(([, value]) => parseRecord(value)).filter(Boolean);
    if (!picks.length) { send(res, 409, { ok: false, reason: "no-locked-picks" }); return; }
    const transcript = buildVoteTranscript(id, picks);
    if (!transcript.entries.every(entry => verifyVoteProof(id, entry, transcript.root))) {
      throw new Error("settlement-proof-failed");
    }
    const counts = transcript.entries.reduce((value, entry) => {
      value[entry.pick] += 1;
      return value;
    }, { hi: 0, lo: 0 });
    const chain = await recordSolanaSettlement({
      roomId: id,
      fixtureId,
      round,
      answer,
      hi: counts.hi,
      lo: counts.lo,
      root: transcript.root,
    });
    const settlement = {
      version: 1,
      roomId: id,
      roomHash: crypto.createHash("sha256").update(id).digest("hex").slice(0, 16),
      fixtureId,
      round,
      answer,
      counts: { ...counts, total: transcript.entries.length },
      root: transcript.root,
      entries: transcript.entries,
      signature: chain.signature,
      payer: chain.payer,
      memo: chain.memo,
      network: chain.network,
      explorerUrl: chain.explorerUrl,
      settledAt: new Date().toISOString(),
    };
    const key = settlementsKey(id, fixtureId);
    const accepted = Number(await redis(config, ["HSETNX", key, String(round), JSON.stringify(settlement)])) === 1;
    await redis(config, ["EXPIRE", key, SETTLEMENT_TTL_SECONDS]);
    const finalSettlement = accepted ? settlement : await storedSettlement(config, id, fixtureId, round);
    send(res, accepted ? 201 : 200, { ok: true, settlement: finalSettlement, idempotent: !accepted });
  } finally {
    const currentLock = await redis(config, ["GET", lockKey]).catch(() => null);
    if (currentLock === lockToken) await redis(config, ["DEL", lockKey]).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (!cors(req, res)) { send(res, 403, { ok: false, reason: "origin-denied" }); return; }
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  const config = storageConfig();
  if (!config) { send(res, 503, { ok: false, reason: "storage-not-configured" }); return; }
  try {
    if (req.method === "GET") {
      const id = roomId(req.query?.roomId);
      if (!id) { send(res, 400, { ok: false, reason: "invalid-room" }); return; }
      const fixtureId = String(req.query?.fixtureId || "");
      const round = validRound(req.query?.round);
      if (fixtureId || round) {
        if (!/^\d{6,12}$/.test(fixtureId) || !round) { send(res, 400, { ok: false, reason: "invalid-settlement-query" }); return; }
        const settlement = await storedSettlement(config, id, fixtureId, round);
        send(res, settlement ? 200 : 404, settlement ? { ok: true, settlement } : { ok: false, reason: "settlement-not-found" });
        return;
      }
      send(res, 200, await snapshot(config, id));
      return;
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET,POST,OPTIONS"); send(res, 405, { ok: false, reason: "method-not-allowed" }); return; }
    const body = requestBody(req);
    if (!body) { send(res, 400, { ok: false, reason: "invalid-json" }); return; }
    if (body.action === "join") { await join(config, req, res, body); return; }
    if (body.action === "pick") { await submitPick(config, req, res, body); return; }
    if (body.action === "result") { await submitResult(config, req, res, body); return; }
    if (body.action === "settle") { await settleRound(config, req, res, body); return; }
    send(res, 400, { ok: false, reason: "invalid-action" });
  } catch (error) {
    send(res, 503, { ok: false, reason: String(error?.message || "storage-unavailable").slice(0, 80) });
  }
}
