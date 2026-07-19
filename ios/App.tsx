import React, { useCallback, useEffect, useState } from "react";
import { AppState, Linking, SafeAreaView, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { C, cardShadow, hairline } from "./src/theme";
import { FadeIn, Tap } from "./src/components/Motion";
import { ChallengeRun, GameResult } from "./src/types";
import { clearProfile, loadProfile, saveProfile, Profile, EMPTY_PROFILE } from "./src/lib/storage";
import { clearIdentity, FanIdentity, loadIdentity } from "./src/lib/auth";
import { clearGameSettings, DEFAULT_GAME_SETTINGS, GameSettings, loadGameSettings, saveGameSettings } from "./src/lib/settings";
import { joinRoom } from "./src/lib/room-service";
import { liveStatus } from "./src/lib/live-service";
import { arenaEntryMode, type ArenaEntryMode } from "./src/lib/arena-entry";
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
  if (match) return decodeURIComponent(match[1]);
  try {
    const parsed = new URL(url);
    return parsed.hostname === "hilo-royale.vercel.app" ? parsed.searchParams.get("squad") : null;
  } catch { return null; }
}

function challengeFromUrl(url: string): ChallengeRun | null {
  const custom = url.match(/^hiloroyale:\/\/challenge\/([0-9]+)(?:\?([^#]*))?/i);
  let fixtureId = custom?.[1] || "";
  let query = custom?.[2] || "";
  if (!custom) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "hilo-royale.vercel.app" || parsed.pathname !== "/play") return null;
      fixtureId = parsed.searchParams.get("fixture") || "";
      query = parsed.search.slice(1);
    } catch { return null; }
  }
  if (!/^\d+$/.test(fixtureId)) return null;
  const params = new URLSearchParams(query.slice(0, 2048));
  const targetPoints = Math.max(0, Math.min(10000, Number(params.get("target")) || 0));
  return { fixtureId, picks: decodeGhostPicks((params.get("p") || "").slice(0, 64)), targetPoints };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [identity, setIdentity] = useState<FanIdentity | null>(null);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [activeGameMode, setActiveGameMode] = useState<ArenaEntryMode>("replay");
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
            setActiveGameMode("replay");
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

  const deleteLocalData = async () => {
    await Promise.all([clearIdentity(), clearProfile(), clearGameSettings()]);
    setIdentity(null);
    setProfile(EMPTY_PROFILE);
    setSettings(DEFAULT_GAME_SETTINGS);
    setLastResult(null);
    setChallenge(null);
    setScreen("lobby");
  };

  const joinGame = async () => {
    if (!identity) return;
    const now = new Date();
    const dailyReplay = replayForDate(now);
    const live = liveStatus();
    const entryMode = arenaEntryMode(settings.mode, live.ready);
    const replay = entryMode === "live"
      ? replayByFixtureId(live.fixtureId || "") || dailyReplay
      : dailyReplay;
    setTodayKey(dailyKey(now));
    setActiveReplay(replay);
    setActiveGameMode(entryMode);
    setChallenge(null);
    setScreen("game");
    void joinRoom(replay.lobbyId, identity).catch(() => { /* Presence is optional; never block the arena. */ });
  };

  if (loading) return <View style={styles.loading}><Icon name="crown" size={52} color={C.gold} style={{ marginBottom: 14 }} /><Text style={styles.loadingText}>OPENING THE ARENA</Text></View>;
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
        {/* True live only when a real fixture is in its window — otherwise the
            join runs SIM LIVE (the real replay presented as if live), so the
            arena is never dead. */}
        {screen === "game" && (activeGameMode === "live" ? <LiveGameScreen settings={settings} onEnd={onGameEnd} /> : <GameScreen settings={settings} replay={activeReplay} dailyKey={todayKey} challenge={challenge} onEnd={onGameEnd} />)}
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
        {screen === "settings" && <SettingsScreen identity={identity} settings={settings} onChange={updateSettings} onBack={() => setScreen("lobby")} onSignOut={signOut} onDeleteData={deleteLocalData} />}
      </View>
      {TAB_SCREENS.includes(screen) && (
        <FadeIn dy={6} duration={260} style={[styles.tabBar, cardShadow()]}>
          <TabButton icon="play" label="Play" active={screen === "lobby"} onPress={() => setScreen("lobby")} />
          <TabButton icon="chart" label="Rank" active={screen === "rank"} onPress={() => setScreen("rank")} />
          <TabButton icon="users" label="Squad" active={screen === "squad"} onPress={() => setScreen("squad")} />
          <TabButton icon="user" label="Me" active={screen === "profile"} onPress={() => setScreen("profile")} />
        </FadeIn>
      )}
    </SafeAreaView>
  );
}

function TabButton({ icon, label, active, onPress }: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
  return (
    <Tap accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} scaleTo={0.94} style={[styles.tabBtn, active && styles.tabBtnOn]} onPress={onPress}>
      <Icon name={icon} size={22} color={active ? C.gold : "#7c8aa0"} style={{ marginBottom: 3 }} />
      <Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: RNStatusBar.currentHeight ?? 0 },
  body: { flex: 1 },
  loading: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  loadingText: { color: C.hi, fontSize: 11, fontWeight: "900", letterSpacing: 2.4, marginTop: 8 },
  /* floating iOS dock — translucent dark, hairline edge, gold active tint */
  tabBar: {
    flexDirection: "row", gap: 4,
    marginHorizontal: 16, marginBottom: 10, marginTop: 6,
    padding: 5, borderRadius: 26,
    backgroundColor: "rgba(11,14,20,0.94)",
    borderColor: "rgba(244,247,251,0.10)", borderWidth: hairline,
  },
  tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 21 },
  tabBtnOn: { backgroundColor: "rgba(255,213,74,0.10)" },
  tabLabel: { color: "#7c8aa0", fontSize: 11, fontWeight: "600", letterSpacing: 0.1 },
  tabActive: { color: C.gold, fontWeight: "700" },
});
