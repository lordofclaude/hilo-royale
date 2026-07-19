# Hi-Lo Royale

**100 fans enter. One survives the stats.** A prediction battle royale on real
World Cup data — live TxLINE odds when a match is on, real replay tapes when it
isn't — with results provable on Solana.

- **Play it:** https://hilo-royale.vercel.app
- **Full story:** [ABOUT.md](ABOUT.md) — what it is, what's real vs. simulated, roadmap
- **Hackathon pack:** [SUBMISSION.md](SUBMISSION.md) (form draft + demo script) · [TXLINE-FEEDBACK.md](TXLINE-FEEDBACK.md) (API feedback for TxODDS)

## Repo layout

```
web/     the deployed app (hilo-royale.vercel.app) — dependency-free vanilla JS,
         self-contained, plus a serverless TxLINE proxy in web/api/
ios/     Expo (SDK 54) React Native app sharing the same game engine
shared/  real TxLINE match captures (replay tapes) + feed adapters used by both
onchain/ ORAO VRF request script + the fulfilled randomness proof
```

## Run the web app

The deployed app is served from `web/` and is self-contained. Locally:

```powershell
cd web
python -m http.server 8080
# → http://localhost:8080/
```

**Live mode is an enhancement, not a requirement.** With `TXLINE_JWT` and
`TXLINE_API_TOKEN` configured in the environment (Vercel project env in
production), `web/api/txline.js` proxies live TxLINE odds/score windows to the
browser — credentials never ship to the client. Without credentials the proxy
answers `{ok:false, reason:"no-credentials"}` and the app falls back to real
captured replay tapes. Nothing breaks offline.

## Run the iOS app (Expo Go)

```powershell
cd ios
corepack pnpm install
corepack pnpm start        # same Wi-Fi, scan the QR with your iPhone
corepack pnpm tunnel       # or a tunnel link that works from anywhere
```

Requires the Expo Go app (App Store). Use **pnpm via corepack** — not npm.
More detail (TestFlight shipping, swapping fixtures, feed wiring): `ios/RUN.md`.

## Run the tests

```powershell
node web/test.js           # full engine suite: schedule builder, question
                           # kinds, tape integrity, share codecs
```

## TxLINE endpoints used

Everything data-shaped in this project comes from TxODDS's TxLINE feed
(devnet). Specifically:

| Endpoint | Used for |
|---|---|
| `POST /auth/guest/start` | guest JWT (30-day), step 1 of auth |
| on-chain `subscribe` on the txoracle program + `POST /api/token/activate` | the "on-chain API key": wallet subscribes, signs, activates the `X-Api-Token` |
| `GET /api/fixtures/snapshot?startEpochDay=` | fixture metadata (teams, kickoff, competition) for each tape |
| `GET /api/scores/historical/{fixtureId}` | full score history for finished fixtures — the source of every bundled replay tape |
| `GET /api/scores/updates/{fixtureId}` | live mode: current ~5-min score window, polled and accumulated client-side |
| `GET /api/odds/updates/{fixtureId}` | live mode: current ~5-min StablePrice window; the 1X2 win-probability shown in-game |
| `GET /api/odds/updates/{epochDay}/{hourOfDay}/{interval}?fixtureId=` | historical 5-min odds intervals — the pre-captured win-probability series bundled with each tape |
| `SSE GET /api/scores/stream?fixtureId=` | real-time score stream, wired in the iOS live service (`ios/src/lib/live-service.ts`) |
| `GET /api/scores/stat-validation?fixtureId=&seq=&statKeys=` | Merkle proofs for individual stats |
| `validateStatV2` (Anchor, devnet program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`) | on-chain settlement of the featured fixture's final score |

Every data call carries both auth headers: `Authorization: Bearer <jwt>` and
`X-Api-Token: <token>`. The full client (auth, SSE parsing, window math,
action mapping, tape builder) is `shared/txline-real.js`; the serverless proxy
that keeps credentials off the client is `web/api/txline.js`.

## Provenance

Built for the TxODDS × Solana World Cup hackathon (July 2026). Match data
pulled from the TxLINE devnet feed via an on-chain subscription. Two real
devnet transactions anchor the trust story:

- **Settlement** — a real `validateStatV2` transaction proves the featured
  fixture's final score against the Merkle root TxODDS publishes on-chain:
  [view on Solscan (devnet)](https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet)
- **Lobby randomness** — a real ORAO VRF request whose fulfilled randomness
  seeds every lobby's bots, picks and tie-breaks:
  [view on Solscan (devnet)](https://solscan.io/tx/4Fn4icgVJEftWm5TuWKWejY3p1adboCydqvragTyEXrsN6yBPx12bdeynrsW6pkuFR3xgMYovV3bXp7DTEuuwikH?cluster=devnet)
