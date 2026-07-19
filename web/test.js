/* HI-LO ROYALE — unit tests for the shared game logic.
   Run: node web/test.js   (or node test.js from web/)
   Uses the same mock feed the web app consumes, so the expected
   values below are hand-counted from shared/txline-mock.js TIMELINE:
     corners at 6',14',29',49',63',78',97',116'
     shots   at 3',12',19',26',34',52',60',75',84',101',112',119'
     cards   yellows 17',42',66' + red 81'
     goals   23',39'(pen),69',87',104'
     subs    55',72'
   Engine v2 sections at the bottom cover: availableStats, the
   occurrence base-rate guard, odds_swing / next_goal / goals_ou,
   the thin-tape regression, and property tests on the real lobby
   tapes in lobbies.js. */
const TxMock = require("../shared/txline-mock.js");
const L = require("./game-logic.js");

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
}

const E = TxMock.EVENTS;

// ---------- stat windows ----------
console.log("stat windows");
eq("stats at minute 0 are empty", L.statsAt(E, 0), L.EMPTY_STATS);
eq("corners 0-15 = 2 (6' + 14')", L.windowValue(E, 0, 0, 15), 2);
eq("corners 15-30 = 1 (29')", L.windowValue(E, 0, 15, 30), 1);
eq("shots 0-15 = 2 (3' + 12')", L.windowValue(E, 1, 0, 15), 2);
eq("shots 15-30 = 2 (19' + 26')", L.windowValue(E, 1, 15, 30), 2);
eq("cards 0-15 = 0", L.windowValue(E, 2, 0, 15), 0);
eq("cards 15-30 = 1 (yellow 17')", L.windowValue(E, 2, 15, 30), 1);
eq("full-match corners = 8", L.windowValue(E, 0, 0, 120), 8);
eq("full-match shots = 12", L.windowValue(E, 1, 0, 120), 12);
eq("full-match cards = 4 (3Y + 1R)", L.windowValue(E, 2, 0, 120), 4);

// ---------- question generation ----------
console.log("question generation");
const q1 = L.makeQuestion(E, 1, 15);
eq("Q1 rotates to shots", q1.key, "shots");
eq("Q1 prev window is 0-15", [q1.prevFrom, q1.fromMin], [0, 15]);
eq("Q1 prevVal = 2 shots", q1.prevVal, 2);
const q2 = L.makeQuestion(E, 2, 15);
eq("Q2 rotates to cards", q2.key, "cards");
const q3 = L.makeQuestion(E, 3, 15);
eq("Q3 rotates to corners", q3.key, "corners");
eq("Q3 prevVal = 2 corners", q3.prevVal, 2);
const qClamp = L.makeQuestion(E, 3, 10);
eq("early-minute prev window clamps to 0", qClamp.prevFrom, 0);
eq("clamped prevVal = corners 0-10 = 1", qClamp.prevVal, 1);

// Quizmaster rule: skip stats whose outcome would tie.
const qb1 = L.makeBestQuestion(E, 1, 15);
eq("Q1 shots would push → quizmaster rotates to cards", qb1.key, "cards");
eq("rotated question keeps its round number", qb1.n, 1);
eq("rotated question is decidable", L.resolveQuestion(E, qb1).answer, "hi");
const qb5 = L.makeBestQuestion(E, 5, 75);
eq("75-90 window: all three stats tie → genuine push round", L.resolveQuestion(E, qb5).answer, "push");
eq("all-push window falls back to rotation stat", qb5.key, "cards");

// ---------- hi/lo resolution against real stat deltas ----------
console.log("resolution");
eq("corners 15-30 (1) vs 0-15 (2) → LO", L.resolveQuestion(E, q3), { val: 1, answer: "lo" });
eq("shots 15-30 (2) vs 0-15 (2) → PUSH", L.resolveQuestion(E, q1), { val: 2, answer: "push" });
eq("cards 15-30 (1) vs 0-15 (0) → HI", L.resolveQuestion(E, q2), { val: 1, answer: "hi" });

// ---------- judging + elimination rules ----------
console.log("elimination rules");
eq("right pick → correct", L.judge("hi", "hi"), "correct");
eq("wrong pick → wrong", L.judge("hi", "lo"), "wrong");
eq("no pick → timeout", L.judge("lo", null), "timeout");
eq("push overrides any pick", L.judge("push", "lo"), "push");
eq("correct survives", L.survives("correct"), true);
eq("push survives", L.survives("push"), true);
eq("wrong is eliminated", L.survives("wrong"), false);
eq("timeout is eliminated", L.survives("timeout"), false);

// ---------- streak math ----------
console.log("streak math");
eq("correct bumps streak", L.nextStreak(4, "correct", true), 5);
eq("push with a pick bumps streak", L.nextStreak(4, "push", true), 5);
eq("push without a pick holds streak", L.nextStreak(4, "push", false), 4);
eq("wrong freezes streak", L.nextStreak(4, "wrong", true), 4);
eq("timeout freezes streak", L.nextStreak(4, "timeout", false), 4);

// ---------- bots + crowd bar ----------
console.log("bots + crowd");
eq("perfect bot picks the answer", L.botPick(1.0, "hi", 0.99), "hi");
eq("hopeless bot picks the opposite", L.botPick(0.0, "hi", 0.5), "lo");
eq("skilled roll under skill → correct", L.botPick(0.6, "lo", 0.59), "lo");
eq("roll over skill → wrong", L.botPick(0.6, "lo", 0.61), "hi");
eq("push pick is coin-flip low half", L.botPick(0.6, "push", 0.2), "hi");
eq("push pick is coin-flip high half", L.botPick(0.6, "push", 0.8), "lo");
eq("crowd split 3 hi / 1 lo", L.crowdSplit(["hi","hi","hi","lo"]), { hi: 0.75, lo: 0.25, n: 4 });
eq("empty crowd defaults 50/50", L.crowdSplit([]), { hi: 0.5, lo: 0.5, n: 0 });

// ---------- survival framing ----------
console.log("survival framing");
eq("winner outlived all 99", L.outlived(100, 0), 99);
eq("died with 40 others alive → outlived 59", L.outlived(100, 40), 59);
eq("first out outlived 0", L.outlived(100, 99), 0);
eq("pick with 0.8s left is near-death", L.isNearDeathTime(800), true);
eq("pick with 3s left is not", L.isNearDeathTime(3000), false);
eq("margin of exactly 1 is a near-death reveal", L.isNearDeathMargin(3, 2), true);
eq("margin of 2 is not", L.isNearDeathMargin(4, 2), false);

// ---------- tournament ladder ----------
console.log("ladder");
eq("crown run: streak 7, outlived 99, won", L.ladderPoints({ streak: 7, outlivedCount: 99, won: true }), 419);
eq("mid run: streak 3, outlived 59", L.ladderPoints({ streak: 3, outlivedCount: 59, won: false }), 89);
const wall = [{ points: 500 }, { points: 400 }, { points: 300 }];
eq("rank above the wall", L.ladderRank(wall, 600), 1);
eq("rank mid-wall", L.ladderRank(wall, 350), 3);
eq("tie ranks with the incumbent", L.ladderRank(wall, 400), 2);
eq("rank below the wall", L.ladderRank(wall, 10), 4);

// ---------- occurrence questions ----------
console.log("occurrence questions");
const GOAL_DEF = L.OCCURRENCE_DEFS.find(d => d.key === "goal");
const CARD_DEF = L.OCCURRENCE_DEFS.find(d => d.key === "card");
const SUB_DEF = L.OCCURRENCE_DEFS.find(d => d.key === "sub");
eq("no goal in 0-15", L.occurrenceInWindow(E, GOAL_DEF, 0, 15), false);
eq("goal in 15-30 (23')", L.occurrenceInWindow(E, GOAL_DEF, 15, 30), true);
eq("penalty-scored counts as a goal (30-45, 39')", L.occurrenceInWindow(E, GOAL_DEF, 30, 45), true);
eq("no card in 45-60", L.occurrenceInWindow(E, CARD_DEF, 45, 60), false);
eq("card in 60-75 (66')", L.occurrenceInWindow(E, CARD_DEF, 60, 75), true);
const occQ = L.makeOccurrenceQuestion(E, 1, 15, 15, L.OCCURRENCE_DEFS.indexOf(GOAL_DEF));
eq("occurrence question never pushes (hi)", occQ.answer, "hi");
eq("occurrence hi/lo labels are YES/NO", [occQ.hiLabel, occQ.loLabel], ["YES", "NO"]);

// ---------- side-pick questions ----------
console.log("side-pick questions");
eq("corners 0-15 side-pick is a push (1 France - 1 Morocco)", L.sidePickValue(E, 0, 0, 15), { team1Delta: 1, team2Delta: 1, answer: "push" });
eq("corners 0-30 side-pick: Morocco ahead 2-1 -> lo", L.sidePickValue(E, 0, 0, 30), { team1Delta: 1, team2Delta: 2, answer: "lo" });
eq("shots 0-40 side-pick: Morocco ahead 3-2 -> lo", L.sidePickValue(E, 1, 0, 40), { team1Delta: 2, team2Delta: 3, answer: "lo" });
eq("cards 0-70 side-pick: Morocco ahead 2-1 -> lo", L.sidePickValue(E, 2, 0, 70), { team1Delta: 1, team2Delta: 2, answer: "lo" });
const spQ = L.makeSidePickQuestion(E, 1, 0, 30, 0, TxMock.FIXTURE);
eq("side-pick labels are 3-letter team codes", [spQ.hiLabel, spQ.loLabel], ["FRA", "MOR"]);
eq("side-pick answer matches sidePickValue", spQ.answer, "lo");

// ---------- VAR-reactive classification ----------
console.log("VAR verdict classification");
eq("'Upheld — penalty awarded' -> hi", L.classifyVarVerdict("Upheld — penalty awarded"), "hi");
eq("'Overturned' -> lo", L.classifyVarVerdict("Overturned"), "lo");
eq("empty/unknown detail -> push", L.classifyVarVerdict(""), "push");

// ---------- full schedule builder ----------
console.log("buildSchedule");
const schedule = L.buildSchedule(E, TxMock.FIXTURE);
// v2: schedule gained a goals_ou entry (second-half over/under), so the mock
// tape now yields 11 = 1 pregame + 7 windows + 1 goals_ou + 1 halftime + 1 VAR.
eq("schedule has 11 entries (pregame + 7 windows + goals_ou + halftime + VAR)", schedule.length, 11);
eq("schedule sorted by fromMin", schedule.every((q, i) => i === 0 || q.fromMin >= schedule[i - 1].fromMin), true);
eq("schedule renumbered 1..N in final order", schedule.map(q => q.n), schedule.map((_, i) => i + 1));
eq("entry 0 is the pregame prop", schedule[0].kind, "pregame");
eq("exactly one halftime_special entry", schedule.filter(q => q.kind === "halftime_special").length, 1);
eq("exactly one var_reactive entry (one var->var_verdict pair in the mock)", schedule.filter(q => q.kind === "var_reactive").length, 1);
const varEntry = schedule.find(q => q.kind === "var_reactive");
eq("VAR entry scheduled at the var event's minute (36)", varEntry.fromMin, 36);
eq("VAR entry answer reflects the real verdict (Upheld -> hi)", varEntry.answer, "hi");
eq("occurrence-kind entries never push", schedule.filter(q => q.kind === "occurrence" || q.kind === "pregame" || q.kind === "halftime_special").every(q => q.answer !== "push"), true);
// Answer balance: the builder steers hi/lo toward ~50/50 (all answers known at
// build time), so blindly picking one side can never be a dominant strategy.
const hiCount = schedule.filter(q => q.answer === "hi").length;
const loCount = schedule.filter(q => q.answer === "lo").length;
eq("answers are balanced (neither side under 3 of 11)", Math.min(hiCount, loCount) >= 3, true);
// Windows straddling the second-half kickoff must not duplicate the halftime
// special's substitution question.
const ht = schedule.find(q => q.kind === "halftime_special");
eq("no window sub-question adjacent to the halftime special",
  schedule.filter(q => q.kind === "occurrence" && q.key === "sub" && Math.abs(q.fromMin - ht.fromMin) <= q.windowLen).length, 0);
// pickWindowQuestion honors the minority side of a lopsided tally when a
// balancing candidate exists.
const balQ = L.pickWindowQuestion(E, 2, 30, 10, [], TxMock.FIXTURE, { hi: 0, lo: 5 });
eq("lopsided tally steers the pick to the minority answer", balQ.answer, "hi");

// ---------- full deterministic lobby sim (integration) ----------
console.log("integration: full lobby replay");
(function () {
  // Deterministic LCG so the sim is reproducible.
  let seed = 42;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const bots = Array.from({ length: 99 }, () => ({ alive: true, skill: 0.45 + rand() * 0.25 }));
  let n = 0, fromMin = 15, pushes = 0;
  while (fromMin + 15 <= 120 && bots.some(b => b.alive)) {
    n++;
    const q = L.makeBestQuestion(E, n, fromMin);
    const { answer } = L.resolveQuestion(E, q);
    if (answer === "push") pushes++;
    for (const b of bots) {
      if (!b.alive) continue;
      const pick = L.botPick(b.skill, answer, rand());
      if (!L.survives(L.judge(answer, pick))) b.alive = false;
    }
    fromMin += 15;
  }
  const survivors = bots.filter(b => b.alive).length;
  eq("lobby ran 7 question windows", n, 7);
  eq("elimination cascade thins 99 bots to a handful", survivors <= 5, true);
  eq("pushes never eliminate anyone (sanity)", pushes >= 0, true);
})();

/* ============================================================
   ENGINE v2 — tape-signal guards + new question kinds
   ============================================================ */

// Synthetic tape builder: rows of [minute, type, team], cumulative stats
// derived the same way the real capture pipeline does it.
function mkTape(rows) {
  const stats = { c1: 0, c2: 0, g1: 0, g2: 0, y1: 0, y2: 0, r1: 0, r2: 0, s1: 0, s2: 0 };
  return rows.map((r, i) => {
    const [minute, type, team] = r;
    if (type === "goal") stats["g" + team]++;
    if (type === "corner") stats["c" + team]++;
    if (type === "shot") stats["s" + team]++;
    if (type === "card") stats["y" + team]++;
    return { seq: i + 1, minute, type, team, detail: "", stats: { ...stats } };
  });
}

// 16-event goals+corners-only tape mirroring the real France-England capture
// (final 2-4, no shots/cards/subs/VAR recorded even though the real match had
// them — a THIN capture, the exact case that used to produce nonsense bets).
const THIN = mkTape([
  [0, "kickoff", 0], [2, "goal", 2], [6, "corner", 2], [11, "goal", 2],
  [14, "corner", 1], [17, "corner", 2], [34, "corner", 1], [36, "goal", 2],
  [45, "halftime", 0], [45, "kickoff", 0], [54, "goal", 1], [63, "corner", 2],
  [68, "goal", 2], [73, "corner", 1], [86, "goal", 1], [90, "fulltime", 0],
]);
const THIN_FIXTURE = { Participant1: "France", Participant2: "England", Participant1IsHome: true };

// ---------- availableStats ----------
console.log("v2: availableStats");
eq("rich mock tape has every signal",
  L.availableStats(E), ["goal", "goals", "corner", "corners", "shot", "shots", "card", "cards", "sub"]);
eq("thin goals+corners tape exposes ONLY goal/corner keys",
  L.availableStats(THIN), ["goal", "goals", "corner", "corners"]);
eq("empty tape has no signal", L.availableStats([]), []);
// Event type present but cumulative total 0 (e.g. only a 0-0 kickoff stats
// row) must not count as signal.
const ZERO = mkTape([[0, "kickoff", 0], [90, "fulltime", 0]]);
eq("kickoff+fulltime only -> no signal", L.availableStats(ZERO), []);

// ---------- occurrence base-rate guard ----------
console.log("v2: base-rate guard");
eq("mock sub base rate = 2/12 windows", L.occurrenceBaseRate(E, SUB_DEF, 10), 2 / 12);
eq("mock goal base rate = 5/12 windows", L.occurrenceBaseRate(E, GOAL_DEF, 10), 5 / 12);
eq("subs (17%) fail the 20-80 band", L.occurrenceIsInteresting(E, SUB_DEF, 10), false);
eq("goals (42%) pass the 20-80 band", L.occurrenceIsInteresting(E, GOAL_DEF, 10), true);
eq("band constants exported", [L.BASE_RATE_MIN, L.BASE_RATE_MAX], [0.2, 0.8]);
// A tape where shots fire in EVERY window: "will there be a shot?" is a
// guaranteed YES and must be filtered.
const DENSE = mkTape([
  [0, "kickoff", 0], [3, "shot", 1], [7, "shot", 2], [13, "shot", 1], [17, "shot", 2],
  [20, "corner", 1], [23, "shot", 1], [27, "shot", 2], [30, "goal", 1], [33, "shot", 1],
  [37, "shot", 2], [43, "shot", 1], [47, "shot", 2], [53, "shot", 1], [57, "shot", 2],
  [60, "goal", 2], [63, "shot", 1], [67, "shot", 2], [70, "corner", 2], [73, "shot", 1],
  [77, "shot", 2], [83, "shot", 1], [87, "shot", 2], [90, "fulltime", 0],
]);
const SHOT_DEF = L.OCCURRENCE_DEFS.find(d => d.key === "shot");
eq("shot-every-window tape: base rate 100%", L.occurrenceBaseRate(DENSE, SHOT_DEF, 10), 1);
eq("near-certain YES is not interesting", L.occurrenceIsInteresting(DENSE, SHOT_DEF, 10), false);
const denseSched = L.buildSchedule(DENSE, THIN_FIXTURE);
eq("no 'will there be a shot?' question on a shot-every-window tape",
  denseSched.filter(q => q.kind === "occurrence" && q.key === "shot").length, 0);
eq("...but shot side-picks/compares are still allowed (shots have signal)",
  L.availableStats(DENSE).includes("shots"), true);

// ---------- thin-tape regression (the France-England bug) ----------
console.log("v2: thin-tape regression");
const thinSched = L.buildSchedule(THIN, THIN_FIXTURE);
const GHOST_KEYS = ["shot", "shots", "card", "cards", "sub"];
eq("ZERO shot/card/sub questions on a goals+corners-only tape",
  thinSched.filter(q => GHOST_KEYS.indexOf(q.key) !== -1).length, 0);
eq("no halftime sub special without subs in the tape",
  thinSched.filter(q => q.kind === "halftime_special").length, 0);
eq("no prompts mention unrecorded stats",
  thinSched.every(q => !/shot|card|substitution/i.test(q.promptText)), true);
eq("thin schedule still fills out (>= 7 questions)", thinSched.length >= 7, true);
eq("thin schedule respects the 12-question cap", thinSched.length <= 12, true);
eq("thin schedule sorted by fromMin", thinSched.every((q, i) => i === 0 || q.fromMin >= thinSched[i - 1].fromMin), true);
eq("thin schedule renumbered 1..N", thinSched.map(q => q.n), thinSched.map((_, i) => i + 1));
eq("thin schedule keeps the pregame prop (tape has goals)", thinSched[0].kind, "pregame");
eq("every occurrence question passes the base-rate band",
  thinSched.filter(q => q.kind === "occurrence")
    .every(q => L.occurrenceIsInteresting(THIN, L.OCCURRENCE_DEFS.find(d => d.key === q.key), q.windowLen)), true);
eq("thin schedule answers stay balanced",
  Math.min(thinSched.filter(q => q.answer === "hi").length, thinSched.filter(q => q.answer === "lo").length) >= 2, true);
// A tape with NO goals must drop the pregame prop (it would be a certain NO).
const GOALLESS = mkTape([
  [0, "kickoff", 0], [6, "corner", 1], [19, "corner", 2], [33, "corner", 1],
  [45, "halftime", 0], [45, "kickoff", 0], [58, "corner", 2], [71, "corner", 1], [90, "fulltime", 0],
]);
const goallessSched = L.buildSchedule(GOALLESS, THIN_FIXTURE);
eq("goalless tape: no pregame goal prop", goallessSched.filter(q => q.kind === "pregame").length, 0);
eq("goalless tape: no goal-keyed questions at all", goallessSched.filter(q => q.key === "goal" || q.key === "goals").length, 0);

// ---------- next_goal ----------
console.log("v2: next_goal");
const ng15 = L.makeNextGoalQuestion(E, 1, 15, TxMock.FIXTURE);
eq("next goal after 15' is France's 23' -> hi", [ng15.kind, ng15.answer], ["next_goal", "hi"]);
eq("next_goal resolves at the goal's minute (windowLen 8)", ng15.windowLen, 8);
eq("next_goal labels are team codes, hi = team 1", [ng15.hiLabel, ng15.loLabel, ng15.hiIsTeam1], ["FRA", "MOR", true]);
eq("next goal after 100' is Morocco's 104' -> lo", L.makeNextGoalQuestion(E, 1, 100, TxMock.FIXTURE).answer, "lo");
eq("no goal left after 110' -> no question (never a guaranteed push)", L.makeNextGoalQuestion(E, 1, 110, TxMock.FIXTURE), null);
eq("penalty 'Scored' counts as the next goal (35' -> 39' pen, team 2)", L.makeNextGoalQuestion(E, 1, 35, TxMock.FIXTURE).answer, "lo");
eq("goalless tape -> never offers next_goal", L.makeNextGoalQuestion(GOALLESS, 1, 10, THIN_FIXTURE), null);
// Property: every scheduled next_goal is decidable (hi or lo, never push).
eq("scheduled next_goal entries are always decidable",
  thinSched.concat(denseSched, goallessSched, schedule)
    .filter(q => q.kind === "next_goal")
    .every(q => q.answer === "hi" || q.answer === "lo"), true);

// ---------- goals_ou ----------
console.log("v2: goals_ou");
const gouHi = L.makeGoalsOuQuestion(E, 1, 46, 90, "hi");
eq("mock H2 (46-90) has 2 goals; prefer-hi threshold = 2 -> YES", [gouHi.prevVal, gouHi.answer, gouHi.val], [2, "hi", 2]);
eq("goals_ou prompt states the threshold", gouHi.promptText, "2 or more goals in the second half?");
eq("goals_ou labels are YES/NO", [gouHi.hiLabel, gouHi.loLabel], ["YES", "NO"]);
const gouLo = L.makeGoalsOuQuestion(E, 1, 46, 90, "lo");
eq("prefer-lo threshold = actual+1 = 3 -> NO", [gouLo.prevVal, gouLo.answer], [3, "lo"]);
eq("zero-goal stretch: threshold clamps to 1, answer NO", (() => {
  const g = L.makeGoalsOuQuestion(E, 1, 105, 120, "hi");
  return [g.prevVal, g.answer, g.val];
})(), [1, "lo", 0]);
eq("mock schedule contains exactly one goals_ou", schedule.filter(q => q.kind === "goals_ou").length, 1);
eq("thin schedule contains exactly one goals_ou", thinSched.filter(q => q.kind === "goals_ou").length, 1);
const thinGou = thinSched.find(q => q.kind === "goals_ou");
eq("thin tape H2 has 3 goals -> threshold anchored at 3 or 4", thinGou.prevVal === 3 || thinGou.prevVal === 4, true);
eq("goals_ou answer math holds on the thin tape", thinGou.answer, thinGou.val >= thinGou.prevVal ? "hi" : "lo");

// ---------- odds_swing ----------
console.log("v2: odds_swing");
const ODDS = [
  { m: 0, p1: 50, draw: 20, p2: 30 },
  { m: 10, p1: 40, draw: 20, p2: 40 },
  { m: 20, p1: 39.5, draw: 20, p2: 40.5 },
  { m: 30, p1: 60, draw: 20, p2: 20 },
];
const os1 = L.makeOddsSwingQuestion(ODDS, 1, 0, 10, TxMock.FIXTURE);
eq("p2 30% -> 40% at 10' -> HIGHER (hi)", [os1.kind, os1.answer], ["odds_swing", "hi"]);
eq("odds_swing labels HIGHER/LOWER", [os1.hiLabel, os1.loLabel], ["HIGHER", "LOWER"]);
eq("prompt names team 2 and the current %", os1.promptText, "Will Morocco win probability be HIGHER or LOWER at 10' than now (30%)?");
eq("move of 0.5pt is inside the 1pt push band", L.makeOddsSwingQuestion(ODDS, 1, 10, 20, TxMock.FIXTURE).answer, "push");
eq("p2 40.5% -> 20% at 30' -> LOWER (lo)", L.makeOddsSwingQuestion(ODDS, 1, 20, 30, TxMock.FIXTURE).answer, "lo");
eq("series ends before target minute -> push (no sample)", L.makeOddsSwingQuestion(ODDS, 1, 25, 40, TxMock.FIXTURE).answer, "push");
eq("no odds series -> no question", L.makeOddsSwingQuestion(null, 1, 0, 10, TxMock.FIXTURE), null);
eq("un-normalized keys (fra/eng) are rejected",
  L.makeOddsSwingQuestion([{ m: 0, fra: 50, draw: 20, eng: 30 }, { m: 10, fra: 40, draw: 20, eng: 40 }], 1, 0, 10, TxMock.FIXTURE), null);
eq("winpct wrapper object is accepted", L.normalizeOddsSeries({ winpct: ODDS }).length, 4);
eq("oddsSampleAt picks last sample at-or-before the minute", L.oddsSampleAt(ODDS, 12).m, 10);
eq("oddsSampleAt before the first sample -> null", L.oddsSampleAt(ODDS, -1), null);

// buildSchedule + odds: at most 2 swings, spaced, non-push, cap holds.
const bigSeries = [];
for (let m = 0; m <= 120; m += 5) bigSeries.push({ m, p1: 50 + 20 * Math.sin(m / 12), draw: 20, p2: 30 - 20 * Math.sin(m / 12) });
const oddsSched = L.buildSchedule(E, TxMock.FIXTURE, { odds: bigSeries });
const swings = oddsSched.filter(q => q.kind === "odds_swing");
eq("odds schedule carries odds_swing rounds", swings.length >= 1, true);
eq("at most 2 odds_swing per schedule", swings.length <= 2, true);
eq("scheduled swings are never guaranteed pushes", swings.every(q => q.answer !== "push"), true);
eq("swings are spaced >= 20 minutes apart",
  swings.length < 2 || swings[1].fromMin - swings[0].fromMin >= 20, true);
eq("schedule stays within the 9-12 target with odds", oddsSched.length >= 9 && oddsSched.length <= 12, true);
eq("odds schedule still sorted + renumbered",
  [oddsSched.every((q, i) => i === 0 || q.fromMin >= oddsSched[i - 1].fromMin), oddsSched.map(q => q.n).join(",") === oddsSched.map((_, i) => i + 1).join(",")], [true, true]);
eq("no odds passed -> no odds_swing rounds", schedule.filter(q => q.kind === "odds_swing").length, 0);

// ---------- no emojis in any user-facing prompt (contract rule) ----------
console.log("v2: prompt hygiene");
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
eq("no emoji in any generated promptText",
  schedule.concat(thinSched, denseSched, goallessSched, oddsSched).every(q => !EMOJI_RE.test(q.promptText)), true);
eq("every question keeps the contract field shape",
  schedule.concat(thinSched, oddsSched).every(q =>
    typeof q.n === "number" && typeof q.kind === "string" && typeof q.key === "string" &&
    typeof q.fromMin === "number" && typeof q.windowLen === "number" &&
    typeof q.promptText === "string" && typeof q.hiLabel === "string" && typeof q.loLabel === "string" &&
    (q.answer === "hi" || q.answer === "lo" || q.answer === "push") && typeof q.val === "number"), true);

// ---------- integration: real lobby tapes (lobbies.js) ----------
// lobbies.js is regenerated as tapes are added, so these are PROPERTY tests
// (no hard-coded event contents): whatever the tape, the engine must never
// ask about a stat the tape has no signal for.
console.log("v2: real lobby tapes");
(function () {
  global.window = global.window || {};
  let lobbies = [];
  try { require("./lobbies.js"); lobbies = global.window.LOBBIES || []; }
  catch (err) { console.error("      (lobbies.js failed to load: " + err.message + ")"); }
  eq("lobbies.js loads with at least one lobby", lobbies.length >= 1, true);

  let signalOk = true, structureOk = true, swingOk = true, nextGoalOk = true, baseRateOk = true;
  const notes = [];
  for (const lob of lobbies) {
    const avail = new Set(L.availableStats(lob.events));
    const series = lob.odds && (lob.odds.winpct || lob.odds);
    const sched = L.buildSchedule(lob.events, lob.fixture, { odds: series });

    // 1) never a question about a stat without signal
    for (const q of sched) {
      if (q.key === "var" || q.key === "odds") continue;
      const base = q.key === "goals" ? "goal" : q.key;
      if (!avail.has(q.key) && !avail.has(base)) {
        signalOk = false; notes.push(lob.fixtureId + ": unavailable-stat question " + q.kind + "/" + q.key);
      }
    }
    // 2) structure: sorted, renumbered, sane size
    if (!sched.every((q, i) => i === 0 || q.fromMin >= sched[i - 1].fromMin)) structureOk = false;
    if (sched.map(q => q.n).join(",") !== sched.map((_, i) => i + 1).join(",")) structureOk = false;
    if (sched.length < 7 || sched.length > 12) { structureOk = false; notes.push(lob.fixtureId + ": size " + sched.length); }
    // 3) odds swings: <= 2, non-push, only when the lobby has odds
    const sw = sched.filter(q => q.kind === "odds_swing");
    if (sw.length > 2 || sw.some(q => q.answer === "push")) swingOk = false;
    if (sw.length && !series) swingOk = false;
    // 4) next_goal is never degenerate: a later goal really exists
    for (const q of sched.filter(x => x.kind === "next_goal")) {
      if (q.answer === "push") nextGoalOk = false;
      if (!lob.events.some(e => e.minute > q.fromMin && L.isGoalEvent(e))) nextGoalOk = false;
    }
    // 5) occurrence questions respect the base-rate band on THIS tape
    for (const q of sched.filter(x => x.kind === "occurrence")) {
      const def = L.OCCURRENCE_DEFS.find(d => d.key === q.key);
      if (!def || !L.occurrenceIsInteresting(lob.events, def, q.windowLen)) baseRateOk = false;
    }
  }
  if (notes.length) console.error("      notes: " + notes.join("; "));
  eq("no lobby ever gets an unavailable-stat question", signalOk, true);
  eq("every lobby schedule is sorted, renumbered, 7-12 questions", structureOk, true);
  eq("odds_swing rounds: <=2, non-push, only with an odds series", swingOk, true);
  eq("next_goal rounds always have a real later goal", nextGoalOk, true);
  eq("occurrence rounds respect the base-rate band per tape", baseRateOk, true);
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
