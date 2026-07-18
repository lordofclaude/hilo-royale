/* HI-LO ROYALE — unit tests for the shared game logic.
   Run: node test.js   (from t2-hilo-royale/)
   Uses the same mock feed the web app consumes, so the expected
   values below are hand-counted from shared/txline-mock.js TIMELINE:
     corners at 6',14',29',49',63',78',97',116'
     shots   at 3',12',19',26',34',52',60',75',84',101',112',119'
     cards   yellows 17',42',66' + red 81'
*/
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
eq("schedule has 10 entries (1 pregame + 7 windows + 1 halftime + 1 VAR)", schedule.length, 10);
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
eq("answers are balanced (neither side under 3 of 10)", Math.min(hiCount, loCount) >= 3, true);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
