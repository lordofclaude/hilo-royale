import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { C, displayFont, glow, hairline, type } from "../theme";
import { FanIdentity } from "../lib/auth";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/Icon";
import { FadeIn, Tap } from "../components/Motion";
import { joinRoom, RoomPlayer, RoomResult, roomServiceStatus, watchRoom } from "../lib/room-service";

interface Props { identity: FanIdentity; fixtureId: string; initialCode?: string | null; onEnterBattle: (code: string) => void; }

export default function SquadScreen({ identity, fixtureId, initialCode, onEnterBattle }: Props) {
  const generatedCode = useMemo(() => `BATTLE-${identity.id.slice(-4).toUpperCase()}`, [identity.id]);
  const [code, setCode] = useState(initialCode || generatedCode);
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [results, setResults] = useState<RoomResult[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
  const roomId = `private-${normalizedCode}`;
  const inviteUrl = `https://hilo-royale.vercel.app/play?fixture=${encodeURIComponent(fixtureId)}&squad=${encodeURIComponent(normalizedCode)}`;
  const roomService = roomServiceStatus();

  useEffect(() => {
    if (!joined || !normalizedCode) return;
    const watcher = watchRoom(roomId, {
      onSnapshot: room => { setPlayers(room.players); setResults(room.results); setRoomError(null); },
      onError: () => setRoomError("Could not refresh this room."),
    });
    return () => watcher.stop();
  }, [joined, normalizedCode, roomId]);

  const invite = () => Share.share({
    title: "Join my Hi-Lo Royale private battle",
    message: `Join ${identity.name}'s private Hi-Lo Royale battle. Battle code: ${code}\n${inviteUrl}`,
    url: inviteUrl,
  }).catch(() => {});

  const copy = async () => { await Clipboard.setStringAsync(code); };
  const joinSquad = async () => {
    if (!normalizedCode) return;
    setRoomError(null);
    try {
      const room = await joinRoom(roomId, identity, normalizedCode);
      if (room) { setPlayers(room.players); setResults(room.results); }
      setCode(normalizedCode);
      setJoined(true);
    } catch {
      setRoomError("Private rooms are temporarily unavailable. Your public arena still works.");
    }
  };

  const visiblePlayers = players.length ? players : [{ id: identity.id, name: identity.name, joinedAt: new Date().toISOString() }];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Private Battle"
        caption="INVITE FRIENDS"
        right={<View style={styles.liveRow}><View style={[styles.liveDot, roomError && { backgroundColor: C.lo }]} /><Text style={styles.liveTxt}>{joined ? `${visiblePlayers.length} JOINED` : "NOT CREATED"}</Text></View>}
      />

      <FadeIn dy={12} style={[styles.hero, glow(C.hi, 12, 0.22)]}>
        <Icon name="crown" size={32} color={C.gold} style={{ marginBottom: 6 }} />
        <Text style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit>YOUR BATTLE ROOM</Text>
        <View style={styles.members}>
          {visiblePlayers.slice(0, 5).map((player, i) => (
            <View key={player.id} style={styles.member}>
              <View style={[styles.avatar, { borderColor: i === 0 ? C.gold : C.hi }]}><Text style={[styles.avatarTxt, { color: i === 0 ? C.gold : C.hi }]}>{player.name.slice(0, 1).toUpperCase()}</Text><View style={styles.online} /></View>
              <Text numberOfLines={1} style={styles.memberName}>{player.name === identity.name ? "YOU" : player.name}</Text>
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
          <TextInput value={code} onChangeText={value => { setCode(value); setJoined(false); setPlayers([]); setResults([]); }} autoCapitalize="characters" style={styles.codeInput} />
          <Tap onPress={() => { void joinSquad(); }} accessibilityRole="button" style={styles.joinBtn}><Text style={styles.joinBtnTxt}>{initialCode ? "JOIN" : "CREATE"}</Text></Tap>
        </View>
        {roomError && <Text style={styles.error}>{roomError}</Text>}
        <View style={styles.actionRow}>
          <Tap onPress={invite} disabled={!joined} accessibilityRole="button" style={[styles.action, { borderColor: C.hi }, !joined && styles.disabled]}><Text style={[styles.actionTxt, { color: C.hi }]}>↗ SHARE INVITE</Text></Tap>
          <Tap onPress={copy} accessibilityRole="button" style={[styles.action, { borderColor: C.gold }]}><Text style={[styles.actionTxt, { color: C.gold }]}>COPY CODE</Text></Tap>
        </View>
        {joined && <Tap onPress={() => onEnterBattle(normalizedCode)} accessibilityRole="button" style={[styles.enterBattle, glow(C.gold, 8, 0.28)]}><Text style={styles.enterBattleTxt}>ENTER PRIVATE BATTLE  →</Text></Tap>}
      </FadeIn>

      <FadeIn delay={130} dy={10} style={[styles.groupPick, glow(C.lo, 10, 0.18)]}>
        <Text style={styles.groupLabel}>PRIVATE PICKS · SERVER LOCKED</Text>
        <View style={styles.pickRow}><Text style={styles.pickHi}>HI</Text><Icon name="ball" size={24} color={C.text} /><Text style={styles.pickLo}>LO</Text></View>
        <Text style={styles.groupMeta}>Friends' picks stay hidden and cannot be changed after locking.</Text>
      </FadeIn>

      <Text style={styles.section}>PRIVATE BATTLE LEADERBOARD</Text>
      <View style={styles.wall}>
        {results.length ? results.map((result, i) => (
          <View key={result.playerId} style={[styles.wallRow, result.name === identity.name && styles.wallYou]}><Text style={[styles.wallRank, result.name === identity.name && { color: C.hi }]}>{i + 1}</Text><Text style={[styles.wallName, result.name === identity.name && { color: C.hi }]}>{result.name}</Text><Text style={styles.wallPts}>{result.pts.toLocaleString()}</Text></View>
        )) : <Text style={styles.empty}>No completed runs yet. Results appear here when friends finish.</Text>}
      </View>
      <Text style={styles.note}>Deep-link invites open this private battle room. {roomService.ready ? "Presence, picks, and results use the shared backend." : roomService.message + "."}</Text>
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
  disabled: { opacity: 0.35 }, error: { color: C.lo, fontSize: 10, lineHeight: 14, marginTop: 7 }, enterBattle: { backgroundColor: C.gold, borderRadius: 11, minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: 10 }, enterBattleTxt: { color: "#120d03", fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  groupPick: { backgroundColor: C.panel, borderColor: C.lo, borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "center", marginBottom: 16 },
  groupLabel: { ...type.caption, color: C.text, letterSpacing: 1.1 }, pickRow: { flexDirection: "row", alignItems: "center", gap: 22, marginVertical: 8 },
  pickHi: { color: C.hi, fontSize: 38, ...displayFont }, pickLo: { color: C.lo, fontSize: 38, ...displayFont }, groupMeta: { color: C.muted, fontSize: 11 },
  section: { ...type.section, marginBottom: 8 }, wall: { backgroundColor: C.panel, borderColor: C.line, borderWidth: hairline, borderRadius: 16, padding: 9 },
  wallRow: { flexDirection: "row", alignItems: "center", borderBottomColor: C.line, borderBottomWidth: hairline, paddingHorizontal: 8, minHeight: 42, paddingVertical: 9 }, wallYou: { borderColor: C.hi, borderWidth: 1, borderRadius: 9, backgroundColor: C.hiSoft },
  wallRank: { color: C.muted, width: 28, fontWeight: "700", fontVariant: ["tabular-nums"] }, wallName: { flex: 1, color: C.text, fontWeight: "600", fontSize: 13, letterSpacing: -0.1 }, wallPts: { color: C.gold, fontWeight: "700", fontVariant: ["tabular-nums"] },
  empty: { ...type.footnote, padding: 12, textAlign: "center", lineHeight: 17 },
  note: { ...type.footnote, fontSize: 10, lineHeight: 15, marginTop: 10 },
});
