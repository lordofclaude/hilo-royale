import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C, glow, displayFont } from "../theme";
import { ReplayFixture, teamCode } from "../lib/txline-real";
import { Profile } from "../lib/storage";
import { FanIdentity } from "../lib/auth";
import { GameSettings, playbackLabel } from "../lib/settings";
import { liveStatus } from "../lib/live-service";
import { ensurePermission, scheduleLobbyReminder } from "../lib/notifications";
import BrandHeader from "../components/BrandHeader";
import { getRoom, roomServiceStatus, RoomPlayer, watchRoom } from "../lib/room-service";

const FRIENDS = ["L", "K", "O", "R", "J"];

function secondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

function clock(value: number): string {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return [hours, minutes, seconds].map(part => String(part).padStart(2, "0")).join(":");
}

interface Props {
  profile: Profile;
  identity: FanIdentity;
  settings: GameSettings;
  replay: ReplayFixture;
  dailyKey: string;
  onJoin: () => void;
  onProfile: () => void;
  onSettings: () => void;
}

export default function LobbyScreen({ profile, identity, settings, replay, dailyKey, onJoin, onProfile, onSettings }: Props) {
  const [reminder, setReminder] = useState<"idle" | "set" | "denied">("idle");
  const [secs, setSecs] = useState(secondsUntilMidnight);
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const live = liveStatus();
  const roomService = roomServiceStatus();

  useEffect(() => {
    const iv = setInterval(() => setSecs(value => (value <= 1 ? secondsUntilMidnight() : value - 1)), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!roomService.ready) return;
    getRoom(replay.lobbyId).then(room => room && setRoomPlayers(room.players)).catch(() => {});
    const watcher = watchRoom(replay.lobbyId, { onSnapshot: room => setRoomPlayers(room.players) });
    return () => watcher.stop();
  }, [replay.lobbyId, roomService.ready]);

  const setLobbyReminder = async () => {
    const ok = await ensurePermission();
    if (!ok) { setReminder("denied"); return; }
    await scheduleLobbyReminder(10, replay.lobbyId, `${replay.fixture.Participant1} vs ${replay.fixture.Participant2}`);
    setReminder("set");
  };

  const modeReady = settings.mode === "replay" || live.ready;
  const fixture = replay.fixture;
  const schedule = replay.schedule;
  const code1 = teamCode(fixture.Participant1);
  const code2 = teamCode(fixture.Participant2);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.utilityRow}>
        <Pressable onPress={onProfile} style={styles.userPill}>
          <View style={styles.userAvatar}><Text style={styles.userAvatarTxt}>{identity.name.slice(0, 1).toUpperCase()}</Text></View>
          <Text style={styles.userName} numberOfLines={1}>{identity.name}</Text>
        </Pressable>
        <Pressable onPress={onSettings} style={styles.settingsBtn}><Text style={styles.settingsIcon}>⚙</Text></Pressable>
      </View>

      <BrandHeader eyebrow={settings.mode === "replay" ? `DAILY LOBBY · ${dailyKey}` : playbackLabel(settings)} />

      <View style={styles.statusRow}>
        <View style={[styles.livePill, settings.mode === "replay" && styles.replayPill]}>
          <View style={[styles.liveDot, { backgroundColor: settings.mode === "live" ? C.lo : C.hi }]} />
          <Text style={styles.liveTxt}>{settings.mode === "live" ? "LIVE MATCH" : "REAL MATCH REPLAY"}</Text>
        </View>
        <Text style={styles.lobbyId}>#{replay.lobbyId}</Text>
      </View>

      <View style={[styles.matchCard, glow(C.hi, 13, 0.35)]}>
        <View style={styles.lightLeft} /><View style={styles.lightRight} />
        <Text style={styles.competition} numberOfLines={1}>{fixture.Competition}</Text>
        <View style={styles.matchRow}>
          <View style={styles.teamBlock}>
            <View style={[styles.teamBadge, { borderColor: C.hi }, glow(C.hi, 9, 0.5)]}><Text style={[styles.teamBadgeTxt, { color: C.hi }]}>{code1}</Text></View>
            <Text style={styles.teamName} numberOfLines={1}>{fixture.Participant1}</Text>
          </View>
          <View style={styles.vsBlock}><Text style={styles.ball}>⚽</Text><Text style={styles.vs}>VS</Text></View>
          <View style={styles.teamBlock}>
            <View style={[styles.teamBadge, { borderColor: C.lo }, glow(C.lo, 9, 0.5)]}><Text style={[styles.teamBadgeTxt, { color: C.lo }]}>{code2}</Text></View>
            <Text style={styles.teamName} numberOfLines={1}>{fixture.Participant2}</Text>
          </View>
        </View>

        <View style={styles.nextCard}>
          <Text style={styles.nextLbl}>{settings.mode === "live" ? "LIVE ARENA" : "DAILY LOBBY RESETS IN"}</Text>
          <Text style={styles.countdown}>{settings.mode === "live" ? <Text style={{ color: C.lo }}>LIVE NOW</Text> : <><Text style={{ color: C.hi }}>{clock(secs).slice(0, 3)}</Text><Text style={{ color: C.lo }}>{clock(secs).slice(3)}</Text></>}</Text>
          <Pressable disabled={!modeReady} style={({ pressed }) => [styles.join, glow(C.gold, 12, 0.48), !modeReady && styles.disabled, pressed && { opacity: 0.84 }]} onPress={onJoin}>
            <Text style={styles.joinTxt}>JOIN {Math.max(1, 100 - roomPlayers.length)} FANS  →</Text>
          </Pressable>
          {!modeReady && <Text style={styles.notReady}>{live.message}</Text>}
        </View>
      </View>

      <View style={styles.sectionHeader}><Text style={styles.sectionLbl}>🔥 HOT PREDICTIONS</Text><Text style={styles.sectionMeta}>{schedule.length} IN THIS MATCH</Text></View>
      <View style={styles.hotRow}>
        {schedule.slice(0, 3).map((question, index) => (
          <Pressable key={question.n} onPress={modeReady ? onJoin : onSettings} style={[styles.hotCard, { borderColor: index % 2 ? C.lo : C.hi }]}>
            <Text style={styles.hotIcon}>{question.emoji}</Text>
            <Text style={[styles.hotLabel, { color: index % 2 ? C.lo : C.hi }]} numberOfLines={1}>{question.label.toUpperCase()}</Text>
            <View style={styles.hotDuel}><Text style={styles.hotHi}>{question.hiLabel}</Text><Text style={styles.hotVs}>VS</Text><Text style={styles.hotLo}>{question.loLabel}</Text></View>
            <View style={[styles.hotPlay, { borderColor: index % 2 ? C.lo : C.hi }]}><Text style={[styles.hotPlayTxt, { color: index % 2 ? C.lo : C.hi }]}>PLAY</Text></View>
          </Pressable>
        ))}
      </View>

      <View style={styles.controlCard}>
        <View style={{ flex: 1 }}><Text style={styles.controlLabel}>MATCH CONTROL</Text><Text style={styles.controlValue}>{playbackLabel(settings)} · {settings.answerSeconds}s answers · {settings.revealSeconds}s reveals</Text></View>
        <Pressable onPress={onSettings} style={styles.controlBtn}><Text style={styles.controlBtnTxt}>TUNE</Text></Pressable>
      </View>

      <View style={styles.friendsCard}>
        <View style={styles.sectionHeader}><Text style={styles.sectionLbl}>FRIENDS PLAYING</Text><Text style={[styles.sectionMeta, { color: C.success }]}>{roomService.ready ? `${roomPlayers.length} LIVE` : "DEMO CREW"}</Text></View>
        <View style={styles.friendRow}>
          {(roomPlayers.length ? roomPlayers.slice(0, 5).map(player => player.name.slice(0, 1).toUpperCase()) : FRIENDS).map((letter, index) => <View key={`${letter}-${index}`} style={[styles.friendAvatar, { borderColor: index === 4 ? C.lo : C.hi }]}><Text style={styles.friendTxt}>{letter}</Text><View style={styles.onlineDot} /></View>)}
          <Pressable style={styles.inviteCircle}><Text style={styles.invitePlus}>+</Text></Pressable>
        </View>
      </View>

      <View style={styles.rulesCard}>
        <Text style={styles.rule}><Text style={{ color: C.hi }}>01  PICK</Text> — multiple live calls during the match</Text>
        <Text style={styles.rule}><Text style={{ color: C.lo }}>02  SURVIVE</Text> — wrong or too slow means elimination</Text>
        <Text style={styles.rule}><Text style={{ color: C.gold }}>03  SHARE</Text> — turn every win or near-miss into a challenge</Text>
      </View>

      <Pressable style={styles.reminder} onPress={setLobbyReminder}>
        <Text style={styles.reminderTxt}>{reminder === "set" ? "🔔 REMINDER SET · LOCK YOUR PHONE" : reminder === "denied" ? "🔕 ENABLE NOTIFICATIONS IN SETTINGS" : "🔔 NOTIFY ME BEFORE THE NEXT LOBBY"}</Text>
      </Pressable>
      <Text style={styles.foot}>Daily Lobby rotates named real TxLINE replay tapes by local calendar date, so every device gets the same fixture for that date. Live mode connects to the configured TxLINE SSE fixture at true 1× match time.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, content: { padding: 18, paddingBottom: 30 },
  utilityRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  userPill: { flexDirection: "row", alignItems: "center", gap: 7, maxWidth: 170 }, userAvatar: { width: 30, height: 30, borderRadius: 15, borderColor: C.hi, borderWidth: 1, backgroundColor: C.hiSoft, alignItems: "center", justifyContent: "center" },
  userAvatarTxt: { color: C.hi, fontWeight: "900" }, userName: { color: C.text, fontSize: 11, fontWeight: "800" }, settingsBtn: { width: 34, height: 34, borderRadius: 17, borderColor: C.lineStrong, borderWidth: 1, alignItems: "center", justifyContent: "center" }, settingsIcon: { color: C.muted, fontSize: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: -8, marginBottom: 13 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.loSoft, borderColor: C.lo, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  replayPill: { backgroundColor: C.hiSoft, borderColor: C.hi }, liveDot: { width: 7, height: 7, borderRadius: 4 }, liveTxt: { color: C.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 }, lobbyId: { color: C.muted, fontSize: 9, fontWeight: "800" },
  matchCard: { backgroundColor: C.panel, borderColor: C.hi, borderWidth: 1.5, borderRadius: 21, padding: 16, overflow: "hidden", marginBottom: 16 },
  lightLeft: { position: "absolute", width: 140, height: 140, borderRadius: 70, left: -90, top: -40, backgroundColor: C.hiSoft }, lightRight: { position: "absolute", width: 150, height: 150, borderRadius: 75, right: -95, top: -35, backgroundColor: C.loSoft },
  competition: { color: C.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1, textAlign: "center", marginBottom: 12 },
  matchRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 14 }, teamBlock: { width: 92, alignItems: "center" },
  teamBadge: { width: 66, height: 66, borderRadius: 18, borderWidth: 2, backgroundColor: C.panelDeep, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-2deg" }] }, teamBadgeTxt: { fontSize: 18, ...displayFont }, teamName: { color: C.text, fontSize: 10, fontWeight: "800", marginTop: 6 },
  vsBlock: { alignItems: "center" }, ball: { fontSize: 23 }, vs: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 3 },
  nextCard: { borderColor: C.lineStrong, borderWidth: 1, borderRadius: 15, backgroundColor: C.panelDeep, padding: 13, alignItems: "center" }, nextLbl: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.7 },
  countdown: { fontSize: 48, ...displayFont, fontVariant: ["tabular-nums"], marginVertical: 1 }, join: { alignSelf: "stretch", backgroundColor: C.gold, borderRadius: 12, paddingVertical: 13, alignItems: "center" }, joinTxt: { color: "#130e03", fontSize: 14, fontWeight: "900", letterSpacing: 1 }, disabled: { opacity: 0.35 }, notReady: { color: C.lo, fontSize: 9, lineHeight: 13, marginTop: 8, textAlign: "center" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }, sectionLbl: { color: C.text, fontSize: 12, fontWeight: "900", letterSpacing: 1 }, sectionMeta: { color: C.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  hotRow: { flexDirection: "row", gap: 8, marginBottom: 12 }, hotCard: { flex: 1, backgroundColor: C.panelDeep, borderWidth: 1.3, borderRadius: 14, padding: 8, alignItems: "center" }, hotIcon: { fontSize: 18 }, hotLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5, marginTop: 3 }, hotDuel: { flexDirection: "row", alignItems: "center", gap: 3, marginVertical: 7 }, hotHi: { color: C.hi, fontSize: 11, ...displayFont, maxWidth: 34 }, hotVs: { color: C.muted, fontSize: 7 }, hotLo: { color: C.lo, fontSize: 11, ...displayFont, maxWidth: 34 }, hotPlay: { alignSelf: "stretch", borderWidth: 1, borderRadius: 8, paddingVertical: 6, alignItems: "center" }, hotPlayTxt: { fontSize: 9, fontWeight: "900" },
  controlCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 15, padding: 13, marginBottom: 11 }, controlLabel: { color: C.gold, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, controlValue: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, controlBtn: { borderColor: C.gold, borderWidth: 1, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 8 }, controlBtnTxt: { color: C.gold, fontSize: 9, fontWeight: "900" },
  friendsCard: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 15, padding: 13, marginBottom: 11 }, friendRow: { flexDirection: "row", alignItems: "center", gap: 9 }, friendAvatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, backgroundColor: C.panelDeep, alignItems: "center", justifyContent: "center" }, friendTxt: { color: C.text, fontSize: 13, fontWeight: "900" }, onlineDot: { position: "absolute", right: -1, bottom: 1, width: 9, height: 9, borderRadius: 5, borderColor: C.bg, borderWidth: 1.5, backgroundColor: C.success }, inviteCircle: { width: 42, height: 42, borderRadius: 21, borderColor: C.lineStrong, borderWidth: 1, alignItems: "center", justifyContent: "center" }, invitePlus: { color: C.hi, fontSize: 22 },
  rulesCard: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 15, padding: 14, marginBottom: 10 }, rule: { color: C.text, fontSize: 11, lineHeight: 20, fontWeight: "600" },
  reminder: { backgroundColor: C.panelDeep, borderColor: C.lineStrong, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" }, reminderTxt: { color: C.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 }, foot: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 9 },
});
