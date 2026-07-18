import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { C, displayFont, glow } from "../theme";
import { FanIdentity } from "../lib/auth";
import BrandHeader from "../components/BrandHeader";
import { joinRoom, roomServiceStatus } from "../lib/room-service";

interface Props { identity: FanIdentity; initialCode?: string | null; }

const MEMBERS = ["LUNA7", "KICKER88", "ONYX", "RIRI_10"];
const SQUAD_WALL = [
  ["GOAL DIGGERS", 2950], ["NET BUSTERS", 2420], ["PITCH KINGS", 2050], ["CROWN CREW", 1840],
] as const;

export default function SquadScreen({ identity, initialCode }: Props) {
  const generatedCode = useMemo(() => `CROWN-${identity.id.slice(-4).toUpperCase()}`, [identity.id]);
  const [code, setCode] = useState(initialCode || generatedCode);
  const [joined, setJoined] = useState(Boolean(initialCode));
  const inviteUrl = `hiloroyale://squad/${encodeURIComponent(code)}`;
  const roomService = roomServiceStatus();

  const invite = () => Share.share({
    title: "Join my Hi-Lo Royale squad",
    message: `Join ${identity.name}'s Crown Crew for the next match. Squad code: ${code}\n${inviteUrl}`,
    url: inviteUrl,
  }).catch(() => {});

  const copy = async () => { await Clipboard.setStringAsync(code); };
  const joinSquad = async () => {
    try { await joinRoom(`squad-${code}`, identity, code); } catch { /* Local squad UI remains available offline. */ }
    setJoined(true);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <BrandHeader eyebrow="SQUAD ROOM" />
      <View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveTxt}>5 ONLINE</Text></View>

      <View style={[styles.hero, glow(C.hi, 13, 0.32)]}>
        <Text style={styles.heroCrown}>♛</Text>
        <Text style={styles.heroTitle}>CROWN CREW</Text>
        <View style={styles.members}>
          {[identity.name, ...MEMBERS].map((name, i) => (
            <View key={name} style={styles.member}>
              <View style={[styles.avatar, { borderColor: i === 0 ? C.gold : C.hi }]}><Text style={[styles.avatarTxt, { color: i === 0 ? C.gold : C.hi }]}>{name.slice(0, 1).toUpperCase()}</Text><View style={styles.online} /></View>
              <Text numberOfLines={1} style={styles.memberName}>{i === 0 ? "YOU" : name}</Text>
            </View>
          ))}
        </View>
        <View style={styles.streak}><Text style={styles.streakLabel}>SQUAD STREAK</Text><Text style={styles.streakValue}>x12 🔥</Text></View>
      </View>

      <View style={styles.inviteCard}>
        <Text style={styles.cardKicker}>{joined ? "SQUAD JOINED" : "INVITE FRIENDS"}</Text>
        <Text style={styles.cardText}>Bring your people. Every surviving squadmate adds a bonus to the crew ladder.</Text>
        <View style={styles.codeRow}>
          <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" style={styles.codeInput} />
          <Pressable onPress={() => { void joinSquad(); }} style={styles.joinBtn}><Text style={styles.joinBtnTxt}>JOIN</Text></Pressable>
        </View>
        <View style={styles.actionRow}>
          <Pressable onPress={invite} style={[styles.action, { borderColor: C.hi }]}><Text style={[styles.actionTxt, { color: C.hi }]}>↗ SHARE INVITE</Text></Pressable>
          <Pressable onPress={copy} style={[styles.action, { borderColor: C.gold }]}><Text style={[styles.actionTxt, { color: C.gold }]}>COPY CODE</Text></Pressable>
        </View>
      </View>

      <View style={[styles.groupPick, glow(C.lo, 10, 0.22)]}>
        <Text style={styles.groupLabel}>NEXT GROUP PICK · CORNERS</Text>
        <View style={styles.pickRow}><Text style={styles.pickHi}>HI</Text><Text style={styles.pickBall}>⚽</Text><Text style={styles.pickLo}>LO</Text></View>
        <Text style={styles.groupMeta}>3 crew members are leaning HI</Text>
      </View>

      <Text style={styles.section}>SQUAD LEADERBOARD</Text>
      <View style={styles.wall}>
        {SQUAD_WALL.map(([name, points], i) => (
          <View key={name} style={[styles.wallRow, i === 3 && styles.wallYou]}><Text style={[styles.wallRank, i === 3 && { color: C.hi }]}>{i + 1}</Text><Text style={[styles.wallName, i === 3 && { color: C.hi }]}>{name}</Text><Text style={styles.wallPts}>{points.toLocaleString()}</Text></View>
        ))}
      </View>
      <Text style={styles.note}>Deep-link invites open this squad screen. {roomService.ready ? "Cross-device room presence is connected." : roomService.message + "."}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, content: { padding: 18, paddingBottom: 30 },
  liveRow: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginTop: -7, marginBottom: 12 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.success }, liveTxt: { color: C.text, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  hero: { backgroundColor: C.panel, borderColor: C.hi, borderWidth: 1.5, borderRadius: 20, padding: 15, alignItems: "center", marginBottom: 11 },
  heroCrown: { color: C.gold, fontSize: 36 }, heroTitle: { color: C.text, fontSize: 31, ...displayFont, marginTop: -4, marginBottom: 12 },
  members: { flexDirection: "row", gap: 7, alignSelf: "stretch" }, member: { flex: 1, alignItems: "center" },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, backgroundColor: C.panelDeep, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 16, fontWeight: "900" }, online: { position: "absolute", right: -1, bottom: 2, width: 9, height: 9, borderRadius: 5, backgroundColor: C.success, borderColor: C.bg, borderWidth: 1.5 },
  memberName: { color: C.muted, fontSize: 8, fontWeight: "800", marginTop: 5, maxWidth: 55 },
  streak: { borderColor: C.gold, borderWidth: 1, borderRadius: 13, backgroundColor: C.goldSoft, paddingHorizontal: 24, paddingVertical: 8, marginTop: 14, alignItems: "center" },
  streakLabel: { color: C.muted, fontSize: 9, letterSpacing: 1.3 }, streakValue: { color: C.gold, fontSize: 24, ...displayFont },
  inviteCard: { backgroundColor: C.panel, borderColor: C.lineStrong, borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 11 },
  cardKicker: { color: C.hi, fontSize: 14, fontWeight: "900", letterSpacing: 1.2 }, cardText: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 10 },
  codeRow: { flexDirection: "row", gap: 8 }, codeInput: { flex: 1, color: C.text, backgroundColor: C.panelDeep, borderColor: C.lineStrong, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  joinBtn: { backgroundColor: C.gold, borderRadius: 10, paddingHorizontal: 17, justifyContent: "center" }, joinBtnTxt: { color: "#120d03", fontWeight: "900" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 9 }, action: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" }, actionTxt: { fontSize: 10, fontWeight: "900" },
  groupPick: { backgroundColor: C.panel, borderColor: C.lo, borderWidth: 1.5, borderRadius: 17, padding: 14, alignItems: "center", marginBottom: 14 },
  groupLabel: { color: C.text, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 }, pickRow: { flexDirection: "row", alignItems: "center", gap: 22, marginVertical: 8 },
  pickHi: { color: C.hi, fontSize: 38, ...displayFont }, pickLo: { color: C.lo, fontSize: 38, ...displayFont }, pickBall: { fontSize: 25 }, groupMeta: { color: C.muted, fontSize: 10 },
  section: { color: C.text, fontSize: 12, fontWeight: "900", letterSpacing: 1.5, marginBottom: 8 }, wall: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 15, padding: 9 },
  wallRow: { flexDirection: "row", alignItems: "center", borderBottomColor: C.line, borderBottomWidth: 1, paddingHorizontal: 8, paddingVertical: 9 }, wallYou: { borderColor: C.hi, borderWidth: 1, borderRadius: 9, backgroundColor: C.hiSoft },
  wallRank: { color: C.muted, width: 28, fontWeight: "900" }, wallName: { flex: 1, color: C.text, fontWeight: "800", fontSize: 12 }, wallPts: { color: C.gold, fontWeight: "900" },
  note: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 10 },
});
