# Hi-Lo Royale

**100 fans enter. One survives the stats.**

Hi-Lo Royale is a prediction battle royale built on real football data.
You join a lobby of 100 fans watching a real World Cup match. Every few minutes
the game fires a prediction question — *"Will there be a goal in the next 10
minutes?"*, *"More corners: France or England?"*, *"France's win probability in
10 minutes: higher or lower?"* — and you have seconds to pick a side. Answer
wrong (or too slow) and you're eliminated, live, in front of everyone. Last fan
standing takes the crown.

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
   - **Occurrence bets** — "A corner in the next 10 minutes?" (YES/NO)
   - **Team head-to-heads** — "More corners: FRA or ENG?" (pick a side)
   - **Odds swing** — "France's win probability in 10 minutes: HIGHER or
     LOWER?" — settled against the real TxLINE 1X2 series
   - **Next goal / goals over-under** — "Who scores next?", "Over 2.5 by the
     75th?"
   - **VAR reactive** — fires at the real VAR moment: "UPHELD or OVERTURNED?"
     (only on tapes that actually contain a VAR review)
   - **Classic hi-lo** — "More corners this window than the last?"

   The engine is **stat-aware**: it inspects each tape and only asks about
   stats with real signal in that match's capture. A tape with only goals and
   corners never generates a shots or cards question.
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
framework — plus a dependency-free vanilla-JS web build deployed at
[hilo-royale.vercel.app](https://hilo-royale.vercel.app). Shared "sports
broadcast" design language across both: black arena, duel colors, gold for
rewards, heavy italic display type (Cabinet Grotesk) with DM Sans body, SVG
iconography throughout — no emoji anywhere in the UI. Haptics everywhere on
iOS; local push notifications for lobby reminders and survival moments.

**Data — real, not mocked**: match events come from TxODDS's TxLINE API
(devnet). Access itself is on-chain: a Solana wallet subscribed to the txoracle
program, activated an API token by signing the transaction, and pulled full
historical score streams plus the 5-minute StablePrice odds intervals covering
each match. Raw pulls are compacted into bundled "replay tapes"
(`ios/src/lib/real-data/*.ts`, mirrored in `web/lobbies.js`) so no network or
credentials are needed to replay a real match. Four real fixtures ship today —
including the France–England quarter-final captured live on 2026-07-18 —
rotating as a daily lobby, each carrying its real 1X2 win-probability series
(normalized to `{p1, draw, p2}` percentages per match minute).

**Live mode — a real TxLINE consumer, not just a replayer**: when a fixture is
inside its live window, the web app polls the TxLINE feed through a serverless
proxy (`web/api/txline.js`, modes for 1X2 odds, raw odds, and score updates).
The proxy keeps the JWT and API token server-side; the client
(`web/live-feed.js`) polls the ~5-minute update windows, accumulates them, and
dedupes by `Seq` — because TxLINE's updates endpoints only serve the current
window, the client has to do its own history-keeping. Everything degrades
gracefully: no credentials or no live match means replay mode, with the UI
saying which one you're in.

**The question engine v2** (`web/game-logic.js`, mirrored in TypeScript for
the iOS app, unit-tested via `node web/test.js`): because a replay's events are
fully known up front, the entire round schedule — every question's timing,
kind, and correct answer — is **precomputed** before the lobby starts. That's
what makes the VAR-reactive round, the pregame prop, and the "up next" queue
trivial: they're entries in one ordered array. v2 makes the builder
**stat-aware**: it derives the set of stats a tape actually has signal for and
only asks about those, requires occurrence questions to have a non-degenerate
base rate (no free "obviously NO" rounds), and adds three kinds driven by the
real odds series — `odds_swing` (win probability higher/lower at a future
minute), `next_goal` (which team scores next), and `goals_ou` (total goals
over/under). The builder still balances the hi/lo answer mix (so blindly
smashing one button never wins) and avoids repeating topics back-to-back.

**On-chain proof**: a real `validateStatV2` transaction on the TxODDS Solana
devnet program proves the featured fixture's final score (home goals − away
goals > 0) against the Merkle root TxODDS publishes on-chain. The transaction
signature ships inside the app as data — no wallet or keys in the bundle — and
renders as a tappable Solscan link on every result ticket.

**Provably fair lobbies (ORAO VRF)**: every piece of lobby "luck" — the 99
bots' skills, their picks and timing, elimination-cascade order, tie-breaks —
derives from a real [ORAO VRF](https://github.com/orao-network/solana-vrf)
verifiable-randomness request fulfilled on Solana devnet
(`onchain/request-vrf.js` makes the request; the fulfilled randomness seeds a
deterministic PRNG shared by both apps). The request transaction is a tappable
Solscan link in both UIs, so the same lobby is reproducible and auditable by
anyone.

**Round lifecycle = Solora's lock→settle state machine**: each round runs the
exact event lifecycle of
[meditatingsloth/solora-anchor](https://github.com/meditatingsloth/solora-anchor)'s
`solora-pyth-price` program, with the TxLINE StablePrice win-probability
standing in for the Pyth feed:

| solora-anchor (on-chain) | Hi-Lo round (in-app today) |
|---|---|
| `create_event` (start/lock time, wait period) | round opens, pick window starts |
| `create_order` Up/Down before `lock_time` | your hi/lo pick before the timer |
| `set_lock_price` from Pyth at lock | win-% reading frozen at lock |
| wait period → `settle_event` | window plays out → settle from the feed |
| `Outcome::Up / Down / Same` | hi / lo / push (push = everyone survives) |
| `Outcome::Invalid` (oracle unavailable) | round voided, nobody eliminated |
| `up_count` / `down_count` | the crowd split bar |

Field and outcome names are kept 1:1 in the web engine (`createEvent`,
`lockEvent`, `settleEvent`, `Undrawn/Invalid/Up/Down/Same`), so taking rounds
on-chain is a program deployment, not a rewrite.

**Identity & social rails**: guest sign-in (Google OAuth is code-complete,
pending client IDs), squad rooms with `hiloroyale://squad/CODE` invite deep
links, ghost-challenge deep links, and a zero-dependency room/presence server
(`ios/server/room-server.js`, SSE-based) for cross-device lobby demos.

## What's real vs. simulated (honest ledger)

| Real | Simulated (for now) |
|---|---|
| Match events, timings, scores (TxLINE feed) | The other 99 fans (bots — but ORAO-VRF-seeded, so provably fair) |
| The 1X2 win-probability series behind odds questions (TxLINE StablePrice) | Global leaderboard (local + this-lobby only) |
| Live odds/score polling during a match window — real TxLINE data via `/api/txline` **when server credentials are configured**; replay tapes otherwise | Squad presence (needs the room server running) |
| On-chain data subscription + API token | |
| On-chain final-score proof (Solscan-verifiable) | |
| Question schedule derived from real events + real odds | |
| Your streaks, badges, points (persisted on device) | |

## Shipped since the first cut (July 18 upgrade)

- **Live TxLINE polling in the web app** — `/api/txline` serverless proxy +
  `window.LiveFeed` client: live 1X2 odds and score windows during a match,
  credentials server-side, graceful replay fallback.
- **Question engine v2** — stat-aware generation plus `odds_swing`,
  `next_goal`, and `goals_ou` kinds settled from the real odds series.
- **France–England quarter-final tape rebuilt** — the raw capture had
  out-of-order sequence numbers (stats briefly regressed mid-tape); the tape
  is now rebuilt from raw updates, deduped by `Seq`, with monotonic cumulative
  stats and the normalized odds series attached.
- **Ghost-challenge share links in the web app** — a compact URL encodes your
  exact run (picks, timing, streak) so a friend replays the same match against
  your ghost.
- **Design pass** — Cabinet Grotesk + DM Sans, SVG iconography, no emoji in
  any UI string, across web and iOS.

## What's next

- **Daily Lobby as ritual** — same match for everyone each day, streak
  calendar with a streak freeze (the Wordle/Duolingo retention loop).
- **All-in doubler** — once per match, stake your streak on one question.
- **Sudden-death finale** — 3-second windows when only a few fans remain.
- **Real multiplayer** — promote the room server to a hosted service so
  lobbies, squads, and rivals are real people; rival assignments + stateful
  push ("your rival just passed you").
- **Full live-match lobbies** — live odds/score polling shipped (see above)
  and the iOS live service already consumes the SSE stream; the remaining step
  is cutting question windows from the live feed end-to-end during a real
  match, with no precomputed answers.
- **More sports** — TxODDS ships US Football and Basketball feed specs; the
  stat-window engine generalizes.
- **On-chain crowns** — settle each lobby winner's crown as its own
  transaction so every crown in a profile is independently verifiable.
- **Rounds on-chain** — deploy the solora-anchor `solora-pyth-price` program
  (the in-app engine already mirrors its state machine 1:1, see "The tech")
  with a TxLINE-oracle adapter in place of Pyth, so locks and settlements are
  themselves on-chain transactions.
- **Staked lobbies** — when lobbies carry real stakes, escrow the pot per
  lobby and pay the survivors from it on settlement, following the
  [dariusjvc/solana-escrow-gambling](https://github.com/dariusjvc/solana-escrow-gambling)
  escrow pattern (deposit → locked pot → programmatic payout). Deliberately a
  roadmap item: Hi-Lo is stakes-free today, and stays that way until the
  multiplayer + compliance story is real.

## Try it / see it

- **In your browser, right now**: [hilo-royale.vercel.app](https://hilo-royale.vercel.app)
- **Code**: [lordofclaude/hilo-royale](https://github.com/lordofclaude/hilo-royale) —
  deployed web app in `web/`, iOS app in `ios/`, bundled real-match data in
  `shared/`. (The on-chain settlement scripts live in the hackathon monorepo.)
- **On your iPhone**: install Expo Go, then open the dev tunnel link while the
  dev machine is serving (`corepack pnpm tunnel` in the app folder).
- **The on-chain proof**: [tx 47rYc5tp…uRdhA on Solscan (devnet)](https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet)
  — the program returns `true`, proving Argentina 3–1 Switzerland against the
  on-chain root.
- **The VRF proof**: [tx 4Fn4icgV…uwikH on Solscan (devnet)](https://solscan.io/tx/4Fn4icgVJEftWm5TuWKWejY3p1adboCydqvragTyEXrsN6yBPx12bdeynrsW6pkuFR3xgMYovV3bXp7DTEuuwikH?cluster=devnet)
  — the ORAO VRF request whose fulfilled randomness seeds lobby luck.

---

*Built in ~48 hours with real data, a real on-chain settlement, and no mock
theater — the parts that are simulated say so on the tin.*
