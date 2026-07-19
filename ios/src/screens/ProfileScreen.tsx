import React from "react";
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { C, WALL, glow, displayFont } from "../theme";
import { Profile } from "../lib/storage";
import { ladderRank } from "../lib/game-logic";
import { BADGE_DEFS } from "../lib/badges";
import { FanIdentity } from "../lib/auth";
import BrandHeader from "../components/BrandHeader";
import Icon from "../components/Icon";

interface Props { identity: FanIdentity; profile: Profile; onBack: () => void; onSettings: () => void; }

// Lifetime-score thresholds -> a level title, purely cosmetic progression flavor.
const LEVELS: Array<{ min: number; title: string }> = [
  { min: 0, title: "Rookie Fan" },
  { min: 500, title: "Streak Chaser" },
  { min: 1500, title: "Crowd Reader" },
  { min: 3000, title: "Royale Regular" },
  { min: 6000, title: "Crown Chaser" },
  { min: 12000, title: "Hi-Lo Royalty" },
];

function levelFor(points: number): { level: number; title: string } {
  let level = 1, title = LEVELS[0].title;
  LEVELS.forEach((l, i) => { if (points >= l.min) { level = i + 1; title = l.title; } });
  return { level, title };
}

function favoritePick(perKeyCorrect: Record<string, number>): string | null {
  const entries = Object.entries(perKeyCorrect);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

export default function ProfileScreen({ identity, profile, onBack, onSettings }: Props) {
  const rank = ladderRank(WALL, profile.ladderPoints);
  const rows = [...WALL.map(w => ({ ...w, you: false })), { name: "YOU", points: profile.ladderPoints, crowns: profile.crowns, you: true }]
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);
  const { level, title } = levelFor(profile.ladderPoints);
  const winRate = profile.totalQuestions > 0 ? Math.round((profile.totalCorrect / profile.totalQuestions) * 100) : 0;
  const favorite = favoritePick(profile.perKeyCorrect);
  const unlockedBadges = Object.keys(profile.badges);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <BrandHeader eyebrow="PLAYER PROFILE" />
      <View style={styles.profileTop}>
        {identity.avatarUrl ? <Image source={{ uri: identity.avatarUrl }} style={styles.avatarImage} /> : <View style={styles.avatarFallback}><Text style={styles.avatarFallbackTxt}>{identity.name.slice(0, 1).toUpperCase()}</Text></View>}
        <Text style={styles.playerName}>{identity.name.toUpperCase()}</Text>
        <Pressable onPress={onSettings} style={styles.settings}><Icon name="gear" size={10} color={C.muted} style={{ marginRight: 5 }} /><Text style={styles.settingsTxt}>SETTINGS</Text></Pressable>
      </View>

      {/* royal status */}
      <View style={[styles.royalCard, glow(C.gold, 10, 0.4)]}>
        <View style={styles.royalKickerRow}>
          <Icon name="crown" size={12} color={C.gold} style={{ marginRight: 8 }} />
          <Text style={styles.royalKicker}>ROYAL STATUS</Text>
          <Icon name="crown" size={12} color={C.gold} style={{ marginLeft: 8 }} />
        </View>
        <Text style={styles.royalLevel}>LEVEL {level}</Text>
        <Text style={styles.royalTitle}>{title.toUpperCase()}</Text>
      </View>

      {/* lifetime score */}
      <View style={[styles.scoreCard, glow(C.hi, 10, 0.35)]}>
        <Text style={styles.scoreLbl}>LIFETIME SCORE</Text>
        <Text style={styles.scoreVal}>{profile.ladderPoints.toLocaleString()}</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat label="WIN RATE" value={`${winRate}%`} color={C.hi} />
        <Stat label="BEST STREAK" value={`x${profile.bestStreak}`} color={C.lo} />
        <Stat label="FAVORITE" value={favorite ? favorite.toUpperCase() : "—"} color={C.hi} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="CROWNS" value={profile.crowns > 0 ? "♛".repeat(Math.min(3, profile.crowns)) : "0"} color={C.gold} />
        <Stat label="LOBBIES" value={String(profile.lobbies)} color={C.text} />
      </View>

      {/* badges */}
      <Text style={styles.sectionLbl}>—  BADGES  —</Text>
      <View style={styles.badgeGrid}>
        {BADGE_DEFS.map((b, i) => {
          const unlocked = unlockedBadges.includes(b.id);
          const color = i % 2 ? C.lo : C.hi;
          return (
            <View key={b.id} style={[styles.badgeTile, { borderColor: unlocked ? color : C.line }, !unlocked && styles.badgeTileLocked]}>
              <Icon name={b.icon} size={22} color={unlocked ? color : C.muted} style={{ marginBottom: 6 }} />
              <Text style={[styles.badgeTileLabel, { color: unlocked ? color : C.muted }]}>{b.label}</Text>
            </View>
          );
        })}
      </View>

      {/* ladder wall */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>♛ ROYALE LADDER · YOU ARE #{rank}</Text>
        {rows.map((r, i) => (
          <View key={r.name + i} style={[styles.wrow, r.you && [styles.wrowYou, glow(C.gold, 6, 0.3)]]}>
            <Text style={[styles.wname, r.you && { color: C.gold }]}>
              #{i + 1} {r.name} <Text style={{ color: C.gold }}>{"♛".repeat(Math.min(3, r.crowns))}</Text>
            </Text>
            <Text style={styles.wpts}>{r.points}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.foot}>
        Provably-fair lobby: bot behavior is seeded from a real ORAO VRF request on Solana devnet,
        and daily fixtures replay real TxLINE tapes (one carries a devnet score-proof tx).
        The ladder above is a local demo — cross-device ranking ships with the multiplayer backend.
      </Text>

      <Pressable style={[styles.shareProfile, glow(C.hi, 8, 0.25)]} onPress={() => Share.share({ message: `${identity.name} is level ${level} ${title} on Hi-Lo Royale with ${profile.ladderPoints.toLocaleString()} points. Join the next lobby: hiloroyale://lobby` }).catch(() => {})}>
        <Text style={styles.shareProfileTxt}>↗  SHARE PROFILE</Text>
      </Pressable>

      <Pressable style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.85 }]} onPress={onBack}>
        <Text style={styles.ghostTxt}>← Back to lobby</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 30 },
  profileTop: { alignItems: "center", marginTop: -8, marginBottom: 12 },
  avatarImage: { width: 82, height: 82, borderRadius: 41, borderColor: C.hi, borderWidth: 2 },
  avatarFallback: { width: 82, height: 82, borderRadius: 41, borderColor: C.hi, borderWidth: 2, backgroundColor: C.hiSoft, alignItems: "center", justifyContent: "center" },
  avatarFallbackTxt: { color: C.hi, fontSize: 32, fontWeight: "900" },
  playerName: { color: C.text, fontSize: 15, fontWeight: "900", letterSpacing: 1.2, marginTop: 8 },
  settings: { flexDirection: "row", alignItems: "center", borderColor: C.lineStrong, borderWidth: 1, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5, marginTop: 7 },
  settingsTxt: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  royalCard: {
    backgroundColor: "rgba(255,213,74,0.05)", borderColor: C.gold, borderWidth: 1.5, borderRadius: 18,
    alignItems: "center", paddingVertical: 16, marginBottom: 12,
  },
  royalKickerRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  royalKicker: { color: C.gold, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  royalLevel: { color: C.text, fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  royalTitle: { color: C.gold, fontSize: 26, ...displayFont, marginTop: 2 },
  scoreCard: {
    backgroundColor: C.panel, borderColor: C.hi, borderWidth: 1.5, borderRadius: 18,
    alignItems: "center", paddingVertical: 16, marginBottom: 12,
  },
  scoreLbl: { color: C.muted, fontSize: 11, letterSpacing: 2, fontWeight: "800", marginBottom: 4 },
  scoreVal: { color: C.hi, fontSize: 42, ...displayFont, fontVariant: ["tabular-nums"] },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  stat: {
    flex: 1, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 14,
    alignItems: "center", paddingVertical: 14, paddingHorizontal: 4,
  },
  statVal: { fontWeight: "900", fontSize: 20 },
  statLbl: { color: C.muted, fontSize: 9, letterSpacing: 1.5, marginTop: 4 },
  sectionLbl: { color: C.muted, fontSize: 11, fontWeight: "800", letterSpacing: 2, textAlign: "center", marginVertical: 10 },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  badgeTile: {
    width: "47.5%", alignItems: "center", backgroundColor: C.panelDeep, borderWidth: 1.5,
    borderRadius: 12, paddingVertical: 14,
  },
  badgeTileLocked: { opacity: 0.4 },
  badgeTileLabel: { fontSize: 11, fontWeight: "900", textAlign: "center", letterSpacing: 0.5 },
  card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  cardLabel: { color: C.muted, fontSize: 10, letterSpacing: 1, marginBottom: 10, fontWeight: "800" },
  wrow: {
    flexDirection: "row", justifyContent: "space-between",
    backgroundColor: C.panelDeep, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 5,
  },
  wrowYou: { borderColor: C.gold, borderWidth: 1 },
  wname: { color: C.text, fontSize: 13, fontWeight: "600" },
  wpts: { color: C.gold, fontWeight: "900", fontSize: 13 },
  foot: { color: C.muted, fontSize: 11, lineHeight: 17, marginBottom: 14 },
  shareProfile: { backgroundColor: C.hiSoft, borderColor: C.hi, borderWidth: 1.5, borderRadius: 13, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  shareProfileTxt: { color: C.hi, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  ghost: {
    backgroundColor: C.panelDeep, borderColor: C.line, borderWidth: 1,
    borderRadius: 12, paddingVertical: 13, alignItems: "center",
  },
  ghostTxt: { color: C.text, fontWeight: "600" },
});
