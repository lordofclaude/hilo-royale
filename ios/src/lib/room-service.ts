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
  results: RoomResult[];
  updatedAt: string;
}

export interface RoomResult {
  playerId: string;
  name: string;
  fixtureId: string;
  pts: number;
  streak: number;
  outlivedCount: number;
  won: boolean;
  finishedAt: string;
}

export interface PredictionSubmission {
  fixtureId: string;
  round: number;
  questionId: string;
  pick: "hi" | "lo";
  msRemaining: number;
}

export interface ResultSubmission {
  fixtureId: string;
  pts: number;
  streak: number;
  outlivedCount: number;
  won: boolean;
}

export interface VoteProofStep { side: "left" | "right"; hash: string; }

export interface SettledVote {
  playerId: string;
  fixtureId: string;
  round: number;
  questionId: string;
  pick: "hi" | "lo";
  lockedAt: string;
  leaf: string;
  proof: VoteProofStep[];
}

export interface RoundSettlement {
  version: 1;
  roomId: string;
  roomHash: string;
  fixtureId: string;
  round: number;
  answer: "hi" | "lo" | "push";
  counts: { hi: number; lo: number; total: number };
  root: string;
  entries: SettledVote[];
  signature: string;
  payer: string;
  memo: string;
  network: string;
  explorerUrl: string;
  settledAt: string;
}

export interface RoomServiceStatus { ready: boolean; message: string; }

function baseUrl(): string {
  return (process.env.EXPO_PUBLIC_HILO_API_URL || "https://hilo-royale.vercel.app").replace(/\/$/, "");
}

export function roomServiceStatus(): RoomServiceStatus {
  return baseUrl()
    ? { ready: true, message: "Room service connected" }
    : { ready: false, message: "Set EXPO_PUBLIC_HILO_API_URL for cross-device rooms" };
}

const roomSessions = new Map<string, string>();

async function request(path: string, init?: RequestInit, timeoutMs = 4000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl()}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function joinRoom(roomId: string, identity: FanIdentity, squadCode?: string): Promise<RoomSnapshot | null> {
  const base = baseUrl();
  if (!base) return null;
  const response = await request("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "join", roomId, playerKey: identity.id, name: identity.name, squadCode }),
  });
  if (!response.ok) throw new Error(`Room join failed (${response.status})`);
  const body = await response.json() as RoomSnapshot & { sessionToken?: string };
  if (body.sessionToken) roomSessions.set(roomId, body.sessionToken);
  return body;
}

export async function getRoom(roomId: string): Promise<RoomSnapshot | null> {
  const base = baseUrl();
  if (!base) return null;
  const response = await request(`/api/rooms?roomId=${encodeURIComponent(roomId)}`);
  if (!response.ok) throw new Error(`Room lookup failed (${response.status})`);
  return response.json() as Promise<RoomSnapshot>;
}

export function watchRoom(roomId: string, opts: { onSnapshot: (room: RoomSnapshot) => void; onError?: (message: string) => void }): { stop: () => void } {
  const base = baseUrl();
  if (!base) return { stop() {} };
  let stopped = false;
  const poll = async () => {
    try {
      const room = await getRoom(roomId);
      if (!stopped && room) opts.onSnapshot(room);
    } catch (error) {
      if (!stopped) opts.onError?.(error instanceof Error ? error.message : "Room refresh failed");
    }
  };
  void poll();
  const interval = setInterval(() => { void poll(); }, 2500);
  return { stop() { stopped = true; clearInterval(interval); } };
}

async function sessionFor(roomId: string, identity: FanIdentity): Promise<string> {
  const current = roomSessions.get(roomId);
  if (current) return current;
  await joinRoom(roomId, identity);
  const token = roomSessions.get(roomId);
  if (!token) throw new Error("Room session unavailable");
  return token;
}

export async function submitPrediction(roomId: string, identity: FanIdentity, prediction: PredictionSubmission): Promise<boolean> {
  const sessionToken = await sessionFor(roomId, identity);
  const response = await request("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pick", roomId, sessionToken, ...prediction }),
  });
  if (response.status === 409) return false;
  if (!response.ok) throw new Error(`Prediction storage failed (${response.status})`);
  return true;
}

export async function submitRoomResult(roomId: string, identity: FanIdentity, result: ResultSubmission): Promise<void> {
  const sessionToken = await sessionFor(roomId, identity);
  const response = await request("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "result", roomId, sessionToken, fixtureId: result.fixtureId, result }),
  });
  if (!response.ok) throw new Error(`Result storage failed (${response.status})`);
}

export async function getRoundSettlement(roomId: string, fixtureId: string, round: number): Promise<RoundSettlement | null> {
  const query = `roomId=${encodeURIComponent(roomId)}&fixtureId=${encodeURIComponent(fixtureId)}&round=${round}`;
  const response = await request(`/api/rooms?${query}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Settlement lookup failed (${response.status})`);
  const body = await response.json() as { settlement: RoundSettlement };
  return body.settlement;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function submitRoundSettlement(
  roomId: string,
  identity: FanIdentity,
  input: { fixtureId: string; round: number; answer: "hi" | "lo" | "push" },
): Promise<RoundSettlement> {
  const sessionToken = await sessionFor(roomId, identity);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "settle", roomId, sessionToken, ...input }),
    }, 20000);
    const body = await response.json().catch(() => ({})) as { reason?: string; settlement?: RoundSettlement };
    if (response.ok && body.settlement) return body.settlement;
    if (response.status !== 409 || body.reason !== "settlement-in-progress") {
      throw new Error(`Round settlement failed (${body.reason || response.status})`);
    }
    for (let poll = 0; poll < 4; poll += 1) {
      await delay(700 + poll * 300);
      const settlement = await getRoundSettlement(roomId, input.fixtureId, input.round);
      if (settlement) return settlement;
    }
  }
  throw new Error("Round settlement is still pending");
}
