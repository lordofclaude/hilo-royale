// Vercel serverless proxy for the live TxLINE feed — game-agnostic.
// Keeps the guest JWT + API token server-side (never shipped to the browser)
// and sidesteps CORS. Returns the latest 1X2 win-probability for any fixture:
//   GET /api/txline?fixtureId=18257865
// Config via env: TXLINE_JWT, TXLINE_API_TOKEN, TXLINE_HOST (optional).
const HOST = process.env.TXLINE_HOST || "https://txline-dev.txodds.com";

export default async function handler(req, res) {
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  const fixtureId = String(req.query.fixtureId || "").replace(/\D/g, "");
  if (!jwt || !apiToken) { res.status(200).json({ ok: false, reason: "no-credentials" }); return; }
  if (!fixtureId) { res.status(400).json({ ok: false, reason: "missing-fixtureId" }); return; }
  try {
    const r = await fetch(`${HOST}/api/odds/updates/${fixtureId}`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken, Accept: "application/json" },
    });
    if (!r.ok) { res.status(200).json({ ok: false, reason: `http-${r.status}` }); return; }
    const arr = await r.json();
    let latest = null;
    for (let i = arr.length - 1; i >= 0; i--) {
      const o = arr[i];
      const ty = o.SuperOddsType || o.type;
      const pct = o.Pct || [];
      if (ty === "1X2_PARTICIPANT_RESULT" && pct.length === 3 && pct[0] !== "NA") {
        const p1 = +pct[0], draw = +pct[1], p2 = +pct[2];
        if ([p1, draw, p2].every(Number.isFinite)) { latest = { p1, draw, p2, ts: o.Ts }; break; }
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(latest ? { ok: true, fixtureId, ...latest } : { ok: false, reason: "no-1x2" });
  } catch (e) {
    res.status(200).json({ ok: false, reason: "fetch-failed" });
  }
}
