// Server-side TxLINE SSE bridge for the native app. Credentials remain in
// Vercel environment variables and never ship in the Expo bundle.
const HOST = process.env.TXLINE_HOST || "https://txline-dev.txodds.com";
const FIXTURES = new Set(["18257865", "18241006", "18237038", "18222446", "18213979", "17588232"].concat(String(process.env.TXLINE_FIXTURE_ALLOWLIST || "").split(",").map(v => v.trim()).filter(Boolean)));

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); res.status(405).json({ ok: false, reason: "method-not-allowed" }); return; }
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  const rawFixtureId = String(req.query.fixtureId || "");
  const fixtureId = /^\d{6,12}$/.test(rawFixtureId) ? rawFixtureId : "";
  if (!jwt || !apiToken) { res.status(503).json({ ok: false, reason: "no-credentials" }); return; }
  if (!fixtureId) { res.status(400).json({ ok: false, reason: "invalid-fixtureId" }); return; }
  if (!FIXTURES.has(fixtureId)) { res.status(404).json({ ok: false, reason: "fixture-not-allowed" }); return; }

  const controller = new AbortController();
  let idleTimer = setTimeout(() => controller.abort(), 45000);
  const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => controller.abort(), 45000); };
  req.on("close", () => { clearTimeout(idleTimer); controller.abort(); });
  try {
    const upstream = await fetch(`${HOST}/api/scores/stream?fixtureId=${fixtureId}`, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": apiToken,
      },
      signal: controller.signal,
    });
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ ok: false, reason: `upstream-${upstream.status}` });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      res.write(Buffer.from(value));
    }
    clearTimeout(idleTimer);
    res.end();
  } catch {
    clearTimeout(idleTimer);
    if (!res.headersSent) res.status(502).json({ ok: false, reason: "fetch-failed" });
    else res.end();
  }
}
