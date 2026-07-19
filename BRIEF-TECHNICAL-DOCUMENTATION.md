# Hi-Lo Royale — Brief Technical Documentation

**TxODDS × Solana World Cup Hackathon · Track 2 (Consumer & Fan Experiences)**

▶️ [**Play it live**](https://hilo-royale.vercel.app) · 💻 [Repo](https://github.com/lordofclaude/hilo-royale) · 🔗 [Score proof (Solscan)](https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet) · 🎲 [VRF proof (Solscan)](https://solscan.io/tx/4Fn4icgVJEftWm5TuWKWejY3p1adboCydqvragTyEXrsN6yBPx12bdeynrsW6pkuFR3xgMYovV3bXp7DTEuuwikH?cluster=devnet)

```
TxODDS TxLINE (devnet, on-chain gated) → replay tapes + live polling/SSE
    → stat-aware question engine → web + iOS clients → Solana devnet proofs
```

---

## Core idea

Live sports betting is thrilling but carries real-money stakes and regulatory weight. **Hi-Lo Royale keeps the thrill and swaps money for survival**: 100 fans join a lobby on a real World Cup match, every few minutes a prediction question fires — goal in the next 10? more corners FRA or ENG? win probability higher or lower in 10 minutes? — wrong or slow answers are eliminated live in a public cascade, and the last fan standing takes the crown.

Every question and its correct answer is a **deterministic function of TxODDS's TxLINE feed** — never hand-authored trivia — and the featured fixture's final score is provable on Solana devnet.

---

## Highlights

### Business
- **Free-to-play, viral by construction** — 99 of 100 players lose, and losing produces the share artifact: a death-replay card plus a **ghost-challenge link** that replays your exact recorded run against a friend. Winning produces a survival ticket. Either way, the result *is* the growth loop.
- **Monetization path** — sponsored and branded lobbies for clubs, broadcasters, and brands; cosmetic crowns and ticket-card themes. The core fan product stays free.
- **Format, not a betting clone** — the battle royale structure turns one live feed into ~10 pieces of scheduled content per match, and the wager is your place in the lobby, not money — no regulatory surface.

### Technical
- **Real data, the hard way** — TxLINE access is gated on-chain: a Solana wallet subscribes to the txoracle program, activates an API token by signature, then pulls historical scores and 5-minute StablePrice odds windows. Six real World Cup fixtures are compiled into canonical replay tapes shared by both clients.
- **A real live consumer, not just a replayer** — during a match window, the web app polls TxLINE's `/updates` endpoints through a credentials-server-side Vercel proxy, dedupes by `Seq`, and accumulates its own window history; iOS additionally consumes the live SSE score stream. No credentials in either client bundle. No live match or no credentials → graceful fallback to real captured replay, never a dead app.
- **Stat-aware question engine** — the full round schedule (timing, type, correct answer) is precomputed from real events + the real 1X2 odds series, only asks about stats a given tape actually has signal for, and includes a VAR-reactive round that fires at the real VAR review moment. 159 unit tests passing (`node web/test.js`).
- **Two independent Solana devnet proofs, both Solscan-verifiable**:
  - `validateStatV2` proves the Argentina 3–1 Switzerland final score against TxODDS's on-chain Merkle root.
  - A fulfilled **ORAO VRF** request supplies the verifiable randomness seed behind every lobby's simulated rivals.
- **Round lifecycle mirrors [`solora-anchor`](https://github.com/meditatingsloth/solora-anchor)'s on-chain lock→settle state machine field-for-field**, with TxLINE's StablePrice standing in for Pyth — so taking rounds on-chain is a program deployment against existing code, not a rewrite.
- **Two shipped clients, one engine** — a dependency-free vanilla-JS web app and an Expo (SDK 54) / React Native / TypeScript iOS app consume the same canonical tape format and round-lifecycle contract.

---

## TxLINE endpoints used

| Endpoint | Used for |
|---|---|
| `POST /auth/guest/start` | guest JWT (30-day), step 1 of auth |
| on-chain `subscribe` (txoracle program) + `POST /api/token/activate` | on-chain API key: wallet subscribes, signs, activates `X-Api-Token` |
| `GET /api/fixtures/snapshot?startEpochDay=` | fixture metadata (teams, kickoff, competition) |
| `GET /api/scores/historical/{fixtureId}` | full score history — source of every bundled replay tape |
| `GET /api/scores/updates/{fixtureId}` | live mode: current ~5-min score window |
| `GET /api/odds/updates/{fixtureId}` | live mode: current ~5-min StablePrice window (1X2 win-probability) |
| `GET /api/odds/updates/{epochDay}/{hourOfDay}/{interval}?fixtureId=` | historical 5-min odds intervals bundled into tapes |
| `SSE GET /api/scores/stream?fixtureId=` | real-time score stream, wired in iOS (`ios/src/lib/live-service.ts`) |
| `GET /api/scores/stat-validation?fixtureId=&seq=&statKeys=` | Merkle proofs for individual stats |
| `validateStatV2` (Anchor, devnet program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`) | on-chain proof of the Argentina–Switzerland final score |

Every data call carries both auth headers: `Authorization: Bearer <jwt>` and `X-Api-Token: <token>`.

---

## Verify it yourself, in 30 seconds

- **Play a real fixture:** [hilo-royale.vercel.app/login?fixture=18222446&demo=1](https://hilo-royale.vercel.app/login?fixture=18222446&demo=1)
- **Check the score proof:** open the Score proof link above — `validateStatV2` returns `true` against TxODDS's on-chain root.
- **Check the randomness proof:** open the VRF proof link above — a real fulfilled ORAO request on devnet.
- **Run the engine tests:** `git clone` the repo, then `node web/test.js` (dependency-free, no install needed) — 159 passing.
