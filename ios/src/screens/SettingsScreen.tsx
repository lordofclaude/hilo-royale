import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C, displayFont, glow } from "../theme";
import { FanIdentity } from "../lib/auth";
import { GameSettings } from "../lib/settings";
import { liveStatus } from "../lib/live-service";
import BrandHeader from "../components/BrandHeader";

interface Props {
  identity: FanIdentity;
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onBack: () => void;
  onSignOut: () => void;
}

export default function SettingsScreen({ identity, settings, onChange, onBack, onSignOut }: Props) {
  const live = liveStatus();
  const patch = (value: Partial<GameSettings>) => onChange({ ...settings, ...value });

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <BrandHeader eyebrow="MATCH CONTROL" />
      <Text style={styles.title}>GAME & PLAYBACK</Text>
      <Text style={styles.subtitle}>Tune the run for a stage demo or lock it to real match time.</Text>

      <View style={[styles.card, glow(settings.mode === "live" ? C.lo : C.hi, 10, 0.25)]}>
        <Text style={styles.label}>DATA MODE</Text>
        <View style={styles.segmentRow}>
          <Choice label="REPLAY" active={settings.mode === "replay"} color={C.hi} onPress={() => patch({ mode: "replay" })} />
          <Choice label="LIVE 1x" active={settings.mode === "live"} color={C.lo} onPress={() => patch({ mode: "live", playbackRate: 1 })} />
        </View>
        <Text style={[styles.status, { color: live.ready ? C.success : C.muted }]}>
          {settings.mode === "live" ? (live.ready ? `● ${live.message} · fixture ${live.fixtureId}` : `○ ${live.message}`) : "● Real TxLINE historical tape · deterministic replay"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>REPLAY SPEED</Text>
        <Text style={styles.help}>1x is real match time. 30x is the recommended 3–5 minute demo.</Text>
        <View style={styles.choiceGrid}>
          {([1, 15, 30, 60] as const).map(rate => (
            <Choice
              key={rate}
              label={`${rate}x`}
              active={settings.playbackRate === rate}
              color={C.hi}
              disabled={settings.mode === "live" && rate !== 1}
              onPress={() => patch({ playbackRate: rate })}
            />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>ANSWER WINDOW</Text>
        <Text style={styles.help}>More time reads better on stage; live play defaults to 15 seconds.</Text>
        <View style={styles.choiceGrid}>
          {([8, 10, 15] as const).map(seconds => (
            <Choice key={seconds} label={`${seconds}s`} active={settings.answerSeconds === seconds} color={C.gold} onPress={() => patch({ answerSeconds: seconds })} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>REVEAL PAUSE</Text>
        <Text style={styles.help}>Controls the breathing room between the answer reveal and the next prediction.</Text>
        <View style={styles.choiceGrid}>
          {([2, 4, 6] as const).map(seconds => (
            <Choice key={seconds} label={`${seconds}s`} active={settings.revealSeconds === seconds} color={C.lo} onPress={() => patch({ revealSeconds: seconds })} />
          ))}
        </View>
      </View>

      <View style={styles.identityCard}>
        <View style={styles.identityAvatar}><Text style={styles.identityAvatarTxt}>{identity.name.slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.identityName}>{identity.name}</Text><Text style={styles.identityMeta}>{identity.provider === "google" ? identity.email : "Demo identity on this device"}</Text></View>
      </View>

      <Pressable style={styles.primary} onPress={onBack}><Text style={styles.primaryTxt}>SAVE & RETURN</Text></Pressable>
      <Pressable style={styles.signOut} onPress={onSignOut}><Text style={styles.signOutTxt}>Sign out</Text></Pressable>
    </ScrollView>
  );
}

function Choice({ label, active, color, onPress, disabled = false }: { label: string; active: boolean; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.choice, active && { borderColor: color, backgroundColor: `${color}18` }, disabled && { opacity: 0.3 }]}>
      <Text style={[styles.choiceTxt, active && { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 36 },
  title: { color: C.text, fontSize: 30, ...displayFont, textAlign: "center" },
  subtitle: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 6, marginBottom: 18 },
  card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 11 },
  label: { color: C.text, fontSize: 12, fontWeight: "900", letterSpacing: 1.6, marginBottom: 8 },
  help: { color: C.muted, fontSize: 11, lineHeight: 16, marginBottom: 10 },
  segmentRow: { flexDirection: "row", gap: 8 },
  choiceGrid: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, minHeight: 42, borderRadius: 11, borderColor: C.lineStrong, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.panelDeep },
  choiceTxt: { color: C.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  status: { fontSize: 10, lineHeight: 15, marginTop: 10 },
  identityCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.panelDeep, borderColor: C.line, borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 2, marginBottom: 12 },
  identityAvatar: { width: 40, height: 40, borderRadius: 20, borderColor: C.hi, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: C.hiSoft },
  identityAvatarTxt: { color: C.hi, fontSize: 17, fontWeight: "900" },
  identityName: { color: C.text, fontWeight: "900", fontSize: 14 },
  identityMeta: { color: C.muted, fontSize: 10, marginTop: 2 },
  primary: { backgroundColor: C.gold, borderRadius: 13, paddingVertical: 15, alignItems: "center" },
  primaryTxt: { color: "#120d03", fontWeight: "900", letterSpacing: 1 },
  signOut: { alignItems: "center", paddingVertical: 14 },
  signOutTxt: { color: C.lo, fontSize: 12, fontWeight: "700" },
});

