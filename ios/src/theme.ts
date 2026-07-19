/* Neon sports-broadcast palette — pure black arena, cyan-vs-red duel,
   gold for rewards. Matches the hilo-ios-neon-expanded-flow mockups.
   v2: Apple-native layer — SF system type ramp for UI text, hairline
   separators, neon reserved for duel/reward moments. */
import { StyleSheet, TextStyle, ViewStyle } from "react-native";

export const C = {
  bg: "#050608",
  bgRaised: "#080b10",
  panel: "#0b0e14",
  panelDeep: "#07090d",
  line: "#1c2433",
  lineStrong: "#334057",
  text: "#f4f7fb",
  muted: "#93a1b5",
  accent: "#ffc233",
  accentDeep: "#ff9f1a",
  hi: "#2ee6ff",
  lo: "#ff3b5c",
  gold: "#ffd54a",
  success: "#31f28b",
  warning: "#ffad33",
  hiSoft: "rgba(46,230,255,0.12)",
  loSoft: "rgba(255,59,92,0.12)",
  goldSoft: "rgba(255,213,74,0.10)",
  /* side-pick questions reuse the duel colors: team1 = cyan, team2 = red */
  teamBlue: "#2ee6ff",
  teamBlueSoft: "rgba(46,230,255,0.12)",
};

/** iOS colored glow via shadow props (works on old + new architecture). */
export function glow(color: string, radius = 10, opacity = 0.6): ViewStyle {
  return { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: 0 } };
}

/** Broadcast display type — heavy italic, tight tracking. RESERVED for brand
 *  and hero moments (wordmark, streak number, duel labels), never for UI text. */
export const displayFont: TextStyle = { fontWeight: "900", fontStyle: "italic", letterSpacing: 0.5 };

/** True 1-physical-pixel separator width. */
export const hairline = StyleSheet.hairlineWidth;

/* iOS system type ramp (RN's default iOS font IS San Francisco).
   Tracking values follow Apple's size-specific tracking tables. */
export const type = {
  /** Navigation large title — SF Pro Display Bold 34/41. */
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700", letterSpacing: 0.37, color: "#f4f7fb" } as TextStyle,
  /** Card / section title — SF 22 bold. */
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: 0.35, color: "#f4f7fb" } as TextStyle,
  /** Emphasized row text. */
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.4, color: "#f4f7fb" } as TextStyle,
  /** Body copy. */
  body: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: "#f4f7fb" } as TextStyle,
  /** Secondary line under rows. */
  footnote: { fontSize: 13, lineHeight: 18, letterSpacing: -0.08, color: "#93a1b5" } as TextStyle,
  /** Grouped-list section header — uppercase tracked caption. */
  section: { fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 1.1, textTransform: "uppercase", color: "#93a1b5" } as TextStyle,
  /** Tiny metadata caption. */
  caption: { fontSize: 11, lineHeight: 13, fontWeight: "600", letterSpacing: 0.6, color: "#93a1b5" } as TextStyle,
};

/** Soft ambient card shadow (layered depth without neon). */
export function cardShadow(): ViewStyle {
  return { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } };
}

export const FANS = 100;
export const ME_INDEX = 44;

const NA = ["Atlas","Zizou","Casa","Bleu","Rabat","Paris","Fennec","Desert","Riad","Kylian","Petit","Grand","Nord","Ultra","Vrai","Magic","Turbo","Cosmic","Lucky","Souk"];
const NB = ["Lion","Fox","Eagle","Baller","Keeper","Winger","Nutmeg","Panenka","Rocket","Maestro","Tifo","Drum","Chant","Flare","Scarf","Boot","Volley","Header","Whistle","Casque"];

export function fanName(i: number): string {
  if (i === ME_INDEX) return "YOU";
  return "@" + NA[i % 20] + NB[(i * 7 + 3) % 20] + (i % 4 === 0 ? String(i) : "");
}

export const WALL = [
  { name: "@CasaLionne", points: 2140, crowns: 4 },
  { name: "@PanenkaPriest", points: 1980, crowns: 3 },
  { name: "@TifoTitan", points: 1725, crowns: 3 },
  { name: "@BleuBaller", points: 1510, crowns: 2 },
  { name: "@AtlasUltra", points: 1340, crowns: 2 },
  { name: "@NutmegNadia", points: 1105, crowns: 1 },
  { name: "@DrumOfRabat", points: 930, crowns: 1 },
  { name: "@WoodworkWes", points: 740, crowns: 1 },
  { name: "@StoppageSam", points: 520, crowns: 0 },
  { name: "@VARsighted", points: 310, crowns: 0 },
];
