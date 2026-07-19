/* AUTO-GENERATED from onchain/vrf-proof.json (node onchain/request-vrf.js).
   A REAL ORAO VRF randomness request fulfilled on Solana devnet. Every piece
   of lobby "luck" — bot skills, bot picks and their timing, elimination
   shuffle order — derives from this randomness through a deterministic PRNG.
   The transaction proves this reusable seed source; a per-lobby commitment and
   output transcript are not shipped yet. */
export const VRF_PROOF = {
  "network": "devnet",
  "program": "ORAO VRF",
  "payer": "CzRXXbfFk11w5Nue5izgL5VwQTkHY8e2mpfxSBssvc6j",
  "seed": "afeefff11a51fabe8a4b1c21252b6eaa5e6b8f6c3137bf0a0df86f9877461521",
  "randomness": "c0b59b2a8130477edbac5a19630524fa8894c5b9b2f716beea99764d427fb38f9cfe32e6b765ed24f4cc3bffd5bc6136cecef282a893430f45e4bab266048e00",
  "requestTx": "4Fn4icgVJEftWm5TuWKWejY3p1adboCydqvragTyEXrsN6yBPx12bdeynrsW6pkuFR3xgMYovV3bXp7DTEuuwikH",
  "requestedAt": "2026-07-18T22:44:32.929Z",
} as const;

export const VRF_EXPLORER_URL = `https://solscan.io/tx/${VRF_PROOF.requestTx}?cluster=devnet`;

/** Deterministic 32-bit PRNG (mulberry32) — same generator as the web build. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh lobby RNG seeded from the bundled on-chain randomness. Create one
 *  per lobby/game mount so the prototype simulation replays deterministically. */
export function lobbyRng(): () => number {
  const seed =
    parseInt(VRF_PROOF.randomness.slice(0, 8), 16) ^
    parseInt(VRF_PROOF.randomness.slice(8, 16), 16);
  return mulberry32(seed);
}
