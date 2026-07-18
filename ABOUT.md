# Hi-Lo Royale ⚽👑

**100 fans enter. One survives the stats.**

Hi-Lo Royale is a mobile prediction battle royale built on real football data.
You join a lobby of 100 fans watching a real World Cup match. Every few minutes
the game fires a prediction question — *"Will there be a goal in the next 10
minutes?"*, *"More corners: Argentina or Switzerland?"*, *"VAR review: upheld or
overturned?"* — and you have seconds to pick a side. Answer wrong (or too slow)
and you're eliminated, live, in front of everyone. Last fan standing takes the
crown.

It was built for the **TxODDS × Solana World Cup hackathon** (July 2026) and
runs on TxODDS's **TxLINE** feed — the same institutional-grade live sports
data that powers bookmakers — with results cryptographically verifiable on the
Solana blockchain.

---

## Why it exists

Live sports betting is engaging but has real-money stakes and regulatory
weight. Hi-Lo Royale keeps the *thrill* — split-second calls, sweating a corner
count, beating the crowd — and swaps money for **survival**. The wager is your
place in the lobby. That makes it:

- **Free to play, viral by design** — losing produces a shareable "death
  replay" card, winning produces a survival ticket. 99 of 100 players lose, so
  the share surface is huge.
- **Provably fair** — every match stat comes from TxODDS's feed, and the final
  score is proven against a Merkle root published **on the Solana blockchain**.
  The result screen has a "VERIFIED ON SOLANA" button that opens the actual
  transaction on a block explorer. That's not marketing copy — it's a real
  on-chain cryptographic proof.

## How a round feels

1. **Lobby** — today's featured real match (a daily rotation over bundled World
   Cup fixtures), a "next round" countdown, and a preview of the hottest
   upcoming predictions.
2. **3-2-1** — you and 99 fans (simulated opponents with varying skill) lock in.
3. **The match replays** as a live feed: goals, cards, corners, VAR reviews
   stream in exactly as they happened, at demo speed (configurable: real-time
   up to 60×).
4. **~10 rounds per match**, each a different question type:
   - **Pregame prop** — "Goal before halftime?"
   - **Occurrence bets** — "A card in the next 10 minutes?" (YES/NO)
   - **Team head-to-heads** — "More shots: ARG or SWI?" (pick a side)
   - **Halftime special** — "Substitutions in the first 10 min of the 2nd half?"
   - **VAR reactive** — fires at the real VAR moment: "UPHELD or OVERTURNED?"
   - **Classic hi-lo** — "More corners this window than the last?"
5. **The crowd bar** shows how the other 99 are splitting in real time. Rare
   correct picks earn more points than following the herd (crowd-difficulty
   scoring), so beating the crowd is the skill ceiling.
6. **Elimination cascade** — wrong answers die with haptic ticks; a heartbeat
   timer and panic-red countdown ratchet the pressure.
7. **Result** — survival ticket or death replay, points breakdown
   (predictions + survival + crown bonus), earned badges (Ice Veins, Crowd
   Breaker, Comeback King, Perfect Round), image share to WhatsApp/Instagram,
   and a **ghost challenge link** so a friend can replay the exact same match
   against your recorded picks.

## The tech

**App**: React Native / Expo (SDK 54), TypeScript, plain StyleSheet — no UI
framework. Neon "sports broadcast" design language: black arena, cyan-vs-red
duel colors, gold for rewards, glowing borders, heavy italic display type.
Haptics everywhere; local push notifications for lobby reminders and survival
moments.

**Data — real, not mocked**: match events come from TxODDS's TxLINE API
(devnet). Access itself is on-chain: a Solana wallet subscribed to the txoracle
program, activated an API token by signing the transaction, and pulled full
historical score streams. Raw pulls are compacted into bundled "replay tapes"
(`ios/src/lib/real-data/*.ts`) so the phone needs no network or credentials to
replay a real match. Three real fixtures ship today, rotating as a daily lobby.

**The question engine** (`game-logic.ts`, mirrored in JS for the companion web
build, ~100 unit tests): because a replay's events are fully known up front,
the entire round schedule — every question's timing, kind, and correct answer —
is **precomputed** before the lobby starts. That's what makes the VAR-reactive
round, the pregame prop, and the "up next" queue trivial: they're entries in
one ordered array. The builder also balances the hi/lo answer mix (so blindly
smashing one button never wins) and avoids repeating question topics
back-to-back.

**On-chain proof**: a real `validateStatV2` transaction on the TxODDS Solana
devnet program proves the featured fixture's final score (home goals − away
goals > 0) against the Merkle root TxODDS publishes on-chain. The transaction
signature ships inside the app as data — no wallet or keys in the bundle — and
renders as a tappable Solscan link on every result ticket.

**Identity & social rails**: guest sign-in (Google OAuth is code-complete,
pending client IDs), squad rooms with `hiloroyale://squad/CODE` invite deep
links, ghost-challenge deep links, and a zero-dependency room/presence server
(`ios/server/room-server.js`, SSE-based) for cross-device lobby demos.

## What's real vs. simulated (honest ledger)

| Real | Simulated (for now) |
|---|---|
| Match events, timings, scores (TxLINE feed) | The other 99 fans (skill-varied bots) |
| On-chain data subscription + API token | Global leaderboard (local + this-lobby only) |
| On-chain final-score proof (Solscan-verifiable) | Squad presence (needs the room server running) |
| Question schedule derived from real events | "Live mode" (wired, needs a match in play + token) |
| Your streaks, badges, points (persisted on device) | |

## What's next

- **Daily Lobby as ritual** — same match for everyone each day, streak
  calendar with a streak freeze (the Wordle/Duolingo retention loop).
- **All-in doubler** — once per match, stake your streak on one question.
- **Sudden-death finale** — 3-second windows when only a few fans remain.
- **Real multiplayer** — promote the room server to a hosted service so
  lobbies, squads, and rivals are real people; rival assignments + stateful
  push ("your rival just passed you").
- **Live-match lobbies** — the engine already streams SSE; during a real match
  window, questions cut from the live feed instead of a replay.
- **More sports** — TxODDS ships US Football and Basketball feed specs; the
  stat-window engine generalizes.
- **On-chain crowns** — settle each lobby winner's crown as its own
  transaction so every crown in a profile is independently verifiable.

## Try it / see it

- **Code**: [lordofclaude/hilo-royale](https://github.com/lordofclaude/hilo-royale) —
  iOS app in `ios/`, companion web build in `web/`, bundled real-match data in
  `shared/`. (The on-chain settlement scripts live in the hackathon monorepo.)
- **On your iPhone**: install Expo Go, then open the dev tunnel link while the
  dev machine is serving (`corepack pnpm tunnel` in the app folder).
- **The on-chain proof**: [tx 47rYc5tp…uRdhA on Solscan (devnet)](https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet)
  — the program returns `true`, proving Argentina 3–1 Switzerland against the
  on-chain root.

---

*Built in ~48 hours with real data, a real on-chain settlement, and no mock
theater — the parts that are simulated say so on the tin.*
