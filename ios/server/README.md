# Hi-Lo Royale room service

Zero-dependency presence service for cross-device lobby and squad demos.

```powershell
$env:PORT=8787
node server/room-server.js
$env:EXPO_PUBLIC_HILO_API_URL='http://YOUR-LAN-IP:8787'
pnpm start
```

Endpoints:

- `GET /health`
- `GET /api/rooms/:roomId`
- `POST /api/rooms/:roomId/join` with `{ id, name, avatarUrl?, squadCode? }`
- `GET /api/rooms/:roomId/events` (SSE room snapshots)

This process keeps room presence in memory and expires inactive players after
15 minutes. For public production traffic, place it behind HTTPS and replace
the in-memory map with durable storage plus authenticated room tokens.

