// Vercel serverless proxy for the live TxLINE feed — game-agnostic.
// Keeps the guest JWT + API token server-side (never shipped to the browser)
// and sidesteps CORS. Three modes:
//   GET /api/txline?fixtureId=18257865                 → latest 1X2 win-probability (default, mode=odds1x2)
//   GET /api/txline?fixtureId=18257865&mode=scores     → raw current ~5-min score-update window (JSON array)
//   GET /api/txline?fixtureId=18257865&mode=odds       → raw current ~5-min odds-update window (JSON array)
// Failures are structured JSON and never include an env value. Config via env: TXLINE_JWT, TXLINE_API_TOKEN,
// TXLINE_HOST (optional).
const HOST = process.env.TXLINE_HOST || "https://txline-dev.txodds.com";
const DEFAULT_FIXTURES = ["18257865", "18241006", "18237038", "18222446", "18213979", "17588232", "18257739" /* WC final Spain v Argentina (UPCOMING live lobby) */];
const FIXTURE_ALLOWLIST = new Set(DEFAULT_FIXTURES.concat(String(process.env.TXLINE_FIXTURE_ALLOWLIST || "").split(",").map(v => v.trim()).filter(Boolean)));
const MODES = new Set(["odds1x2", "scores", "odds"]);
// Raw pass-through modes are capped tight (the array goes back to the browser);
// odds1x2 digests server-side into ~100 bytes, so it may read a bigger backlog
// (finished fixtures' odds/updates can exceed 2MB and were tripping the guard).
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const MAX_DIGEST_BYTES = 12 * 1024 * 1024;

function send(res, status, body, cache = "no-store") {
  res.setHeader("Cache-Control", cache);
  res.status(status).json(body);
}

async function upstreamText(url, headers, maxBytes = MAX_UPSTREAM_BYTES) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return { error: `http-${r.status}` };
  const text = await r.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { error: "response-too-large" };
  return { text };
}

// TxLINE gotcha: /api/scores/historical answers text/event-stream even for JSON
// Accept — be defensive and parse either a plain JSON array or SSE data: frames
// for the /updates endpoints too.
function parseBody(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  if (t[0] === "[" || t[0] === "{") {
    try { const v = JSON.parse(t); return Array.isArray(v) ? v : [v]; } catch (e) { return null; }
  }
  const out = [];
  for (const block of t.split(/\r?\n\r?\n/)) {
    const datas = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("data:")) datas.push(line.slice(5).replace(/^ /, ""));
    }
    if (datas.length) {
      try { out.push(JSON.parse(datas.join("\n"))); } catch (e) { /* skip unparseable frame */ }
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); send(res, 405, { ok: false, reason: "method-not-allowed" }); return; }
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  const rawFixtureId = String(req.query.fixtureId || "");
  const fixtureId = /^\d{6,12}$/.test(rawFixtureId) ? rawFixtureId : "";
  const mode = String(req.query.mode || "odds1x2");
  if (!fixtureId) { send(res, 400, { ok: false, reason: "invalid-fixtureId" }); return; }
  if (!FIXTURE_ALLOWLIST.has(fixtureId)) { send(res, 404, { ok: false, reason: "fixture-not-allowed" }); return; }
  if (!MODES.has(mode)) { send(res, 400, { ok: false, reason: "invalid-mode" }); return; }
  if (!jwt || !apiToken) { send(res, 503, { ok: false, reason: "no-credentials" }); return; }

  const headers = { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken, Accept: "application/json" };

  if (mode === "scores" || mode === "odds") {
    // Raw pass-through of the current ~5-minute update window (poll + accumulate client-side).
    try {
      const up = await upstreamText(`${HOST}/api/${mode}/updates/${fixtureId}`, headers);
      if (up.error) { send(res, 502, { ok: false, reason: up.error }); return; }
      let arr = parseBody(up.text);
      if (arr === null) { send(res, 502, { ok: false, reason: "bad-json" }); return; }
      if (mode === "odds") arr = arr.filter(o => Number(o.BookmakerId ?? o.bookmakerId) === 10021 && (o.MarketPeriod ?? o.marketPeriod) == null);
      send(res, 200, arr);
    } catch (e) {
      send(res, 504, { ok: false, reason: e && e.name === "TimeoutError" ? "timeout" : "fetch-failed" });
    }
    return;
  }

  // mode=odds1x2 (default): latest 1X2 win-probability triple — original behavior.
  try {
    const up = await upstreamText(`${HOST}/api/odds/updates/${fixtureId}`, headers, MAX_DIGEST_BYTES);
    if (up.error) { send(res, 502, { ok: false, reason: up.error }); return; }
    const arr = parseBody(up.text);
    if (arr === null) { send(res, 502, { ok: false, reason: "bad-json" }); return; }
    let latest = null;
    for (const o of arr) {
      const ty = o.SuperOddsType || o.type;
      const pct = o.Pct || [];
      const sourceOk = Number(o.BookmakerId ?? o.bookmakerId) === 10021 && (o.MarketPeriod ?? o.marketPeriod) == null;
      if (sourceOk && ty === "1X2_PARTICIPANT_RESULT" && pct.length === 3 && pct[0] !== "NA") {
        const p1 = +pct[0], draw = +pct[1], p2 = +pct[2];
        const sum = p1 + draw + p2;
        if ([p1, draw, p2].every(v => Number.isFinite(v) && v >= 0 && v <= 100) && sum >= 95 && sum <= 105) {
          if (!latest || Number(o.Ts) > Number(latest.ts)) latest = { p1, draw, p2, ts: o.Ts };
        }
      }
    }
    send(res, 200, latest ? { ok: true, fixtureId, ...latest } : { ok: false, reason: "no-1x2" }, "s-maxage=10, stale-while-revalidate=30");
  } catch (e) {
    send(res, 504, { ok: false, reason: e && e.name === "TimeoutError" ? "timeout" : "fetch-failed" });
  }
}
