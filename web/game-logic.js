/* ============================================================
   HI-LO ROYALE — core game rules (shared module).
   Plain JS: attaches a browser global `HiLoLogic` AND exports
   via CommonJS so `node test.js` and the web app share ONE
   implementation of question generation, hi/lo resolution,
   elimination rules, streak math and ladder scoring.

   Data contract: events are TxLINE-shaped score events
   ({ minute, type, stats:{c1,c2,s1,s2,y1,y2,r1,r2,g1,g2} }) —
   exactly what shared/txline-mock.js emits and what the real
   ⟨REAL⟩ GET /api/scores/stream SSE feed maps onto.
   ============================================================ */

const HiLoLogic = (() => {

  // ---------- stat windows ----------
  const STAT_DEFS = [
    { key: "corners", label: "corners", emoji: "🚩", get: (a, b) => (b.c1 + b.c2) - (a.c1 + a.c2) },
    { key: "shots",   label: "shots",   emoji: "🎯", get: (a, b) => (b.s1 + b.s2) - (a.s1 + a.s2) },
    { key: "cards",   label: "cards",   emoji: "🟨", get: (a, b) => (b.y1 + b.y2 + b.r1 + b.r2) - (a.y1 + a.y2 + a.r1 + a.r2) },
  ];

  const EMPTY_STATS = { c1:0, c2:0, s1:0, s2:0, y1:0, y2:0, r1:0, r2:0, g1:0, g2:0 };

  // Running stats snapshot at a match minute (last event at-or-before it).
  function statsAt(events, minute) {
    let s = EMPTY_STATS;
    for (const e of events) { if (e.minute <= minute) s = e.stats; }
    return s;
  }

  function windowStats(events, fromMin, toMin) {
    return { a: statsAt(events, fromMin), b: statsAt(events, toMin) };
  }

  // Delta of one stat inside a window.
  function windowValue(events, statIdx, fromMin, toMin) {
    const d = STAT_DEFS[statIdx];
    const w = windowStats(events, fromMin, toMin);
    return d.get(w.a, w.b);
  }

  // ---------- richer question kinds (occurrence / side-pick / VAR-reactive) ----------
  // Occurrence: "will X happen in the next N min?" — never pushes (binary),
  // so it's a safe filler whenever a comparison would tie.
  const OCCURRENCE_DEFS = [
    { key: "goal",   label: "a goal",         emoji: "⚽", matchType: e => e.type === "goal" || (e.type === "penalty" && /scored/i.test(e.detail || "")) },
    { key: "card",   label: "a card",         emoji: "🟨", matchType: e => e.type === "card" },
    { key: "corner", label: "a corner",       emoji: "🚩", matchType: e => e.type === "corner" },
    { key: "sub",    label: "a substitution", emoji: "🔄", matchType: e => e.type === "sub" },
    { key: "shot",   label: "a shot",         emoji: "🎯", matchType: e => e.type === "shot" },
  ];

  function occurrenceInWindow(events, def, fromMin, toMin) {
    return events.some(e => e.minute > fromMin && e.minute <= toMin && def.matchType(e));
  }

  // Side-pick: "more X this window — Team A or Team B?" — head-to-head
  // within the SAME window (simpler/more intuitive than vs-previous-window).
  const SIDE_STAT_DEFS = [
    { key: "corners", label: "corners", emoji: "🚩", get1: s => s.c1, get2: s => s.c2 },
    { key: "shots",   label: "shots",   emoji: "🎯", get1: s => s.s1, get2: s => s.s2 },
    { key: "cards",   label: "cards",   emoji: "🟨", get1: s => s.y1 + s.r1, get2: s => s.y2 + s.r2 },
  ];

  function sidePickValue(events, statIdx, fromMin, toMin) {
    const def = SIDE_STAT_DEFS[statIdx];
    const a = statsAt(events, fromMin), b = statsAt(events, toMin);
    const team1Delta = def.get1(b) - def.get1(a);
    const team2Delta = def.get2(b) - def.get2(a);
    const answer = team1Delta > team2Delta ? "hi" : team1Delta < team2Delta ? "lo" : "push";
    return { team1Delta, team2Delta, answer };
  }

  // VAR-reactive: hi = upheld/confirmed, lo = overturned/cancelled, push = ambiguous.
  const VAR_OVERTURN_WORDS = /(overturn|cancel|reject|disallow|scrap|wave)/i;
  const VAR_UPHOLD_WORDS = /(uphold|confirm|award|stand)/i;
  function classifyVarVerdict(detail) {
    const d = String(detail || "");
    if (VAR_OVERTURN_WORDS.test(d)) return "lo";
    if (VAR_UPHOLD_WORDS.test(d)) return "hi";
    return "push";
  }

  function code3(name) { return String(name || "").slice(0, 3).toUpperCase(); }

  function makeOccurrenceQuestion(events, n, fromMin, windowLen, defIdx, kindOverride, promptOverride) {
    const def = OCCURRENCE_DEFS[defIdx];
    const toMin = fromMin + windowLen;
    const happened = occurrenceInWindow(events, def, fromMin, toMin);
    const answer = happened ? "hi" : "lo";
    return {
      n, kind: kindOverride || "occurrence", key: def.key, label: def.label, emoji: def.emoji,
      fromMin, windowLen,
      promptText: promptOverride || `${def.emoji} Will there be ${def.label} in the next ${windowLen} min?`,
      hiLabel: "YES", loLabel: "NO",
      answer, val: happened ? 1 : 0,
    };
  }

  function makeSidePickQuestion(events, n, fromMin, windowLen, defIdx, fixture) {
    const def = SIDE_STAT_DEFS[defIdx];
    const toMin = fromMin + windowLen;
    const r = sidePickValue(events, defIdx, fromMin, toMin);
    const name1 = (fixture && fixture.Participant1) || "Team 1";
    const name2 = (fixture && fixture.Participant2) || "Team 2";
    return {
      n, kind: "side_pick", key: def.key, label: def.label, emoji: def.emoji,
      fromMin, windowLen,
      promptText: `${def.emoji} Next ${windowLen} min — more ${def.label}: ${name1} or ${name2}?`,
      hiLabel: code3(name1), loLabel: code3(name2), hiIsTeam1: true,
      answer: r.answer, val: r.team1Delta - r.team2Delta,
    };
  }

  function toScheduleQuestion(q, events) {
    const r = resolveQuestion(events, q);
    return {
      n: q.n, kind: "compare_window", key: q.key, label: q.label, emoji: q.emoji,
      fromMin: q.fromMin, windowLen: q.windowLen, prevFrom: q.prevFrom, prevVal: q.prevVal,
      promptText: `${q.emoji} MORE or FEWER ${q.label} in the next ${q.windowLen} min than the last ${q.windowLen}?`,
      hiLabel: "HIGHER", loLabel: "LOWER",
      answer: r.answer, val: r.val,
    };
  }

  function makeHalftimeQuestion(events, n, h2Start) {
    const windowLen = 10;
    const subIdx = OCCURRENCE_DEFS.findIndex(d => d.key === "sub");
    return makeOccurrenceQuestion(events, n, h2Start, windowLen, subIdx, "halftime_special",
      `🔄 1+ substitutions in the first ${windowLen} min of the second half?`);
  }

  function makePregameQuestion(events, n) {
    const goalIdx = OCCURRENCE_DEFS.findIndex(d => d.key === "goal");
    return makeOccurrenceQuestion(events, n, 0, 45, goalIdx, "pregame", "⚽ Will there be a goal before halftime?");
  }

  function makeVarQuestion(varEvent, verdictEvent, n) {
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
  function pickWindowQuestion(events, n, fromMin, windowLen, recentKeys, fixture, tally) {
    const candidates = [];
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
   * special + 1 entry per real var→var_verdict pair.
   */
  function buildSchedule(events, fixture, opts) {
    opts = opts || {};
    const windowLen = opts.windowLen || 10;
    const maxWindows = opts.maxWindows || 7;
    let maxMinute = 0;
    events.forEach(e => { if (e.minute > maxMinute) maxMinute = e.minute; });

    let h2Start = 45;
    for (const e of events) { if (e.type === "kickoff" && e.minute >= 44) { h2Start = e.minute; break; } }

    const schedule = [];
    let n = 0;
    const tally = { hi: 0, lo: 0 };
    const count = q => { if (q.answer === "hi") tally.hi++; else if (q.answer === "lo") tally.lo++; };

    n++; const pre = makePregameQuestion(events, n); schedule.push(pre); count(pre);

    const recentKeys = [];
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

    let openVar = null;
    for (const e of events) {
      if (e.type === "var" && !openVar) openVar = e;
      else if (e.type === "var_verdict" && openVar) { n++; schedule.push(makeVarQuestion(openVar, e, n)); openVar = null; }
    }

    schedule.sort((a, b) => a.fromMin - b.fromMin);
    schedule.forEach((q, i) => { q.n = i + 1; });
    return schedule;
  }

  // ---------- question generation ----------
  // Question n at minute m: "more or fewer <stat> in the NEXT windowLen
  // minutes than in the LAST windowLen minutes?" Stats rotate by n.
  function makeQuestion(events, questionNumber, fromMin, windowLen = 15) {
    const statIdx = questionNumber % STAT_DEFS.length;
    const def = STAT_DEFS[statIdx];
    const prevFrom = Math.max(0, fromMin - windowLen);
    const prevVal = windowValue(events, statIdx, prevFrom, fromMin);
    return {
      n: questionNumber, statIdx, key: def.key, label: def.label, emoji: def.emoji,
      fromMin, windowLen, prevFrom, prevVal,
    };
  }

  // Quizmaster rule: a good round has a decidable answer. Starting from the
  // rotation stat for question n, advance to the next stat if the scheduled
  // one would tie (push). If every stat ties in this window, keep the
  // rotation default — a genuine all-square push round ("everyone breathes").
  function makeBestQuestion(events, questionNumber, fromMin, windowLen = 15) {
    let fallback = null;
    for (let i = 0; i < STAT_DEFS.length; i++) {
      const q = makeQuestion(events, questionNumber + i, fromMin, windowLen);
      q.n = questionNumber; // display number stays the round number
      if (i === 0) fallback = q;
      if (resolveQuestion(events, q).answer !== "push") return q;
    }
    return fallback;
  }

  // ---------- resolution ----------
  // 'hi' if the next window strictly beats the previous, 'lo' if fewer,
  // 'push' on a tie (nobody is eliminated on a push).
  function resolveQuestion(events, q) {
    const val = windowValue(events, q.statIdx, q.fromMin, q.fromMin + q.windowLen);
    const answer = val > q.prevVal ? "hi" : val < q.prevVal ? "lo" : "push";
    return { val, answer };
  }

  // ---------- judging one player's pick ----------
  // pick: 'hi' | 'lo' | null (no answer before the lock)
  function judge(answer, pick) {
    if (answer === "push") return "push";
    if (pick == null) return "timeout";
    return pick === answer ? "correct" : "wrong";
  }

  function survives(verdict) { return verdict === "correct" || verdict === "push"; }

  // ---------- streak math ----------
  // correct → +1. Push with a pick → +1 (you committed). Push without a
  // pick → unchanged. wrong/timeout → streak freezes (player is out).
  function nextStreak(streak, verdict, hadPick) {
    if (verdict === "correct") return streak + 1;
    if (verdict === "push") return hadPick ? streak + 1 : streak;
    return streak;
  }

  // ---------- bot behaviour (the other 99 fans) ----------
  // A bot with `skill` answers correctly with probability skill.
  // rand ∈ [0,1). On a push everyone lives, so the pick is pure crowd flavour.
  function botPick(skill, answer, rand) {
    if (answer === "push") return rand < 0.5 ? "hi" : "lo";
    const correct = rand < skill;
    return correct ? answer : (answer === "hi" ? "lo" : "hi");
  }

  // Crowd split for the social-proof bar: fraction of picks that are HI.
  function crowdSplit(picks) {
    const total = picks.length;
    if (!total) return { hi: 0.5, lo: 0.5, n: 0 };
    const hi = picks.filter(p => p === "hi").length / total;
    return { hi, lo: 1 - hi, n: total };
  }

  // ---------- survival framing ----------
  // You outlived everyone eliminated before you. othersAlive = other fans
  // still alive at the moment of your elimination (0 if you won it all).
  function outlived(totalPlayers, othersAlive) {
    return Math.max(0, totalPlayers - othersAlive - 1);
  }

  // Near-death flags for the drama layer.
  function isNearDeathTime(msRemainingAtPick, thresholdMs = 1200) {
    return msRemainingAtPick != null && msRemainingAtPick <= thresholdMs;
  }
  function isNearDeathMargin(val, prevVal) {
    return Math.abs(val - prevVal) === 1;
  }

  // ---------- tournament ladder (across all 104 matches) ----------
  // streak×10 + fans outlived + 250 crown bonus for winning the lobby.
  function ladderPoints({ streak, outlivedCount, won }) {
    return streak * 10 + outlivedCount + (won ? 250 : 0);
  }

  // Merge "you" into a top-10 wall (descending points, stable for ties).
  function ladderRank(wall, myPoints) {
    let rank = 1;
    for (const row of wall) { if (row.points > myPoints) rank++; }
    return rank;
  }

  return {
    STAT_DEFS, EMPTY_STATS,
    statsAt, windowStats, windowValue,
    makeQuestion, makeBestQuestion, resolveQuestion,
    judge, survives, nextStreak,
    botPick, crowdSplit,
    outlived, isNearDeathTime, isNearDeathMargin,
    ladderPoints, ladderRank,
    // richer question kinds + schedule builder
    OCCURRENCE_DEFS, SIDE_STAT_DEFS,
    occurrenceInWindow, sidePickValue, classifyVarVerdict,
    makeOccurrenceQuestion, makeSidePickQuestion, makePregameQuestion,
    makeHalftimeQuestion, makeVarQuestion, pickWindowQuestion,
    buildSchedule,
  };
})();

if (typeof module !== "undefined") module.exports = HiLoLogic;
