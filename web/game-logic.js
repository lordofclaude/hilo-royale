/* ============================================================
   HI-LO ROYALE — core game rules (shared module), engine v2.
   Plain JS: attaches a browser global `HiLoLogic` AND exports
   via CommonJS so `node test.js` and the web app share ONE
   implementation of question generation, hi/lo resolution,
   elimination rules, streak math and ladder scoring.

   Data contract: events are TxLINE-shaped score events
   ({ minute, type, stats:{c1,c2,s1,s2,y1,y2,r1,r2,g1,g2} }) —
   exactly what shared/txline-mock.js emits and what the real
   ⟨REAL⟩ GET /api/scores/stream SSE feed maps onto.

   v2 rules (why the engine looks the way it does):
   - availableStats(events): a tape only supports bets on stats it
     actually records. A thin capture with only goals+corners must
     never produce "will there be a shot?" questions — the real match
     had shots, the tape just didn't log them, so the question is
     nonsense.
   - Base-rate guard: an occurrence bet is only offered when, across
     all windowLen-minute windows of the match, the event fires in
     ~20-80% of them. No near-certain YES ("a shot in 10 min" on a
     56-shot tape) and no near-certain NO.
   - New kinds when the data supports them: odds_swing (needs a
     normalized winpct series in opts.odds), next_goal (only where a
     later goal exists — never a guaranteed push), goals_ou (threshold
     anchored to the tape's actual half total so it's a sweat).
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

  // ---------- v2: tape signal detection ----------
  // Which stat/occurrence keys does this tape ACTUALLY carry? A key needs its
  // event type present AND (for cumulative stats) a final total > 0. Anything
  // else is a capture gap, not a fact about the match — never bet on it.
  function availableStats(events) {
    events = events || [];
    const s = statsAt(events, Infinity);
    const types = {};
    events.forEach(e => { types[e.type] = true; });
    const avail = [];
    if ((types.goal || types.penalty) && (s.g1 + s.g2) > 0) avail.push("goal", "goals");
    if (types.corner && (s.c1 + s.c2) > 0) avail.push("corner", "corners");
    if (types.shot && (s.s1 + s.s2) > 0) avail.push("shot", "shots");
    if (types.card && (s.y1 + s.y2 + s.r1 + s.r2) > 0) avail.push("card", "cards");
    if (types.sub) avail.push("sub");
    return avail;
  }

  function tapeMaxMinute(events) {
    let m = 0;
    (events || []).forEach(e => { if (e.minute > m) m = e.minute; });
    return m;
  }

  // Precomputed per-tape context so the schedule builder doesn't rescan the
  // tape for every candidate question.
  function buildQuestionContext(events, windowLen) {
    return { avail: new Set(availableStats(events)), maxMinute: tapeMaxMinute(events), windowLen: windowLen || 10 };
  }

  // ---------- v2: occurrence base-rate guard ----------
  // Fraction of windowLen-minute windows of the match in which the event
  // fires. A good occurrence bet lives in the 20-80% band: outside it the
  // answer is near-certain and the "bet" is a coin with one face.
  const BASE_RATE_MIN = 0.2, BASE_RATE_MAX = 0.8;

  function occurrenceBaseRate(events, def, windowLen, maxMinute) {
    if (maxMinute == null) maxMinute = tapeMaxMinute(events);
    let total = 0, hits = 0;
    for (let from = 0; from + windowLen <= maxMinute; from += windowLen) {
      total++;
      if (occurrenceInWindow(events, def, from, from + windowLen)) hits++;
    }
    return total ? hits / total : 0;
  }

  function occurrenceIsInteresting(events, def, windowLen, maxMinute) {
    const r = occurrenceBaseRate(events, def, windowLen, maxMinute);
    return r >= BASE_RATE_MIN && r <= BASE_RATE_MAX;
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
      promptText: promptOverride || `Will there be ${def.label} in the next ${windowLen} min?`,
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
      promptText: `Next ${windowLen} min — more ${def.label}: ${name1} or ${name2}?`,
      hiLabel: code3(name1), loLabel: code3(name2), hiIsTeam1: true,
      answer: r.answer, val: r.team1Delta - r.team2Delta,
    };
  }

  function toScheduleQuestion(q, events) {
    const r = resolveQuestion(events, q);
    return {
      n: q.n, kind: "compare_window", key: q.key, label: q.label, emoji: q.emoji,
      fromMin: q.fromMin, windowLen: q.windowLen, prevFrom: q.prevFrom, prevVal: q.prevVal,
      promptText: `MORE or FEWER ${q.label} in the next ${q.windowLen} min than the last ${q.windowLen}?`,
      hiLabel: "HIGHER", loLabel: "LOWER",
      answer: r.answer, val: r.val,
    };
  }

  // compare_window restricted to stats the tape has signal for: start from
  // the rotation stat for round n, advance until an available stat is found.
  function makeGuardedCompareQuestion(events, n, fromMin, windowLen, avail) {
    for (let i = 0; i < STAT_DEFS.length; i++) {
      const idx = (n + i) % STAT_DEFS.length;
      if (!avail.has(STAT_DEFS[idx].key)) continue;
      const q = makeQuestion(events, n + i, fromMin, windowLen);
      q.n = n;
      return toScheduleQuestion(q, events);
    }
    return null;
  }

  function makeHalftimeQuestion(events, n, h2Start) {
    const windowLen = 10;
    const subIdx = OCCURRENCE_DEFS.findIndex(d => d.key === "sub");
    return makeOccurrenceQuestion(events, n, h2Start, windowLen, subIdx, "halftime_special",
      `1+ substitutions in the first ${windowLen} min of the second half?`);
  }

  function makePregameQuestion(events, n) {
    const goalIdx = OCCURRENCE_DEFS.findIndex(d => d.key === "goal");
    return makeOccurrenceQuestion(events, n, 0, 45, goalIdx, "pregame", "Will there be a goal before halftime?");
  }

  function makeVarQuestion(varEvent, verdictEvent, n) {
    const answer = classifyVarVerdict(verdictEvent.detail);
    return {
      n, kind: "var_reactive", key: "var", label: "VAR review", emoji: "📺",
      fromMin: varEvent.minute, windowLen: Math.max(1, verdictEvent.minute - varEvent.minute),
      promptText: "VAR REVIEW — will the call be upheld?",
      hiLabel: "UPHELD", loLabel: "OVERTURNED",
      answer, val: answer === "hi" ? 1 : answer === "lo" ? -1 : 0,
    };
  }

  // ---------- v2: next_goal ----------
  // "Next goal: Team A or Team B?" — hi is always team 1. Only offered at a
  // fromMin where a later goal actually exists in the tape, so it can never
  // be a guaranteed-push/void question.
  function isGoalEvent(e) {
    return e.type === "goal" || (e.type === "penalty" && /scored/i.test(e.detail || ""));
  }

  function makeNextGoalQuestion(events, n, fromMin, fixture) {
    let next = null;
    for (const e of events) {
      if (e.minute > fromMin && isGoalEvent(e)) { next = e; break; }
    }
    if (!next || (next.team !== 1 && next.team !== 2)) return null;
    const name1 = (fixture && fixture.Participant1) || "Team 1";
    const name2 = (fixture && fixture.Participant2) || "Team 2";
    return {
      n, kind: "next_goal", key: "goal", label: "next goal",
      fromMin, windowLen: Math.max(1, next.minute - fromMin),
      promptText: `Next goal — ${name1} or ${name2}?`,
      hiLabel: code3(name1), loLabel: code3(name2), hiIsTeam1: true,
      answer: next.team === 1 ? "hi" : "lo", val: next.team === 1 ? 1 : -1,
    };
  }

  // ---------- v2: goals over/under ----------
  // "N or more goals in the second half?" — the threshold is anchored to the
  // tape's ACTUAL half total (either exactly it, answer YES, or one above,
  // answer NO — steered by the hi/lo balance), so it's always a sweat and
  // never trivially certain.
  function makeGoalsOuQuestion(events, n, h2Start, h2End, preferAnswer) {
    const a = statsAt(events, h2Start), b = statsAt(events, h2End);
    const halfGoals = Math.max(0, (b.g1 + b.g2) - (a.g1 + a.g2));
    const threshold = (preferAnswer === "lo" || halfGoals === 0) ? halfGoals + 1 : halfGoals;
    const answer = halfGoals >= threshold ? "hi" : "lo";
    return {
      n, kind: "goals_ou", key: "goals", label: "second-half goals",
      fromMin: h2Start, windowLen: Math.max(1, h2End - h2Start),
      promptText: `${threshold} or more goals in the second half?`,
      hiLabel: "YES", loLabel: "NO",
      answer, val: halfGoals, prevVal: threshold,
    };
  }

  // ---------- v2: odds swing ----------
  // Needs a normalized winpct series [{m, p1, draw, p2}] (percent 0-100).
  // "Will Team2's win probability be HIGHER or LOWER at minute T than now?"
  // Resolves from the series; pushes when the move is within 1pt or the
  // series has no sample covering the target minute.
  function normalizeOddsSeries(odds) {
    const raw = Array.isArray(odds) ? odds : (odds && Array.isArray(odds.winpct)) ? odds.winpct : null;
    if (!raw) return null;
    const s = raw
      .filter(o => o && typeof o.m === "number" && typeof o.p1 === "number" && typeof o.p2 === "number")
      .slice().sort((a, b) => a.m - b.m);
    return s.length >= 2 ? s : null;
  }

  // Last sample at-or-before the minute (series must be sorted by m).
  function oddsSampleAt(series, minute) {
    let s = null;
    for (const o of series) { if (o.m <= minute) s = o; else break; }
    return s;
  }

  function makeOddsSwingQuestion(odds, n, fromMin, toMin, fixture) {
    const s = normalizeOddsSeries(odds);
    if (!s) return null;
    const now = oddsSampleAt(s, fromMin);
    if (!now) return null;
    const name2 = (fixture && fixture.Participant2) || "Team 2";
    const x = Math.round(now.p2);
    // The series must actually reach toMin, otherwise "the value at toMin"
    // is unknown and the round is a push (voided, nobody eliminated).
    const covered = s[s.length - 1].m >= toMin;
    const future = covered ? oddsSampleAt(s, toMin) : null;
    let answer = "push", diff = 0;
    if (future) {
      diff = future.p2 - now.p2;
      answer = diff > 1 ? "hi" : diff < -1 ? "lo" : "push";
    }
    return {
      n, kind: "odds_swing", key: "odds", label: "win probability",
      fromMin, windowLen: Math.max(1, toMin - fromMin),
      promptText: `Will ${name2} win probability be HIGHER or LOWER at ${toMin}' than now (${x}%)?`,
      hiLabel: "HIGHER", loLabel: "LOWER",
      answer, val: Math.round(diff * 10) / 10, prevVal: x,
    };
  }

  // tally = running {hi, lo} answer counts across the schedule so far.
  // Because every answer is known at build time, the builder can steer the
  // hi/lo mix toward balance — without it, sparse real fixtures skew heavily
  // one way (e.g. 9/10 "NO") and blindly picking one side becomes a winning
  // strategy, which kills the game.
  // ctx (optional) = buildQuestionContext(events): availability + base-rate
  // guards. Only stats with real tape signal produce candidates; occurrence
  // bets additionally need a 20-80% base rate. Returns null when the tape
  // supports no sensible question for this window.
  function pickWindowQuestion(events, n, fromMin, windowLen, recentKeys, fixture, tally, ctx) {
    ctx = ctx || buildQuestionContext(events, windowLen);
    const avail = ctx.avail;
    const candidates = [];
    for (let i = 0; i < SIDE_STAT_DEFS.length; i++) {
      if (!avail.has(SIDE_STAT_DEFS[i].key)) continue;
      candidates.push(makeSidePickQuestion(events, n, fromMin, windowLen, i, fixture));
    }
    for (let i = 0; i < OCCURRENCE_DEFS.length; i++) {
      const def = OCCURRENCE_DEFS[i];
      if (!avail.has(def.key)) continue;
      if (!occurrenceIsInteresting(events, def, windowLen, ctx.maxMinute)) continue;
      candidates.push(makeOccurrenceQuestion(events, n, fromMin, windowLen, i));
    }
    const cw = makeGuardedCompareQuestion(events, n, fromMin, windowLen, avail);
    if (cw) candidates.push(cw);
    if (avail.has("goal")) {
      const ng = makeNextGoalQuestion(events, n, fromMin, fixture);
      if (ng) candidates.push(ng);
    }
    if (!candidates.length) return null;

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
   *
   * Targets 9-12 entries: pregame (if the tape has goals) + up to
   * `maxWindows` rolling windows + a second-half goals over/under + up to 2
   * odds_swing rounds (only when opts.odds carries a normalized winpct
   * series) + the halftime sub special (only when the tape has subs) + 1
   * entry per real var→var_verdict pair. Hard cap 12 (fillers trimmed from
   * the end, specials kept).
   *
   * opts: { windowLen=10, maxWindows=7, odds: [{m,p1,draw,p2}] | {winpct:[...]} }
   */
  function buildSchedule(events, fixture, opts) {
    opts = opts || {};
    const windowLen = opts.windowLen || 10;
    const maxWindows = opts.maxWindows || 7;
    const ctx = buildQuestionContext(events, windowLen);
    const maxMinute = ctx.maxMinute;

    let h2Start = 45;
    for (const e of events) { if (e.type === "kickoff" && e.minute >= 44) { h2Start = e.minute; break; } }
    let h2End = maxMinute;
    for (const e of events) {
      if ((e.type === "fulltime" || e.type === "game_finalised") && e.minute > h2Start) { h2End = e.minute; break; }
    }

    const schedule = [];
    let n = 0;
    const tally = { hi: 0, lo: 0 };
    const count = q => { if (q.answer === "hi") tally.hi++; else if (q.answer === "lo") tally.lo++; };

    // Pregame prop only when the tape actually records goals — on a goalless
    // capture "a goal before halftime?" would be a guaranteed NO.
    if (ctx.avail.has("goal")) {
      n++; const pre = makePregameQuestion(events, n); schedule.push(pre); count(pre);
    }

    const recentKeys = [];
    let fromMin = windowLen, windowCount = 0;
    while (fromMin + windowLen <= maxMinute && windowCount < maxWindows) {
      n++;
      // windows straddling the second-half kickoff avoid "sub" — the halftime
      // special right after is already a substitution question.
      const avoid = Math.abs(fromMin - h2Start) <= windowLen ? recentKeys.concat(["sub"]) : recentKeys;
      const q = pickWindowQuestion(events, n, fromMin, windowLen, avoid, fixture, tally, ctx);
      if (q) {
        schedule.push(q); count(q);
        recentKeys.push(q.key); if (recentKeys.length > 2) recentKeys.shift();
      }
      windowCount++;
      fromMin += windowLen;
    }

    // Second-half goals over/under — threshold steered toward the minority
    // answer so the schedule stays balanced.
    if (ctx.avail.has("goal") && h2End > h2Start) {
      n++;
      const prefer = tally.hi > tally.lo ? "lo" : "hi";
      const gq = makeGoalsOuQuestion(events, n, h2Start, h2End, prefer);
      schedule.push(gq); count(gq);
    }

    // Odds swings: at most 2 per schedule, non-push only, spaced >= 20 min.
    const series = normalizeOddsSeries(opts.odds);
    if (series) {
      const chosen = [];
      for (let m = 5; m + windowLen <= maxMinute && chosen.length < 2; m += windowLen) {
        const q = makeOddsSwingQuestion(series, 0, m, m + windowLen, fixture);
        if (!q || q.answer === "push") continue;
        if (chosen.length && m - chosen[chosen.length - 1].fromMin < 20) continue;
        chosen.push(q);
      }
      for (const q of chosen) { n++; q.n = n; schedule.push(q); count(q); }
    }

    // Halftime sub special only when the tape records substitutions.
    if (ctx.avail.has("sub")) {
      n++; schedule.push(makeHalftimeQuestion(events, n, h2Start));
    }

    let openVar = null;
    for (const e of events) {
      if (e.type === "var" && !openVar) openVar = e;
      else if (e.type === "var_verdict" && openVar) { n++; schedule.push(makeVarQuestion(openVar, e, n)); openVar = null; }
    }

    schedule.sort((a, b) => a.fromMin - b.fromMin);

    // Hard cap 12: trim filler questions from the end, keep the specials.
    const FILLER = { occurrence: 1, side_pick: 1, compare_window: 1, next_goal: 1 };
    for (let i = schedule.length - 1; schedule.length > 12 && i >= 0; i--) {
      if (FILLER[schedule[i].kind]) schedule.splice(i, 1);
    }

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
    // v2: tape-signal + base-rate guards, new question kinds
    availableStats, buildQuestionContext, tapeMaxMinute,
    occurrenceBaseRate, occurrenceIsInteresting,
    BASE_RATE_MIN, BASE_RATE_MAX,
    makeGuardedCompareQuestion, makeNextGoalQuestion,
    makeGoalsOuQuestion, makeOddsSwingQuestion,
    normalizeOddsSeries, oddsSampleAt, isGoalEvent,
  };
})();

if (typeof module !== "undefined") module.exports = HiLoLogic;
