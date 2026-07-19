/* ============================================================
   Geometric icon system — the iOS mirror of the web SVG sprite
   (i-ball, i-flag, i-target, i-cardy, i-swap, i-monitor, i-crown,
   i-check, i-x, i-heart, i-clock, i-bolt, i-shield, i-up, i-down …).
   react-native-svg is NOT a dependency, so every glyph is drawn with
   plain Views (borders / border-triangles / transforms) plus a few
   guaranteed text-presentation unicode glyphs (✓ ✕ ↗). Zero emojis.
   ============================================================ */
import React from "react";
import { Text, TextStyle, View, ViewStyle } from "react-native";
import { C } from "../theme";

export type IconName =
  | "ball" | "flag" | "target" | "card" | "swap" | "monitor"
  | "crown" | "check" | "x" | "heart" | "clock" | "bolt" | "shield"
  | "up" | "down" | "skull" | "users" | "bell" | "bell-off" | "lock"
  | "share" | "dice" | "chart" | "swords" | "orb" | "diamond"
  | "gear" | "play" | "chain" | "user";

/** Web parity: tape-event type / stat key -> icon (KEY_ICON map on web). */
export const KEY_ICON: Record<string, IconName> = {
  goal: "ball", goals: "ball", penalty: "ball",
  corner: "flag", corners: "flag",
  shot: "target", shots: "target",
  card: "card", cards: "card",
  sub: "swap", subs: "swap",
  var: "monitor",
  kickoff: "play",
};

/** Web parity: question kind -> icon. */
export const KIND_ICON: Record<string, IconName> = {
  compare_window: "chart", side_pick: "swords", occurrence: "orb",
  var_reactive: "monitor", pregame: "ball", halftime_special: "swap",
};

interface Props { name: IconName; size?: number; color?: string; style?: ViewStyle; }

type Dir = "up" | "down" | "right";
function tri(w: number, h: number, color: string, dir: Dir): ViewStyle {
  if (dir === "up") return { width: 0, height: 0, borderLeftWidth: w / 2, borderRightWidth: w / 2, borderBottomWidth: h, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: color };
  if (dir === "down") return { width: 0, height: 0, borderLeftWidth: w / 2, borderRightWidth: w / 2, borderTopWidth: h, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: color };
  return { width: 0, height: 0, borderTopWidth: h / 2, borderBottomWidth: h / 2, borderLeftWidth: w, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: color };
}

export default function Icon({ name, size = 14, color = C.text, style }: Props) {
  const s = size;
  const box: ViewStyle = { width: s, height: s, alignItems: "center", justifyContent: "center", overflow: "visible" };
  const stroke = Math.max(1, s * 0.1);
  const bar = Math.max(1.5, s * 0.12);
  const glyph: TextStyle = { color, fontSize: s * 0.95, lineHeight: s * 1.05, fontWeight: "900", textAlign: "center" };

  switch (name) {
    case "ball":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.9, height: s * 0.9, borderRadius: s, borderWidth: stroke, borderColor: color, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: s * 0.28, height: s * 0.28, borderRadius: s, backgroundColor: color }} />
          </View>
        </View>
      );
    case "flag":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.72, height: s * 0.92 }}>
            <View style={{ position: "absolute", left: 0, top: 0, width: bar, height: s * 0.92, borderRadius: 1, backgroundColor: color }} />
            <View style={{ position: "absolute", left: bar, top: s * 0.05, ...tri(s * 0.52, s * 0.4, color, "right") }} />
          </View>
        </View>
      );
    case "target":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.92, height: s * 0.92, borderRadius: s, borderWidth: stroke, borderColor: color, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: s * 0.52, height: s * 0.52, borderRadius: s, borderWidth: stroke, borderColor: color, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: s * 0.16, height: s * 0.16, borderRadius: s, backgroundColor: color }} />
            </View>
          </View>
        </View>
      );
    case "card":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.56, height: s * 0.78, borderRadius: s * 0.12, backgroundColor: color, transform: [{ rotate: "8deg" }] }} />
        </View>
      );
    case "swap":
      return (
        <View style={[box, style, { flexDirection: "row" }]}>
          <View style={{ alignItems: "center", marginRight: s * 0.08 }}>
            <View style={tri(s * 0.42, s * 0.34, color, "up")} />
            <View style={{ width: bar, height: s * 0.4, backgroundColor: color, marginTop: 1 }} />
          </View>
          <View style={{ alignItems: "center" }}>
            <View style={{ width: bar, height: s * 0.4, backgroundColor: color, marginBottom: 1 }} />
            <View style={tri(s * 0.42, s * 0.34, color, "down")} />
          </View>
        </View>
      );
    case "monitor":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.88, height: s * 0.58, borderWidth: stroke, borderColor: color, borderRadius: s * 0.1 }} />
          <View style={{ width: Math.max(1, s * 0.1), height: s * 0.12, backgroundColor: color }} />
          <View style={{ width: s * 0.46, height: Math.max(1, s * 0.09), borderRadius: 1, backgroundColor: color }} />
        </View>
      );
    case "crown":
      return (
        <View style={[box, style]}>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <View style={tri(s * 0.3, s * 0.4, color, "up")} />
            <View style={tri(s * 0.3, s * 0.58, color, "up")} />
            <View style={tri(s * 0.3, s * 0.4, color, "up")} />
          </View>
          <View style={{ width: s * 0.9, height: s * 0.2, borderRadius: s * 0.04, backgroundColor: color, marginTop: -1 }} />
        </View>
      );
    case "check":
      return <View style={[box, style]}><Text style={glyph} allowFontScaling={false}>✓</Text></View>;
    case "x":
      return <View style={[box, style]}><Text style={glyph} allowFontScaling={false}>✕</Text></View>;
    case "share":
      return <View style={[box, style]}><Text style={glyph} allowFontScaling={false}>↗</Text></View>;
    case "heart":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.78, height: s * 0.74 }}>
            <View style={{ position: "absolute", left: 0, top: 0, width: s * 0.44, height: s * 0.44, borderRadius: s * 0.22, backgroundColor: color }} />
            <View style={{ position: "absolute", right: 0, top: 0, width: s * 0.44, height: s * 0.44, borderRadius: s * 0.22, backgroundColor: color }} />
            <View style={{ position: "absolute", left: s * 0.12, top: s * 0.14, width: s * 0.54, height: s * 0.54, backgroundColor: color, transform: [{ rotate: "45deg" }] }} />
          </View>
        </View>
      );
    case "clock":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.92, height: s * 0.92, borderRadius: s, borderWidth: stroke, borderColor: color }}>
            <View style={{ position: "absolute", left: s * 0.4, top: s * 0.16, width: Math.max(1, s * 0.09), height: s * 0.28, backgroundColor: color }} />
            <View style={{ position: "absolute", left: s * 0.4, top: s * 0.38, width: s * 0.26, height: Math.max(1, s * 0.09), backgroundColor: color }} />
          </View>
        </View>
      );
    case "bolt":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.34, height: s * 0.46, backgroundColor: color, transform: [{ skewX: "-16deg" }, { translateX: s * 0.08 }] }} />
          <View style={{ width: s * 0.34, height: s * 0.46, backgroundColor: color, transform: [{ skewX: "-16deg" }, { translateX: -s * 0.08 }], marginTop: -s * 0.1 }} />
        </View>
      );
    case "shield":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.74, height: s * 0.88, borderWidth: stroke, borderColor: color, borderTopLeftRadius: s * 0.12, borderTopRightRadius: s * 0.12, borderBottomLeftRadius: s * 0.42, borderBottomRightRadius: s * 0.42, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: s * 0.18, height: s * 0.18, borderRadius: s, backgroundColor: color }} />
          </View>
        </View>
      );
    case "up":
      return <View style={[box, style]}><View style={tri(s * 0.8, s * 0.6, color, "up")} /></View>;
    case "down":
      return <View style={[box, style]}><View style={tri(s * 0.8, s * 0.6, color, "down")} /></View>;
    case "play":
      return <View style={[box, style]}><View style={tri(s * 0.62, s * 0.74, color, "right")} /></View>;
    case "skull":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.76, height: s * 0.6, borderTopLeftRadius: s * 0.38, borderTopRightRadius: s * 0.38, borderBottomLeftRadius: s * 0.12, borderBottomRightRadius: s * 0.12, backgroundColor: color, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: s * 0.15, height: s * 0.15, borderRadius: s, backgroundColor: C.bg, marginRight: s * 0.1 }} />
            <View style={{ width: s * 0.15, height: s * 0.15, borderRadius: s, backgroundColor: C.bg }} />
          </View>
          <View style={{ flexDirection: "row", marginTop: s * 0.04 }}>
            <View style={{ width: s * 0.1, height: s * 0.16, backgroundColor: color, marginRight: s * 0.08 }} />
            <View style={{ width: s * 0.1, height: s * 0.16, backgroundColor: color }} />
          </View>
        </View>
      );
    case "user":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.36, height: s * 0.36, borderRadius: s, backgroundColor: color }} />
          <View style={{ width: s * 0.66, height: s * 0.34, borderTopLeftRadius: s * 0.33, borderTopRightRadius: s * 0.33, backgroundColor: color, marginTop: s * 0.05 }} />
        </View>
      );
    case "users":
      return (
        <View style={[box, style, { flexDirection: "row", alignItems: "flex-end", justifyContent: "center" }]}>
          <View style={{ alignItems: "center", marginRight: -s * 0.1, opacity: 0.55 }}>
            <View style={{ width: s * 0.3, height: s * 0.3, borderRadius: s, backgroundColor: color }} />
            <View style={{ width: s * 0.46, height: s * 0.28, borderTopLeftRadius: s * 0.23, borderTopRightRadius: s * 0.23, backgroundColor: color, marginTop: s * 0.04 }} />
          </View>
          <View style={{ alignItems: "center" }}>
            <View style={{ width: s * 0.34, height: s * 0.34, borderRadius: s, backgroundColor: color }} />
            <View style={{ width: s * 0.52, height: s * 0.3, borderTopLeftRadius: s * 0.26, borderTopRightRadius: s * 0.26, backgroundColor: color, marginTop: s * 0.04 }} />
          </View>
        </View>
      );
    case "bell":
    case "bell-off":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.6, height: s * 0.54, borderTopLeftRadius: s * 0.3, borderTopRightRadius: s * 0.3, backgroundColor: color }} />
          <View style={{ width: s * 0.86, height: Math.max(1, s * 0.09), borderRadius: 1, backgroundColor: color, marginTop: s * 0.03 }} />
          <View style={{ width: s * 0.16, height: s * 0.12, borderBottomLeftRadius: s * 0.08, borderBottomRightRadius: s * 0.08, backgroundColor: color, marginTop: s * 0.02 }} />
          {name === "bell-off" && (
            <View style={{ position: "absolute", width: s * 1.1, height: bar, backgroundColor: color, borderWidth: 1, borderColor: C.bg, transform: [{ rotate: "-45deg" }] }} />
          )}
        </View>
      );
    case "lock":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.5, height: s * 0.38, borderTopLeftRadius: s * 0.25, borderTopRightRadius: s * 0.25, borderWidth: stroke, borderBottomWidth: 0, borderColor: color, marginBottom: -s * 0.02 }} />
          <View style={{ width: s * 0.72, height: s * 0.5, borderRadius: s * 0.1, backgroundColor: color }} />
        </View>
      );
    case "dice":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.86, height: s * 0.86, borderRadius: s * 0.18, borderWidth: stroke, borderColor: color, padding: s * 0.1, justifyContent: "space-between" }}>
            <View style={{ width: s * 0.14, height: s * 0.14, borderRadius: s, backgroundColor: color, alignSelf: "flex-start" }} />
            <View style={{ width: s * 0.14, height: s * 0.14, borderRadius: s, backgroundColor: color, alignSelf: "center" }} />
            <View style={{ width: s * 0.14, height: s * 0.14, borderRadius: s, backgroundColor: color, alignSelf: "flex-end" }} />
          </View>
        </View>
      );
    case "chart":
      return (
        <View style={[box, style, { flexDirection: "row", alignItems: "flex-end", justifyContent: "center" }]}>
          <View style={{ width: s * 0.2, height: s * 0.4, borderRadius: 1, backgroundColor: color, marginRight: s * 0.08 }} />
          <View style={{ width: s * 0.2, height: s * 0.85, borderRadius: 1, backgroundColor: color, marginRight: s * 0.08 }} />
          <View style={{ width: s * 0.2, height: s * 0.6, borderRadius: 1, backgroundColor: color }} />
        </View>
      );
    case "swords":
      return (
        <View style={[box, style]}>
          <View style={{ position: "absolute", width: bar, height: s * 0.94, borderRadius: 1, backgroundColor: color, transform: [{ rotate: "45deg" }] }} />
          <View style={{ position: "absolute", width: bar, height: s * 0.94, borderRadius: 1, backgroundColor: color, transform: [{ rotate: "-45deg" }] }} />
        </View>
      );
    case "orb":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.6, height: s * 0.6, borderWidth: stroke, borderColor: color, transform: [{ rotate: "45deg" }] }} />
        </View>
      );
    case "diamond":
      return (
        <View style={[box, style]}>
          <View style={{ width: s * 0.58, height: s * 0.58, backgroundColor: color, transform: [{ rotate: "45deg" }] }} />
        </View>
      );
    case "gear":
      return (
        <View style={[box, style]}>
          <View style={{ position: "absolute", width: bar, height: s * 0.96, borderRadius: 1, backgroundColor: color }} />
          <View style={{ position: "absolute", width: s * 0.96, height: bar, borderRadius: 1, backgroundColor: color }} />
          <View style={{ position: "absolute", width: bar, height: s * 0.96, borderRadius: 1, backgroundColor: color, transform: [{ rotate: "45deg" }] }} />
          <View style={{ width: s * 0.62, height: s * 0.62, borderRadius: s, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: s * 0.24, height: s * 0.24, borderRadius: s, backgroundColor: C.bg }} />
          </View>
        </View>
      );
    case "chain":
      return (
        <View style={[box, style]}>
          <View style={{ position: "absolute", left: s * 0.02, top: s * 0.02, width: s * 0.52, height: s * 0.34, borderRadius: s * 0.17, borderWidth: stroke, borderColor: color, transform: [{ rotate: "45deg" }] }} />
          <View style={{ position: "absolute", right: s * 0.02, bottom: s * 0.02, width: s * 0.52, height: s * 0.34, borderRadius: s * 0.17, borderWidth: stroke, borderColor: color, transform: [{ rotate: "45deg" }] }} />
        </View>
      );
    default:
      return <View style={[box, style]} />;
  }
}
