import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as L from "../lib/game-logic";
import { liveStatus, streamLive } from "../lib/live-service";
import type { ScoreEvent, StreamHandle } from "../lib/txline-mock";
import { C, FANS, ME_INDEX, fanName, displayFont, glow } from "../theme";
import { GameSettings } from "../lib/settings";
import { DeathMoment, GameResult, RoundRecord } from "../types";

interface Bot { alive: boolean; isMe: boolean; name: string; }
interface LivePending { question: L.Question; myPick: L.Side | null; botPicks: Array<{ index: number; pick: L.Side }>; deadline: number; }
interface Props { settings: GameSettings; onEnd: (result: GameResult) => void; }

const WINDOW_MINUTES = 5;
const TEAM_1 = process.env.EXPO_PUBLIC_LIVE_TEAM_1 || "TEAM A";
const TEAM_2 = process.env.EXPO_PUBLIC_LIVE_TEAM_2 || "TEAM B";
const CODE_1 = TEAM_1.slice(0, 3).toUpperCase();
const CODE_2 = TEAM_2.slice(0, 3).toUpperCase();

export default function LiveGameScreen({ settings, onEnd }: Props) {
  const botsRef = useRef<Bot[]>(Array.from({ length: FANS }, (_, index) => ({ alive: true, isMe: index === ME_INDEX, name: fanName(index) })));
  const meRef = useRef({ alive: true, streak: 0, outlivedAtDeath: null as number | null });
  const eventsRef = useRef<ScoreEvent[]>([]);
  const pendingRef = useRef<LivePending | null>(null);
  const streamRef = useRef<StreamHandle | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const roundRef = useRef(0);
  const nextWindowRef = useRef<number | null>(null);
  const historyRef = useRef<RoundRecord[]>([]);
  const predictionPointsRef = useRef(0);
  const deathRef = useRef<DeathMoment | undefined>(undefined);
  const ghostRankRef = useRef<number | undefined>(undefined);
  const gameOverRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [minute, setMinute] = useState(0);
  const [score, setScore] = useState(`${CODE_1} 0 – 0 ${CODE_2}`);
  const [lastEvent, setLastEvent] = useState("Connecting to TxLINE live stream…");
  const [question, setQuestion] = useState<L.Question | null>(null);
  const [myPick, setMyPick] = useState<L.Side | null>(null);
  const [locked, setLocked] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState<number>(settings.answerSeconds);
  const [answer, setAnswer] = useState<L.Answer | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [aliveCount, setAliveCount] = useState(FANS);
  const [dead, setDead] = useState<boolean[]>(() => Array(FANS).fill(false));
  const [crowdHi, setCrowdHi] = useState(50);
  const [streak, setStreak] = useState(0);
  const [predictionPoints, setPredictionPoints] = useState(0);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [ghostMessage, setGhostMessage] = useState<string | null>(null);
  const [roundReward, setRoundReward] = useState<{ points: number; correctPct: number } | null>(null);

  const later = (fn: () => void, ms: number) => timersRef.current.push(setTimeout(fn, ms));
  const aliveTotal = () => botsRef.current.filter(bot => bot.alive).length;
  const othersAlive = () => botsRef.current.filter(bot => bot.alive && !bot.isMe).length;

  useEffect(() => {
    streamRef.current = streamLive({
      onEvent: handleEvent,
      onDone: () => endGame(),
      onError: message => setConnectionError(message),
    });
    return () => {
      streamRef.current?.stop();
      if (tickRef.current) clearInterval(tickRef.current);
      timersRef.current.forEach(clearTimeout);
    };
    // The live match is intentionally bound once to the configured fixture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEvent(event: ScoreEvent) {
    if (gameOverRef.current) return;
    setConnected(true);
    eventsRef.current.push(event);
    setMinute(event.minute);
    setScore(`${CODE_1} ${event.stats.g1} – ${event.stats.g2} ${CODE_2}`);
    const icon: Record<string, string> = { goal: "⚽", corner: "🚩", card: "🟨", shot: "🎯", var: "📺", penalty: "⚽", kickoff: "▶" };
    setLastEvent(`${icon[event.type] || "●"} ${event.minute}' ${event.type.replace(/_/g, " ")} ${event.teamName !== "—" ? `· ${event.teamName}` : ""}`);

    if (nextWindowRef.current == null) nextWindowRef.current = Math.max(WINDOW_MINUTES, Math.ceil(event.minute / WINDOW_MINUTES) * WINDOW_MINUTES);
    const pending = pendingRef.current;
    if (pending && event.minute >= pending.question.fromMin + pending.question.windowLen) {
      resolveWindow();
      return;
    }
    if (!pending && nextWindowRef.current != null && event.minute >= nextWindowRef.current) startWindow(nextWindowRef.current);
    if (/game_finalised|fulltime/i.test(event.type)) endGame();
  }

  function startWindow(fromMinute: number) {
    roundRef.current += 1;
    const q = L.makeQuestion(eventsRef.current, roundRef.current, fromMinute, WINDOW_MINUTES);
    q.kind = "compare_window";
    q.promptText = `${q.emoji} MORE or FEWER ${q.label} in the next ${WINDOW_MINUTES} min than the last ${WINDOW_MINUTES}?`;
    q.hiLabel = "HIGHER";
    q.loLabel = "LOWER";
    const botPicks = botsRef.current.flatMap((bot, index) => !bot.alive || bot.isMe ? [] : [{ index, pick: (Math.random() < 0.5 ? "hi" : "lo") as L.Side }]);
    const split = L.crowdSplit(botPicks.map(entry => entry.pick));
    const answerMs = L.answerWindowMs(settings.answerSeconds * 1000, aliveTotal());
    pendingRef.current = { question: q, myPick: null, botPicks, deadline: Date.now() + answerMs };
    setQuestion(q);
    setMyPick(null);
    setAnswer(null);
    setVerdict(null);
    setRoundReward(null);
    setCrowdHi(Math.round(split.hi * 100));
    setLocked(!meRef.current.alive);
    setSuddenDeath(answerMs <= 3000 && aliveTotal() <= 3);
    setSecondsLeft(answerMs / 1000);

    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const current = pendingRef.current;
      if (!current) return;
      const remaining = Math.max(0, current.deadline - Date.now());
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        if (tickRef.current) clearInterval(tickRef.current);
        setLocked(true);
        if (!current.myPick) setVerdict("PICK LOCKED · NO ANSWER · WAITING FOR THE LIVE WINDOW");
        else setVerdict(`PICK LOCKED · RESOLVES AT ${current.question.fromMin + current.question.windowLen}'`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    }, 100);
  }

  function pick(side: L.Side) {
    const current = pendingRef.current;
    if (!current || locked || current.myPick || !meRef.current.alive) return;
    current.myPick = side;
    setMyPick(side);
    setLocked(true);
    setVerdict(`PICK LOCKED · RESOLVES AT ${current.question.fromMin + current.question.windowLen}'`);
    Haptics.selectionAsync().catch(() => {});
  }

  function resolveWindow() {
    const current = pendingRef.current;
    if (!current) return;
    if (tickRef.current) clearInterval(tickRef.current);
    const outcome = L.resolveQuestion(eventsRef.current, current.question);
    const playerVerdict = L.judge(outcome.answer, current.myPick);
    const wasAlive = meRef.current.alive;
    const allPicks = current.botPicks.map(entry => entry.pick).concat(current.myPick ? [current.myPick] : []);
    const correctShare = L.correctPickShare(outcome.answer, allPicks);
    const earnedPoints = wasAlive ? L.predictionPoints(playerVerdict, correctShare) : 0;
    predictionPointsRef.current += earnedPoints;
    setPredictionPoints(predictionPointsRef.current);
    setRoundReward(wasAlive ? { points: earnedPoints, correctPct: Math.round(correctShare * 100) } : null);
    setAnswer(outcome.answer);
    const me = meRef.current;
    if (wasAlive) {
      me.streak = L.nextStreak(me.streak, playerVerdict, current.myPick != null);
      setStreak(me.streak);
    }

    const dying: number[] = [];
    for (const entry of current.botPicks) {
      if (!L.survives(L.judge(outcome.answer, entry.pick))) { botsRef.current[entry.index].alive = false; dying.push(entry.index); }
    }
    if (me.alive && !L.survives(playerVerdict)) {
      me.alive = false;
      botsRef.current[ME_INDEX].alive = false;
      me.outlivedAtDeath = L.outlived(FANS, othersAlive());
      deathRef.current = {
        round: roundRef.current,
        prompt: current.question.promptText || current.question.label,
        pick: current.myPick,
        answer: outcome.answer,
        correctShare,
        matchMinute: minute,
        eliminatedWith: dying.length,
      };
      dying.push(ME_INDEX);
    }

    dying.forEach((index, position) => later(() => {
      setDead(value => { const next = [...value]; next[index] = true; return next; });
      setAliveCount(aliveTotal());
      if (position % 5 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, position * 45));

    if (wasAlive) historyRef.current.push({
      round: roundRef.current,
      kind: current.question.kind || "compare_window",
      key: current.question.key,
      prompt: current.question.promptText || current.question.label,
      pick: current.myPick,
      answer: outcome.answer,
      matchMinute: minute,
      correct: playerVerdict === "correct",
      points: earnedPoints,
      correctShare,
    });
    if (!wasAlive) {
      setVerdict(null);
    } else if (playerVerdict === "correct") {
      setVerdict(`✓ SURVIVED · ${current.question.key.toUpperCase()} = ${outcome.val}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (playerVerdict === "push") setVerdict("— PUSH · THE WHOLE LOBBY SURVIVES");
    else {
      setVerdict(playerVerdict === "timeout" ? "⏱ TOO SLOW · ELIMINATED" : "✕ WRONG · ELIMINATED");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }

    nextWindowRef.current = current.question.fromMin + current.question.windowLen;
    later(() => {
      pendingRef.current = null;
      setQuestion(null);
      setAnswer(null);
      setVerdict(null);
      if (!meRef.current.alive) {
        const ghostRank = Math.max(2, aliveTotal() + 1);
        ghostRankRef.current = ghostRank;
        setGhostMessage(`GHOST MODE · YOU WOULD NOW BE TOP ${ghostRank}`);
      }
      if (othersAlive() === 0 || aliveTotal() <= 1) endGame();
    }, settings.revealSeconds * 1000);
  }

  function endGame() {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    streamRef.current?.stop();
    const me = meRef.current;
    const won = me.alive && othersAlive() === 0;
    const outlivedCount = me.alive ? FANS - aliveTotal() : me.outlivedAtDeath || 0;
    const result: GameResult = {
      fixtureId: liveStatus().fixtureId || "live",
      dailyKey: "live",
      won,
      survivedToEnd: me.alive,
      streak: me.streak,
      outlivedCount,
      predictionPoints: predictionPointsRef.current,
      survivalPoints: outlivedCount,
      crownBonus: won ? 250 : 0,
      pts: L.ladderPoints({ predictionPoints: predictionPointsRef.current, outlivedCount, won }),
      rounds: historyRef.current.length,
      aliveAtEnd: aliveTotal(),
      ghostRankAtEnd: ghostRankRef.current,
      death: deathRef.current,
      badges: historyRef.current.length > 0 && historyRef.current.every(item => item.correct) ? ["perfect_round"] : [],
      history: historyRef.current,
    };
    later(() => onEnd(result), 900);
  }

  const resolvingAt = question ? question.fromMin + question.windowLen : null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={[styles.livePill, glow(C.lo, 8, 0.35)]}><View style={styles.liveDot} /><Text style={styles.liveTxt}>LIVE · 1x</Text></View>
        <Text style={styles.round}>ROUND {Math.max(1, roundRef.current)}</Text>
        <Text style={styles.alive}>👥 {aliveCount}</Text>
      </View>
      {suddenDeath && <Text style={styles.suddenBanner}>⚡ SUDDEN DEATH · 3 SECONDS · {aliveCount} FANS LEFT</Text>}

      <View style={styles.scoreCard}><Text style={styles.team1}>{CODE_1}</Text><Text style={styles.score}>{score.replace(CODE_1, "").replace(CODE_2, "").trim()}</Text><Text style={styles.team2}>{CODE_2}</Text></View>
      <Text style={styles.feed}>{connectionError ? `CONNECTION ERROR · ${connectionError}` : connected ? lastEvent : "CONNECTING TO TXLINE…"}</Text>

      <View style={[styles.questionCard, glow(C.hi, 12, 0.3)]}>
        <Text style={styles.window}>{question ? `LIVE WINDOW ${question.fromMin}–${resolvingAt}'` : `MATCH MINUTE ${minute}'`}</Text>
        <Text style={styles.question}>{question?.promptText || "Watching the live feed for the next prediction window…"}</Text>
        {question?.prevVal != null && <Text style={styles.previous}>LAST {WINDOW_MINUTES} MIN · <Text style={{ color: C.hi, fontWeight: "900" }}>{question.prevVal}</Text> {question.key.toUpperCase()}</Text>}
      </View>

      <View style={styles.answers}>
        <Pressable disabled={locked || !question} onPress={() => pick("hi")} style={[styles.answerBtn, styles.hiBtn, myPick === "hi" && [styles.selectedHi, glow(C.hi, 14, 0.7)], (locked || !question) && myPick !== "hi" && styles.dim]}><Text style={styles.hiTxt}>{question?.hiLabel || "HI"}</Text></Pressable>
        <Pressable disabled={locked || !question} onPress={() => pick("lo")} style={[styles.answerBtn, styles.loBtn, myPick === "lo" && [styles.selectedLo, glow(C.lo, 14, 0.7)], (locked || !question) && myPick !== "lo" && styles.dim]}><Text style={styles.loTxt}>{question?.loLabel || "LO"}</Text></Pressable>
      </View>

      <View style={styles.crowdRow}><Text style={styles.crowdHi}>{crowdHi}% HI</Text><View style={styles.crowdTrack}><View style={[styles.crowdHiFill, { flex: Math.max(4, crowdHi) }]} /><View style={[styles.crowdLoFill, { flex: Math.max(4, 100 - crowdHi) }]} /></View><Text style={styles.crowdLo}>{100 - crowdHi}% LO</Text></View>
      <Text style={styles.crowdMeta}>{question ? `${aliveCount - 1} LIVE PICKS · RESULT AT ${resolvingAt}'` : "THE NEXT PICK OPENS ON A FIVE-MINUTE BOUNDARY"}</Text>

      <View style={[styles.timer, glow(secondsLeft <= 3 ? C.lo : C.hi, 10, 0.5)]}><Text style={[styles.timerNum, secondsLeft <= 3 && { color: C.lo }]}>{question && !answer ? String(secondsLeft).padStart(2, "0") : "—"}</Text><Text style={styles.timerLabel}>{question ? (locked ? "LOCKED" : "SECONDS TO PICK") : "STANDBY"}</Text></View>
      {!!verdict && <Text style={[styles.verdict, answer === "hi" && { color: C.hi }, answer === "lo" && { color: C.lo }]}>{verdict}</Text>}
      {roundReward && <Text style={[styles.reward, roundReward.points === 0 && { color: C.muted }]}>{roundReward.points > 0 ? `+${roundReward.points} PTS · ONLY ${roundReward.correctPct}% GOT IT RIGHT` : "0 PTS · WRONG / PUSH"}</Text>}
      {ghostMessage && <Text style={styles.ghostMode}>{ghostMessage} · KEEP WATCHING</Text>}
      <View style={styles.streak}><Text style={styles.streakTxt}>🔥 STREAK x{streak}  ·  {predictionPoints} SKILL PTS</Text></View>

      <Text style={styles.section}>LIVE ELIMINATION FIELD</Text>
      <View style={styles.grid}>{botsRef.current.map((bot, index) => <View key={bot.name} style={[styles.dot, bot.isMe && styles.you, dead[index] && styles.dead]} />)}</View>
      <Text style={styles.truth}>LIVE MODE · no outcome is precomputed. Picks resolve only after TxLINE closes the real stat window.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, content: { padding: 16, paddingBottom: 36 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }, livePill: { flexDirection: "row", alignItems: "center", gap: 6, borderColor: C.lo, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.loSoft }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.lo }, liveTxt: { color: C.text, fontSize: 10, fontWeight: "900", letterSpacing: 1 }, round: { color: C.text, fontSize: 15, ...displayFont }, alive: { color: C.text, fontSize: 12, fontWeight: "900" },
  suddenBanner: { color: C.gold, backgroundColor: C.goldSoft, borderColor: C.gold, borderWidth: 1, borderRadius: 10, paddingVertical: 9, textAlign: "center", fontSize: 11, fontWeight: "900", letterSpacing: 0.8, marginBottom: 10 },
  ghostMode: { color: C.hi, backgroundColor: C.hiSoft, borderColor: C.hi, borderWidth: 1, borderRadius: 10, paddingVertical: 9, textAlign: "center", fontSize: 10, fontWeight: "900", letterSpacing: 0.6, marginVertical: 7 },
  scoreCard: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18, backgroundColor: C.panel, borderColor: C.lineStrong, borderWidth: 1, borderRadius: 15, paddingVertical: 12 }, team1: { color: C.hi, fontSize: 17, ...displayFont }, team2: { color: C.lo, fontSize: 17, ...displayFont }, score: { color: C.text, fontSize: 23, fontWeight: "900" }, feed: { color: C.muted, fontSize: 10, textAlign: "center", marginTop: 7, marginBottom: 11, textTransform: "uppercase" },
  questionCard: { backgroundColor: C.panel, borderColor: C.hi, borderWidth: 1.5, borderRadius: 19, padding: 17, minHeight: 145, justifyContent: "center" }, window: { color: C.muted, textAlign: "center", fontSize: 9, fontWeight: "900", letterSpacing: 1.7, marginBottom: 8 }, question: { color: C.text, fontSize: 22, fontWeight: "900", lineHeight: 29, textAlign: "center" }, previous: { color: C.muted, fontSize: 10, textAlign: "center", marginTop: 9 },
  answers: { flexDirection: "row", gap: 9, marginTop: 11 }, answerBtn: { flex: 1, height: 112, borderRadius: 18, borderWidth: 2, backgroundColor: C.panelDeep, alignItems: "center", justifyContent: "center" }, hiBtn: { borderColor: C.hi }, loBtn: { borderColor: C.lo }, selectedHi: { backgroundColor: C.hiSoft }, selectedLo: { backgroundColor: C.loSoft }, dim: { opacity: 0.34 }, hiTxt: { color: C.hi, fontSize: 33, ...displayFont }, loTxt: { color: C.lo, fontSize: 33, ...displayFont },
  crowdRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }, crowdHi: { color: C.hi, width: 55, fontSize: 11, fontWeight: "900" }, crowdLo: { color: C.lo, width: 55, textAlign: "right", fontSize: 11, fontWeight: "900" }, crowdTrack: { flex: 1, flexDirection: "row", height: 9, borderRadius: 99, overflow: "hidden" }, crowdHiFill: { backgroundColor: C.hi }, crowdLoFill: { backgroundColor: C.lo }, crowdMeta: { color: C.muted, fontSize: 8, letterSpacing: 1, textAlign: "center", marginTop: 5 },
  timer: { alignSelf: "center", width: 78, height: 78, borderRadius: 39, borderColor: C.hi, borderWidth: 2, backgroundColor: C.panelDeep, alignItems: "center", justifyContent: "center", marginVertical: 12 }, timerNum: { color: C.text, fontSize: 27, fontWeight: "900" }, timerLabel: { color: C.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.6 }, verdict: { color: C.gold, textAlign: "center", fontSize: 13, fontWeight: "900", marginBottom: 8 }, streak: { alignSelf: "center", borderColor: C.gold, borderWidth: 1, backgroundColor: C.goldSoft, borderRadius: 99, paddingHorizontal: 15, paddingVertical: 7 }, streakTxt: { color: C.gold, fontSize: 12, fontWeight: "900" },
  reward: { color: C.gold, textAlign: "center", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginBottom: 7 },
  section: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, textAlign: "center", marginTop: 14, marginBottom: 7 }, grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }, dot: { width: "8.5%", aspectRatio: 1, borderRadius: 99, margin: "0.7%", backgroundColor: "#172131", borderColor: "#293a52", borderWidth: 1 }, you: { borderColor: C.gold, borderWidth: 2, backgroundColor: C.goldSoft }, dead: { backgroundColor: C.loSoft, borderColor: C.lo, transform: [{ scale: 0.55 }] }, truth: { color: C.muted, fontSize: 8, lineHeight: 13, textAlign: "center", marginTop: 9 },
});
