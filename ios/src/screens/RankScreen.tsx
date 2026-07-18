import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C, FANS, ME_INDEX, fanName, glow, displayFont } from "../theme";
import { Profile } from "../lib/storage";

interface Props { profile: Profile; }

interface Row { name: string; points: number; you: boolean; }
type Board = "GLOBAL" | "FRIENDS" | "SQUADS";
const SQUADS = ["GOAL DIGGERS", "NET BUSTERS", "PITCH KINGS", "CROWN CREW", "VAR VILLAINS", "NINETY PLUS", "ULTRAS XI", "THE PANENKAS", "BOX OFFICE", "CROSSBAR CLUB"];

// Deterministic pseudo-score per bot index — flavor for this lobby's 100 fans,
// not a real global leaderboard (this app has no multiplayer backend).
function botScore(i: number): number {
  const h = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  return Math.round(3200 + h * 6000);
}

export default function RankScreen({ profile }: Props) {
  const [board, setBoard] = useState<Board>("GLOBAL");
  const rows = useMemo<Row[]>(() => {
    const r: Row[] = [];
    if (board === "SQUADS") {
      SQUADS.forEach((name, i) => r.push({ name, points: name === "CROWN CREW" ? 1840 + profile.crowns * 100 : botScore(i + 10), you: name === "CROWN CREW" }));
    } else {
      const count = board === "FRIENDS" ? 14 : FANS;
      for (let i = 0; i < count; i++) {
        const isYou = board === "FRIENDS" ? i === 5 : i === ME_INDEX;
        if (isYou) r.push({ name: "YOU", points: profile.ladderPoints, you: true });
        else r.push({ name: fanName(i), points: botScore(i), you: false });
      }
    }
    return r.sort((a, b) => b.points - a.points);
  }, [board, profile.crowns, profile.ladderPoints]);

  const myRank = rows.findIndex(r => r.you) + 1;
  const list = rows.slice(3, 10);
  const podium = rows.slice(0, 3);
  // render order: #2 left, #1 center (raised), #3 right — broadcast podium
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>LIVE RANK</Text>
      <Text style={styles.h2}>MATCH LEADERBOARD</Text>
      <View style={styles.boardTabs}>
        {(["GLOBAL", "FRIENDS", "SQUADS"] as const).map(value => <Pressable key={value} onPress={() => setBoard(value)} style={[styles.boardTab, board === value && styles.boardTabOn]}><Text style={[styles.boardTabTxt, board === value && styles.boardTabTxtOn]}>{value}</Text></Pressable>)}
      </View>
      <View style={styles.topPill}><Text style={styles.topPillTxt}>{board} DEMO BOARD · CONNECT ROOM API FOR LIVE RANKS</Text></View>

      <View style={styles.podiumRow}>
        {podiumOrder.map((r, idx) => {
          const place = idx === 1 ? 1 : idx === 0 ? 2 : 3;
          const color = place === 1 ? C.gold : place === 2 ? C.hi : C.lo;
          return (
            <View
              key={r.name + place}
              style={[
                styles.podiumCard,
                { borderColor: color },
                place === 1 && styles.podiumFirst,
                place === 1 && glow(C.gold, 12, 0.5),
              ]}
            >
              <Text style={[styles.podiumPlace, { color }]}>{place}</Text>
              {place === 1 && <Text style={styles.podiumCrown}>👑</Text>}
              <Text style={[styles.podiumName, r.you && { color: C.gold }]} numberOfLines={1}>{r.name}</Text>
              <Text style={[styles.podiumPts, { color }]}>♛ {r.points.toLocaleString()}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        {list.map((r, i) => {
          const place = i + 4;
          return (
            <View key={r.name + i} style={[styles.row, r.you && [styles.rowYou, glow(C.lo, 8, 0.4)]]}>
              <Text style={[styles.rowRank, r.you && { color: C.gold }]}>{place}</Text>
              <Text style={[styles.rowName, r.you && { color: C.lo }]} numberOfLines={1}>{r.name}</Text>
              <Text style={[styles.rowPts, r.you && { color: C.lo }]}>♛ {r.points.toLocaleString()}</Text>
              <Text style={[styles.move, { color: i % 3 === 0 ? C.success : i % 3 === 1 ? C.lo : C.muted }]}>{i % 3 === 0 ? `+${i + 1}` : i % 3 === 1 ? "-1" : "—"}</Text>
            </View>
          );
        })}
        {myRank > 10 && (
          <View style={[styles.row, styles.rowYou, glow(C.lo, 8, 0.4), { marginTop: 6 }]}>
            <Text style={[styles.rowRank, { color: C.gold }]}>{myRank}</Text>
            <Text style={[styles.rowName, { color: C.lo }]}>YOU</Text>
            <Text style={[styles.rowPts, { color: C.lo }]}>♛ {profile.ladderPoints.toLocaleString()}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 20 },
  h1: { color: C.text, fontSize: 34, ...displayFont, textAlign: "center", marginTop: 8 },
  h2: { color: C.hi, fontSize: 12, fontWeight: "900", letterSpacing: 3, textAlign: "center", marginTop: 2 },
  boardTabs: { flexDirection: "row", gap: 7, marginTop: 13 },
  boardTab: { flex: 1, borderColor: C.lineStrong, borderWidth: 1, borderRadius: 9, paddingVertical: 8, alignItems: "center", backgroundColor: C.panelDeep },
  boardTabOn: { borderColor: C.hi, backgroundColor: C.hiSoft }, boardTabTxt: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 }, boardTabTxtOn: { color: C.hi },
  topPill: {
    alignSelf: "center", borderColor: C.hi, borderWidth: 1, borderRadius: 99,
    paddingHorizontal: 14, paddingVertical: 4, marginTop: 10, marginBottom: 16,
  },
  topPillTxt: { color: C.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  podiumRow: { flexDirection: "row", gap: 8, marginBottom: 16, alignItems: "flex-end" },
  podiumCard: {
    flex: 1, backgroundColor: C.panel, borderWidth: 1.5,
    borderRadius: 14, alignItems: "center", paddingVertical: 12,
  },
  podiumFirst: { paddingVertical: 20, backgroundColor: "rgba(255,213,74,0.06)" },
  podiumPlace: { fontSize: 22, ...displayFont },
  podiumCrown: { fontSize: 18, marginTop: 2 },
  podiumName: { color: C.text, fontWeight: "800", fontSize: 12, marginTop: 4, maxWidth: "90%" },
  podiumPts: { fontSize: 12, fontWeight: "900", marginTop: 4 },
  card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 16, padding: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.panelDeep, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  rowYou: { borderColor: C.lo, borderWidth: 1.5 },
  rowRank: { color: C.muted, fontSize: 13, fontWeight: "900", width: 24 },
  rowName: { flex: 1, color: C.text, fontSize: 13, fontWeight: "700" },
  rowPts: { color: C.hi, fontWeight: "900", fontSize: 13 },
  move: { width: 22, textAlign: "right", fontSize: 10, fontWeight: "900" },
});
