/* ============================================================
   HI-LO ROYALE — core game rules (TypeScript port).
   MIRROR of ../../t2-hilo-royale/game-logic.js — that file is the
   tested source of truth (node test.js, 63 assertions). Keep the
   two in sync when rules change.
   ============================================================ */
import type { ScoreEvent, StatMap } from "./txline-mock";

export type Side = "hi" | "lo";
export type Answer = Side | "push";
export type Verdict = "correct" | "wrong" | "timeout" | "push";
export type QuestionKind = "compare_window" | "side_pick" | "occurrence" | "var_reactive" | "pregame" | "halftime_special";

export interface StatDef {
  key: string; label: string; emoji: string;
  get: (a: StatMap, b: StatMap) => number;
}

export const STAT_DEFS: StatDef[] = [
  { key: "corners", label: "corners", emoji: "🚩", get: (a, b) => (b.c1 + b.c2) - (a.c1 + a.c2) },
  { key: "shots",   label: "shots",   emoji: "🎯", get: (a, b) => (b.s1 + b.s2) - (a.s1 + a.s2) },
  { key: "cards",   label: "cards",   emoji: "🟨", get: (a, b) => (b.y1 + b.y2 + b.r1 + b.r2) - (a.y1 + a.y2 + a.r1 + a.r2) },
];

export const EMPTY_STATS: StatMap = { c1:0,c2:0,s1:0,s2:0,y1:0,y2:0,r1:0,r2:0,g1:0,g2:0 };

export interface Question {
  n: number; key: string; label: string; emoji: string;
  fromMin: number; windowLen: number;
  /** Only meaningful for kind === "compare_window" (or the legacy makeQuestion/makeBestQuestion). */
  statIdx?: number; prevFrom?: number; prevVal?: number;
  /** Rich schedule fields — only present on entries from buildSchedule(). */
  kind?: QuestionKind;
  promptText?: string;
  hiLabel?: string; loLabel?: string;
  hiIsTeam1?: boolean;
  answer?: Answer;
  val?: number;
}

export interface FixtureLike { Participant1: string; Participant2: string; }

export function statsAt(events: ScoreEvent[], minute: number): StatMap {
  let s = EMPTY_STATS;
  for (const e of events) { if (e.minute <= minute) s = e.stats; }
  return s;
}

export function windowValue(events: ScoreEvent[], statIdx: number, fromMin: number, toMin: number): number {
  const d = STAT_DEFS[statIdx];
  return d.get(statsAt(events, fromMin), statsAt(events, toMin));
}

export function makeQuestion(events: ScoreEvent[], questionNumber: number, fromMin: number, windowLen = 15): Question {
  const statIdx = questionNumber % STAT_DEFS.length;
  const def = STAT_DEFS[statIdx];
  const prevFrom = Math.max(0, fromMin - windowLen);
  const prevVal = windowValue(events, statIdx, prevFrom, fromMin);
  return { n: questionNumber, statIdx, key: def.key, label: def.label, emoji: def.emoji, fromMin, windowLen, prevFrom, prevVal };
}

/** Quizmaster rule: prefer a stat whose outcome is decidable (non-push). */
export function makeBestQuestion(events: ScoreEvent[], questionNumber: number, fromMin: number, windowLen = 15): Question {
  let fallback: Question | null = null;
  for (let i = 0; i < STAT_DEFS.length; i++) {
    const q = makeQuestion(events, questionNumber + i, fromMin, windowLen);
    q.n = questionNumber;
    if (i === 0) fallback = q;
    if (resolveQuestion(events, q).answer !== "push") return q;
  }
  return fallback as Question;
}

/** Only meaningful for compare_window questions (statIdx/prevVal set by makeQuestion). */
export function resolveQuestion(events: ScoreEvent[], q: Question): { val: number; answer: Answer } {
  const val = windowValue(events, q.statIdx as number, q.fromMin, q.fromMin + q.windowLen);
  const answer: Answer = val > (q.prevVal as number) ? "hi" : val < (q.prevVal as number) ? "lo" : "push";
  return { val, answer };
}

export function judge(answer: Answer, pick: Side | null): Verdict {
  if (answer === "push") return "push";
  if (pick == null) return "timeout";
  return pick === answer ? "correct" : "wrong";
}

export function survives(verdict: Verdict): boolean {
  return verdict === "correct" || verdict === "push";
}

export function nextStreak(streak: number, verdict: Verdict, hadPick: boolean): number {
  if (verdict === "correct") return streak + 1;
  if (verdict === "push") return hadPick ? streak + 1 : streak;
  return streak;
}

export function botPick(skill: number, answer: Answer, rand: number): Side {
  if (answer === "push") return rand < 0.5 ? "hi" : "lo";
  const correct = rand < skill;
  return correct ? answer : answer === "hi" ? "lo" : "hi";
}

export function crowdSplit(picks: Side[]): { hi: number; lo: number; n: number } {
  const total = picks.length;
  if (!total) return { hi: 0.5, lo: 0.5, n: 0 };
  const hi = picks.filter(p => p === "hi").length / total;
  return { hi, lo: 1 - hi, n: total };
}

/** Share of the lobby that chose the side that ultimately won. */
export function correctPickShare(answer: Answer, picks: Side[]): number {
  if (answer === "push") return 1;
  const split = crowdSplit(picks);
  return answer === "hi" ? split.hi : split.lo;
}

/** Difficulty-weighted reward for a correct prediction.
 *  100% correct = 10 pts, 50% = 30 pts, 5% = 48 pts, 0% = 50 pts.
 *  Wrong, timeout, and push do not earn prediction points. */
export function predictionPoints(verdict: Verdict, correctShare: number): number {
  if (verdict !== "correct") return 0;
  const share = Math.max(0, Math.min(1, correctShare));
  return Math.round(10 + 40 * (1 - share));
}

/** Local calendar key used by the offline Daily Lobby rotation. */
export function dailyKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Stable fixture slot for a date key. */
export function dailyIndex(key: string, count: number): number {
  if (count <= 0) return 0;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return (hash >>> 0) % count;
}

/** Compact, URL-safe encoding of a run's round-by-round picks. */
export function encodeGhostPicks(picks: Array<Side | null>): string {
  return picks.map(pick => pick === "hi" ? "h" : pick === "lo" ? "l" : "x").join("");
}

export function decodeGhostPicks(code: string, maxRounds = 32): Array<Side | null> {
  return code.slice(0, maxRounds).split("").map(value => value === "h" ? "hi" : value === "l" ? "lo" : null);
}

/** Final-round drama without overriding an already shorter accessibility setting. */
export function answerWindowMs(baseMs: number, aliveCount: number): number {
  return aliveCount <= 3 ? Math.min(baseMs, 3000) : baseMs;
}

export function outlived(totalPlayers: number, othersAlive: number): number {
  return Math.max(0, totalPlayers - othersAlive - 1);
}

export function isNearDeathTime(msRemainingAtPick: number | null, thresholdMs = 1200): boolean {
  return msRemainingAtPick != null && msRemainingAtPick <= thresholdMs;
}

export function isNearDeathMargin(val: number, prevVal: number): boolean {
  return Math.abs(val - prevVal) === 1;
}

export function ladderPoints(o: { predictionPoints?: number; streak?: number; outlivedCount: number; won: boolean }): number {
  const skillPoints = o.predictionPoints ?? (o.streak ?? 0) * 10;
  return skillPoints + o.outlivedCount + (o.won ? 250 : 0);
}

export function ladderRank(wall: Array<{ points: number }>, myPoints: number): number {
  let rank = 1;
  for (const row of wall) { if (row.points > myPoints) rank++; }
  return rank;
}

// ---------- richer question kinds (occurrence / side-pick / VAR-reactive) ----------
// Occurrence: "will X happen in the next N min?" — never pushes (binary),
// so it's a safe filler whenever a comparison would tie.
export interface OccurrenceDef {
  key: string; label: string; emoji: string;
  matchType: (e: ScoreEvent) => boolean;
}

export const OCCURRENCE_DEFS: OccurrenceDef[] = [
  { key: "goal",   label: "a goal",         emoji: "⚽", matchType: e => e.type === "goal" || (e.type === "penalty" && /scored/i.test(e.detail || "")) },
  { key: "card",   label: "a card",         emoji: "🟨", matchType: e => e.type === "card" },
  { key: "corner", label: "a corner",       emoji: "🚩", matchType: e => e.type === "corner" },
  { key: "sub",    label: "a substitution", emoji: "🔄", matchType: e => e.type === "sub" },
  { key: "shot",   label: "a shot",         emoji: "🎯", matchType: e => e.type === "shot" },
];

export function occurrenceInWindow(events: ScoreEvent[], def: OccurrenceDef, fromMin: number, toMin: number): boolean {
  return events.some(e => e.minute > fromMin && e.minute <= toMin && def.matchType(e));
}

// Side-pick: "more X this window — Team A or Team B?" — head-to-head
// within the SAME window (simpler/more intuitive than vs-previous-window).
export interface SideStatDef {
  key: string; label: string; emoji: string;
  get1: (s: StatMap) => number; get2: (s: StatMap) => number;
}

export const SIDE_STAT_DEFS: SideStatDef[] = [
  { key: "corners", label: "corners", emoji: "🚩", get1: s => s.c1, get2: s => s.c2 },
  { key: "shots",   label: "shots",   emoji: "🎯", get1: s => s.s1, get2: s => s.s2 },
  { key: "cards",   label: "cards",   emoji: "🟨", get1: s => s.y1 + s.r1, get2: s => s.y2 + s.r2 },
];

export function sidePickValue(events: ScoreEvent[], statIdx: number, fromMin: number, toMin: number): { team1Delta: number; team2Delta: number; answer: Answer } {
  const def = SIDE_STAT_DEFS[statIdx];
  const a = statsAt(events, fromMin), b = statsAt(events, toMin);
  const team1Delta = def.get1(b) - def.get1(a);
  const team2Delta = def.get2(b) - def.get2(a);
  const answer: Answer = team1Delta > team2Delta ? "hi" : team1Delta < team2Delta ? "lo" : "push";
  return { team1Delta, team2Delta, answer };
}

// VAR-reactive: hi = upheld/confirmed, lo = overturned/cancelled, push = ambiguous.
const VAR_OVERTURN_WORDS = /(overturn|cancel|reject|disallow|scrap|wave)/i;
const VAR_UPHOLD_WORDS = /(uphold|confirm|award|stand)/i;
export function classifyVarVerdict(detail: string | null | undefined): Answer {
  const d = String(detail || "");
  if (VAR_OVERTURN_WORDS.test(d)) return "lo";
  if (VAR_UPHOLD_WORDS.test(d)) return "hi";
  return "push";
}

function code3(name: string): string {
  return String(name || "").slice(0, 3).toUpperCase();
}

export function makeOccurrenceQuestion(
  events: ScoreEvent[], n: number, fromMin: number, windowLen: number, defIdx: number,
  kindOverride?: QuestionKind, promptOverride?: string
): Question {
  const def = OCCURRENCE_DEFS[defIdx];
  const toMin = fromMin + windowLen;
  const happened = occurrenceInWindow(events, def, fromMin, toMin);
  const answer: Answer = happened ? "hi" : "lo";
  return {
    n, kind: kindOverride || "occurrence", key: def.key, label: def.label, emoji: def.emoji,
    fromMin, windowLen,
    promptText: promptOverride || `${def.emoji} Will there be ${def.label} in the next ${windowLen} min?`,
    hiLabel: "YES", loLabel: "NO",
    answer, val: happened ? 1 : 0,
  };
}

export function makeSidePickQuestion(
  events: ScoreEvent[], n: number, fromMin: number, windowLen: number, defIdx: number, fixture?: FixtureLike
): Question {
  const def = SIDE_STAT_DEFS[defIdx];
  const toMin = fromMin + windowLen;
  const r = sidePickValue(events, defIdx, fromMin, toMin);
  const name1 = fixture?.Participant1 || "Team 1";
  const name2 = fixture?.Participant2 || "Team 2";
  return {
    n, kind: "side_pick", key: def.key, label: def.label, emoji: def.emoji,
    fromMin, windowLen,
    promptText: `${def.emoji} Next ${windowLen} min — more ${def.label}: ${name1} or ${name2}?`,
    hiLabel: code3(name1), loLabel: code3(name2), hiIsTeam1: true,
    answer: r.answer, val: r.team1Delta - r.team2Delta,
  };
}

function toScheduleQuestion(q: Question, events: ScoreEvent[]): Question {
  const r = resolveQuestion(events, q);
  return {
    n: q.n, kind: "compare_window", key: q.key, label: q.label, emoji: q.emoji,
    fromMin: q.fromMin, windowLen: q.windowLen, prevFrom: q.prevFrom, prevVal: q.prevVal,
    promptText: `${q.emoji} MORE or FEWER ${q.label} in the next ${q.windowLen} min than the last ${q.windowLen}?`,
    hiLabel: "HIGHER", loLabel: "LOWER",
    answer: r.answer, val: r.val,
  };
}

export function makeHalftimeQuestion(events: ScoreEvent[], n: number, h2Start: number): Question {
  const windowLen = 10;
  const subIdx = OCCURRENCE_DEFS.findIndex(d => d.key === "sub");
  return makeOccurrenceQuestion(events, n, h2Start, windowLen, subIdx, "halftime_special",
    `🔄 1+ substitutions in the first ${windowLen} min of the second half?`);
}

export function makePregameQuestion(events: ScoreEvent[], n: number): Question {
  const goalIdx = OCCURRENCE_DEFS.findIndex(d => d.key === "goal");
  return makeOccurrenceQuestion(events, n, 0, 45, goalIdx, "pregame", "⚽ Will there be a goal before halftime?");
}

export function makeVarQuestion(varEvent: ScoreEvent, verdictEvent: ScoreEvent, n: number): Question {
  const answer = classifyVarVerdict(verdictEvent.detail);
  return {
    n, kind: "var_reactive", key: "var", label: "VAR review", emoji: "📺",
    fromMin: varEvent.minute, windowLen: Math.max(1, verdictEvent.minute - varEvent.minute),
    promptText: "📺 VAR REVIEW — will the call be upheld?",
    hiLabel: "UPHELD", loLabel: "OVERTURNED",
    answer, val: answer === "hi" ? 1 : answer === "lo" ? -1 : 0,
  };
}

// tally = running {hi, lo} answer counts across the schedule so far.
// Because every answer is known at build time, the builder can steer the
// hi/lo mix toward balance — without it, sparse real fixtures skew heavily
// one way (e.g. 9/10 "NO") and blindly picking one side becomes a winning
// strategy, which kills the game.
export function pickWindowQuestion(
  events: ScoreEvent[], n: number, fromMin: number, windowLen: number, recentKeys: string[], fixture?: FixtureLike,
  tally?: { hi: number; lo: number }
): Question {
  const candidates: Question[] = [];
  for (let i = 0; i < SIDE_STAT_DEFS.length; i++) candidates.push(makeSidePickQuestion(events, n, fromMin, windowLen, i, fixture));
  for (let i = 0; i < OCCURRENCE_DEFS.length; i++) candidates.push(makeOccurrenceQuestion(events, n, fromMin, windowLen, i));
  candidates.push(toScheduleQuestion(makeQuestion(events, n, fromMin, windowLen), events));

  const nonPush = candidates.filter(q => q.answer !== "push");
  const pool = nonPush.length ? nonPush : candidates;
  const fresh = pool.filter(q => recentKeys.indexOf(q.key) === -1);
  let finalPool = fresh.length ? fresh : pool;
  if (tally) {
    const minority = tally.hi < tally.lo ? "hi" : tally.lo < tally.hi ? "lo" : null;
    if (minority) {
      const balancing = finalPool.filter(q => q.answer === minority);
      if (balancing.length) finalPool = balancing;
    }
  }
  return finalPool[n % finalPool.length];
}

/**
 * Precompute the FULL round schedule for a replay lobby. Since EVENTS is a
 * static, fully-known array (this is a replay, not a live feed), every
 * question's minute, kind, and correct answer can be resolved up front —
 * that's what makes the VAR-reactive slot, the pregame prop, the halftime
 * special, and an "up next" queue all simple: they're just entries in one
 * ordered array, not runtime special-casing.
 * Targets ~9-10 entries total: 1 pregame + up to `maxWindows` rolling
 * windows (default 7, capped independent of match length) + 1 halftime
 * special + 1 entry per real var->var_verdict pair.
 */
export function buildSchedule(events: ScoreEvent[], fixture?: FixtureLike, opts?: { windowLen?: number; maxWindows?: number }): Question[] {
  const windowLen = opts?.windowLen || 10;
  const maxWindows = opts?.maxWindows || 7;
  let maxMinute = 0;
  events.forEach(e => { if (e.minute > maxMinute) maxMinute = e.minute; });

  let h2Start = 45;
  for (const e of events) { if (e.type === "kickoff" && e.minute >= 44) { h2Start = e.minute; break; } }

  const schedule: Question[] = [];
  let n = 0;
  const tally = { hi: 0, lo: 0 };
  const count = (q: Question) => { if (q.answer === "hi") tally.hi++; else if (q.answer === "lo") tally.lo++; };

  n++; const pre = makePregameQuestion(events, n); schedule.push(pre); count(pre);

  const recentKeys: string[] = [];
  let fromMin = windowLen, windowCount = 0;
  while (fromMin + windowLen <= maxMinute && windowCount < maxWindows) {
    n++;
    // windows straddling the second-half kickoff avoid "sub" — the halftime
    // special right after is already a substitution question.
    const avoid = Math.abs(fromMin - h2Start) <= windowLen ? recentKeys.concat(["sub"]) : recentKeys;
    const q = pickWindowQuestion(events, n, fromMin, windowLen, avoid, fixture, tally);
    schedule.push(q); count(q);
    recentKeys.push(q.key); if (recentKeys.length > 2) recentKeys.shift();
    windowCount++;
    fromMin += windowLen;
  }

  n++; schedule.push(makeHalftimeQuestion(events, n, h2Start));

  let openVar: ScoreEvent | null = null;
  for (const e of events) {
    if (e.type === "var" && !openVar) openVar = e;
    else if (e.type === "var_verdict" && openVar) { n++; schedule.push(makeVarQuestion(openVar, e, n)); openVar = null; }
  }

  schedule.sort((a, b) => a.fromMin - b.fromMin);
  schedule.forEach((q, i) => { q.n = i + 1; });
  return schedule;
}
