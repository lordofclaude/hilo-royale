/* ============================================================
   TxLINE real feed — drop-in replacement for txline-mock.ts.

   Same exported surface (FIXTURE, EVENTS, stream, ScoreEvent, StreamHandle)
   so GameScreen/LobbyScreen don't change, just the import path.

   Data source: a pre-generated replay tape (src/lib/real-data/<fixtureId>.ts),
   built offline from a real TxLINE historical pull via
   `node scripts/gen-real-data.js <fixtureId>` (see that script + RUN.md §4).
   This mirrors the "recommended demo path" used by the other T2 apps
   (window.TXLINE_TAPE in the browser) — bundled at build time so the phone
   needs no network call or embedded API credentials to replay a real match.

   Swapping to a LIVE lobby (rather than a replay) means pointing `stream()`
   at GET /api/scores/stream?fixtureId=… over SSE instead — see the
   ⟨REAL⟩ note in txline-mock.ts and shared/txline-real.js's streamLive().
   ============================================================ */
import { FIXTURE as FIXTURE_18222446, EVENTS as EVENTS_18222446 } from "./real-data/18222446";
import { FIXTURE as FIXTURE_18237038, EVENTS as EVENTS_18237038 } from "./real-data/18237038";
import { FIXTURE as FIXTURE_18241006, EVENTS as EVENTS_18241006 } from "./real-data/18241006";
import { ONCHAIN_PROOF } from "./real-data/18222446.proof";

/** A REAL devnet validateStatV2 transaction proving this fixture's final score
 *  against TxODDS's on-chain Merkle root — generated once per fixture by
 *  08-integration/tx-on-chain/examples/devnet/scripts/hilo_settle_stat.ts.
 *  Re-run that script when swapping fixtures (it writes <id>.proof.ts). */
export { ONCHAIN_PROOF };
export const PROOF_EXPLORER_URL = `https://solscan.io/tx/${ONCHAIN_PROOF.txSig}?cluster=devnet`;
import type { ScoreEvent, StatMap, StreamHandle } from "./txline-mock";
import { buildSchedule, dailyIndex, dailyKey, Question } from "./game-logic";

export type { ScoreEvent, StatMap, StreamHandle };

export interface ReplayFixture {
  fixtureId: string;
  fixture: {
    FixtureId: number;
    Competition: string;
    Participant1: string;
    Participant2: string;
    Participant1IsHome: boolean;
    StartTime: string;
  };
  events: ScoreEvent[];
  schedule: Question[];
  lobbyId: string;
  finalScore: { g1: number; g2: number };
  proof?: typeof ONCHAIN_PROOF;
  proofExplorerUrl?: string;
}

function makeReplay(
  fixture: ReplayFixture["fixture"],
  events: ScoreEvent[],
  proof?: typeof ONCHAIN_PROOF,
): ReplayFixture {
  const fixtureId = String(fixture.FixtureId);
  const lastEvent = events[events.length - 1];
  return {
    fixtureId,
    fixture,
    events,
    schedule: buildSchedule(events, fixture),
    lobbyId: `${teamCode(fixture.Participant1)}-${teamCode(fixture.Participant2)}-${fixtureId.slice(-3)}`,
    finalScore: { g1: lastEvent.stats.g1, g2: lastEvent.stats.g2 },
    proof,
    proofExplorerUrl: proof ? `https://solscan.io/tx/${proof.txSig}?cluster=devnet` : undefined,
  };
}

/** Named real replays bundled for the backend-free Daily Lobby rotation. */
export const REPLAYS: ReplayFixture[] = [
  makeReplay(FIXTURE_18222446, EVENTS_18222446, ONCHAIN_PROOF),
  makeReplay(FIXTURE_18237038, EVENTS_18237038),
  makeReplay(FIXTURE_18241006, EVENTS_18241006),
];

export function replayForDate(date = new Date()): ReplayFixture {
  return REPLAYS[dailyIndex(dailyKey(date), REPLAYS.length)];
}

export function replayByFixtureId(fixtureId: string): ReplayFixture | undefined {
  return REPLAYS.find(replay => replay.fixtureId === fixtureId);
}

/** Backward-compatible default replay exports. */
export const DEFAULT_REPLAY = REPLAYS[0];
export const FIXTURE = DEFAULT_REPLAY.fixture;
export const EVENTS = DEFAULT_REPLAY.events;

/** The full round schedule for this lobby, computed once from the static
 *  replay tape — shared by LobbyScreen (preview strip) and GameScreen
 *  (the actual round walk) so both read the exact same ordered questions. */
export const SCHEDULE = DEFAULT_REPLAY.schedule;

/** First-3-letters code, e.g. "Argentina" -> "ARG". Generic so a re-pull of a
 *  different fixture via scripts/gen-real-data.js needs no UI changes. */
export function teamCode(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

export const LOBBY_ID = DEFAULT_REPLAY.lobbyId;
export const FINAL_SCORE = DEFAULT_REPLAY.finalScore;

/** Streaming simulator over real match events: speed = sim-minutes per real second.
 *  Same onEvent/onDone surface as txline-mock.ts's stream(). */
export function stream(opts: {
  /** Playback rate relative to real match time. 1 = real-time, 30 = demo. */
  playbackRate?: number;
  /** Legacy sim-minutes/real-second override retained for compatibility. */
  speed?: number;
  from?: number;
  onEvent?: (e: ScoreEvent) => void;
  onDone?: (e: ScoreEvent) => void;
}): StreamHandle {
  return streamReplay(DEFAULT_REPLAY, opts);
}

export function streamReplay(replay: ReplayFixture, opts: {
  playbackRate?: number;
  speed?: number;
  from?: number;
  onEvent?: (e: ScoreEvent) => void;
  onDone?: (e: ScoreEvent) => void;
}): StreamHandle {
  const { playbackRate = 30, speed, from = 0, onEvent, onDone } = opts;
  const events = replay.events;
  const simMinutesPerRealSecond = speed ?? playbackRate / 60;
  let i = 0, stopped = false;
  while (i < events.length && events[i].minute < from) i++;
  let simMin = from;
  const iv = setInterval(() => {
    if (stopped) return;
    simMin += simMinutesPerRealSecond * 0.25;
    while (i < events.length && events[i].minute <= simMin) {
      const e = events[i++];
      onEvent && onEvent(e);
      if (e.type === "game_finalised") { clearInterval(iv); onDone && onDone(e); }
    }
    if (i >= events.length) { clearInterval(iv); onDone && onDone(events[events.length - 1]); }
  }, 250);
  return { stop() { stopped = true; clearInterval(iv); } };
}
