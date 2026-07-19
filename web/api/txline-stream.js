// Server-side TxLINE SSE bridge for the native app. Credentials remain in
// Vercel environment variables and never ship in the Expo bundle.
const HOST = process.env.TXLINE_HOST || "https://txline-dev.txodds.com";

export default async function handler(req, res) {
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  const fixtureId = String(req.query.fixtureId || "").replace(/\D/g, "");
  if (!jwt || !apiToken) { res.status(503).json({ ok: false, reason: "no-credentials" }); return; }
  if (!fixtureId) { res.status(400).json({ ok: false, reason: "missing-fixtureId" }); return; }

  try {
    const upstream = await fetch(`${HOST}/api/scores/stream?fixtureId=${fixtureId}`, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": apiToken,
      },
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
      res.write(Buffer.from(value));
    }
    res.end();
  } catch {
    if (!res.headersSent) res.status(502).json({ ok: false, reason: "fetch-failed" });
    else res.end();
  }
}

