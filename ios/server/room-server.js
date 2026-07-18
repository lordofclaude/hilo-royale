/* Minimal Hi-Lo Royale presence service. Node 20+, no dependencies.
 * Deploy behind HTTPS and set EXPO_PUBLIC_HILO_API_URL to its public origin. */
const http = require("node:http");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 32 * 1024;
const PLAYER_TTL_MS = 15 * 60 * 1000;
const rooms = new Map();

function roomFor(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { players: new Map(), clients: new Set(), updatedAt: new Date().toISOString() });
  return rooms.get(roomId);
}

function snapshot(roomId) {
  const room = roomFor(roomId);
  const now = Date.now();
  for (const [id, player] of room.players) if (now - player.lastSeen > PLAYER_TTL_MS) room.players.delete(id);
  return {
    roomId,
    players: [...room.players.values()].map(({ lastSeen, ...player }) => player),
    updatedAt: room.updatedAt,
  };
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function json(res, status, value) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function broadcast(roomId) {
  const room = roomFor(roomId);
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
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/health") { json(res, 200, { ok: true, rooms: rooms.size }); return; }

  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(join|events))?$/);
  if (!match) { json(res, 404, { error: "not found" }); return; }
  const roomId = decodeURIComponent(match[1]);
  const action = match[2] || "snapshot";

  if (req.method === "GET" && action === "snapshot") { json(res, 200, snapshot(roomId)); return; }
  if (req.method === "GET" && action === "events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const room = roomFor(roomId);
    room.clients.add(res);
    res.write(`event: room\ndata: ${JSON.stringify(snapshot(roomId))}\n\n`);
    const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 20000);
    req.on("close", () => { clearInterval(heartbeat); room.clients.delete(res); });
    return;
  }
  if (req.method === "POST" && action === "join") {
    try {
      const body = await readJson(req);
      const id = String(body.id || "").slice(0, 120);
      const name = String(body.name || "").trim().slice(0, 40);
      if (!id || !name) { json(res, 400, { error: "id and name are required" }); return; }
      const room = roomFor(roomId);
      const existing = room.players.get(id);
      room.players.set(id, {
        id,
        name,
        avatarUrl: body.avatarUrl ? String(body.avatarUrl).slice(0, 500) : undefined,
        squadCode: body.squadCode ? String(body.squadCode).slice(0, 40) : undefined,
        joinedAt: existing?.joinedAt || new Date().toISOString(),
        lastSeen: Date.now(),
      });
      room.updatedAt = new Date().toISOString();
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Hi-Lo room service listening on http://0.0.0.0:${PORT}`);
});

