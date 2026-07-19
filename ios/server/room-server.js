/* Minimal Hi-Lo Royale presence service. Node 20+, no dependencies.
 * Deploy behind HTTPS and set EXPO_PUBLIC_HILO_API_URL to its public origin. */
const http = require("node:http");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 32 * 1024;
const PLAYER_TTL_MS = 15 * 60 * 1000;
const ROOM_TTL_MS = 30 * 60 * 1000;
const MAX_ROOMS = 100;
const MAX_PLAYERS = 100;
const MAX_CLIENTS = 120;
const ALLOWED_ORIGINS = new Set(String(process.env.ROOM_ORIGINS || "https://hilo-royale.vercel.app").split(",").map(v => v.trim()).filter(Boolean));
const rooms = new Map();
const joinsByIp = new Map();

function roomFor(roomId, create = false) {
  if (!rooms.has(roomId) && create) {
    if (rooms.size >= MAX_ROOMS) return null;
    rooms.set(roomId, { players: new Map(), clients: new Set(), updatedAt: new Date().toISOString(), touchedAt: Date.now() });
  }
  return rooms.get(roomId);
}

function snapshot(roomId) {
  const room = roomFor(roomId);
  if (!room) return { roomId, players: [], updatedAt: null };
  const now = Date.now();
  for (const [id, player] of room.players) if (now - player.lastSeen > PLAYER_TTL_MS) room.players.delete(id);
  room.touchedAt = now;
  return {
    roomId,
    players: [...room.players.values()].map(({ lastSeen, ...player }) => player),
    updatedAt: room.updatedAt,
  };
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return false;
  if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return true;
}

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function broadcast(roomId) {
  const room = roomFor(roomId);
  if (!room) return;
  const body = `event: room\ndata: ${JSON.stringify(snapshot(roomId))}\n\n`;
  for (const client of room.clients) client.write(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new Error("request too large"));
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("invalid json")); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (!cors(req, res)) { json(res, 403, { error: "origin denied" }); return; }
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || "localhost"}`); }
  catch { json(res, 400, { error: "invalid url" }); return; }
  if (url.pathname === "/health") { json(res, 200, { ok: true, rooms: rooms.size }); return; }

  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(join|events))?$/);
  if (!match) { json(res, 404, { error: "not found" }); return; }
  let roomId;
  try { roomId = decodeURIComponent(match[1]); } catch { json(res, 400, { error: "invalid room id" }); return; }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(roomId)) { json(res, 400, { error: "invalid room id" }); return; }
  const action = match[2] || "snapshot";

  if (req.method === "GET" && action === "snapshot") { json(res, 200, snapshot(roomId)); return; }
  if (req.method === "GET" && action === "events") {
    const room = roomFor(roomId, true);
    if (!room) { json(res, 503, { error: "room capacity reached" }); return; }
    if (room.clients.size >= MAX_CLIENTS) { json(res, 429, { error: "room audience full" }); return; }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    room.clients.add(res);
    res.write(`event: room\ndata: ${JSON.stringify(snapshot(roomId))}\n\n`);
    const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 20000);
    req.on("close", () => { clearInterval(heartbeat); room.clients.delete(res); });
    return;
  }
  if (req.method === "POST" && action === "join") {
    try {
      const ip = String(req.socket.remoteAddress || "unknown");
      const now = Date.now(), rate = joinsByIp.get(ip) || [];
      const recent = rate.filter(ts => now - ts < 60000);
      if (recent.length >= 60) { json(res, 429, { error: "rate limited" }); return; }
      recent.push(now);joinsByIp.set(ip, recent);
      const body = await readJson(req);
      const id = String(body.id || "").slice(0, 120);
      const name = String(body.name || "").trim().slice(0, 40);
      if (!id || !name) { json(res, 400, { error: "id and name are required" }); return; }
      const room = roomFor(roomId, true);
      if (!room) { json(res, 503, { error: "room capacity reached" }); return; }
      const existing = room.players.get(id);
      if (!existing && room.players.size >= MAX_PLAYERS) { json(res, 429, { error: "room full" }); return; }
      room.players.set(id, {
        id,
        name,
        squadCode: body.squadCode ? String(body.squadCode).slice(0, 40) : undefined,
        joinedAt: existing?.joinedAt || new Date().toISOString(),
        lastSeen: Date.now(),
      });
      room.updatedAt = new Date().toISOString();
      room.touchedAt = Date.now();
      const value = snapshot(roomId);
      json(res, 200, value);
      broadcast(roomId);
    } catch (error) {
      json(res, error.message === "request too large" ? 413 : 400, { error: error.message });
    }
    return;
  }
  json(res, 405, { error: "method not allowed" });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) if (!room.clients.size && now - room.touchedAt > ROOM_TTL_MS) rooms.delete(id);
  for (const [ip, stamps] of joinsByIp) if (!stamps.some(ts => now - ts < 60000)) joinsByIp.delete(ip);
}, 60000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Hi-Lo room service listening on http://0.0.0.0:${PORT}`);
});
