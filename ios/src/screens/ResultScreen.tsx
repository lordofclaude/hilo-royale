import React, { useRef } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import ViewShot, { captureRef } from "react-native-view-shot";
import { C, WALL, glow, displayFont } from "../theme";
import { GameResult } from "../types";
import { Profile } from "../lib/storage";
import { encodeGhostPicks, ladderRank } from "../lib/game-logic";
import { ReplayFixture, teamCode } from "../lib/txline-real";
import { badgeDef } from "../lib/badges";
import { VRF_EXPLORER_URL } from "../lib/vrf";
import Icon from "../components/Icon";

const WEB_URL = "https://hilo-royale.vercel.app";

interface Props {
  result: GameResult;
  profile: Profile;
  replay: ReplayFixture;
  onAgain: () => void;
  onLobby: () => void;
  onProfile: () => void;
}

export default function ResultScreen({ result, profile, replay, onAgain, onLobby, onProfile }: Props) {
  const r = result;
  const rank = ladderRank(WALL, profile.ladderPoints);
  const ticketRef = useRef<ViewShot>(null);
  const survived = r.won || r.survivedToEnd;
  const code1 = teamCode(replay.fixture.Participant1);
  const code2 = teamCode(replay.fixture.Participant2);
  const finalScore = replay.finalScore;
  const challengeOutcome = r.challengeTargetPoints == null ? null
    : r.pts > r.challengeTargetPoints ? `GHOST BEATEN · +${r.pts - r.challengeTargetPoints}`
    : r.pts === r.challengeTargetPoints ? "GHOST TIED"
    : `GHOST SURVIVED · ${r.challengeTargetPoints - r.pts} PTS SHORT`;

  const title = r.won ? "LAST FAN\nSTANDING" : r.survivedToEnd ? "YOU\nSURVIVED" : "ELIMINATED";
  const sub = r.won
    ? `You outlived all 99 fans across ${r.rounds} questions. Provably-fair lobby · ORAO VRF seed on Solana devnet.`
    : r.survivedToEnd
    ? `You survived all ${r.rounds} questions with ${r.aliveAtEnd - 1} others still alive.`
    : `${r.aliveAtEnd} fans outlasted you.${r.ghostRankAtEnd ? ` In ghost mode, your run would have reached top ${r.ghostRankAtEnd}.` : ""}`;

  const ghostCode = encodeGhostPicks(r.history.map(record => record.pick));
  const challengeUrl = `${WEB_URL}/play?fixture=${encodeURIComponent(r.fixtureId)}` +
    `&p=${ghostCode}&streak=${r.streak}&outlived=${r.outlivedCount}&target=${r.pts}` +
    `&challenger=${encodeURIComponent("A rival")}`;
  const message =
    `I outlived ${r.outlivedCount} of 99 fans on Hi-Lo Royale ` +
    `(streak ${r.streak}, ${r.predictionPoints} crowd-difficulty points${r.won ? ", LOBBY CHAMPION" : ""}) — ${code1} ${finalScore.g1}–${finalScore.g2} ${code2}. ` +
    `${survived ? "Think you can outlast my run? Same match, same questions — prove it." : `I died on round ${r.death?.round || r.rounds}. Beat my ghost if you can.`} ` +
    `Beat my run: ${challengeUrl}`;

  const shareText = () => {
    Share.share({
      message,
    }).catch(() => {});
  };

  const shareImage = async () => {
    try {
      const uri = await captureRef(ticketRef, { format: "png", quality: 0.92 });
      await Share.share({ url: uri, message: `I just played Hi-Lo Royale — beat my run: ${challengeUrl}` });
    } catch {
      shareText();
    }
  };

  const shareWhatsApp = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
    else shareText();
  };

  const copyChallenge = async () => {
    await Clipboard.setStringAsync(challengeUrl);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.brand}>
        <Text style={{ color: C.text }}>HI-LO </Text>
        <Text style={{ color: C.gold }}>ROYALE</Text>
      </Text>
      <Text style={[styles.title, !survived && { color: C.lo }]}>{title}</Text>
      <View style={styles.crownBig}>
        <Icon name={survived ? "crown" : "skull"} size={58} color={survived ? C.gold : C.lo} />
      </View>
      <Text style={[styles.pts, glow(C.gold, 12, 0.4) as object]}>+{r.pts.toLocaleString()}</Text>
      <Text style={styles.sub}>{sub}</Text>
      {challengeOutcome && <Text style={styles.challengeOutcome}>{challengeOutcome}</Text>}

      {/* streak + rank pills */}
      <View style={[styles.pill, { borderColor: C.gold }, glow(C.gold, 8, 0.35)]}>
        <Icon name="bolt" size={13} color={C.gold} style={{ marginRight: 7 }} />
        <Text style={styles.pillGoldTxt}>
          STREAK x{r.streak}{r.streak > 0 ? "  " + "♛".repeat(Math.min(7, r.streak)) : ""}
        </Text>
      </View>
      <View style={[styles.pill, { borderColor: C.hi }]}>
        <Icon name="shield" size={13} color={C.hi} style={{ marginRight: 7 }} />
        <Text style={styles.pillCyanTxt}>OUTLIVED {r.outlivedCount} OF 99 FANS</Text>
      </View>

      <View style={styles.breakdown}>
        <Breakdown label="PREDICTIONS" value={`+${r.predictionPoints}`} color={C.hi} />
        <Text style={styles.operator}>+</Text>
        <Breakdown label="SURVIVAL" value={`+${r.survivalPoints}`} color={C.text} />
        <Text style={styles.operator}>+</Text>
        <Breakdown label="CROWN" value={`+${r.crownBonus}`} color={C.gold} />
      </View>
      <Text style={styles.formula}>RARE CORRECT PICKS EARN MORE · WRONG / PUSH = 0 PREDICTION PTS</Text>

      {/* survival ticket (captured for image share) */}
      <ViewShot ref={ticketRef} options={{ format: "png", quality: 0.92 }}>
        <View style={[styles.ticket, glow(C.gold, 10, 0.35)]}>
          <Text style={styles.tHead}>
            <Text style={{ color: C.text }}>HI-LO </Text>
            <Text style={{ color: C.gold }}>ROYALE</Text>
          </Text>
          <Text style={styles.tSub}>{survived ? "SURVIVAL TICKET" : "DEATH REPLAY"} · DAILY {r.dailyKey}</Text>
          {r.won && (
            <View style={styles.tCrownRow}>
              <Icon name="crown" size={12} color={C.gold} style={{ marginRight: 6 }} />
              <Text style={styles.tCrown}>LOBBY CHAMPION</Text>
            </View>
          )}
          <Text style={styles.tStreak}>{r.streak}</Text>
          <Text style={styles.tStreakLbl}>QUESTION STREAK</Text>
          {!survived && r.death && (
            <View style={styles.deathBox}>
              <Text style={styles.deathRound}>ELIMINATED · ROUND {r.death.round} · {r.death.matchMinute}'</Text>
              <Text style={styles.deathPrompt}>{r.death.prompt}</Text>
              <Text style={styles.deathPick}>YOU: {r.death.pick?.toUpperCase() || "TIMEOUT"} · ANSWER: {r.death.answer.toUpperCase()}</Text>
              <Text style={styles.deathCrowd}>{Math.round(r.death.correctShare * 100)}% OF FANS GOT IT RIGHT · {r.death.eliminatedWith} OTHERS FELL</Text>
            </View>
          )}
          <Text style={styles.tMatch}>
            <Text style={{ color: C.hi }}>{code1}</Text>
            <Text style={{ color: C.text }}>  {finalScore.g1} – {finalScore.g2}  </Text>
            <Text style={{ color: C.lo }}>{code2}</Text>
          </Text>
          <Text style={styles.tMeta}>
            {r.predictionPoints} skill + {r.survivalPoints} survival + {r.crownBonus} crown · rank #{rank}
          </Text>
          {replay.proof && (
            <View style={styles.tChainRow}>
              <Icon name="chain" size={10} color={C.success} style={{ marginRight: 5 }} />
              <Text style={styles.tChain}>FINAL SCORE PROVEN ON SOLANA DEVNET · {replay.proof.txSig.slice(0, 8)}…</Text>
            </View>
          )}
          {r.badges.length > 0 && (
            <View style={styles.badgeRow}>
              {r.badges.map(id => {
                const b = badgeDef(id);
                return (
                  <View key={id} style={styles.badgeChip}>
                    <Icon name={b.icon} size={11} color={C.gold} />
                    <Text style={styles.badgeLabel}>{b.label}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ViewShot>

      {/* real on-chain proof: one devnet validateStatV2 tx per fixture, proving
          the final score against TxODDS's Merkle root — tap to view on Solscan */}
      {replay.proofExplorerUrl && <Pressable
        style={({ pressed }) => [styles.chainPill, glow(C.success, 8, 0.4), pressed && { opacity: 0.85 }]}
        onPress={() => Linking.openURL(replay.proofExplorerUrl!).catch(() => {})}
      >
        <Icon name="chain" size={12} color={C.success} style={{ marginRight: 7 }} />
        <Text style={styles.chainPillTxt}>SCORE PROOF · SOLANA DEVNET — VIEW TX  ↗</Text>
      </Pressable>}

      {/* provably fair lobby: bots/tie-breaks seeded by a real ORAO VRF
          randomness request on devnet (lib/vrf.ts) — tap to view on Solscan */}
      <Pressable
        style={({ pressed }) => [styles.chainPill, glow(C.hi, 8, 0.35), pressed && { opacity: 0.85 }]}
        onPress={() => Linking.openURL(VRF_EXPLORER_URL).catch(() => {})}
      >
        <Icon name="dice" size={12} color={C.success} style={{ marginRight: 7 }} />
        <Text style={styles.chainPillTxt}>PROVABLY FAIR — ORAO VRF SEED (DEVNET)  ↗</Text>
      </Pressable>

      {/* share */}
      <Text style={styles.shareLbl}>—  SHARE THE {survived ? "WIN" : "RUN"}  —</Text>
      <View style={styles.shareRow}>
        <Pressable style={[styles.sharePlatform, styles.whatsapp]} onPress={shareWhatsApp}><Text style={[styles.sharePlatformTxt, { color: C.success }]}>WHATSAPP</Text></Pressable>
        <Pressable style={[styles.sharePlatform, styles.instagram]} onPress={shareImage}><Text style={[styles.sharePlatformTxt, { color: C.text }]}>INSTAGRAM</Text></Pressable>
        <Pressable style={[styles.sharePlatform, styles.copy]} onPress={copyChallenge}><Text style={[styles.sharePlatformTxt, { color: C.hi }]}>COPY LINK</Text></Pressable>
      </View>
      <Pressable style={({ pressed }) => [styles.primary, glow(C.gold, 8, 0.4), pressed && { opacity: 0.85 }]} onPress={shareImage}>
        <Text style={styles.primaryTxt}>SHARE {survived ? "SURVIVAL TICKET" : "DEATH REPLAY"}  ↗</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.challenge, pressed && { opacity: 0.85 }]} onPress={shareText}>
        <Icon name="users" size={13} color={C.gold} style={{ marginRight: 7 }} />
        <Text style={styles.challengeTxt}>CHALLENGE 3 FRIENDS  →</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.again, glow(C.hi, 8, 0.4), pressed && { opacity: 0.85 }]} onPress={onAgain}>
        <Icon name="play" size={12} color={C.hi} style={{ marginRight: 8 }} />
        <Text style={styles.againTxt}>RUN IT BACK</Text>
      </Pressable>
      <View style={styles.row}>
        <Pressable style={({ pressed }) => [styles.ghost, styles.half, pressed && { opacity: 0.85 }]} onPress={onLobby}>
          <Text style={styles.ghostTxt}>LOBBY</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.ghost, styles.half, pressed && { opacity: 0.85 }]} onPress={onProfile}>
          <Text style={styles.ghostTxt}>PROFILE</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Stat label="POINTS" value={String(profile.ladderPoints)} />
        <Stat label="RANK" value={`#${rank}`} />
        <Stat label="CROWNS" value={String(profile.crowns)} />
        <Stat label="BEST" value={String(profile.bestStreak)} />
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function Breakdown({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={styles.breakdownItem}><Text style={[styles.breakdownValue, { color }]}>{value}</Text><Text style={styles.breakdownLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },
  brand: { fontSize: 18, ...displayFont, textAlign: "center", marginTop: 8 },
  title: { color: C.gold, fontSize: 44, ...displayFont, textAlign: "center", lineHeight: 48, marginTop: 10 },
  crownBig: { alignItems: "center", marginVertical: 10 },
  pts: { color: C.gold, fontSize: 40, ...displayFont, textAlign: "center" },
  sub: { color: C.muted, textAlign: "center", marginTop: 8, marginBottom: 16, lineHeight: 20 },
  challengeOutcome: { color: C.hi, backgroundColor: C.hiSoft, borderColor: C.hi, borderWidth: 1, borderRadius: 10, paddingVertical: 9, textAlign: "center", fontSize: 11, fontWeight: "900", letterSpacing: 0.8, marginBottom: 12 },
  pill: {
    alignSelf: "center", flexDirection: "row", alignItems: "center",
    backgroundColor: C.panelDeep, borderWidth: 1.5,
    borderRadius: 99, paddingHorizontal: 18, paddingVertical: 9, marginBottom: 10,
  },
  pillGoldTxt: { color: C.gold, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  pillCyanTxt: { color: C.hi, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  breakdown: { flexDirection: "row", alignItems: "center", gap: 5, marginVertical: 5 },
  breakdownItem: { flex: 1, backgroundColor: C.panelDeep, borderColor: C.line, borderWidth: 1, borderRadius: 10, alignItems: "center", paddingVertical: 9 },
  breakdownValue: { fontSize: 17, fontWeight: "900" }, breakdownLabel: { color: C.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.7, marginTop: 2 }, operator: { color: C.muted, fontWeight: "900" },
  formula: { color: C.muted, fontSize: 8, lineHeight: 12, textAlign: "center", letterSpacing: 0.5, marginBottom: 8 },
  ticket: {
    borderColor: C.gold, borderWidth: 2, borderRadius: 20,
    backgroundColor: C.panel, padding: 20, alignItems: "center", marginTop: 8, marginBottom: 18,
  },
  tHead: { fontSize: 22, ...displayFont },
  tSub: { color: C.muted, fontSize: 10, letterSpacing: 1.5, marginTop: 4, marginBottom: 8 },
  tCrownRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  tCrown: { color: C.gold, fontWeight: "900", letterSpacing: 0.8 },
  tStreak: { color: C.gold, fontSize: 84, ...displayFont, lineHeight: 92 },
  tStreakLbl: { color: C.muted, fontSize: 11, letterSpacing: 2, marginBottom: 12 },
  deathBox: { alignSelf: "stretch", backgroundColor: C.loSoft, borderColor: C.lo, borderWidth: 1.5, borderRadius: 13, padding: 12, alignItems: "center", marginBottom: 13 },
  deathRound: { color: C.lo, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  deathPrompt: { color: C.text, fontSize: 15, fontWeight: "900", textAlign: "center", lineHeight: 20, marginVertical: 8 },
  deathPick: { color: C.gold, fontSize: 11, fontWeight: "900" },
  deathCrowd: { color: C.muted, fontSize: 8, fontWeight: "800", textAlign: "center", marginTop: 5 },
  tMatch: { fontWeight: "900", fontSize: 16 },
  tMeta: { color: C.muted, fontSize: 11, marginTop: 4 },
  tChainRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  tChain: { color: C.success, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  chainPill: {
    alignSelf: "center", flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(49,242,139,0.08)", borderColor: C.success, borderWidth: 1.5,
    borderRadius: 99, paddingHorizontal: 18, paddingVertical: 10, marginBottom: 14,
  },
  chainPillTxt: { color: C.success, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 12 },
  badgeChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: C.panelDeep, borderColor: C.gold, borderWidth: 1,
    borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5,
  },
  badgeLabel: { color: C.gold, fontSize: 10, fontWeight: "800" },
  shareLbl: { color: C.muted, fontSize: 11, fontWeight: "800", letterSpacing: 2, textAlign: "center", marginBottom: 10 },
  shareRow: { flexDirection: "row", gap: 7, marginBottom: 10 },
  sharePlatform: { flex: 1, borderWidth: 1, borderRadius: 11, paddingVertical: 11, alignItems: "center", backgroundColor: C.panelDeep },
  whatsapp: { borderColor: C.success }, instagram: { borderColor: C.lo }, copy: { borderColor: C.hi },
  sharePlatformTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  primary: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
  primaryTxt: { color: "#160f07", fontWeight: "900", fontSize: 15, letterSpacing: 1 },
  again: {
    flexDirection: "row", justifyContent: "center",
    backgroundColor: C.hiSoft, borderColor: C.hi, borderWidth: 1.5,
    borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10,
  },
  againTxt: { color: C.hi, fontWeight: "900", fontSize: 15, letterSpacing: 1 },
  challenge: { flexDirection: "row", justifyContent: "center", backgroundColor: C.goldSoft, borderColor: C.gold, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  challengeTxt: { color: C.gold, fontSize: 13, fontWeight: "900", letterSpacing: 0.7 },
  ghost: {
    backgroundColor: C.panelDeep, borderColor: C.line, borderWidth: 1,
    borderRadius: 12, paddingVertical: 13, alignItems: "center", marginBottom: 10,
  },
  ghostTxt: { color: C.text, fontWeight: "800", fontSize: 11, letterSpacing: 1.4 },
  row: { flexDirection: "row", gap: 10, marginBottom: 14 },
  half: { flex: 1 },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1, backgroundColor: C.panelDeep, borderColor: C.line, borderWidth: 1,
    borderRadius: 10, alignItems: "center", paddingVertical: 10,
  },
  statVal: { color: C.hi, fontWeight: "900", fontSize: 17 },
  statLbl: { color: C.muted, fontSize: 9, letterSpacing: 1, marginTop: 2 },
});
