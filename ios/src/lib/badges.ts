export interface BadgeDef { id: string; label: string; icon: string; desc: string; }

export const BADGE_DEFS: BadgeDef[] = [
  { id: "ice_veins", label: "Ice Veins", icon: "🧊", desc: "Correct pick with under 1.5s left" },
  { id: "comeback_king", label: "Comeback King", icon: "👑", desc: "Survived a near-death round" },
  { id: "perfect_round", label: "Perfect Round", icon: "💯", desc: "Every question correct this match" },
  { id: "crowd_breaker", label: "Crowd Breaker", icon: "🎯", desc: "Correct against the crowd majority" },
];

const BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGE_DEFS.map(b => [b.id, b]));

export function badgeDef(id: string): BadgeDef {
  return BY_ID[id] || { id, label: id, icon: "🏅", desc: "" };
}
