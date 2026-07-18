import type { ScoreEvent, StatMap, StreamHandle } from "./txline-mock";

interface LiveEnvironment {
  baseUrl: string;
  token: string;
  fixtureId: string;
}

export interface LiveStatus {
  ready: boolean;
  message: string;
  fixtureId?: string;
}

const EMPTY_STATS: StatMap = { c1: 0, c2: 0, s1: 0, s2: 0, y1: 0, y2: 0, r1: 0, r2: 0, g1: 0, g2: 0 };

function environment(): LiveEnvironment {
  return {
    // Devnet host matches the guest/token auth used for the World Cup free tier.
    baseUrl: (process.env.EXPO_PUBLIC_TXLINE_BASE_URL || "https://txline-dev.txodds.com").replace(/\/$/, ""),
    token: process.env.EXPO_PUBLIC_TXLINE_TOKEN || "",
    // Default to the featured France v England fixture. NOTE: live in-play data
    // comes from /api/scores/stream (SSE) or /api/scores/updates — NOT
    // /api/scores/historical, which stays locked until ~6h after kickoff.
    fixtureId: process.env.EXPO_PUBLIC_TXLINE_FIXTURE_ID || "18257865",
  };
}

export function liveStatus(): LiveStatus {
  const env = environment();
  if (!env.fixtureId) {
    return { ready: false, message: "Set EXPO_PUBLIC_TXLINE_FIXTURE_ID to enable a live lobby." };
  }
  if (!env.token) {
    return { ready: false, message: "Set EXPO_PUBLIC_TXLINE_TOKEN after TxLINE guest/token activation." };
  }
  return { ready: true, message: "TxLINE live stream configured", fixtureId: env.fixtureId };
}

function numberOr(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStats(value: unknown): StatMap {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    c1: numberOr(source.c1), c2: numberOr(source.c2),
    s1: numberOr(source.s1), s2: numberOr(source.s2),
    y1: numberOr(source.y1), y2: numberOr(source.y2),
    r1: numberOr(source.r1), r2: numberOr(source.r2),
    g1: numberOr(source.g1), g2: numberOr(source.g2),
  };
}

function normalizeEvent(value: unknown, fallbackSeq: number): ScoreEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const payload = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
  const minute = numberOr(payload.minute ?? payload.matchMinute, -1);
  if (minute < 0) return null;
  return {
    seq: numberOr(payload.seq ?? payload.sequence, fallbackSeq),
    minute,
    type: String(payload.type ?? payload.eventType ?? "update"),
    team: numberOr(payload.team ?? payload.participant, 0),
    detail: String(payload.detail ?? payload.description ?? ""),
    stats: normalizeStats(payload.stats ?? EMPTY_STATS),
    teamName: String(payload.teamName ?? payload.participantName ?? "—"),
  };
}

/** Connects directly to the TxLINE SSE endpoint. Credentials stay in Expo
 *  public build-time variables; no token is committed to the repository. */
export function streamLive(opts: {
  onEvent: (event: ScoreEvent) => void;
  onDone?: (event: ScoreEvent | null) => void;
  onError?: (message: string) => void;
}): StreamHandle {
  const env = environment();
  const controller = new AbortController();
  let lastEvent: ScoreEvent | null = null;
  let stopped = false;

  const pump = async () => {
    try {
      const response = await fetch(`${env.baseUrl}/api/scores/stream?fixtureId=${encodeURIComponent(env.fixtureId)}`, {
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${env.token}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`TxLINE returned HTTP ${response.status}`);
      if (!response.body) throw new Error("This runtime does not expose a streaming response body.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fallbackSeq = 1;

      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const data = frame
            .split(/\r?\n/)
            .filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).trim())
            .join("\n");
          if (!data || data === "[DONE]") continue;
          const event = normalizeEvent(JSON.parse(data), fallbackSeq++);
          if (!event) continue;
          lastEvent = event;
          opts.onEvent(event);
        }
      }
      if (!stopped) opts.onDone?.(lastEvent);
    } catch (error) {
      if (!stopped) opts.onError?.(error instanceof Error ? error.message : "Live stream failed");
    }
  };

  void pump();
  return {
    stop() {
      stopped = true;
      controller.abort();
    },
  };
}

