import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { C, displayFont, glow, type } from "../theme";
import { FadeIn, Tap } from "../components/Motion";
import { FanIdentity, makeGuestIdentity, saveIdentity } from "../lib/auth";
import BrandHeader from "../components/BrandHeader";

WebBrowser.maybeCompleteAuthSession();

interface Props { onSignedIn: (identity: FanIdentity) => void; }

/** Mounted ONLY when a Google client id is configured — expo-auth-session's
 *  Google.useAuthRequest THROWS at hook time on iOS when iosClientId is
 *  undefined, so the hook must live in a conditionally-rendered child, not
 *  the login screen itself. */
function GoogleAuthButton({ onSignedIn, onError }: { onSignedIn: (identity: FanIdentity) => void; onError: (msg: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const config = useMemo(() => ({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  }), []);
  const [request, response, promptAsync] = Google.useAuthRequest(config);

  useEffect(() => {
    if (response?.type !== "success") return;
    const accessToken = response.authentication?.accessToken || response.params.access_token;
    if (!accessToken) { onError("Google did not return an access token."); return; }
    setBusy(true);
    fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async res => {
        if (!res.ok) throw new Error("Could not load your Google profile.");
        return res.json() as Promise<{ sub: string; name?: string; email?: string; picture?: string }>;
      })
      .then(async info => {
        const identity: FanIdentity = {
          id: info.sub,
          name: info.name || info.email?.split("@")[0] || "Royale Fan",
          provider: "google",
        };
        await saveIdentity(identity);
        onSignedIn(identity);
      })
      .catch(err => onError(err instanceof Error ? err.message : "Google sign-in failed"))
      .finally(() => setBusy(false));
  }, [onSignedIn, onError, response]);

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      disabled={!request || busy}
      onPress={() => { onError(null); void promptAsync(); }}
      style={[styles.google, !request && styles.disabled]}
    >
      {busy ? <ActivityIndicator color="#111318" /> : <Text style={styles.googleTxt}>G  CONTINUE WITH GOOGLE</Text>}
    </Tap>
  );
}

export default function LoginScreen({ onSignedIn }: Props) {
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const googleConfigured = Platform.OS === "ios"
    ? Boolean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)
    : Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);

  const continueAsGuest = async () => {
    const identity = makeGuestIdentity(handle.trim() || "Demo Fan");
    await saveIdentity(identity);
    onSignedIn(identity);
  };

  return (
    <View style={styles.root}>
      <Image
        source={require("../../assets/world-football/tunnel-final.jpg")}
        resizeMode="cover"
        style={styles.backgroundArt}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.lightLeft} />
      <View style={styles.lightRight} />
      <FadeIn dy={8}>
        <BrandHeader eyebrow="100 FANS · ONE CROWN" />
      </FadeIn>

      <FadeIn delay={60} dy={12}>
        <Text style={styles.title}>ENTER THE{`\n`}ARENA</Text>
        <Text style={styles.sub}>Live football predictions become a battle royale. Make the call. Beat the crowd. Survive the match.</Text>
      </FadeIn>

      <FadeIn delay={140} dy={14} style={[styles.card, glow(C.hi, 12, 0.2)]}>
        <Text style={styles.cardKicker}>YOUR FAN ID</Text>
        <TextInput
          accessibilityLabel="Fan display name"
          value={handle}
          onChangeText={setHandle}
          placeholder="Choose a display name"
          placeholderTextColor={C.muted}
          autoCapitalize="words"
          maxLength={22}
          style={styles.input}
        />
        {googleConfigured ? (
          <GoogleAuthButton onSignedIn={onSignedIn} onError={setError} />
        ) : (
          <>
            <View style={[styles.google, styles.disabled]}>
              <Text style={styles.googleTxt}>G  CONTINUE WITH GOOGLE</Text>
            </View>
            <Text style={styles.configNote}>Google OAuth is code-complete. Add the two EXPO_PUBLIC_GOOGLE_* client IDs for production sign-in.</Text>
          </>
        )}
        <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.or}>OR</Text><View style={styles.orLine} /></View>
        <Tap accessibilityRole="button" accessibilityLabel="Play demo now" onPress={continueAsGuest} style={[styles.demo, glow(C.gold, 10, 0.3)]}>
          <Text style={styles.demoTxt}>PLAY DEMO NOW  →</Text>
        </Tap>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </FadeIn>

      <Text style={styles.legal}>Google OAuth is used for identity only. No Gmail or IMAP mailbox access is requested.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 22, justifyContent: "center", overflow: "hidden" },
  backgroundArt: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, opacity: 0.24 },
  lightLeft: { position: "absolute", width: 180, height: 180, borderRadius: 90, left: -110, top: 110, backgroundColor: C.hiSoft },
  lightRight: { position: "absolute", width: 220, height: 220, borderRadius: 110, right: -140, bottom: 100, backgroundColor: C.loSoft },
  title: { color: C.text, fontSize: 48, lineHeight: 48, ...displayFont, textAlign: "center" },
  sub: { color: C.muted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12, marginBottom: 24 },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.hi, borderRadius: 20, padding: 18 },
  cardKicker: { ...type.caption, color: C.hi, letterSpacing: 1.8, marginBottom: 9 },
  input: { color: C.text, borderColor: C.lineStrong, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, backgroundColor: C.panelDeep, marginBottom: 12 },
  google: { backgroundColor: "#f4f7fb", borderRadius: 13, minHeight: 50, alignItems: "center", justifyContent: "center" },
  googleTxt: { color: "#111318", fontSize: 13, fontWeight: "900", letterSpacing: 0.6 },
  disabled: { opacity: 0.42 },
  configNote: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 13 },
  orLine: { flex: 1, height: 1, backgroundColor: C.line },
  or: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  demo: { backgroundColor: C.gold, borderRadius: 13, minHeight: 50, alignItems: "center", justifyContent: "center" },
  demoTxt: { color: "#120d03", fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  error: { color: C.lo, textAlign: "center", fontSize: 11, marginTop: 10 },
  legal: { color: C.muted, opacity: 0.72, fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 16 },
});
