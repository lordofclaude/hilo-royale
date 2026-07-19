import type { ScoreEvent, StatMap, StreamHandle } from "./txline-mock";

interface LiveEnvironment {
  baseUrl: string;
  fixtureId: string;
  kickoffMs: number;
  team1: string;
  team2: string;
}

export interface LiveStatus {
  ready: boolean;
  message: string;
  fixtureId?: string;
  team1?: string;
  team2?: string;
}

const EMPTY_STATS: StatMap = { c1: 0, c2: 0, s1: 0, s2: 0, y1: 0, y2: 0, r1: 0, r2: 0, g1: 0, g2: 0 };

function environment(): LiveEnvironment {
  const configuredFixture = (process.env.EXPO_PUBLIC_TXLINE_FIXTURE_ID || "").trim();
  const fixtureId = configuredFixture || "18257739";
  const isDefaultFinal = fixtureId === "18257739";
  return {
    // Native clients use our server-side SSE bridge. TxLINE credentials stay
    // in the backend environment and are never extractable from the app.
    baseUrl: (process.env.EXPO_PUBLIC_HILO_API_URL || "https://hilo-royale.vercel.app").replace(/\/$/, ""),
    // Default: the next scheduled real fixture — the FIFA World Cup 2026 FINAL,
    // Spain v Argentina (18257739), KO 2026-07-19 19:00 UTC. The kickoff-window
    // gate below keeps "LIVE" honest: outside ±(15min/3h) of KO the lobby shows
    // the countdown message instead, so a finished/future fixture never reads
    // as live. Env vars still override for a different fixture.
    fixtureId,
    kickoffMs: Number(process.env.EXPO_PUBLIC_TXLINE_KICKOFF_MS || (isDefaultFinal ? 1784487600000 : 0)),
    team1: (process.env.EXPO_PUBLIC_LIVE_TEAM_1 || (isDefaultFinal ? "Spain" : "")).trim(),
    team2: (process.env.EXPO_PUBLIC_LIVE_TEAM_2 || (isDefaultFinal ? "Argentina" : "")).trim(),
  };
}

const LIVE_EARLY_ALLOWANCE_MS = 15 * 60 * 1000;
const LIVE_LATE_ALLOWANCE_MS = 3 * 60 * 60 * 1000;

export function liveStatus(nowMs = Date.now()): LiveStatus {
  const env = environment();
  if (!env.fixtureId) {
    return { ready: false, message: "Set EXPO_PUBLIC_TXLINE_FIXTURE_ID to enable a live lobby." };
  }
  if (!Number.isFinite(env.kickoffMs) || env.kickoffMs <= 0) {
    return { ready: false, message: "Set EXPO_PUBLIC_TXLINE_KICKOFF_MS so Live appears only during the match window." };
  }
  if (!env.team1 || !env.team2 || env.team1.toLowerCase() === env.team2.toLowerCase()) {
    return { ready: false, message: "Set both live team names so the scoreboard matches the configured fixture." };
  }
  if (nowMs < env.kickoffMs - LIVE_EARLY_ALLOWANCE_MS || nowMs > env.kickoffMs + LIVE_LATE_ALLOWANCE_MS) {
    const when = new Date(env.kickoffMs);
    const hh = String(when.getUTCHours()).padStart(2, "0");
    const mm = String(when.getUTCMinutes()).padStart(2, "0");
    return {
      ready: false,
      message: nowMs < env.kickoffMs
        ? `Next live lobby: the World Cup final kicks off ${when.getUTCDate()} Jul ${hh}:${mm} UTC. Until then, play today's replay lobby.`
        : "That match has finished — play today's replay lobby, or wait for the next live fixture.",
    };
  }
  return { ready: true, message: "TxLINE live stream configured", fixtureId: env.fixtureId, team1: env.team1, team2: env.team2 };
}

function numberOr(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStats(value: unknown, previous: StatMap = EMPTY_STATS): StatMap {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    c1: Math.max(previous.c1, numberOr(source.c1 ?? source["7"])), c2: Math.max(previous.c2, numberOr(source.c2 ?? source["8"])),
    s1: Math.max(previous.s1, numberOr(source.s1)), s2: Math.max(previous.s2, numberOr(source.s2)),
    y1: Math.max(previous.y1, numberOr(source.y1 ?? source["3"])), y2: Math.max(previous.y2, numberOr(source.y2 ?? source["4"])),
    r1: Math.max(previous.r1, numberOr(source.r1 ?? source["5"])), r2: Math.max(previous.r2, numberOr(source.r2 ?? source["6"])),
    g1: Math.max(previous.g1, numberOr(source.g1 ?? source["1"])), g2: Math.max(previous.g2, numberOr(source.g2 ?? source["2"])),
  };
}

const ACTION_TYPES: Record<string, string> = {
  goal: "goal", owngoal: "goal", goalscored: "goal", corner: "corner", cornerkick: "corner",
  shot: "shot", shotontarget: "shot", shotofftarget: "shot", shotblocked: "shot", attempt: "shot",
  card: "card", yellowcard: "card", redcard: "card", secondyellowcard: "card", booking: "card",
  substitution: "sub", sub: "sub", kickoff: "kickoff", periodstart: "kickoff",
  halftime: "halftime", fulltime: "fulltime", gamefinalised: "game_finalised", matchfinalised: "game_finalised",
  var: "var", varreview: "var", varend: "var_verdict", varverdict: "var_verdict",
  penalty: "penalty", penaltyawarded: "penalty", freekick: "freekick", additionaltime: "additionaltime",
};
const CONFIRMED_ACTIONS = new Set(["goal", "corner", "shot", "card", "sub", "var", "penalty", "freekick"]);
const DROPPED_ACTIONS = new Set(["actiondiscarded", "actionamend", "actionamended", "possible", "possibleaction"]);

function normalizeAction(value: unknown): string {
  const key = String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (DROPPED_ACTIONS.has(key)) return "unknown";
  if (ACTION_TYPES[key]) return ACTION_TYPES[key];
  if (key.includes("goalkick")) return "unknown";
  if (key.includes("goal")) return "goal";
  if (key.includes("corner")) return "corner";
  if (key.includes("shot")) return "shot";
  if (key.includes("yellow") || key.includes("red") || key.includes("card")) return "card";
  if (key.includes("final")) return "game_finalised";
  return "unknown";
}

function normalizeEvent(value: unknown, fallbackSeq: number, running: StatMap, emitted: Set<string>): ScoreEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const nested = raw.data && typeof raw.data === "object" ? raw.data as Record<string, unknown> : null;
  const payload = nested && (nested.Action !== undefined || nested.action !== undefined || nested.minute !== undefined) ? nested : raw;
  const clock = payload.Clock && typeof payload.Clock === "object" ? payload.Clock as Record<string, unknown> : null;
  const minute = numberOr(payload.minute ?? payload.matchMinute ?? (clock ? numberOr(clock.Seconds ?? clock.seconds, -60) / 60 : -1), -1);
  if (minute < 0) return null;
  const type = normalizeAction(payload.type ?? payload.eventType ?? payload.Action ?? payload.action);
  if (type === "unknown") return null;
  if (CONFIRMED_ACTIONS.has(type) && (payload.Confirmed ?? payload.confirmed) === false) return null;
  const seq = numberOr(payload.seq ?? payload.sequence ?? payload.Seq, fallbackSeq);
  const actionId = String(payload.Id ?? payload.id ?? seq);
  const dedupeKey = `${actionId}:${type}`;
  if (emitted.has(dedupeKey)) return null;

  let team = numberOr(payload.team ?? payload.participant ?? payload.Participant, 0);
  if (team !== 1 && team !== 2) {
    if (team === numberOr(payload.Participant1Id, -1)) team = 1;
    else if (team === numberOr(payload.Participant2Id, -1)) team = 2;
    else team = 0;
  }
  const next = normalizeStats(payload.stats ?? payload.Stats ?? EMPTY_STATS, running);
  if (type === "shot" && team) next[`s${team}` as "s1" | "s2"] += 1;
  else if (team && !(payload.stats || payload.Stats)) {
    if (type === "goal") next[`g${team}` as "g1" | "g2"] += 1;
    if (type === "corner") next[`c${team}` as "c1" | "c2"] += 1;
    if (type === "card") next[`y${team}` as "y1" | "y2"] += 1;
  }
  Object.assign(running, next);
  emitted.add(dedupeKey);
  return {
    seq,
    minute: Math.floor(minute),
    type,
    team,
    detail: String(payload.detail ?? payload.description ?? ""),
    stats: { ...running },
    teamName: String(payload.teamName ?? payload.participantName ?? "—"),
  };
}

/** Connects to the app's server-side TxLINE SSE bridge. */
export function streamLive(opts: {
  onEvent: (event: ScoreEvent) => void;
  onDone?: (event: ScoreEvent | null) => void;
  onError?: (message: string) => void;
}): StreamHandle {
  const env = environment();
  const controller = new AbortController();
  let lastEvent: ScoreEvent | null = null;
  let stopped = false;
  const running: StatMap = { ...EMPTY_STATS };
  const emitted = new Set<string>();

  const pump = async () => {
    let reconnects = 0;
    while (!stopped) {
      try {
        const response = await fetch(`${env.baseUrl}/api/txline-stream?fixtureId=${encodeURIComponent(env.fixtureId)}`, {
        headers: {
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`TxLINE returned HTTP ${response.status}`);
      if (!response.body) throw new Error("This runtime does not expose a streaming response body.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fallbackSeq = (lastEvent?.seq || 0) + 1;
        reconnects = 0;

        while (!stopped) {
          const { value: chunk, done } = await reader.read();
          if (done) throw new Error("Live feed disconnected before the final whistle.");
          buffer += decoder.decode(chunk, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() || "";
          for (const frame of frames) {
            const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
            if (!data || data === "[DONE]") continue;
            let parsed: unknown;
            try { parsed = JSON.parse(data); } catch { opts.onError?.("Skipped one malformed live-feed frame."); continue; }
            const event = normalizeEvent(parsed, fallbackSeq++, running, emitted);
            if (!event) continue;
            lastEvent = event;
            opts.onEvent(event);
            if (event.type === "game_finalised") { opts.onDone?.(event); return; }
          }
        }
      } catch (error) {
        if (stopped) return;
        reconnects += 1;
        const detail = error instanceof Error ? error.message : "Live stream failed";
        opts.onError?.(`${detail} Retrying…`);
        await new Promise(resolve => setTimeout(resolve, Math.min(15000, 1000 * (2 ** Math.min(4, reconnects)))));
      }
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
