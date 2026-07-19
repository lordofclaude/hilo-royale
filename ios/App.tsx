import React, { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, SafeAreaView, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { C } from "./src/theme";
import { ChallengeRun, GameResult } from "./src/types";
import { loadProfile, saveProfile, Profile, EMPTY_PROFILE } from "./src/lib/storage";
import { clearIdentity, FanIdentity, loadIdentity } from "./src/lib/auth";
import { DEFAULT_GAME_SETTINGS, GameSettings, loadGameSettings, saveGameSettings } from "./src/lib/settings";
import { joinRoom } from "./src/lib/room-service";
import { replayByFixtureId, replayForDate, ReplayFixture } from "./src/lib/txline-real";
import { dailyKey, decodeGhostPicks } from "./src/lib/game-logic";
import Icon, { IconName } from "./src/components/Icon";
import LoginScreen from "./src/screens/LoginScreen";
import LobbyScreen from "./src/screens/LobbyScreen";
import GameScreen from "./src/screens/GameScreen";
import LiveGameScreen from "./src/screens/LiveGameScreen";
import ResultScreen from "./src/screens/ResultScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import RankScreen from "./src/screens/RankScreen";
import SquadScreen from "./src/screens/SquadScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

type Screen = "lobby" | "game" | "result" | "profile" | "rank" | "squad" | "settings";
const TAB_SCREENS: Screen[] = ["lobby", "rank", "squad", "profile"];

function squadCodeFromUrl(url: string): string | null {
  const match = url.match(/^hiloroyale:\/\/squad\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function challengeFromUrl(url: string): ChallengeRun | null {
  const match = url.match(/^hiloroyale:\/\/challenge\/([0-9]+)(?:\?([^#]*))?/i);
  if (!match) return null;
  const params: Record<string, string> = {};
  for (const pair of (match[2] || "").split("&")) {
    const [key, value] = pair.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || "");
  }
  const targetPoints = Math.max(0, Math.min(10000, Number(params.target) || 0));
  return { fixtureId: match[1], picks: decodeGhostPicks(params.p || ""), targetPoints };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [identity, setIdentity] = useState<FanIdentity | null>(null);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [activeReplay, setActiveReplay] = useState<ReplayFixture>(() => replayForDate());
  const [todayKey, setTodayKey] = useState(() => dailyKey(new Date()));
  const [challenge, setChallenge] = useState<ChallengeRun | null>(null);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [initialSquadCode, setInitialSquadCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadProfile(), loadIdentity(), loadGameSettings()]).then(([nextProfile, nextIdentity, nextSettings]) => {
      setProfile(nextProfile);
      setIdentity(nextIdentity);
      setSettings(nextSettings);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const open = (url: string | null) => {
      if (!url) return;
      const code = squadCodeFromUrl(url);
      if (code) { setInitialSquadCode(code); setScreen("squad"); }
      else {
        const nextChallenge = challengeFromUrl(url);
        if (nextChallenge) {
          const replay = replayByFixtureId(nextChallenge.fixtureId);
          if (replay) {
            setActiveReplay(replay);
            setChallenge(nextChallenge);
            setSettings(current => ({ ...current, mode: "replay" }));
            setScreen("game");
          }
        }
        else if (/^hiloroyale:\/\/lobby/i.test(url)) setScreen("lobby");
      }
    };
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener("url", event => open(event.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const refreshDaily = () => {
      if (screen !== "lobby" || challenge) return;
      const now = new Date();
      setTodayKey(dailyKey(now));
      setActiveReplay(replayForDate(now));
    };
    const sub = AppState.addEventListener("change", state => { if (state === "active") refreshDaily(); });
    return () => sub.remove();
  }, [challenge, screen]);

  const updateSettings = useCallback((next: GameSettings) => {
    const normalized = next.mode === "live" ? { ...next, playbackRate: 1 as const } : next;
    setSettings(normalized);
    void saveGameSettings(normalized);
  }, []);

  const onGameEnd = useCallback((result: GameResult) => {
    setLastResult(result);
    setProfile(prev => {
      const perKeyCorrect = { ...prev.perKeyCorrect };
      let correctDelta = 0;
      for (const record of result.history) {
        if (record.correct) { perKeyCorrect[record.key] = (perKeyCorrect[record.key] || 0) + 1; correctDelta++; }
      }
      const badges = { ...prev.badges };
      for (const badge of result.badges) badges[badge] = true;
      const next: Profile = {
        bestStreak: Math.max(prev.bestStreak, result.streak),
        ladderPoints: prev.ladderPoints + result.pts,
        crowns: prev.crowns + (result.won ? 1 : 0),
        lobbies: prev.lobbies + 1,
        totalQuestions: prev.totalQuestions + result.history.length,
        totalCorrect: prev.totalCorrect + correctDelta,
        perKeyCorrect,
        badges,
      };
      void saveProfile(next);
      return next;
    });
    setScreen("result");
  }, []);

  const signOut = async () => {
    await clearIdentity();
    setIdentity(null);
    setScreen("lobby");
  };

  const joinGame = async () => {
    if (!identity) return;
    const now = new Date();
    const replay = replayForDate(now);
    setTodayKey(dailyKey(now));
    setActiveReplay(replay);
    setChallenge(null);
    try { await joinRoom(replay.lobbyId, identity); } catch { /* Replay remains playable if presence is offline. */ }
    setScreen("game");
  };

  if (loading) return <View style={styles.loading}><Text style={styles.loadingCrown}>♛</Text><Text style={styles.loadingText}>OPENING THE ARENA</Text></View>;
  if (!identity) return <SafeAreaView style={styles.root}><StatusBar style="light" /><LoginScreen onSignedIn={setIdentity} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.body}>
        {screen === "lobby" && (
          <LobbyScreen
            profile={profile}
            identity={identity}
            settings={settings}
            replay={activeReplay}
            dailyKey={todayKey}
            onJoin={() => { void joinGame(); }}
            onProfile={() => setScreen("profile")}
            onSettings={() => setScreen("settings")}
          />
        )}
        {screen === "game" && (settings.mode === "live" ? <LiveGameScreen settings={settings} onEnd={onGameEnd} /> : <GameScreen settings={settings} replay={activeReplay} dailyKey={todayKey} challenge={challenge} onEnd={onGameEnd} />)}
        {screen === "result" && lastResult && (
          <ResultScreen
            result={lastResult}
            profile={profile}
            replay={activeReplay}
            onAgain={() => setScreen("game")}
            onLobby={() => setScreen("lobby")}
            onProfile={() => setScreen("profile")}
          />
        )}
        {screen === "profile" && <ProfileScreen identity={identity} profile={profile} onBack={() => setScreen("lobby")} onSettings={() => setScreen("settings")} />}
        {screen === "rank" && <RankScreen profile={profile} />}
        {screen === "squad" && <SquadScreen identity={identity} initialCode={initialSquadCode} />}
        {screen === "settings" && <SettingsScreen identity={identity} settings={settings} onChange={updateSettings} onBack={() => setScreen("lobby")} onSignOut={signOut} />}
      </View>
      {TAB_SCREENS.includes(screen) && (
        <View style={styles.tabBar}>
          <TabButton icon="play" label="PLAY" active={screen === "lobby"} onPress={() => setScreen("lobby")} />
          <TabButton icon="chart" label="RANK" active={screen === "rank"} onPress={() => setScreen("rank")} />
          <TabButton icon="users" label="SQUAD" active={screen === "squad"} onPress={() => setScreen("squad")} />
          <TabButton icon="user" label="ME" active={screen === "profile"} onPress={() => setScreen("profile")} />
        </View>
      )}
    </SafeAreaView>
  );
}

function TabButton({ icon, label, active, onPress }: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.tabBtn} onPress={onPress}>
      <View style={[styles.tabIndicator, active && styles.tabIndicatorOn]} />
      <Icon name={icon} size={16} color={active ? C.hi : "#566174"} style={{ marginBottom: 3 }} />
      <Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: RNStatusBar.currentHeight ?? 0 },
  body: { flex: 1 },
  loading: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  loadingCrown: { color: C.gold, fontSize: 58 },
  loadingText: { color: C.hi, fontSize: 11, fontWeight: "900", letterSpacing: 2.4, marginTop: 8 },
  tabBar: { flexDirection: "row", borderTopColor: C.line, borderTopWidth: 1, backgroundColor: "#030405", paddingBottom: 9 },
  tabBtn: { flex: 1, alignItems: "center" },
  tabIndicator: { height: 3, width: 42, borderRadius: 2, backgroundColor: "transparent", marginBottom: 6 },
  tabIndicatorOn: { backgroundColor: C.hi },
  tabLabel: { color: "#566174", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  tabActive: { color: C.hi },
});
