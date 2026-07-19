// Vercel serverless proxy for the live TxLINE feed — game-agnostic.
// Keeps the guest JWT + API token server-side (never shipped to the browser)
// and sidesteps CORS. Three modes:
//   GET /api/txline?fixtureId=18257865                 → latest 1X2 win-probability (default, mode=odds1x2)
//   GET /api/txline?fixtureId=18257865&mode=scores     → raw current ~5-min score-update window (JSON array)
//   GET /api/txline?fixtureId=18257865&mode=odds       → raw current ~5-min odds-update window (JSON array)
// Always HTTP 200 JSON. Failures are {ok:false,reason} (never a thrown 500,
// never an env value in the body). Config via env: TXLINE_JWT, TXLINE_API_TOKEN,
// TXLINE_HOST (optional).
const HOST = process.env.TXLINE_HOST || "https://txline-dev.txodds.com";

function send(res, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(body);
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
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  const fixtureId = String(req.query.fixtureId || "").replace(/\D/g, "");
  const mode = String(req.query.mode || "odds1x2");
  if (!jwt || !apiToken) { send(res, { ok: false, reason: "no-credentials" }); return; }
  if (!fixtureId) { send(res, { ok: false, reason: "missing-fixtureId" }); return; }

  const headers = { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken, Accept: "application/json" };

  if (mode === "scores" || mode === "odds") {
    // Raw pass-through of the current ~5-minute update window (poll + accumulate client-side).
    try {
      const r = await fetch(`${HOST}/api/${mode}/updates/${fixtureId}`, { headers });
      if (!r.ok) { send(res, { ok: false, reason: `http-${r.status}` }); return; }
      const arr = parseBody(await r.text());
      if (arr === null) { send(res, { ok: false, reason: "bad-json" }); return; }
      send(res, arr);
    } catch (e) {
      send(res, { ok: false, reason: "fetch-failed" });
    }
    return;
  }

  // mode=odds1x2 (default): latest 1X2 win-probability triple — original behavior.
  try {
    const r = await fetch(`${HOST}/api/odds/updates/${fixtureId}`, { headers });
    if (!r.ok) { send(res, { ok: false, reason: `http-${r.status}` }); return; }
    const arr = parseBody(await r.text());
    if (arr === null) { send(res, { ok: false, reason: "bad-json" }); return; }
    let latest = null;
    for (let i = arr.length - 1; i >= 0; i--) {
      const o = arr[i];
      const ty = o.SuperOddsType || o.type;
      const pct = o.Pct || [];
      if (ty === "1X2_PARTICIPANT_RESULT" && pct.length === 3 && pct[0] !== "NA") {
        const p1 = +pct[0], draw = +pct[1], p2 = +pct[2];
        const sum = p1 + draw + p2;
        if ([p1, draw, p2].every(v => Number.isFinite(v) && v >= 0 && v <= 100) && sum >= 95 && sum <= 105) {
          latest = { p1, draw, p2, ts: o.Ts };
          break;
        }
      }
    }
    send(res, latest ? { ok: true, fixtureId, ...latest } : { ok: false, reason: "no-1x2" });
  } catch (e) {
    send(res, { ok: false, reason: "fetch-failed" });
  }
}
