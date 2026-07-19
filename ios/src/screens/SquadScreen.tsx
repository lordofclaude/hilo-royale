import React, { useMemo, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { C, displayFont, glow, hairline, type } from "../theme";
import { FanIdentity } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/Icon";
import { FadeIn, Tap } from "../components/Motion";
import { joinRoom, roomServiceStatus } from "../lib/room-service";

interface Props { identity: FanIdentity; initialCode?: string | null; }

const MEMBERS = ["LUNA7", "KICKER88", "ONYX", "RIRI_10"];
const SQUAD_WALL = [
  ["GOAL DIGGERS", 2950], ["NET BUSTERS", 2420], ["PITCH KINGS", 2050], ["CROWN CREW", 1840],
] as const;

export default function SquadScreen({ identity, initialCode }: Props) {
  const generatedCode = useMemo(() => `BATTLE-${identity.id.slice(-4).toUpperCase()}`, [identity.id]);
  const [code, setCode] = useState(initialCode || generatedCode);
  const [joined, setJoined] = useState(Boolean(initialCode));
  const inviteUrl = `https://hilo-royale.vercel.app/play?squad=${encodeURIComponent(code)}`;
  const roomService = roomServiceStatus();

  const invite = () => Share.share({
    title: "Join my Hi-Lo Royale private battle",
    message: `Join ${identity.name}'s private Hi-Lo Royale battle. Battle code: ${code}\n${inviteUrl}`,
    url: inviteUrl,
  }).catch(() => {});

  const copy = async () => { await Clipboard.setStringAsync(code); };
  const joinSquad = async () => {
    try { await joinRoom(`squad-${code}`, identity, code); } catch { /* Local squad UI remains available offline. */ }
    setJoined(true);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Private Battle"
        caption="INVITE FRIENDS"
        right={<View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveTxt}>{roomService.ready ? "5 ONLINE" : "DEMO CREW"}</Text></View>}
      />

      <FadeIn dy={12} style={[styles.hero, glow(C.hi, 12, 0.22)]}>
        <Icon name="crown" size={32} color={C.gold} style={{ marginBottom: 6 }} />
        <Text style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit>YOUR BATTLE ROOM</Text>
        <View style={styles.members}>
          {[identity.name, ...MEMBERS].map((name, i) => (
            <View key={name} style={styles.member}>
              <View style={[styles.avatar, { borderColor: i === 0 ? C.gold : C.hi }]}><Text style={[styles.avatarTxt, { color: i === 0 ? C.gold : C.hi }]}>{name.slice(0, 1).toUpperCase()}</Text><View style={styles.online} /></View>
              <Text numberOfLines={1} style={styles.memberName}>{i === 0 ? "YOU" : name}</Text>
            </View>
          ))}
        </View>
        <View style={styles.streak}>
          <Text style={styles.streakLabel}>BATTLE STREAK</Text>
          <View style={styles.streakValueRow}>
            <Text style={styles.streakValue}>x12</Text>
            <Icon name="bolt" size={16} color={C.gold} style={{ marginLeft: 6 }} />
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={70} dy={10} style={styles.inviteCard}>
        <Text style={styles.cardKicker}>{joined ? "BATTLE READY" : "CREATE YOUR BATTLE"}</Text>
        <Text style={styles.cardText}>Create the room, then share its private code so friends can join your next match.</Text>
        <View style={styles.codeRow}>
          <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" style={styles.codeInput} />
          <Tap onPress={() => { void joinSquad(); }} accessibilityRole="button" style={styles.joinBtn}><Text style={styles.joinBtnTxt}>{initialCode ? "JOIN" : "CREATE"}</Text></Tap>
        </View>
        <View style={styles.actionRow}>
          <Tap onPress={invite} accessibilityRole="button" style={[styles.action, { borderColor: C.hi }]}><Text style={[styles.actionTxt, { color: C.hi }]}>↗ SHARE INVITE</Text></Tap>
          <Tap onPress={copy} accessibilityRole="button" style={[styles.action, { borderColor: C.gold }]}><Text style={[styles.actionTxt, { color: C.gold }]}>COPY CODE</Text></Tap>
        </View>
      </FadeIn>

      <FadeIn delay={130} dy={10} style={[styles.groupPick, glow(C.lo, 10, 0.18)]}>
        <Text style={styles.groupLabel}>NEXT GROUP PICK · CORNERS</Text>
        <View style={styles.pickRow}><Text style={styles.pickHi}>HI</Text><Icon name="ball" size={24} color={C.text} /><Text style={styles.pickLo}>LO</Text></View>
        <Text style={styles.groupMeta}>3 crew members are leaning HI</Text>
      </FadeIn>

      <Text style={styles.section}>PRIVATE BATTLE LEADERBOARD</Text>
      <View style={styles.wall}>
        {SQUAD_WALL.map(([name, points], i) => (
          <View key={name} style={[styles.wallRow, i === 3 && styles.wallYou]}><Text style={[styles.wallRank, i === 3 && { color: C.hi }]}>{i + 1}</Text><Text style={[styles.wallName, i === 3 && { color: C.hi }]}>{name}</Text><Text style={styles.wallPts}>{points.toLocaleString()}</Text></View>
        ))}
      </View>
      <Text style={styles.note}>Deep-link invites open this private battle room. {roomService.ready ? "Cross-device room presence is connected." : roomService.message + "."}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, content: { padding: 18, paddingBottom: 30 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.success }, liveTxt: { ...type.caption, color: C.text, fontSize: 10, letterSpacing: 1 },
  hero: { backgroundColor: C.panel, borderColor: C.hi, borderWidth: 1, borderRadius: 20, padding: 16, alignItems: "center", marginBottom: 12 },
  heroTitle: { color: C.text, fontSize: 31, ...displayFont, marginTop: -4, marginBottom: 12 },
  members: { flexDirection: "row", gap: 7, alignSelf: "stretch" }, member: { flex: 1, alignItems: "center" },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, backgroundColor: C.panelDeep, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 16, fontWeight: "900" }, online: { position: "absolute", right: -1, bottom: 2, width: 9, height: 9, borderRadius: 5, backgroundColor: C.success, borderColor: C.bg, borderWidth: 1.5 },
  memberName: { color: C.muted, fontSize: 8, fontWeight: "800", marginTop: 5, maxWidth: 55 },
  streak: { borderColor: C.gold, borderWidth: 1, borderRadius: 13, backgroundColor: C.goldSoft, paddingHorizontal: 24, paddingVertical: 8, marginTop: 14, alignItems: "center" },
  streakLabel: { color: C.muted, fontSize: 9, letterSpacing: 1.3 }, streakValueRow: { flexDirection: "row", alignItems: "center" }, streakValue: { color: C.gold, fontSize: 24, ...displayFont },
  inviteCard: { backgroundColor: C.panel, borderColor: C.line, borderWidth: hairline, borderRadius: 16, padding: 14, marginBottom: 12 },
  cardKicker: { ...type.section, color: C.hi }, cardText: { ...type.footnote, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 10 },
  codeRow: { flexDirection: "row", gap: 8 }, codeInput: { flex: 1, color: C.text, backgroundColor: C.panelDeep, borderColor: C.lineStrong, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, minHeight: 44, fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  joinBtn: { backgroundColor: C.gold, borderRadius: 11, paddingHorizontal: 18, minHeight: 44, justifyContent: "center" }, joinBtnTxt: { color: "#120d03", fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 }, action: { flex: 1, borderWidth: 1, borderRadius: 11, minHeight: 42, alignItems: "center", justifyContent: "center" }, actionTxt: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  groupPick: { backgroundColor: C.panel, borderColor: C.lo, borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "center", marginBottom: 16 },
  groupLabel: { ...type.caption, color: C.text, letterSpacing: 1.1 }, pickRow: { flexDirection: "row", alignItems: "center", gap: 22, marginVertical: 8 },
  pickHi: { color: C.hi, fontSize: 38, ...displayFont }, pickLo: { color: C.lo, fontSize: 38, ...displayFont }, groupMeta: { color: C.muted, fontSize: 11 },
  section: { ...type.section, marginBottom: 8 }, wall: { backgroundColor: C.panel, borderColor: C.line, borderWidth: hairline, borderRadius: 16, padding: 9 },
  wallRow: { flexDirection: "row", alignItems: "center", borderBottomColor: C.line, borderBottomWidth: hairline, paddingHorizontal: 8, minHeight: 42, paddingVertical: 9 }, wallYou: { borderColor: C.hi, borderWidth: 1, borderRadius: 9, backgroundColor: C.hiSoft },
  wallRank: { color: C.muted, width: 28, fontWeight: "700", fontVariant: ["tabular-nums"] }, wallName: { flex: 1, color: C.text, fontWeight: "600", fontSize: 13, letterSpacing: -0.1 }, wallPts: { color: C.gold, fontWeight: "700", fontVariant: ["tabular-nums"] },
  note: { ...type.footnote, fontSize: 10, lineHeight: 15, marginTop: 10 },
});
