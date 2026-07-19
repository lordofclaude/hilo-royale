import type { IconName } from "../components/Icon";

export interface BadgeDef { id: string; label: string; icon: IconName; desc: string; }

/* icon = a name from components/Icon.tsx (geometric icon system, no emojis). */
export const BADGE_DEFS: BadgeDef[] = [
  { id: "ice_veins", label: "Ice Veins", icon: "diamond", desc: "Correct pick with under 1.5s left" },
  { id: "comeback_king", label: "Comeback King", icon: "crown", desc: "Survived a near-death round" },
  { id: "perfect_round", label: "Perfect Round", icon: "check", desc: "Every question correct this match" },
  { id: "crowd_breaker", label: "Crowd Breaker", icon: "target", desc: "Correct against the crowd majority" },
];

const BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGE_DEFS.map(b => [b.id, b]));

export function badgeDef(id: string): BadgeDef {
  return BY_ID[id] || { id, label: id, icon: "shield", desc: "" };
}
