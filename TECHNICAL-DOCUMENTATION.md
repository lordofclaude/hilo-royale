# Hi-Lo Royale — Technical Documentation

**TxODDS × Solana World Cup Hackathon · Track 2 (Consumer & Fan Experiences)**
Live: [hilo-royale.vercel.app](https://hilo-royale.vercel.app) · Repo: [github.com/lordofclaude/hilo-royale](https://github.com/lordofclaude/hilo-royale)

This document is the single technical reference for judges: system architecture, the TxLINE integration, the on-chain proof layer, the game engine internals, and an explicit ledger of what is live today versus what is roadmap. Companion docs: [ABOUT.md](ABOUT.md) (product story), [PROJECT-STATUS.md](PROJECT-STATUS.md) (build status), [SUBMISSION.md](SUBMISSION.md) (form + demo script).

---

## 1. System overview

Hi-Lo Royale is a 100-player prediction battle royale played on real World Cup matches. Every question a player answers, and its correct answer, is a deterministic function of TxODDS's institutional **TxLINE** feed — never hand-authored trivia. Two platforms (a dependency-free web app and an Expo/React Native iOS app) share one canonical game engine and one canonical data format, so a match plays out identically on both.

```
                         ┌─────────────────────────────┐
                         │   TxODDS TxLINE (devnet)     │
                         │   institutional sports feed  │
                         └──────────────┬────────────────┘
                                         │ on-chain subscribe (txoracle program)
                                         │ + POST /api/token/activate
                                         ▼
                         ┌─────────────────────────────┐
                         │   API token (JWT + token)    │
                         └──────────────┬────────────────┘
              ┌──────────────────────────┼──────────────────────────┐
              ▼                                                     ▼
   ┌─────────────────────┐                                ┌─────────────────────┐
   │  Historical capture  │                                │   Live window feed   │
   │  scores + odds       │                                │   /updates + SSE      │
   └──────────┬────────────┘                                └──────────┬────────────┘
              ▼                                                        ▼
   ┌─────────────────────┐                                ┌─────────────────────┐
   │  Canonical replay    │                                │  Vercel serverless   │
   │  tapes (6 fixtures)  │                                │  proxy — creds never  │
   │  shared/real-data/*  │                                │  reach the client     │
   └──────────┬────────────┘                                └──────────┬────────────┘
              └───────────────────────┬──────────────────────────────┘
                                       ▼
                         ┌─────────────────────────────┐
                         │   buildSchedule (engine v2)   │
                         │   stat-aware question builder │
                         └──────────────┬────────────────┘
                    ┌──────────────────┴──────────────────┐
                    ▼                                      ▼
         ┌───────────────────┐                  ┌───────────────────┐
         │  Web client         │                  │  iOS client (Expo)  │
         │  vanilla JS, 3 pages│                  │  RN/TS, 9 screens   │
         └───────────────────┘                  └───────────────────┘
                    │                                      │
                    └──────────────────┬───────────────────┘
                                        ▼
                         ┌─────────────────────────────┐
                         │        Solana devnet          │
                         │  validateStatV2 (score proof) │
                         │  ORAO VRF (randomness proof)  │
                         └─────────────────────────────┘
```

---

## 2. Repository map

```
hilo-royale/
├── web/          deployed app (hilo-royale.vercel.app) — dependency-free vanilla JS
│                 game-logic.js (593 lines, engine v2), live-feed.js (459 lines),
│                 api/ (serverless TxLINE proxy), 159 unit tests (test.js)
├── ios/          Expo (SDK 54) React Native + TypeScript app, 9 screens,
│                 shares the same engine contract as web
├── shared/       canonical TxLINE client (txline-real.js, 887 lines) + real match
│                 captures compiled into replay tapes, used by both clients
├── onchain/      ORAO VRF request script + fulfilled randomness proof (Anchor 0.30.1,
│                 @solana/web3.js 1.95.8, @orao-network/solana-vrf)
└── *.md          product/architecture/submission docs (this file included)
```

**Stack:** TypeScript + React Native/Expo (iOS), dependency-free vanilla JS (web), Node.js serverless functions on Vercel, Solana web3.js + Anchor for on-chain calls, ORAO VRF SDK. No UI framework on either client — hand-built design system, zero emoji, SVG iconography, Cabinet Grotesk + DM Sans typography.

---

## 3. TxLINE integration — the data layer

Everything data-shaped in this project originates from TxODDS's TxLINE API. Access is gated on-chain, not by a static API key:

1. A Solana wallet issues an on-chain `subscribe` instruction against the **txoracle program**.
2. `POST /api/token/activate` exchanges that subscription for an `X-Api-Token`.
3. `POST /auth/guest/start` mints a 30-day guest JWT.
4. Every subsequent call carries both headers: `Authorization: Bearer <jwt>` and `X-Api-Token: <token>`.

| Endpoint | Purpose |
|---|---|
| `POST /auth/guest/start` | guest JWT (30-day) |
| on-chain `subscribe` (txoracle program) + `POST /api/token/activate` | on-chain API key activation |
| `GET /api/fixtures/snapshot?startEpochDay=` | fixture metadata (teams, kickoff, competition) |
| `GET /api/scores/historical/{fixtureId}` | full score history — source of every bundled replay tape |
| `GET /api/scores/updates/{fixtureId}` | live mode: current ~5-min score window |
| `GET /api/odds/updates/{fixtureId}` | live mode: current ~5-min StablePrice window (1X2 win-probability) |
| `GET /api/odds/updates/{epochDay}/{hourOfDay}/{interval}?fixtureId=` | historical 5-min odds intervals bundled into tapes |
| `SSE GET /api/scores/stream?fixtureId=` | real-time score stream (iOS: `ios/src/lib/live-service.ts`) |
| `GET /api/scores/stat-validation?fixtureId=&seq=&statKeys=` | Merkle proofs for individual stats |
| `validateStatV2` (Anchor, devnet program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`) | on-chain final-score proof |

**Historical path (replay tapes):** raw score/odds history is compiled once by `shared/build-real-tapes.js` into `shared/real-data/*.tape.js` — six real World Cup fixtures, deduped by `Seq`, with monotonic cumulative stats and a normalized `{p1, draw, p2}` odds series per match minute. Replay needs zero network access or credentials at play time.

**Live path (real-time consumer, not just a replayer):** when a fixture is inside its live window, `web/live-feed.js` polls `/api/odds/updates` and `/api/scores/updates` through the Vercel serverless proxy `web/api/txline.js`, accumulating each ~5-minute window and deduping by `Seq` (TxLINE's `/updates` endpoints only ever serve the *current* window, so the client owns its own history-keeping). iOS additionally wires the SSE stream through `live-service.ts` for push-based score updates. **Credentials never reach either client bundle** — `TXLINE_JWT` / `TXLINE_API_TOKEN` / `TXLINE_HOST` live only in server-side Vercel project env vars. Without them, the proxy returns `{ok:false, reason:"no-credentials"}` and the app transparently falls back to replay tapes — nothing ever breaks, on stage or off.

---

## 4. Game engine internals

The core insight: because a replay's full event history is known in advance, **the entire round schedule is precomputed** before a lobby starts — every question's timing, type, and correct answer is one entry in an ordered array (`buildSchedule`, `web/game-logic.js`).

Engine v2 is **stat-aware**: it inspects each tape's actual signal (goals, corners, cards, shots, VAR events) and only generates question types the tape can support — a tape with only goals and corners never produces a shots question. It also:
- enforces a non-degenerate base rate on occurrence questions (no free "obviously NO" rounds),
- balances the hi/lo answer distribution so blindly mashing one button can't win,
- avoids repeating the same topic on consecutive rounds,
- derives three odds-driven question kinds directly from the real 1X2 series: `odds_swing` (win-probability higher/lower at a future minute), `next_goal`, and `goals_ou` (over/under).

A featured fixture (France–England) runs an 11-round schedule spanning pregame props, occurrence bets, team side-picks, odds-swing rounds settled against the real 1X2 series, next-goal, goals over/under, a halftime special, and a VAR-reactive round that fires at the actual VAR review moment in the capture.

**Round lifecycle** is modeled 1:1 on [`meditatingsloth/solora-anchor`](https://github.com/meditatingsloth/solora-anchor)'s `solora-pyth-price` on-chain state machine, with TxLINE's StablePrice standing in for Pyth:

| solora-anchor (on-chain) | Hi-Lo round (in-app today) |
|---|---|
| `create_event` (start/lock time) | round opens, pick window starts |
| `create_order` Up/Down before `lock_time` | your hi/lo pick before the timer |
| `set_lock_price` from Pyth at lock | win-% reading frozen at lock |
| wait period → `settle_event` | window plays out → settle from the feed |
| `Outcome::Up / Down / Same` | hi / lo / push (push = everyone survives) |
| `Outcome::Invalid` (oracle unavailable) | round voided, nobody eliminated |
| `up_count` / `down_count` | the live crowd-split bar |

Field and outcome names (`createEvent`, `lockEvent`, `settleEvent`, `Undrawn/Invalid/Up/Down/Same`) are kept identical in the web engine, so moving round settlement on-chain is a program deployment against the existing state machine, not a rewrite.

---

## 5. On-chain proof layer (Solana devnet)

Two real, independently verifiable devnet transactions anchor the trust story:

| Proof | What it verifies | Link |
|---|---|---|
| **Settlement** (`validateStatV2`) | Argentina 3–1 Switzerland final score, checked against the Merkle root TxODDS publishes on-chain | [Solscan](https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet) |
| **Lobby randomness** (ORAO VRF) | fulfilled verifiable randomness that seeds every lobby's bot skills, picks, timing, and elimination order via a deterministic PRNG shared by both clients | [Solscan](https://solscan.io/tx/4Fn4icgVJEftWm5TuWKWejY3p1adboCydqvragTyEXrsN6yBPx12bdeynrsW6pkuFR3xgMYovV3bXp7DTEuuwikH?cluster=devnet) |

Both transaction signatures ship inside the app as plain data — no wallet, keys, or signing capability in either client bundle — and render as tappable Solscan links on the result screens ("SCORE PROOF · SOLANA DEVNET", "VERIFIABLE SEED SOURCE — ORAO VRF"). `onchain/request-vrf.js` is the script that produced the VRF request; the on-chain scripts run against Anchor 0.30.1 and `@solana/web3.js` 1.95.8.

---

## 6. Client architecture

**Web** (`web/`) — three pages (`/`, `/login`, `/play`) plus `/pitch`, `/privacy`, and social card generation, built with zero runtime dependencies. `dev-server.js` mirrors Vercel's clean-URL routing locally so `/login`, `/play`, and challenge links behave identically pre- and post-deploy. Canvas-based arena hero (100 live fan dots), bit-packed ghost-challenge share links (<120 chars), and a Merkle-proof-backed result ticket.

**iOS** (`ios/`) — Expo SDK 54, TypeScript, React Native, plain `StyleSheet` (no UI framework). 9 screens behind a floating tab dock: guest + Google-OAuth-ready login, PLAY/RANK/SQUAD/ME tabs, a Settings screen exposing Match Control (replay speed 1×–60×, live toggle). Native haptics, local push notifications, `view-shot`-based share cards, and a zero-dependency SSE room/presence server (`ios/server/room-server.js`) for cross-device demo lobbies.

**Shared contract** — both clients consume the same canonical tape format and the same round-lifecycle field names, so a fixture plays identically whether it's rendered in a browser canvas or a native `StyleSheet` view.

---

## 7. Security & credential handling

- TxLINE JWT and API token are **never bundled into either client**; they exist only as server-side Vercel environment variables (`TXLINE_JWT`, `TXLINE_API_TOKEN`, `TXLINE_HOST`) consumed by the serverless proxy.
- All live data requests are proxied server-side (`web/api/txline.js`, `web/api/txline-stream.js`); the browser and the iOS app only ever talk to the proxy, never to TxLINE directly.
- No wallet keys, seed phrases, or signing authority ship in any client — on-chain proofs are pre-computed transaction signatures rendered as read-only links.
- Guest identity is device-local; no PII is collected at the free-to-play tier.

---

## 8. Testing & verification

```
npm run verify
```
runs the full gate: web engine + integration + share + live-feed + settlement + rooms-API tests, plus the iOS TypeScript typecheck. Individually:

| Suite | File | Covers |
|---|---|---|
| Engine unit tests | `web/test.js` | 159 passing assertions on schedule building, stat-awareness, hi/lo balancing |
| Integration | `web/test-integration.js` | end-to-end round flow |
| Share links | `web/share.test.js` | ghost-challenge encode/decode |
| Live feed | `web/live-feed.test.js` | window polling, Seq dedupe |
| Settlement | `web/settlement.test.js` | solora-style lock→settle outcomes |
| Rooms API | `web/rooms-api.test.js` | squad/room server contract |
| Room server | `ios/server/room-server.test.js` | SSE presence server |
| Arena entry / room client / replay settlement / replay stream | `ios/src/lib/*.test.{mjs,cjs}` | native-side parity with the web engine |
| iOS typecheck | `corepack pnpm --dir ios typecheck` | end-to-end TypeScript soundness |

---

## 9. Honest ledger — real vs. simulated today

Judges reward calibrated claims over marketing copy, so this table is maintained deliberately:

| Real, today | Simulated, today (clearly labeled in-UI) |
|---|---|
| Match events, timings, scores — TxLINE feed | The other 99 fans: VRF-seeded bots, deterministic, labeled |
| 1X2 win-probability series — TxLINE StablePrice | Leaderboard beyond your own stats: local/demo data |
| Live odds/score polling during a match window, credentials server-side | Squad presence (needs the room server running — works on LAN today) |
| On-chain data subscription + API token activation | |
| One Argentina–Switzerland final-score proof (Solscan-verifiable) | |
| One fulfilled ORAO VRF randomness request (Solscan-verifiable) | |
| Question schedule derived entirely from real events + real odds | |
| Round lifecycle mirrors solora-anchor's on-chain state machine 1:1 (runs in-engine; program not yet deployed) | |

---

## 10. Roadmap (explicit — not yet built)

Everything below is the deliberate next step, not a claim about the current build:

- **Deploy the solora-anchor program** with a TxLINE-oracle adapter, so round locks and settlements become real on-chain transactions instead of mirroring the state machine in-engine.
- **Per-lobby VRF commitments** — extend the single fulfilled ORAO request into a per-lobby seed commitment plus a full output transcript.
- **On-chain crowns** — settle each lobby winner as its own transaction, so every crown in a profile is independently verifiable.
- **Staked lobbies** — escrow real stakes per lobby using the [`dariusjvc/solana-escrow-gambling`](https://github.com/dariusjvc/solana-escrow-gambling) deposit → locked pot → programmatic payout pattern. Hi-Lo is deliberately stakes-free today.
- **Hosted multiplayer** — promote `ios/server/room-server.js` from LAN-only to a hosted service for real (not simulated) rivals and a global ladder.
- **Google OAuth** — code-complete client-side, pending production client IDs.
- **More sports** — TxODDS ships US Football and Basketball feed specs; the stat-aware question engine generalizes directly.

---

## 11. Quick verification for judges

```powershell
# Clone and run the engine test suite (no install needed — web build is dependency-free)
git clone https://github.com/lordofclaude/hilo-royale
cd hilo-royale && node web/test.js        # 159 tests

# Play it live — no install required
# https://hilo-royale.vercel.app/login?fixture=18222446&demo=1

# Verify the on-chain proofs directly on Solscan (devnet, no login needed)
# Score proof:  https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet
# VRF proof:    https://solscan.io/tx/4Fn4icgVJEftWm5TuWKWejY3p1adboCydqvragTyEXrsN6yBPx12bdeynrsW6pkuFR3xgMYovV3bXp7DTEuuwikH?cluster=devnet
```

---

*Built in ~48 hours on real TxLINE data, with two independently verifiable Solana devnet transactions and no mock theater — everything simulated is labeled as such in-app and in this document.*
