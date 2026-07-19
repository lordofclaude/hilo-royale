#!/usr/bin/env node
/* ============================================================
   build-lobbies.js — regenerates web/lobbies.js from REAL TxLINE captures.
   Usage:  node shared/build-lobbies.js          (from repo root or anywhere)

   Sources (all real captures, committed in shared/real-data/):
     18257865  France v England        <- 18257865.tape.js (completed score
               history) + 18257865.odds-live.json (in-play StablePrice capture)
     18222446, 18237038, 18241006, 18213979, 17588232
               <- <id>.tape.js  (window.TXLINE_TAPE bundles: raw historical score
               updates + BookmakerId 10021 demargined 1X2 consensus, produced by
               shared/build-real-tapes.js from full TxLINE pulls)

   What it does:
     - dedupes raw updates by Seq, sorts by Seq (server order — Ts alone reorders
       confirm/amend pairs and caused the old stat regressions)
     - recomputes CUMULATIVE stats from the feed's own Stats map (statKeys 1..8 =
       per-participant Goals/Yellow/Red/Corners, TOTAL period) through a suffix-min
       MONOTONE ENVELOPE: a stat unit only counts if the feed never takes it back
       later, so VAR-disallowed goals (e.g. Spain's "3rd" v France, Norway's "2nd"
       v England) never enter the tape and stats never regress; shots counted from
       Confirmed shot actions (not in statKeys 1..8)
     - emits goal/corner/card events exactly when the enveloped stat moves
       (this drops unconfirmed + VAR-discarded actions automatically: e.g. the
       FRA-ENG 11' "goal" that was action_discarded and corrupted the old tape)
     - match minutes from Clock.Seconds clamped to the StatusId period (H1<=45',
       H2 45-90', ET 90-120'), so HT/ET breaks and stoppage collapse monotonically
     - normalizes odds to lobby.odds.winpct = [{m, p1, draw, p2}] (percent 0-100,
       m = match minute mapped through the event clock so HT/ET breaks collapse)
     - the FRA-ENG live odds capture interleaves several market variants (no
       market metadata survived the capture); we keep, per score segment, the
       majority price track whose jumps at goals point the right way — every
       emitted point is a real captured price, none are synthesized
     - VALIDATES: monotonic stats, ordered minutes, sane minute range, final
       score vs game_finalised stats and vs the known result — exits 1 on any
       violation.

   Output: web/lobbies.js  (window.LOBBIES + window.UPCOMING)
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RD = path.join(ROOT, "shared", "real-data");
const OUT = path.join(ROOT, "web", "lobbies.js");
const IOS_OUT = path.join(ROOT, "ios", "src", "lib", "real-data", "canonical.ts");

/* ------------------------------------------------------------ fixture metadata
   Stage/tag from the World Cup 2026 bracket (cross-checked against the TxLINE
   fixture list: 08-integration/probe-results/fixtures_wc.json in the hackathon
   workspace). 17588232's feed never resolved participant names ("Team 3021" /
   "Team 2935"); the capture's own lineups identify them (players' country =
   Spain / Saudi Arabia), so we name them honestly from the capture itself. */
const META = {
  "18257865": {
    p1: "France", p2: "England", stage: "Third-place play-off", tag: "3RD",
    expected: { g1: 4, g2: 6 },
    note: "Completed TxLINE score history; in-play StablePrice odds were captured through ~84'.",
  },
  "18241006": {
    p1: "England", p2: "Argentina", stage: "Semi-final", tag: "SF",
    expected: { g1: 1, g2: 2 },
  },
  "18237038": {
    p1: "France", p2: "Spain", stage: "Semi-final", tag: "SF",
    expected: { g1: 0, g2: 2 },
  },
  "18222446": {
    p1: "Argentina", p2: "Switzerland", stage: "Quarter-final", tag: "QF",
    expected: { g1: 3, g2: 1 },
    proof: {
      url: "https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet",
      tx: "47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA",
      claim: "final score 3-1 (home win) proven on devnet against TxODDS's on-chain Merkle root (validateStatV2, seq 1306)",
    },
  },
  "18213979": {
    p1: "Norway", p2: "England", stage: "Quarter-final", tag: "QF",
    expected: { g1: 1, g2: 2 },
    note: "Went to extra time (England won 2-1 aet).",
  },
  "17588232": {
    p1: "Spain", p2: "Saudi Arabia", stage: "Group stage", tag: "GROUP",
    expected: { g1: 5, g2: 0 },
    note: "Feed left names unresolved (Team 3021/Team 2935); identified as Spain v Saudi Arabia from the capture's own lineup data.",
  },
};

// World Cup FINAL — fixture id + kickoff from the same TxLINE fixture list
// (18257739 Spain v Argentina, StartTime 1784487600000 = 2026-07-19 19:00 UTC).
const UPCOMING = [{
  fixtureId: "18257739", comp: "FIFA World Cup 2026", stage: "Final",
  t1: "Spain", t2: "Argentina", kickoffMs: 1784487600000,
}];

/* ------------------------------------------------------------ helpers */
const STATKEY = { 1: "g1", 2: "g2", 3: "y1", 4: "y2", 5: "r1", 6: "r2", 7: "c1", 8: "c2" };
const STAT_TYPE = { g: "goal", c: "corner", y: "card", r: "card" };
const STAT_KEYS_10 = ["c1", "c2", "g1", "g2", "y1", "y2", "r1", "r2", "s1", "s2"];
const PERIOD_START_SECS = new Set([0, 2700, 5400, 6300]);

function fail(msg) { console.error("BUILD FAILED: " + msg); process.exit(1); }
function cloneStats(s) { const o = {}; for (const k of STAT_KEYS_10) o[k] = s[k]; return o; }

/** Parse an SSE capture ("data: {...}" lines) into message objects. */
function parseSSE(file) {
  const msgs = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    try { msgs.push(JSON.parse(line.slice(6))); } catch (e) { /* partial line at capture edge */ }
  }
  return msgs;
}

/** Load a window.TXLINE_TAPE bundle without a browser. */
function loadTapeBundle(file) {
  const g = { window: {} };
  new Function("window", fs.readFileSync(file, "utf8"))(g.window);
  return g.window.TXLINE_TAPE;
}

/* ------------------------------------------------------------ tape compiler
   messages -> {events, anchors, warnings}. Deterministic, monotonic. */
function compileTape(messages, fx) {
  // dedupe by Seq (first wins), sort by Seq then Ts
  const bySeq = new Map();
  for (const m of messages) {
    const seq = m.Seq != null ? Number(m.Seq) : null;
    if (seq == null) continue;
    if (!bySeq.has(seq)) bySeq.set(seq, m);
  }
  const msgs = [...bySeq.values()].sort((a, b) => (a.Seq - b.Seq) || ((a.Ts || 0) - (b.Ts || 0)));

  // ---- pass 1: feed stat snapshots (carry-forward), then suffix-min envelope.
  // env[i][field] = min(feed value at i.., ) — a unit counts only if the feed
  // never takes it back later (VAR-disallowed goals are removed at the source).
  const feed = new Array(msgs.length);
  {
    const cur = { c1: 0, c2: 0, g1: 0, g2: 0, y1: 0, y2: 0, r1: 0, r2: 0 };
    for (let i = 0; i < msgs.length; i++) {
      const S = msgs[i].Stats;
      if (S && typeof S === "object") for (const k in STATKEY) if (S[k] != null) cur[STATKEY[k]] = Number(S[k]) || 0;
      feed[i] = { ...cur };
    }
  }
  const env = new Array(msgs.length);
  {
    let sfx = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const e = { ...feed[i] };
      if (sfx) for (const f in e) e[f] = Math.min(e[f], sfx[f]);
      env[i] = sfx = e;
    }
  }

  const run = { c1: 0, c2: 0, g1: 0, g2: 0, y1: 0, y2: 0, r1: 0, r2: 0, s1: 0, s2: 0 };
  const events = [], anchors = [], warnings = [];
  let lastMinute = 0, lastStatus = null, expectKickoff = false, lastEmit = {};
  // takeback report: units the feed granted then removed
  {
    const finalFeed = feed[msgs.length - 1] || {};
    const peak = {};
    for (const f of Object.keys(finalFeed)) peak[f] = Math.max(...feed.map(s => s[f]));
    for (const f of Object.keys(finalFeed)) if (peak[f] > finalFeed[f])
      warnings.push(`${f}: feed peaked at ${peak[f]} but settled at ${finalFeed[f]} — ${peak[f] - finalFeed[f]} unit(s) taken back (VAR/amend), excluded from tape`);
  }

  const teamName = t => (t === 1 ? fx.Participant1 : t === 2 ? fx.Participant2 : "—");
  function push(seq, minute, type, team, detail, ts) {
    events.push({ seq, minute, type, team, detail: detail || "", stats: cloneStats(run), teamName: teamName(team), ts });
  }

  // StatusId -> [min,max] match-minute window (collapses stoppage + breaks)
  const PERIOD_RANGE = { 1: [0, 0], 2: [0, 45], 3: [45, 45], 4: [45, 90], 6: [90, 90], 7: [90, 105], 8: [105, 105], 9: [105, 120] };

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const act = String(m.Action || "").toLowerCase();
    const sec = m.Clock && m.Clock.Seconds != null ? Number(m.Clock.Seconds) : null;
    if (m.StatusId != null && m.StatusId !== lastStatus) { lastStatus = m.StatusId; expectKickoff = true; }
    let minute = sec != null ? Math.floor(sec / 60) : lastMinute;
    const range = PERIOD_RANGE[lastStatus];
    if (range) minute = Math.max(range[0], Math.min(range[1], minute));
    if (minute < lastMinute) minute = lastMinute;          // clock jitter guard
    lastMinute = minute;
    if (m.Ts && sec != null) anchors.push({ ts: Number(m.Ts), minute });

    // --- cumulative stats: enveloped feed values (monotone by construction)
    const deltas = [];
    for (const field in env[i]) {
      const v = env[i][field];
      if (v > run[field]) { deltas.push({ field, from: run[field], to: v }); run[field] = v; }
    }

    // --- goal/corner/card events: emitted exactly when the cumulative stat moves
    for (const d of deltas) {
      const kind = STAT_TYPE[d.field[0]], team = Number(d.field[1]);
      let detail = "";
      if (kind === "goal") detail = (m.Data && m.Data.GoalType ? String(m.Data.GoalType).toLowerCase() : "");
      if (kind === "card") detail = d.field[0] === "r" ? "red card" : "yellow card";
      for (let i = d.from; i < d.to; i++) push(m.Seq, minute, kind, team, detail, m.Ts);
    }
    // a stat-moving message is fully accounted for — except var_end, whose
    // verdict event should coexist with the goal it confirms (same real seq)
    if (deltas.length && act !== "var_end") continue;

    // --- non-stat event types (Confirmed messages only; confirm pairs dedupe themselves)
    const team = Number(m.Participant || (m.Data && m.Data.Participant) || 0) || 0;
    switch (act) {
      case "shot":
        if (m.Confirmed === true) {
          const key = "shot:" + team + ":" + sec;
          if (lastEmit.shot !== key) { lastEmit.shot = key; if (team) run["s" + team]++; push(m.Seq, minute, "shot", team, "", m.Ts); }
        }
        break;
      case "free_kick":
        if (m.Confirmed === true) push(m.Seq, minute, "freekick", team, (m.Data && m.Data.FreeKickType) || "", m.Ts);
        break;
      case "substitution":
        if (m.Confirmed === true && m.Data && m.Data.PlayerInId != null) push(m.Seq, minute, "sub", team, "", m.Ts);
        break;
      case "penalty":
        if (m.Confirmed === true) push(m.Seq, minute, "penalty", team, (m.Data && m.Data.Outcome) || "", m.Ts);
        break;
      case "var":
        if (m.Confirmed === true) push(m.Seq, minute, "var", team, "review: " + ((m.Data && m.Data.Type) || "incident"), m.Ts);
        break;
      case "var_end":
        push(m.Seq, minute, "var_verdict", team, (m.Data && m.Data.Outcome) || "", m.Ts);
        break;
      case "kickoff":
        // only period starts (0'/45'/90'/105'); restart kickoffs after goals are noise
        if (m.Confirmed === true && sec != null && PERIOD_START_SECS.has(sec) && expectKickoff) {
          expectKickoff = false;
          push(m.Seq, minute, "kickoff", 0, "", m.Ts);
        }
        break;
      case "halftime_finalised":
        push(m.Seq, 45, "halftime", 0, "", m.Ts); lastMinute = Math.max(lastMinute, 45);
        break;
      case "additional_time":
        if (m.Confirmed === true) push(m.Seq, minute, "additionaltime", 0, m.Data && m.Data.Minutes != null ? "+" + m.Data.Minutes : "", m.Ts);
        break;
      case "game_finalised":
        push(m.Seq, minute, "game_finalised", 0, "", m.Ts);
        break;
      default: break; // possession spam, comments, lineups, discarded/amended actions
    }
  }
  anchors.sort((a, b) => a.ts - b.ts);
  return { events, anchors, warnings };
}

/* ------------------------------------------------------------ odds pipeline */
/** wall-clock ts -> match minute via event anchors (collapses HT/ET breaks). */
function minuteAt(anchors, t) {
  if (!anchors.length) return 0;
  let a = null, next = null;
  for (const p of anchors) { if (p.ts <= t) a = p; else { next = p; break; } }
  if (!a) return 0;
  let m = a.minute + (t - a.ts) / 60000;
  if (next) m = Math.min(m, next.minute);
  return m;
}

/** Per-integer-minute downsample (keep last point in each minute). */
function perMinute(points) {
  const byM = new Map();
  for (const p of points) byM.set(p.m, p);
  return [...byM.values()].sort((a, b) => a.m - b.m);
}

const r1 = x => Math.round(x * 10) / 10;

/** FRA-ENG live capture: interleaved market variants with no metadata.
    Segment by confirmed goals; cluster interleaved tracks by p1-similarity;
    keep the majority track per segment (goal-direction sanity-checked);
    time-disjoint clusters inside one segment are genuine drift — keep both. */
function selectLiveChain(points, goals) {
  const bounds = goals.map(g => g.ts).sort((a, b) => a - b);
  const segs = [];
  let s = [], bi = 0;
  for (const p of points) {
    while (bi < bounds.length && p.t >= bounds[bi]) { if (s.length) segs.push({ pts: s, goal: goals[bi] }); s = []; bi++; }
    s.push(p);
  }
  if (s.length) segs.push({ pts: s, goal: null });

  const chain = [];
  let prevExit = null, prevGoalTeam = null;
  for (const seg of segs) {
    // greedy continuity clustering on p1
    const clusters = [];
    for (const p of seg.pts) {
      let best = null, bd = 1e9;
      for (const c of clusters) { const d = Math.abs(p.p1 - c.last); if (d < bd) { bd = d; best = c; } }
      if (best && bd <= 8) { best.pts.push(p); best.last = p.p1; }
      else clusters.push({ pts: [p], last: p.p1 });
    }
    // interleaved (time-overlapping) clusters -> keep majority; disjoint -> keep all
    let keep;
    const overlapping = clusters.length > 1 && clusters.some((c, i) => clusters.some((d, j) => {
      if (i >= j) return false;
      const c0 = c.pts[0].t, c1 = c.pts[c.pts.length - 1].t, d0 = d.pts[0].t, d1 = d.pts[d.pts.length - 1].t;
      return c0 <= d1 && d0 <= c1;
    }));
    if (overlapping) {
      clusters.sort((a, b) => b.pts.length - a.pts.length);
      keep = clusters[0].pts;
      // goal-direction sanity: away goal must not sink p2, home goal must not lift it
      if (prevExit != null && prevGoalTeam) {
        const ok = c => prevGoalTeam === 2 ? c[0].p2 >= prevExit - 3 : c[0].p2 <= prevExit + 3;
        if (!ok(keep)) { const alt = clusters.slice(1).find(c => ok(c.pts)); if (alt) keep = alt.pts; }
      }
    } else {
      keep = seg.pts;
    }
    chain.push(...keep);
    prevExit = keep[keep.length - 1].p2;
    prevGoalTeam = seg.goal ? seg.goal.team : null;
  }
  return chain;
}

/** 18257865.odds-live.json -> normalized winpct (France=Participant1 -> p1). */
function oddsFromLive(file, anchors, kickoffMs, goals) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const inplay = j.x2.filter(o => o.t >= kickoffMs)
    .map(o => ({ t: o.t, p1: o.fra, draw: o.draw, p2: o.eng }));
  const chain = selectLiveChain(inplay, goals);
  return perMinute(chain.map(o => ({
    m: Math.round(minuteAt(anchors, o.t)), p1: r1(o.p1), draw: r1(o.draw), p2: r1(o.p2),
  })));
}

/** TXLINE_TAPE odds (BookmakerId 10021 demargined full-match 1X2, PriceNames
    [part1, draw, part2]) -> normalized in-play winpct. */
function oddsFromTape(oddsArr, anchors, firstTs) {
  const pts = [];
  for (const o of oddsArr || []) {
    if (!Array.isArray(o.Pct) || o.Pct.length !== 3) continue;
    const t = Number(o.Ts);
    if (!(t >= firstTs)) continue; // in-play only
    const [p1, draw, p2] = o.Pct.map(Number);
    if ([p1, draw, p2].some(isNaN)) continue;
    pts.push({ m: Math.round(minuteAt(anchors, t)), p1: r1(p1), draw: r1(draw), p2: r1(p2) });
  }
  return perMinute(pts);
}

/* ------------------------------------------------------------ validation */
function validateLobby(lb) {
  const errs = [];
  const ev = lb.events;
  if (!ev || ev.length < 12) errs.push(`only ${ev ? ev.length : 0} events (<12)`);
  let prevStats = null, prevMin = -1, prevSeq = -1;
  for (const e of ev) {
    if (e.seq < prevSeq) errs.push(`seq decreasing at ${e.seq}`); // equal allowed: one raw update can move 2 stats
    prevSeq = e.seq;
    if (e.minute < prevMin) errs.push(`minute regressed at seq ${e.seq} (${prevMin}->${e.minute})`);
    prevMin = e.minute;
    if (e.minute < 0 || e.minute > 130) errs.push(`insane minute ${e.minute} at seq ${e.seq}`);
    if (prevStats) for (const k of STAT_KEYS_10) if (e.stats[k] < prevStats[k]) errs.push(`stat ${k} regressed at seq ${e.seq} (${prevStats[k]}->${e.stats[k]})`);
    prevStats = e.stats;
  }
  const last = ev[ev.length - 1];
  const fin = ev.filter(e => e.type === "game_finalised");
  const ref = fin.length ? fin[fin.length - 1].stats : last.stats;
  const score = lb.finalScore || lb.observedScore;
  if (score.g1 !== ref.g1 || score.g2 !== ref.g2)
    errs.push(`score ${score.g1}-${score.g2} != ${fin.length ? "game_finalised" : "last-event"} stats ${ref.g1}-${ref.g2}`);
  const exp = META[lb.fixtureId].expected;
  if (exp && lb.finalScore && (lb.finalScore.g1 !== exp.g1 || lb.finalScore.g2 !== exp.g2))
    errs.push(`finalScore ${lb.finalScore.g1}-${lb.finalScore.g2} != known result ${exp.g1}-${exp.g2}`);
  if (!Number.isFinite(lb.kickoffMs)) errs.push("missing kickoffMs");
  if (lb.odds) {
    let pm = -1;
    for (const o of lb.odds.winpct) {
      for (const k of ["p1", "draw", "p2"]) if (!(o[k] >= 0 && o[k] <= 100)) errs.push(`odds ${k}=${o[k]} out of range at m${o.m}`);
      const sum = o.p1 + o.draw + o.p2;
      if (sum < 95 || sum > 105) errs.push(`odds sum ${sum.toFixed(1)} at m${o.m}`);
      if (o.m < pm) errs.push(`odds minutes unordered at m${o.m}`);
      pm = o.m;
      if (o.m < 0 || o.m > 130) errs.push(`odds minute ${o.m} out of range`);
    }
  }
  return errs;
}

/* ------------------------------------------------------------ build */
function buildLobby(fid, messages, fixture, oddsBuilder) {
  const meta = META[fid];
  const fx = {
    FixtureId: Number(fid),
    Competition: "FIFA World Cup 2026",
    Participant1: meta.p1, Participant2: meta.p2,
    Participant1IsHome: fixture.Participant1IsHome !== false,
    StartTime: new Date(Number(fixture.StartTime)).toISOString(),
  };
  const kickoffMs = Number(fixture.StartTime);
  const { events, anchors, warnings } = compileTape(messages, fx);
  for (const w of warnings) console.warn(`  [warn] ${fid}: ${w}`);

  const last = events[events.length - 1];
  const score = { g1: last.stats.g1, g2: last.stats.g2 };
  const odds = oddsBuilder ? oddsBuilder(events, anchors, kickoffMs) : undefined;

  const lb = {
    fixtureId: fid, fixture: fx,
    // One TxLINE update can emit multiple semantic events (for example a
    // goal plus its VAR verdict). Use a strict tape sequence while keeping
    // the upstream sequence number alongside it for audit provenance.
    events: events.map((e, index) => ({ seq: index + 1, sourceSeq: e.seq, minute: e.minute, type: e.type, team: e.team, detail: e.detail, stats: e.stats, teamName: e.teamName })),
    stage: meta.stage, tag: meta.tag, kickoffMs,
  };
  if (meta.captureStatus === "partial") lb.observedScore = score;
  else lb.finalScore = score;
  if (odds && odds.winpct && odds.winpct.length >= 5) lb.odds = odds;
  if (meta.proof) lb.proof = meta.proof;
  if (meta.captureStatus) lb.captureStatus = meta.captureStatus;
  if (meta.capturedThroughMinute != null) lb.capturedThroughMinute = meta.capturedThroughMinute;
  if (meta.note) lb.note = meta.note;
  return lb;
}

const lobbies = [];

// --- 18257865 France v England: completed score tape + captured in-play odds
{
  const fid = "18257865";
  const T = loadTapeBundle(path.join(RD, fid + ".tape.js"));
  if (!T.historical || !T.historical.length) fail(fid + ": completed tape has no historical events");
  const fixture = {
    StartTime: (T.fixture && T.fixture.StartTime) || T.historical[0].StartTime,
    Participant1IsHome: T.fixture ? T.fixture.Participant1IsHome : true,
  };
  const lb = buildLobby(fid, T.historical, fixture, (events, anchors, kickoffMs) => {
    const goals = events.filter(e => e.type === "goal").map(e => ({ ts: e.ts, team: e.team }));
    const winpct = oddsFromLive(path.join(RD, fid + ".odds-live.json"), anchors, kickoffMs, goals);
    return { winpct };
  });
  lobbies.push(lb);
}

// --- the tape-bundle fixtures (order: kickoff desc)
for (const fid of ["18241006", "18237038", "18222446", "18213979", "17588232"]) {
  const T = loadTapeBundle(path.join(RD, fid + ".tape.js"));
  const fixture = {
    StartTime: (T.fixture && T.fixture.StartTime) || (T.historical[0] && T.historical[0].StartTime),
    Participant1IsHome: T.fixture ? T.fixture.Participant1IsHome : true,
  };
  const lb = buildLobby(fid, T.historical, fixture, (events, anchors) => {
    const firstTs = events.length ? events.find(e => e.ts != null).ts : Infinity;
    const winpct = oddsFromTape(T.odds, anchors, firstTs);
    return { winpct };
  });
  lobbies.push(lb);
}

// --- validate everything, fail loudly
let bad = 0;
for (const lb of lobbies) {
  const errs = validateLobby(lb);
  const types = {};
  lb.events.forEach(e => { types[e.type] = (types[e.type] || 0) + 1; });
  const score = lb.finalScore || lb.observedScore;
  console.log(`${lb.fixtureId} ${lb.fixture.Participant1} ${score.g1}-${score.g2} ${lb.fixture.Participant2} [${lb.tag}] events=${lb.events.length} odds=${lb.odds ? lb.odds.winpct.length + "pts" : "none"}${lb.proof ? " proof" : ""}`);
  console.log(`  ${JSON.stringify(types)}`);
  for (const e of errs) { console.error(`  [FAIL] ${e}`); bad++; }
}
if (bad) fail(bad + " validation error(s)");

// --- emit
const header = `/* AUTO-GENERATED lobby catalog — REAL TxLINE captures only. Do not edit by hand.
   Regenerate: node shared/build-lobbies.js
   Sources: shared/real-data/<id>.tape.js (TxLINE pulls) plus the committed
   18257865.odds-live.json in-play capture. Stats are cumulative and
   validated monotonic; complete finalScore values come from game_finalised. Partial
   captures use observedScore and are never promoted to a final claim.
   odds.winpct = [{m, p1, draw, p2}] — percent 0-100, m = match minute, p1 = Participant1. */
`;
const body = "window.LOBBIES = " + JSON.stringify(lobbies) + ";\n" +
  "window.UPCOMING = " + JSON.stringify(UPCOMING) + ";\n";
fs.writeFileSync(OUT, header + body);
console.log(`\nwrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB), ${lobbies.length} lobbies + ${UPCOMING.length} upcoming`);

// iOS consumes the exact same compiler output, eliminating the old hand-edited
// tapes whose provisional actions and stat regressions diverged from web.
const iosOrder = ["18257865", "18222446", "18237038", "18241006"];
const iosRows = iosOrder.map(fid => lobbies.find(lb => lb.fixtureId === fid));
const iosBody = iosRows.map(lb => `  { fixtureId: ${JSON.stringify(lb.fixtureId)}, fixture: ${JSON.stringify(lb.fixture)}, events: ${JSON.stringify(lb.events)} as ScoreEvent[], captureStatus: ${JSON.stringify(lb.captureStatus || "complete")}, capturedThroughMinute: ${JSON.stringify(lb.capturedThroughMinute ?? null)} }`).join(",\n");
const iosSource = `/* AUTO-GENERATED from the canonical TxLINE compiler. Do not edit.\n   Regenerate: node shared/build-lobbies.js */\nimport type { ScoreEvent } from "../txline-mock";\n\nexport const CANONICAL_REPLAYS = [\n${iosBody}\n];\n`;
fs.writeFileSync(IOS_OUT, iosSource);
console.log(`wrote ${path.relative(ROOT, IOS_OUT)} (${(fs.statSync(IOS_OUT).size / 1024).toFixed(0)} KB), ${iosRows.length} canonical iOS replays`);
