// Vercel serverless proxy for the live TxLINE feed.
// Keeps the guest JWT + API token server-side (never shipped to the browser)
// and sidesteps CORS. Returns the latest France v England 1X2 win-probability.
// Config via env: TXLINE_JWT, TXLINE_API_TOKEN, TXLINE_HOST (optional).
const HOST = process.env.TXLINE_HOST || "https://txline-dev.txodds.com";
const FIXTURE = "18257865";

export default async function handler(req, res) {
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!jwt || !apiToken) {
    res.status(200).json({ ok: false, reason: "no-credentials" });
    return;
  }
  try {
    const r = await fetch(`${HOST}/api/odds/updates/${FIXTURE}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": apiToken,
        Accept: "application/json",
      },
    });
    if (!r.ok) {
      res.status(200).json({ ok: false, reason: `http-${r.status}` });
      return;
    }
    const arr = await r.json();
    // walk backwards for the freshest valid 1X2 line
    let latest = null;
    for (let i = arr.length - 1; i >= 0; i--) {
      const o = arr[i];
      const ty = o.SuperOddsType || o.type;
      const pct = o.Pct || [];
      if (ty === "1X2_PARTICIPANT_RESULT" && pct.length === 3 && pct[0] !== "NA") {
        const fra = +pct[0], draw = +pct[1], eng = +pct[2];
        if ([fra, draw, eng].every(Number.isFinite)) { latest = { fra, draw, eng, ts: o.Ts }; break; }
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(latest ? { ok: true, ...latest } : { ok: false, reason: "no-1x2" });
  } catch (e) {
    res.status(200).json({ ok: false, reason: "fetch-failed" });
  }
}
