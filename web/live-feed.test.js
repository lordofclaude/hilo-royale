/* HI-LO ROYALE — unit tests for web/live-feed.js (LiveFeed).
   Run: node live-feed.test.js   (from web/) — exits 0 when green.

   Sample payloads are trimmed copies of the REAL France-England capture
   (shared/real-data/18257865.scores-raw.txt): the same goal repeats over
   Seq 51/52/53 sharing action Id 56 (unconfirmed then confirmed), stats
   maps use statKeys 1..8, GameState stays "scheduled" all match, and
   Clock.Seconds is absolute (H2 starts at 2700). Odds payloads follow
   /api/odds/updates shape: MessageId, Ts, SuperOddsType, Pct[] percents. */
"use strict";
const LiveFeed = require("./live-feed.js");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}`); }
}
function eq(name, got, want) {
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (same) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
}

// ---------------------------------------------------------- fixtures (from the real capture)
const BASE = {
  FixtureId: 18257865, GameState: "scheduled", StartTime: 1784408400000, IsTeam: true,
  CompetitionId: 72, SportId: 1, Participant1IsHome: true, Participant1Id: 1999, Participant2Id: 1888,
};
// trimmed stats map helper (statKeys 1..8 + a couple of period keys like the real feed)
const smap = (g1, g2, c1, c2) => ({ "1": g1, "2": g2, "3": 0, "4": 0, "5": 0, "6": 0, "7": c1, "8": c2, "1002": g2, "2002": g2 });

const kickoff17 = { ...BASE, Action: "kickoff", Id: 25, Ts: 1784408413795, Seq: 17, StatusId: 2, Confirmed: false, Clock: { Running: true, Seconds: 0 }, Stats: {}, Kickoff: { Team: 1 } };
// one physical goal, three feed updates (Id 56)
const goal51 = { ...BASE, Action: "goal", Id: 56, Ts: 1784408551516, Seq: 51, StatusId: 2, Confirmed: false, Clock: { Running: true, Seconds: 137 }, Data: {}, Stats: {}, Participant: 2 };
const goal52 = { ...BASE, Action: "goal", Id: 56, Ts: 1784408630197, Seq: 52, StatusId: 2, Confirmed: true, Clock: { Running: true, Seconds: 137 }, Data: { GoalType: "Shot" }, Stats: smap(0, 1, 0, 0), Participant: 2 };
const goal53 = { ...BASE, Action: "goal", Id: 56, Ts: 1784408632379, Seq: 53, StatusId: 2, Confirmed: true, Clock: { Running: true, Seconds: 137 }, Data: { GoalType: "Shot", PlayerId: 720122 }, Stats: smap(0, 1, 0, 0), Participant: 2 };
// one corner, two updates (Id 103) — delivered out of order in window 2
const corner101 = { ...BASE, Action: "corner", Id: 103, Ts: 1784408786004, Seq: 101, StatusId: 2, Confirmed: false, Clock: { Running: true, Seconds: 372 }, Stats: {}, Participant: 2 };
const corner102 = { ...BASE, Action: "corner", Id: 103, Ts: 1784408810916, Seq: 102, StatusId: 2, Confirmed: true, Clock: { Running: true, Seconds: 372 }, Stats: smap(0, 1, 0, 1), Participant: 2 };
// a shot (shots are NOT in the stats map — accumulated from the action)
const shot120 = { ...BASE, Action: "shot", Id: 130, Ts: 1784409301000, Seq: 120, StatusId: 2, Confirmed: true, Clock: { Running: true, Seconds: 900 }, Data: { Outcome: "OffTarget" }, Stats: smap(0, 1, 0, 1), Participant: 1 };
// a STALE update whose map regresses g2 to 0 — monotonic clamp must hold
const cornerStale = { ...BASE, Action: "corner", Id: 140, Ts: 1784409400000, Seq: 121, StatusId: 2, Confirmed: true, Clock: { Running: true, Seconds: 960 }, Stats: smap(0, 0, 0, 2), Participant: 2 };
// second half: status carries Clock 2700 (absolute seconds), VAR pair from the capture
const var454 = { ...BASE, Action: "var", Id: 423, Ts: 1784410673296, Seq: 454, StatusId: 2, Confirmed: false, Clock: { Running: true, Seconds: 2259 }, Data: {}, Stats: smap(0, 1, 0, 2), Participant: 2 };
const varEnd456 = { ...BASE, Action: "var_end", Id: 423, Ts: 1784410682257, Seq: 456, StatusId: 2, Confirmed: true, Clock: { Running: true, Seconds: 2268 }, Data: { Outcome: "Stands" }, Stats: smap(0, 1, 0, 2), Participant: 2 };
// pure noise — must never emit
const noise = { ...BASE, Action: "safe_possession", Id: 141, Ts: 1784409405000, Seq: 122, StatusId: 2, Clock: { Running: true, Seconds: 965 }, Stats: smap(0, 1, 0, 2) };

const odds1x2 = (mid, ts, p1, dr, p2) => ({ FixtureId: 18257865, MessageId: mid, Ts: ts, Bookmaker: "bk", SuperOddsType: "1X2_PARTICIPANT_RESULT", InRunning: true, Prices: [3.01, 2.35, 4.13], Pct: [String(p1), String(dr), String(p2)] });
const oddsNA = { FixtureId: 18257865, MessageId: 900003, Ts: 1784408400500, SuperOddsType: "1X2_PARTICIPANT_RESULT", Pct: ["NA", "NA", "NA"] };
const oddsOther = { FixtureId: 18257865, MessageId: 900002, Ts: 1784408401000, SuperOddsType: "TOTAL_POINTS_OVER_UNDER", Pct: ["55.1", "44.9"] };

// window 1 and window 2 overlap (Seq 51/52 repeat) — dedupe must hold
const scoresWin1 = [kickoff17, goal51, goal52];
const scoresWin2 = [goal52, goal53, corner102, corner101, shot120, cornerStale, noise, var454, varEnd456]; // shuffled on purpose
const oddsWin1 = [oddsNA, oddsOther, odds1x2(900001, 1784408405000, 33.2, 42.6, 24.2)];
const oddsWin2 = [odds1x2(900001, 1784408405000, 33.2, 42.6, 24.2), odds1x2(900004, 1784409000000, 43.7, 27.4, 28.9)];

// ---------------------------------------------------------- mock fetch
const calls = [];
let failNetwork = false;
const windows = { scores: [scoresWin1, scoresWin2], odds: [oddsWin1, oddsWin2] };
const cursor = { scores: 0, odds: 0 };
function mockFetch(url) {
  calls.push(url);
  if (failNetwork) return Promise.reject(new Error("network down"));
  const mode = /mode=scores/.test(url) ? "scores" : /mode=odds\b/.test(url) ? "odds" : "odds1x2";
  if (mode === "odds1x2") {
    return Promise.resolve({ json: () => Promise.resolve({ ok: true, fixtureId: "18257865", p1: 43.7, draw: 27.4, p2: 28.9, ts: 1784409000000 }) });
  }
  const list = windows[mode];
  const win = list[Math.min(cursor[mode], list.length - 1)];
  cursor[mode]++;
  return Promise.resolve({ json: () => Promise.resolve(win) });
}

// ---------------------------------------------------------- tests
async function main() {
  console.log("module surface");
  ok("exports poll/latestOdds/isLive/configure", ["poll", "latestOdds", "isLive", "configure"].every(k => typeof LiveFeed[k] === "function"));

  console.log("isLive boundaries (kickoff-10min .. kickoff+150min)");
  const K = 1784408400000, MIN = 60000;
  eq("10min before kickoff = live", LiveFeed.isLive(K, K - 10 * MIN), true);
  eq("10min1ms before = not live", LiveFeed.isLive(K, K - 10 * MIN - 1), false);
  eq("kickoff = live", LiveFeed.isLive(K, K), true);
  eq("+150min = live", LiveFeed.isLive(K, K + 150 * MIN), true);
  eq("+150min1ms = not live", LiveFeed.isLive(K, K + 150 * MIN + 1), false);
  eq("garbage kickoff = not live", LiveFeed.isLive("not-a-date", K), false);

  LiveFeed.configure({ fetchImpl: mockFetch, base: "http://test.local" });

  console.log("latestOdds");
  const lo = await LiveFeed.latestOdds("18257865");
  eq("latestOdds parses the 1X2 triple", lo, { ok: true, p1: 43.7, draw: 27.4, p2: 28.9, ts: 1784409000000 });
  const loBad = await LiveFeed.latestOdds("");
  eq("latestOdds without id fails soft", loBad.ok, false);

  console.log("poll: dedupe + cumulative monotonic events + odds");
  const events = [], odds = [], statuses = [];
  const h = LiveFeed.poll("fx-18257865", { // non-digits must be stripped from fixtureId
    intervalMs: 3600000, // effectively: only manual tick()s during the test
    onScoreEvent: e => events.push(e),
    onOdds: o => odds.push(o),
    onStatus: s => statuses.push(s),
  });
  await h.tick();            // joins the initial cycle → window 1
  await h.tick();            // window 2 (overlapping, shuffled, stale update)

  eq("fixtureId digits-only in proxy calls", calls.filter(u => /mode=scores/.test(u)).every(u => u.includes("fixtureId=18257865")), true);
  eq("status went live", statuses[0], "live");

  eq("event types in order", events.map(e => e.type), ["kickoff", "goal", "corner", "shot", "corner", "var", "var_verdict"]);
  eq("one goal despite 3 feed updates (Id 56 over Seq 51/52/53)", events.filter(e => e.type === "goal").length, 1);
  eq("goal minute from Clock.Seconds (137s -> 2)", events.find(e => e.type === "goal").minute, 2);
  eq("goal team resolved (England = 2)", events.find(e => e.type === "goal").team, 2);
  eq("goal stats cumulative g2=1", events.find(e => e.type === "goal").stats.g2, 1);
  eq("corner stats cumulative c2=1", events.find(e => e.type === "corner").stats.c2, 1);
  eq("shot accumulates s1 (not in stats map)", events.find(e => e.type === "shot").stats.s1, 1);
  eq("stale regressing map clamped (g2 stays 1)", events.filter(e => e.type === "corner")[1].stats.g2, 1);
  eq("second corner c2=2", events.filter(e => e.type === "corner")[1].stats.c2, 2);
  eq("var verdict detail carried (Stands)", events.find(e => e.type === "var_verdict").detail, "Stands");
  eq("no noise events (possession etc.)", events.some(e => !["kickoff", "goal", "corner", "shot", "var", "var_verdict"].includes(e.type)), false);

  // monotonicity across the whole emission stream
  const KEYS = ["c1", "c2", "g1", "g2", "y1", "y2", "r1", "r2", "s1", "s2"];
  let monotonic = true, minutes = true;
  for (let i = 1; i < events.length; i++) {
    for (const k of KEYS) if (events[i].stats[k] < events[i - 1].stats[k]) monotonic = false;
    if (events[i].minute < events[i - 1].minute) minutes = false;
  }
  eq("stats monotonic non-decreasing across all events", monotonic, true);
  eq("minutes non-decreasing", minutes, true);

  eq("odds emitted twice (window 2 repeat deduped by MessageId)", odds.length, 2);
  eq("first odds triple", { p1: odds[0].p1, draw: odds[0].draw, p2: odds[0].p2 }, { p1: 33.2, draw: 42.6, p2: 24.2 });
  eq("second odds triple", { p1: odds[1].p1, draw: odds[1].draw, p2: odds[1].p2 }, { p1: 43.7, draw: 27.4, p2: 28.9 });
  ok("NA / non-1X2 payloads never emitted", odds.every(o => [o.p1, o.draw, o.p2].every(Number.isFinite)));

  console.log("poll: network failure degrades to idle, never throws");
  failNetwork = true;
  await h.tick();
  eq("status transitioned to idle", statuses[statuses.length - 1], "idle");
  failNetwork = false;
  h.stop();
  await h.tick(); // after stop: no-op, must not throw
  ok("tick after stop is a no-op", true);

  console.log("poll: bad fixtureId is a quiet idle handle");
  const h2 = LiveFeed.poll(null, { onStatus: s => statuses.push(s) });
  eq("null fixtureId -> idle", statuses[statuses.length - 1], "idle");
  h2.stop();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error("UNCAUGHT:", err); process.exit(1); });
