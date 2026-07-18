import type { FanIdentity } from "./auth";

export interface RoomPlayer {
  id: string;
  name: string;
  avatarUrl?: string;
  squadCode?: string;
  joinedAt: string;
}

export interface RoomSnapshot {
  roomId: string;
  players: RoomPlayer[];
  updatedAt: string;
}

export interface RoomServiceStatus { ready: boolean; message: string; }

function baseUrl(): string {
  return (process.env.EXPO_PUBLIC_HILO_API_URL || "").replace(/\/$/, "");
}

export function roomServiceStatus(): RoomServiceStatus {
  return baseUrl()
    ? { ready: true, message: "Room service connected" }
    : { ready: false, message: "Set EXPO_PUBLIC_HILO_API_URL for cross-device rooms" };
}

export async function joinRoom(roomId: string, identity: FanIdentity, squadCode?: string): Promise<RoomSnapshot | null> {
  const base = baseUrl();
  if (!base) return null;
  const response = await fetch(`${base}/api/rooms/${encodeURIComponent(roomId)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: identity.id, name: identity.name, avatarUrl: identity.avatarUrl, squadCode }),
  });
  if (!response.ok) throw new Error(`Room join failed (${response.status})`);
  return response.json() as Promise<RoomSnapshot>;
}

export async function getRoom(roomId: string): Promise<RoomSnapshot | null> {
  const base = baseUrl();
  if (!base) return null;
  const response = await fetch(`${base}/api/rooms/${encodeURIComponent(roomId)}`);
  if (!response.ok) throw new Error(`Room lookup failed (${response.status})`);
  return response.json() as Promise<RoomSnapshot>;
}

export function watchRoom(roomId: string, opts: { onSnapshot: (room: RoomSnapshot) => void; onError?: (message: string) => void }): { stop: () => void } {
  const base = baseUrl();
  if (!base) return { stop() {} };
  const controller = new AbortController();
  let stopped = false;

  const pump = async () => {
    try {
      const response = await fetch(`${base}/api/rooms/${encodeURIComponent(roomId)}/events`, { headers: { Accept: "text/event-stream" }, signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`Room stream failed (${response.status})`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
          if (data) opts.onSnapshot(JSON.parse(data) as RoomSnapshot);
        }
      }
    } catch (error) {
      if (!stopped) opts.onError?.(error instanceof Error ? error.message : "Room stream failed");
    }
  };
  void pump();
  return { stop() { stopped = true; controller.abort(); } };
}

