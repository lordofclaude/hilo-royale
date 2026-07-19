import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as TxMock from "../lib/txline-real";
import * as L from "../lib/game-logic";
import { C, FANS, ME_INDEX, fanName, glow, displayFont, hairline, type } from "../theme";
import { FadeIn, Pulse, Tap } from "../components/Motion";
import { ChallengeRun, DeathMoment, GameResult, RoundRecord } from "../types";
import { notifySurvival } from "../lib/notifications";
import { GameSettings } from "../lib/settings";
import { lobbyRng } from "../lib/vrf";
import Icon, { IconName, KEY_ICON, KIND_ICON } from "../components/Icon";


// Precomputed once (in txline-real.ts) from the static real-match tape: every
// question's minute, kind, and correct answer is known up front (this is a
// replay, not a live feed), so the VAR-reactive slot, the pregame prop, and
// the halftime special are just entries in this ordered array — no runtime
// special-casing needed. Shared with LobbyScreen's preview strip.

function questionPrompt(question: L.Question): string {
  return question.promptText || `MORE or FEWER ${question.label} in the next ${question.windowLen} min than the last ${question.windowLen}?`;
}

interface Bot { name: string; alive: boolean; skill: number; isMe: boolean; }
interface BotPickEntry { idx: number; pick: L.Side; at: number; shown?: boolean; }
interface Pending {
  q: L.Question;
  outcome: { val: number; answer: L.Answer };
  botPicks: BotPickEntry[];
  myPick: L.Side | null;
  myPickAtMs: number | null;
  deadline: number;
  started: number;
  durationMs: number;
}

interface Props {
  settings: GameSettings;
  replay: TxMock.ReplayFixture;
  dailyKey: string;
  challenge: ChallengeRun | null;
  onEnd: (r: GameResult) => void;
}

export default function GameScreen({ settings, replay, dailyKey, challenge, onEnd }: Props) {
  const baseQms = settings.answerSeconds * 1000;
  const CODE1 = TxMock.teamCode(replay.fixture.Participant1);
  const CODE2 = TxMock.teamCode(replay.fixture.Participant2);
  const SCHEDULE = replay.schedule;
  // ----- mutable game state (refs: game runs on timers, not renders) -----
  // Provably fair: all lobby luck (bot skills/picks/timing, cascade order)
  // draws from a PRNG seeded by real ORAO VRF randomness (see lib/vrf.ts).
  const rngRef = useRef(lobbyRng());
  const rng = rngRef.current;
  const botsRef = useRef<Bot[]>(
    Array.from({ length: FANS }, (_, i) => ({
      name: fanName(i), alive: true, skill: 0.45 + rng() * 0.25, isMe: i === ME_INDEX,
    }))
  );
  const meRef = useRef({ alive: true, streak: 0, outlivedAtDeath: null as number | null });
  const pendingRef = useRef<Pending | null>(null);
  const bufferRef = useRef<TxMock.ScoreEvent[]>([]);
  const scheduleIdxRef = useRef(0); // index of the next SCHEDULE entry not yet asked
  const historyRef = useRef<Array<RoundRecord & { pickMs: number | null; wentAgainstCrowd: boolean; nearDeath: boolean }>>([]);
  const predictionPointsRef = useRef(0);
  const deathRef = useRef<DeathMoment | undefined>(undefined);
  const ghostRankRef = useRef<number | undefined>(undefined);
  const matchMinuteRef = useRef(0);
  const gameOverRef = useRef(false);
  const streamRef = useRef<TxMock.StreamHandle | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const tickIvRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextBeatRef = useRef(0);

  // ----- render state -----
  const [countdown, setCountdown] = useState(3);
  const [q, setQ] = useState<L.Question | null>(null);
  const [remainingPct, setRemainingPct] = useState(100);
  const [panic, setPanic] = useState(false);
  const [crowd, setCrowd] = useState({ hi: 0.5, n: 0 });
  const [answerSide, setAnswerSide] = useState<L.Answer | null>(null);
  const [myPick, setMyPick] = useState<L.Side | null>(null);
  const [locked, setLocked] = useState(true);
  const [verdict, setVerdict] = useState<{ text: string; kind: "ok" | "out" | "flat" } | null>(null);
  const [nearDeath, setNearDeath] = useState<{ icon: IconName; text: string } | null>(null);
  const [streak, setStreak] = useState(0);
  const [predictionPoints, setPredictionPoints] = useState(0);
  const [roundReward, setRoundReward] = useState<{ points: number; correctPct: number } | null>(null);
  const [questionDurationMs, setQuestionDurationMs] = useState(baseQms);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [windowPhase, setWindowPhase] = useState(false); // pick locked, window playing out on screen
  const [ghostMessage, setGhostMessage] = useState<string | null>(null);
  const [aliveCount, setAliveCount] = useState(FANS);
  const [dead, setDead] = useState<boolean[]>(() => Array(FANS).fill(false));
  const [ticker, setTicker] = useState("");
  const [score, setScore] = useState(`${CODE1} 0 – 0 ${CODE2}`);
  const [lastEvent, setLastEvent] = useState<{ icon: IconName | null; text: string }>({ icon: null, text: "kickoff imminent…" });
  const [matchMinute, setMatchMinute] = useState(0);

  const later = (fn: () => void, ms: number) => { timersRef.current.push(setTimeout(fn, ms)); };
  const aliveTotal = () => botsRef.current.filter(b => b.alive).length;
  const othersAlive = () => botsRef.current.filter(b => b.alive && !b.isMe).length;

  // ----- lifecycle -----
  useEffect(() => {
    let n = 3;
    const cd = setInterval(() => {
      n--;
      if (n > 0) { setCountdown(n); Haptics.selectionAsync().catch(() => {}); }
      else {
        clearInterval(cd);
        setCountdown(0);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        streamRef.current = TxMock.streamReplay(replay, {
          playbackRate: settings.playbackRate,
          onEvent: handleEvent,
          onDone: () => { if (pendingRef.current) resolveRound(); else if (!gameOverRef.current) endGame(); },
        });
      }
    }, 800);
    return () => {
      clearInterval(cd);
      streamRef.current?.stop();
      if (tickIvRef.current) clearInterval(tickIvRef.current);
      timersRef.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- event pump -----
  // Before the lock, window events buffer (no spoilers while you can still
  // pick). AFTER the lock the window plays out ON SCREEN — score, minute and
  // feed fast-forward through the real events while the pick is locked, so
  // the wait for settlement is visible drama, exactly like live mode at 1×.
  function renderMatchEvent(e: TxMock.ScoreEvent) {
    setScore(`${CODE1} ${e.stats.g1} – ${e.stats.g2} ${CODE2}`);
    setMatchMinute(e.minute);
    matchMinuteRef.current = e.minute;
    const feedTypes = ["goal", "corner", "card", "shot", "var", "penalty"];
    if (feedTypes.includes(e.type)) setLastEvent({ icon: KEY_ICON[e.type] || null, text: `${e.minute}' ${e.type} — ${e.teamName}` });
  }
  function handleEvent(e: TxMock.ScoreEvent) {
    if (gameOverRef.current) return;
    const P = pendingRef.current;
    if (P) {
      const boundary = P.q.fromMin + P.q.windowLen;
      if (e.minute >= boundary) { bufferRef.current.push(e); resolveRound(); return; }
      const lockedIn = P.myPick != null || Date.now() >= P.deadline;
      if (lockedIn) { renderMatchEvent(e); return; }
      bufferRef.current.push(e);
      return;
    }
    renderMatchEvent(e);
    const next = SCHEDULE[scheduleIdxRef.current];
    if (next && e.minute >= next.fromMin && !pendingRef.current) {
      scheduleIdxRef.current++;
      startQuestion(next);
    }
  }
  /** On lock, spill any events buffered during the answer window into the
   *  live view — they are all inside the window (boundary events resolve). */
  function drainWindowIntoView() {
    if (!pendingRef.current) return;
    const queued = bufferRef.current;
    bufferRef.current = [];
    for (const e of queued) renderMatchEvent(e);
    setWindowPhase(true);
  }
  function flushBuffer() {
    const queued = bufferRef.current;
    bufferRef.current = [];
    for (const e of queued) {
      if (pendingRef.current) bufferRef.current.push(e);
      else handleEvent(e);
    }
  }

  // ----- question loop -----
  function startQuestion(question: L.Question) {
    const outcome = { val: question.val ?? 0, answer: (question.answer ?? "push") as L.Answer };
    const durationMs = L.answerWindowMs(baseQms, aliveTotal());
    const botPicks: BotPickEntry[] = [];
    botsRef.current.forEach((b, idx) => {
      if (!b.alive || b.isMe) return;
      botPicks.push({ idx, pick: L.botPick(b.skill, outcome.answer, rng()), at: 250 + rng() * Math.max(400, durationMs - 700) });
    });
    const now = Date.now();
    pendingRef.current = {
      q: question, outcome, botPicks, myPick: null, myPickAtMs: null,
      deadline: now + durationMs, started: now, durationMs,
    };
    setQ(question);
    setAnswerSide(null);
    setMyPick(null);
    setLocked(!meRef.current.alive);
    setVerdict(null);
    setNearDeath(null);
    setRoundReward(null);
    setQuestionDurationMs(durationMs);
    setSuddenDeath(durationMs <= 3000 && aliveTotal() <= 3);
    setCrowd({ hi: 0.5, n: 0 });
    setRemainingPct(100);
    setPanic(false);
    nextBeatRef.current = 0;

    tickIvRef.current && clearInterval(tickIvRef.current);
    tickIvRef.current = setInterval(() => {
      const P = pendingRef.current;
      if (!P) { tickIvRef.current && clearInterval(tickIvRef.current); return; }
      const t = Date.now();
      const rem = Math.max(0, P.deadline - t);
      const elapsed = t - P.started;
      setRemainingPct((rem / P.durationMs) * 100);
      // crowd bar: bot picks stream in before the lock
      const revealed: L.Side[] = [];
      for (const p of P.botPicks) { if (p.at <= elapsed) revealed.push(p.pick); }
      if (P.myPick) revealed.push(P.myPick);
      setCrowd({ hi: L.crowdSplit(revealed).hi, n: revealed.length });
      // heartbeat haptics as the timer dies
      if (rem < 2200) {
        setPanic(true);
        if (t >= nextBeatRef.current) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          nextBeatRef.current = t + Math.max(280, (rem / 2200) * 820);
        }
      }
      if (rem <= 0) {
        tickIvRef.current && clearInterval(tickIvRef.current);
        setLocked(true);
        drainWindowIntoView(); // no pick = still locked in — the window plays out either way
      }
    }, 50);
  }

  function pick(side: L.Side) {
    const P = pendingRef.current;
    if (!P || !meRef.current.alive || P.myPick) return;
    P.myPick = side;
    P.myPickAtMs = Math.max(0, P.deadline - Date.now());
    setMyPick(side);
    setLocked(true);
    Haptics.selectionAsync().catch(() => {});
    drainWindowIntoView(); // pick locked — start sweating the window immediately
  }

  function resolveRound() {
    const P = pendingRef.current;
    if (!P) return;
    pendingRef.current = null;
    setWindowPhase(false);
    const { val, answer } = P.outcome;
    const question = P.q;
    setAnswerSide(answer);
    setLocked(true);
    setRemainingPct(0);
    setPanic(false);

    const finalPicks = P.botPicks.map(p => p.pick).concat(P.myPick ? [P.myPick] : []);
    setCrowd({ hi: L.crowdSplit(finalPicks).hi, n: finalPicks.length });

    const wasAlive = meRef.current.alive;
    const verdictNow = L.judge(answer, P.myPick);
    const correctShare = L.correctPickShare(answer, finalPicks);
    const earnedPoints = wasAlive ? L.predictionPoints(verdictNow, correctShare) : 0;
    predictionPointsRef.current += earnedPoints;
    setPredictionPoints(predictionPointsRef.current);
    setRoundReward(wasAlive ? { points: earnedPoints, correctPct: Math.round(correctShare * 100) } : null);
    const hadPick = P.myPick != null;
    const me = meRef.current;
    const prevStreak = me.streak;
    if (wasAlive) {
      me.streak = L.nextStreak(me.streak, verdictNow, hadPick);
      setStreak(me.streak);
    }

    // bot eliminations
    const dying: number[] = [];
    for (const p of P.botPicks) {
      if (!L.survives(L.judge(answer, p.pick))) { botsRef.current[p.idx].alive = false; dying.push(p.idx); }
    }

    const botMajority = L.crowdSplit(P.botPicks.map(p => p.pick)).hi >= 0.5 ? "hi" : "lo";
    const wentAgainstCrowd = hadPick && P.myPick !== botMajority;
    let flaggedNearDeath = false;

    if (me.alive) {
      if (L.survives(verdictNow)) {
        if (verdictNow === "correct") {
          const isHiLoKind = question.kind === "compare_window" || !question.kind;
          setVerdict({
            text: isHiLoKind
              ? `✓ CORRECT — it was ${val} (${answer === "hi" ? "higher" : "lower"})`
              : `✓ CORRECT — ${answer === "hi" ? question.hiLabel : question.loLabel}`,
            kind: "ok",
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (L.isNearDeathTime(P.myPickAtMs)) {
            setNearDeath({ icon: "heart", text: `SURVIVED BY ${((P.myPickAtMs ?? 0) / 1000).toFixed(1)}s` });
            flaggedNearDeath = true;
          } else if (question.kind === "compare_window" && question.prevVal != null && L.isNearDeathMargin(val, question.prevVal)) {
            setNearDeath({ icon: "heart", text: `SURVIVED BY A SINGLE ${question.key.replace(/s$/, "").toUpperCase()}` });
            flaggedNearDeath = true;
          } else if (wentAgainstCrowd) {
            setNearDeath({ icon: "target", text: "WENT AGAINST THE CROWD AND WON" });
          }
        } else {
          setVerdict({ text: `— PUSH — the whole lobby breathes`, kind: "flat" });
          if (hadPick && me.streak > prevStreak) setNearDeath({ icon: "check", text: "push with a pick still feeds the streak" });
        }
        // survival push notification demo (round 3 = the promised moment)
        if (question.n === 3) {
          notifySurvival(3, aliveTotal()).catch(() => {});
        }
      } else {
        me.alive = false;
        botsRef.current[ME_INDEX].alive = false;
        me.outlivedAtDeath = L.outlived(FANS, othersAlive());
        deathRef.current = {
          round: question.n,
          prompt: questionPrompt(question),
          pick: P.myPick,
          answer,
          correctShare,
          matchMinute: matchMinuteRef.current,
          eliminatedWith: dying.length,
        };
        const why = verdictNow === "timeout" ? "TOO SLOW" : `✗ WRONG`;
        setVerdict({ text: `${why}. Eliminated at streak ${me.streak} — you outlived ${me.outlivedAtDeath} of 99 bot rivals`, kind: "out" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setDead(d => { const nd = [...d]; nd[ME_INDEX] = true; return nd; });
      }
    }

    if (wasAlive) {
      historyRef.current.push({
        round: question.n,
        kind: question.kind || "compare_window", key: question.key,
        prompt: questionPrompt(question), pick: P.myPick, answer, matchMinute: matchMinuteRef.current,
        correct: verdictNow === "correct",
        points: earnedPoints, correctShare,
        pickMs: P.myPickAtMs, wentAgainstCrowd, nearDeath: flaggedNearDeath,
      });
    }

    // staggered elimination cascade with haptic ticks
    const order = [...dying].sort(() => rng() - 0.5);
    order.forEach((idx, i) => {
      later(() => {
        setDead(d => { const nd = [...d]; nd[idx] = true; return nd; });
        setAliveCount(a => a - 1);
        if (i % 6 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }, 140 + i * 40);
    });
    const names = order.slice(0, 2).map(i => botsRef.current[i].name).join(", ");
    setTicker(
      dying.length
        ? `${names}${dying.length > 2 ? ` +${dying.length - 2} more` : ""} eliminated${me.alive ? " — you outlived them" : ""}`
        : answer === "push" ? "push — nobody eliminated this round" : ""
    );

    later(() => {
      setAliveCount(aliveTotal());
      if (!meRef.current.alive) {
        const ghostRank = Math.max(2, aliveTotal() + 1);
        ghostRankRef.current = ghostRank;
        setGhostMessage(`GHOST MODE · YOU WOULD NOW BE TOP ${ghostRank}`);
      }
      if (scheduleIdxRef.current >= SCHEDULE.length || aliveTotal() <= 1 || othersAlive() === 0) endGame();
      else flushBuffer();
    }, settings.revealSeconds * 1000 + Math.min(1400, dying.length * 40));
  }

  function computeBadges(): string[] {
    const h = historyRef.current;
    const badges: string[] = [];
    if (h.some(r => r.correct && r.pickMs != null && r.pickMs <= 1500)) badges.push("ice_veins");
    if (h.some(r => r.correct && r.nearDeath)) badges.push("comeback_king");
    if (h.length > 0 && h.every(r => r.correct)) badges.push("perfect_round");
    if (h.some(r => r.correct && r.wentAgainstCrowd)) badges.push("crowd_breaker");
    return badges;
  }

  function endGame() {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    streamRef.current?.stop();
    const me = meRef.current;
    const oa = othersAlive();
    const won = me.alive && oa === 0;
    const outlivedCount = me.alive ? FANS - aliveTotal() : me.outlivedAtDeath ?? 0;
    const crownBonus = won ? 250 : 0;
    const pts = L.ladderPoints({ predictionPoints: predictionPointsRef.current, outlivedCount, won });
    const badges = computeBadges();
    const history: RoundRecord[] = historyRef.current.map(r => ({
      round: r.round, kind: r.kind, key: r.key, prompt: r.prompt, pick: r.pick,
      answer: r.answer, matchMinute: r.matchMinute, correct: r.correct,
      points: r.points, correctShare: r.correctShare,
    }));
    if (won) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    later(() => onEnd({
      fixtureId: replay.fixtureId, dailyKey,
      won, survivedToEnd: me.alive, streak: me.streak, outlivedCount,
      predictionPoints: predictionPointsRef.current, survivalPoints: outlivedCount, crownBonus, pts,
      rounds: historyRef.current.length, aliveAtEnd: aliveTotal(),
      challengeTargetPoints: challenge?.targetPoints,
      ghostRankAtEnd: ghostRankRef.current,
      death: deathRef.current,
      badges, history,
    }), 1200);
  }

  // ----- render -----
  if (countdown > 0) {
    return (
      <View style={styles.countWrap}>
        <Pulse trigger={countdown}><Text style={styles.countNum}>{countdown}</Text></Pulse>
        <Text style={styles.countSub}>entering lobby #{replay.lobbyId} — 100 fans locked in</Text>
      </View>
    );
  }

  const hiPct = Math.round(crowd.hi * 100);
  const isSidePick = q?.kind === "side_pick";
  const hiColor = isSidePick ? C.teamBlue : C.hi;
  const hiSoftColor = isSidePick ? C.teamBlueSoft : C.hiSoft;
  const upNext = SCHEDULE.slice(scheduleIdxRef.current, scheduleIdxRef.current + 3);
  const ghostPick = q && challenge ? challenge.picks[q.n - 1] : null;
  const secsLeft = Math.max(0, Math.ceil((remainingPct / 100) * (questionDurationMs / 1000)));

  const scoreDigits = score.replace(CODE1, "").replace(CODE2, "").trim();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* broadcast top bar */}
      <View style={styles.topBar}>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTxt}>{challenge ? "GHOST CHALLENGE" : "SIM LIVE"} · {settings.playbackRate}x</Text>
        </View>
        <Text style={styles.roundTitle}>{q ? `ROUND ${q.n} / ${SCHEDULE.length}` : "GET READY"}</Text>
        <View style={styles.leftPillRow}>
          <Text style={styles.leftPill}>{matchMinute}'  ·  </Text>
          <Icon name="users" size={12} color={C.text} />
          <Text style={styles.leftPill}> {aliveCount}</Text>
        </View>
      </View>

      {/* scoreline */}
      <Pulse trigger={score} style={styles.scoreChip}>
        <Text style={styles.scoreCode1}>{CODE1}</Text>
        <Text style={styles.scoreNum}>{scoreDigits}</Text>
        <Text style={styles.scoreCode2}>{CODE2}</Text>
      </Pulse>
      <View style={styles.feedRow}>
        {lastEvent.icon && <Icon name={lastEvent.icon} size={11} color={C.muted} style={{ marginRight: 5 }} />}
        <Text style={styles.feedLine}>{lastEvent.text}</Text>
      </View>

      {/* question card */}
      {suddenDeath && (
        <View style={[styles.suddenBanner, glow(C.gold, 10, 0.6)]}>
          <Icon name="bolt" size={12} color={C.gold} style={{ marginRight: 6 }} />
          <Text style={styles.suddenBannerTxt}>SUDDEN DEATH · 3 SECONDS · {aliveCount} FANS LEFT</Text>
        </View>
      )}
      <FadeIn key={`q-${q?.n ?? 0}`} dy={10} duration={280} style={[styles.qCard, suddenDeath && styles.qCardSudden, glow(suddenDeath ? C.gold : C.hi, 10, 0.3)]}>
        <View style={styles.qKickerRow}>
          <Icon name={q ? KIND_ICON[q.kind || "compare_window"] : "ball"} size={11} color={C.muted} style={{ marginRight: 6 }} />
          {q && <Text style={styles.qKicker}>WINDOW {q.fromMin}–{q.fromMin + q.windowLen}'</Text>}
        </View>
        <Text style={styles.question}>
          {q ? questionPrompt(q)
            : "Every stat window is a question. Wrong = eliminated."}
        </Text>
        {q && q.kind === "compare_window" && q.prevVal != null && (
          <Text style={styles.lastval}>last {q.windowLen} min: <Text style={styles.lastvalNum}>{q.prevVal}</Text> {q.key}</Text>
        )}
      </FadeIn>
      {challenge && q && (
        <View style={styles.ghostPickCard}>
          <Text style={styles.ghostPickLabel}>FRIEND'S GHOST · ROUND {q.n}</Text>
          <Text style={styles.ghostPickValue}>{ghostPick ? `PICKED ${ghostPick.toUpperCase()}` : "TIMED OUT"} · TARGET {challenge.targetPoints} PTS</Text>
        </View>
      )}

      {/* the duel */}
      <View style={styles.answers}>
        <Tap
          accessibilityRole="button"
          accessibilityLabel={q?.hiLabel || "Higher"}
          accessibilityState={{ disabled: locked, selected: myPick === "hi" }}
          disabled={locked}
          scaleTo={0.96}
          onPress={() => pick("hi")}
          style={[
            styles.duelBtn, styles.duelHi,
            myPick === "hi" && [{ backgroundColor: hiSoftColor }, glow(hiColor, 14, 0.8)],
            locked && myPick !== "hi" && styles.duelDim,
          ]}
        >
          <Text style={[styles.duelTxt, { color: hiColor }]} numberOfLines={1} adjustsFontSizeToFit>
            {q?.hiLabel || "HI"}
          </Text>
        </Tap>
        <Tap
          accessibilityRole="button"
          accessibilityLabel={q?.loLabel || "Lower"}
          accessibilityState={{ disabled: locked, selected: myPick === "lo" }}
          disabled={locked}
          scaleTo={0.96}
          onPress={() => pick("lo")}
          style={[
            styles.duelBtn, styles.duelLo,
            myPick === "lo" && [{ backgroundColor: C.loSoft }, glow(C.lo, 14, 0.8)],
            locked && myPick !== "lo" && styles.duelDim,
          ]}
        >
          <Text style={[styles.duelTxt, { color: C.lo }]} numberOfLines={1} adjustsFontSizeToFit>
            {q?.loLabel || "LO"}
          </Text>
        </Tap>
      </View>

      {/* crowd split */}
      <View style={styles.crowdRow}>
        <Text style={styles.crowdHiTxt}>{hiPct}% HI</Text>
        <View style={styles.crowdTrack}>
          <View style={[styles.crowdFillHi, { flex: Math.max(4, hiPct) }]} />
          <View style={[styles.crowdFillLo, { flex: Math.max(4, 100 - hiPct) }]} />
        </View>
        <Text style={styles.crowdLoTxt}>{100 - hiPct}% LO</Text>
      </View>
      <Text style={styles.crowdLbl}>
        {answerSide
          ? answerSide === "push"
            ? "dead heat — the stat tied"
            : `the crowd was ${(answerSide === "hi" ? crowd.hi : 1 - crowd.hi) >= 0.5 ? "RIGHT" : "WRONG"}`
          : `${crowd.n} of ${aliveCount} fans locked in…`}
      </Text>

      {/* heartbeat timer */}
      <View style={styles.timerRow}>
        <View style={[styles.pulseLine, { backgroundColor: C.hi }]} />
        <View style={[styles.timerCircle, panic && styles.timerCirclePanic, glow(panic ? C.lo : C.hi, 12, 0.7)]}>
          <Text style={[styles.timerNum, panic && { color: C.lo }]}>{String(secsLeft).padStart(2, "0")}</Text>
        </View>
        <View style={[styles.pulseLine, { backgroundColor: C.lo }]} />
      </View>

      {/* window in play: pick is locked, the match fast-forwards through the
          real window on screen — the wait for settlement IS the drama */}
      {windowPhase && !verdict && q && (
        <FadeIn dy={6} duration={240} style={styles.windowRow}>
          <View style={[styles.windowChip, glow(C.gold, 9, 0.4)]}>
            <Icon name="clock" size={12} color={C.gold} style={{ marginRight: 6 }} />
            <Text style={styles.windowChipTxt}>WINDOW IN PLAY · SETTLES AT {q.fromMin + q.windowLen}'</Text>
          </View>
          <Text style={styles.windowSub}>
            {settings.mode === "live"
              ? `${q.windowLen} real minutes — hold your nerve`
              : `replay ×${settings.playbackRate} — this is ${q.windowLen} real minutes in live mode`}
          </Text>
        </FadeIn>
      )}
      {verdict && (
        <FadeIn dy={6} duration={240}>
          <Text accessibilityLiveRegion="polite" style={[styles.verdict, verdict.kind === "ok" && { color: C.hi }, verdict.kind === "out" && { color: C.lo }]}>
            {verdict.text}
          </Text>
        </FadeIn>
      )}
      {roundReward && (
        <FadeIn dy={6} duration={240} delay={60}>
          <Text style={[styles.reward, roundReward.points === 0 && styles.rewardZero]}>
            {roundReward.points > 0 ? `+${roundReward.points} PTS · ONLY ${roundReward.correctPct}% GOT IT RIGHT` : "0 PTS · WRONG / PUSH"}
          </Text>
        </FadeIn>
      )}
      {nearDeath && (
        <FadeIn dy={6} duration={240} delay={110} style={styles.nearDeathRow}>
          <Icon name={nearDeath.icon} size={12} color={C.gold} style={{ marginRight: 6 }} />
          <Text style={styles.nearDeath}>{nearDeath.text}</Text>
        </FadeIn>
      )}
      {ghostMessage && <FadeIn dy={6}><Text style={styles.ghostMode}>{ghostMessage} · KEEP WATCHING</Text></FadeIn>}

      {/* streak */}
      <Pulse trigger={`${streak}-${predictionPoints}`} style={[styles.streakPill, glow(C.gold, 8, 0.3)]}>
        <Icon name="bolt" size={13} color={C.gold} style={{ marginRight: 7 }} />
        <Text style={styles.streakPillTxt}>
          STREAK <Text style={styles.streakNum}>x{streak}</Text>  ·  {predictionPoints} SKILL PTS
        </Text>
      </Pulse>

      {/* up next */}
      {upNext.length > 1 && (
        <>
          <Text style={styles.sectionLbl}>—  UP NEXT  —</Text>
          <View style={styles.upNextRow}>
            {upNext.slice(1).map((nq, idx) => (
              <View key={nq.n} style={[styles.upNextCard, idx % 2 ? styles.upNextRed : styles.upNextCyan]}>
                <Text style={styles.upNextNum}>{nq.n}</Text>
                <Icon name={KIND_ICON[nq.kind || "compare_window"]} size={18} color={idx % 2 ? C.lo : C.hi} style={{ marginVertical: 4 }} />
                <Text style={[styles.upNextLabel, { color: idx % 2 ? C.lo : C.hi }]} numberOfLines={2}>
                  {nq.label.toUpperCase()}
                </Text>
                <Icon name="lock" size={10} color={C.muted} style={{ opacity: 0.7 }} />
              </View>
            ))}
          </View>
        </>
      )}

      {/* the 100 fans */}
      <View style={styles.sectionLblRow}>
        <Icon name="skull" size={11} color={C.muted} style={{ marginRight: 8 }} />
        <Text style={[styles.sectionLbl, { marginBottom: 0 }]}>ELIMINATED {FANS - aliveCount}</Text>
        <Icon name="skull" size={11} color={C.muted} style={{ marginLeft: 8 }} />
      </View>
      <View style={styles.grid}>
        {botsRef.current.map((b, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              b.isMe && styles.dotMe,
              dead[i] && styles.dotDead,
            ]}
          />
        ))}
      </View>
      {!!ticker && <Text style={styles.ticker}>{ticker}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  countWrap: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  countNum: { color: C.gold, fontSize: 120, ...displayFont },
  countSub: { color: C.muted, marginTop: 12 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  livePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,59,92,0.15)", borderColor: C.lo, borderWidth: 1,
    borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.lo },
  liveTxt: { color: C.text, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  roundTitle: { color: C.text, fontSize: 16, ...displayFont, letterSpacing: 1 },
  leftPillRow: { flexDirection: "row", alignItems: "center" },
  leftPill: { color: C.text, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  scoreChip: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    backgroundColor: C.panel, borderColor: C.line, borderWidth: hairline, borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  scoreCode1: { color: C.hi, fontSize: 18, ...displayFont },
  scoreNum: { color: C.text, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  scoreCode2: { color: C.lo, fontSize: 18, ...displayFont },
  feedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 6, marginBottom: 12 },
  feedLine: { color: C.muted, fontSize: 12, textAlign: "center" },
  qCard: {
    backgroundColor: C.panel, borderColor: C.hi, borderWidth: 1, borderRadius: 18,
    paddingVertical: 16, paddingHorizontal: 14, marginBottom: 14,
  },
  qCardSudden: { borderColor: C.gold, transform: [{ scale: 1.015 }] },
  suddenBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.goldSoft, borderColor: C.gold, borderWidth: 1, borderRadius: 10, paddingVertical: 9, marginBottom: 10 },
  suddenBannerTxt: { color: C.gold, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  ghostPickCard: { backgroundColor: "rgba(46,230,255,0.08)", borderColor: C.hi, borderWidth: 1, borderRadius: 11, padding: 9, alignItems: "center", marginBottom: 11 },
  ghostPickLabel: { color: C.hi, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  ghostPickValue: { color: C.text, fontSize: 11, fontWeight: "800", marginTop: 3 },
  qKickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  qKicker: { color: C.muted, fontSize: 10, letterSpacing: 2, textAlign: "center", textTransform: "uppercase" },
  question: { color: C.text, fontSize: 21, fontWeight: "900", textAlign: "center", lineHeight: 28 },
  lastval: { color: C.muted, textAlign: "center", marginTop: 8 },
  lastvalNum: { color: C.hi, fontSize: 18, fontWeight: "900" },
  answers: { flexDirection: "row", gap: 10, marginBottom: 12 },
  duelBtn: {
    flex: 1, height: 92, borderRadius: 18, borderWidth: 2,
    backgroundColor: C.panelDeep, alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
  },
  duelHi: { borderColor: C.hi },
  duelLo: { borderColor: C.lo },
  duelDim: { opacity: 0.35 },
  duelTxt: { fontSize: 34, ...displayFont },
  crowdRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  crowdHiTxt: { color: C.hi, fontSize: 13, fontWeight: "900", width: 62 },
  crowdLoTxt: { color: C.lo, fontSize: 13, fontWeight: "900", width: 62, textAlign: "right" },
  crowdTrack: { flex: 1, flexDirection: "row", height: 10, borderRadius: 99, overflow: "hidden", backgroundColor: C.panelDeep },
  crowdFillHi: { backgroundColor: C.hi },
  crowdFillLo: { backgroundColor: C.lo },
  crowdLbl: { color: C.muted, fontSize: 10, letterSpacing: 1, textAlign: "center", marginBottom: 10, textTransform: "uppercase" },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  pulseLine: { flex: 1, height: 2, borderRadius: 1, opacity: 0.7 },
  timerCircle: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: C.hi,
    alignItems: "center", justifyContent: "center", backgroundColor: C.panelDeep,
  },
  timerCirclePanic: { borderColor: C.lo },
  timerNum: { color: C.text, fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] },
  windowRow: { alignItems: "center", marginBottom: 6 },
  windowChip: { flexDirection: "row", alignItems: "center", backgroundColor: C.goldSoft, borderColor: C.gold, borderWidth: 1, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7 },
  windowChipTxt: { color: C.gold, fontSize: 11, fontWeight: "900", letterSpacing: 1, fontVariant: ["tabular-nums"] },
  windowSub: { color: C.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.4, marginTop: 5 },
  verdict: { color: C.text, textAlign: "center", fontWeight: "800", marginBottom: 4, fontSize: 15 },
  reward: { color: C.gold, textAlign: "center", fontSize: 11, fontWeight: "900", letterSpacing: 0.8, marginBottom: 4 },
  rewardZero: { color: C.muted },
  nearDeathRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  nearDeath: { color: C.gold, textAlign: "center", fontWeight: "900" },
  ghostMode: { color: C.hi, backgroundColor: C.hiSoft, borderColor: C.hi, borderWidth: 1, borderRadius: 10, paddingVertical: 9, textAlign: "center", fontSize: 10, fontWeight: "900", letterSpacing: 0.6, marginBottom: 8 },
  streakPill: {
    alignSelf: "center", flexDirection: "row", alignItems: "center",
    backgroundColor: C.goldSoft, borderColor: C.gold, borderWidth: 1.5,
    borderRadius: 99, paddingHorizontal: 18, paddingVertical: 8, marginTop: 6, marginBottom: 14,
  },
  streakPillTxt: { color: C.gold, fontSize: 14, fontWeight: "700", letterSpacing: 0.6 },
  streakNum: { ...displayFont, fontSize: 15 },
  sectionLbl: { ...type.section, textAlign: "center", marginBottom: 8 },
  sectionLblRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  upNextRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  upNextCard: {
    flex: 1, backgroundColor: C.panelDeep, borderWidth: hairline,
    borderRadius: 14, alignItems: "center", paddingVertical: 10, paddingHorizontal: 4,
  },
  upNextCyan: { borderColor: C.line },
  upNextRed: { borderColor: C.line },
  upNextNum: { color: C.muted, fontSize: 10, fontWeight: "900", alignSelf: "flex-start", marginLeft: 8 },
  upNextLabel: { fontSize: 10, fontWeight: "900", textAlign: "center", letterSpacing: 0.5, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  dot: {
    width: "8.6%", aspectRatio: 1, borderRadius: 99, backgroundColor: "#141c28",
    borderColor: "#233046", borderWidth: 1, margin: "0.7%",
  },
  dotMe: { borderColor: C.gold, borderWidth: 2, backgroundColor: C.goldSoft },
  dotDead: { backgroundColor: "rgba(255,59,92,0.18)", borderColor: C.lo, transform: [{ scale: 0.6 }] },
  ticker: { color: C.muted, fontSize: 12, textAlign: "center", marginTop: 10 },
});
