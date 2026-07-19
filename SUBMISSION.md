# Hi-Lo Royale — Superteam Earn submission draft

Track 2 (Consumer & Fan Experiences) · TxODDS × Solana World Cup hackathon ·
deadline July 19 2026 23:59 UTC.

> **Before submitting (manual, Tiago):**
> 1. Flip `github.com/lordofclaude/hilo-royale` to **PUBLIC** (it is private today).
> 2. Record the demo video from the script below (≤5 min) and upload (YouTube unlisted works).
> 3. Confirm `TXLINE_JWT` / `TXLINE_API_TOKEN` are set in the Vercel project env if you want live mode on camera; the app is fully demoable in replay mode without them.
> 4. Redeploy `web/` to Vercel so the live site matches the repo.

---

## Form fields

**Project name:** Hi-Lo Royale

**One-liner:** 100 fans enter a real World Cup match; every stat window is a
hi/lo question; wrong = eliminated live; last fan standing takes the crown —
powered by TxODDS's TxLINE feed and provable on Solana.

**Track:** Track 2 — Consumer & Fan Experiences

**Links:**

| What | URL |
|---|---|
| Live app | https://hilo-royale.vercel.app |
| Repo (flip public first) | https://github.com/lordofclaude/hilo-royale |
| On-chain settlement (`validateStatV2`, devnet) | https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet |
| ORAO VRF lobby-randomness request (devnet) | https://solscan.io/tx/4Fn4icgVJEftWm5TuWKWejY3p1adboCydqvragTyEXrsN6yBPx12bdeynrsW6pkuFR3xgMYovV3bXp7DTEuuwikH?cluster=devnet |
| Technical docs | `README.md` (endpoints list) + `ABOUT.md` (architecture + honest ledger) in the repo |
| TxLINE API feedback | `TXLINE-FEEDBACK.md` in the repo |

**Team:** Tiago Dias — solo build (product, game engine, TxLINE integration,
on-chain work). Contact: tiagobrbdias@gmail.com · GitHub `lordofclaude`.

---

## Core idea (for the description field)

Live sports betting is thrilling but carries real-money stakes and regulatory
weight. Hi-Lo Royale keeps the thrill and swaps money for **survival**: 100
fans join a lobby on a real World Cup match, every few minutes a prediction
question fires (goal in the next 10? more corners FRA or ENG? win probability
higher or lower in 10 minutes?), wrong or slow answers are eliminated in a
public cascade, and the last fan standing takes the crown.

**Business highlights:** free-to-play and viral by design — 99 of 100 players
lose, and losing produces the share artifact (elimination card + ghost
challenge link that replays your exact run against a friend). Monetization
path: cosmetic crowns and sponsored named lobbies now; entry-fee lobbies with
**proof-settled prize pools** later — because every question resolves from a
TxLINE stat that is Merkle-anchored on Solana, a paid lobby's payout needs no
oracle and no trust.

**Technical highlights:** the whole game is a deterministic function of the
TxLINE feed. Real captured fixtures (including the France–England
quarter-final, captured live on July 18) are compiled into replay tapes with
their real 1X2 StablePrice series; a stat-aware question engine precomputes
each lobby's schedule and only asks about stats the tape has signal for;
during a live match window the web app polls real TxLINE odds/score updates
through a serverless proxy (credentials server-side, graceful replay
fallback); lobby randomness comes from a real ORAO VRF request; and the
featured fixture's final score is settled with a real `validateStatV2`
transaction on devnet. Bots and the leaderboard are simulated/local today and
the app says so — the honest ledger is in `ABOUT.md`.

## TxLINE endpoints used (form asks for these)

- `POST /auth/guest/start` — guest JWT
- On-chain `subscribe` on the txoracle program + `POST /api/token/activate` — API token activation via wallet signature
- `GET /api/fixtures/snapshot?startEpochDay=` — fixture metadata
- `GET /api/scores/historical/{fixtureId}` — full score history (source of all replay tapes)
- `GET /api/scores/updates/{fixtureId}` — live ~5-min score windows (polled + accumulated)
- `GET /api/odds/updates/{fixtureId}` — live ~5-min StablePrice 1X2 windows
- `GET /api/odds/updates/{epochDay}/{hourOfDay}/{interval}?fixtureId=` — historical 5-min odds intervals (bundled odds series)
- `SSE GET /api/scores/stream?fixtureId=` — real-time stream (iOS live service)
- `GET /api/scores/stat-validation?fixtureId=&seq=&statKeys=` — Merkle proofs
- `validateStatV2` on devnet program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` — on-chain settlement
- All data calls: dual headers `Authorization: Bearer <jwt>` + `X-Api-Token: <token>`

---

## Demo video script (≤5:00)

Record the browser at hilo-royale.vercel.app (desktop, clean profile, 1080p).
Have a second browser window ready for the ghost link and Solscan tabs
preloaded. Voiceover lines are suggestions — keep the energy of a match
commentator, not a pitch deck.

| Time | Scene | On screen | Voiceover |
|---|---|---|---|
| 0:00–0:20 | Hook | Cold open on the elimination cascade mid-game: avatars dying in a wave, alive-counter free-falling | "100 fans just entered a real World Cup match. In four minutes, 99 of them will be dead. This is Hi-Lo Royale." |
| 0:20–1:00 | Lobby + kickoff | Load hilo-royale.vercel.app. Pick the France–England quarter-final lobby. Show the countdown, the 3-2-1, kickoff | "Every lobby is a real match from TxODDS's TxLINE feed — this is the actual France–England quarter-final, every goal and corner exactly as it happened. You and 99 fans lock in." |
| 1:00–1:50 | Playing rounds | Answer 2–3 questions: an occurrence bet, a head-to-head, then an odds-swing question. Point at the crowd bar and the win-probability readout | "Every few minutes, a question. Corner in the next ten? More corners, France or England? And this one — will France's win probability be HIGHER in ten minutes — settles against the real bookmaker consensus, TxLINE's StablePrice. The crowd bar shows how the other 99 split. The crowd is often wrong." |
| 1:50–2:20 | LIVE TxLINE moment | Open the live indicator / a fixture in its live window if one is on; otherwise show `/api/txline?fixtureId=18257865&mode=odds1x2` returning real JSON in a tab and the in-app live badge | "This isn't only replays. When a match is live, the app polls TxLINE's odds and score windows through our serverless proxy — real institutional data, updating in-game, credentials never touching the browser." |
| 2:20–2:50 | Death + ghost challenge | Die on purpose (or finish a run). Show the elimination card, hit share, open the ghost link in the second window and show the ghost racing your picks | "Losing is the growth loop. Your death mints a challenge link — your exact run, every pick, every hesitation. Your friend replays the same match against your ghost." |
| 2:50–3:30 | On-chain proofs | Click "VERIFIED ON SOLANA" → Solscan tab with the `validateStatV2` tx; then the ORAO VRF tx | "Two real devnet transactions. This one proves the final score against the Merkle root TxODDS publishes on Solana — trustless settlement, no oracle to build. And this one is the ORAO VRF request that seeds every lobby's luck. Provably fair, end to end." |
| 3:30–4:10 | How TxLINE powers it | Quick cut over README endpoint table / architecture: tapes from `scores/historical`, live windows from `odds/updates` + `scores/updates`, SSE on iOS, stat-validation proofs | "TxLINE is the whole engine: historical scores become replay tapes, five-minute update windows become live mode, the stat-validation endpoint becomes the settlement layer. The game is a deterministic function of the feed." |
| 4:10–4:40 | Monetization + close | Crown moment / winner overlay, then the lobby list | "Today: cosmetic crowns and sponsored lobbies. Tomorrow: entry-fee lobbies where the prize pool settles itself on-chain — because when the data is Merkle-anchored, the feed IS the escrow judge. 104 matches. 100 fans each. One crown. Hi-Lo Royale." |

---

## Judge quickstart

**Play in 60 seconds:** open https://hilo-royale.vercel.app → pick the
France–England lobby → when a question fires, tap HI or LO before the timer
dies → survive all rounds to take the crown. Wrong or slow = eliminated (you
will still see how far you'd have gone — and get a shareable card).

**Test the ghost challenge:** finish (or die in) a run → share → open the
generated link in another tab: same match, your recorded picks racing you.

**Test live mode:** `GET /api/txline?fixtureId=<id>&mode=odds1x2` on the
deployed app returns `{ok:true, p1, draw, p2, ts}` when TxLINE credentials are
configured and the fixture has a current odds window, and an honest
`{ok:false, reason}` otherwise — the app itself falls back to replay tapes, so
nothing ever breaks. Modes `scores` and `odds` expose the raw update windows.

**Run the tests:** clone the repo, then `node web/test.js` (no install needed —
the web build is dependency-free).

**Verify the chain:** both Solscan links above are real devnet transactions;
the settlement tx executes `validateStatV2` against TxODDS's published root.

## Judging criteria, explicitly

- **Fan UX** — a native-feeling app (web + Expo iOS) built around spectacle:
  elimination cascades, heartbeat timers, crowd bars, badges, ghost rematches.
  No wallet, no signup, no emoji slop — playable in 60 seconds.
- **Real-Time Responsiveness** — TxLINE is a live input, not a static dataset:
  live odds/score window polling with Seq-deduped accumulation during match
  windows, SSE wired on iOS, and odds-swing questions that settle against the
  real 1X2 series.
- **Originality** — not a betting clone: survival is the wager. The battle
  royale format turns one feed into 104 pieces of scheduled content, and
  losing (99% of outcomes) is the viral artifact.
- **Monetization path** — cosmetic crowns, ticket-card themes, and sponsored
  named lobbies now (app-store-safe, gambling-reg-safe); entry-fee lobbies
  with proof-settled prize pools later, because `validateStatV2` makes payouts
  trustless (see `web/VIRAL-PLAYBOOK.md`, section 6).
- **Completeness** — deployed web app, iOS app, tested shared engine
  (`node web/test.js`), two real on-chain transactions, real captured data
  from four fixtures, honest ledger of what is simulated, and this submission
  pack.
