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
| On-chain final-score proof (`validateStatV2`, devnet) | https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet |
| ORAO VRF lobby-randomness request (devnet) | https://solscan.io/tx/4Fn4icgVJEftWm5TuWKWejY3p1adboCydqvragTyEXrsN6yBPx12bdeynrsW6pkuFR3xgMYovV3bXp7DTEuuwikH?cluster=devnet |
| Technical docs | `README.md` (endpoints list) + `ABOUT.md` (architecture + honest ledger) in the repo |
| TxLINE API feedback | `TXLINE-FEEDBACK.md` in the repo |

**Team:** Tiago Dias — solo build (product, game engine, TxLINE integration,
on-chain work). GitHub `lordofclaude`.

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
path: sponsored and branded lobbies for clubs, broadcasters, and brands, plus
cosmetic crowns and ticket-card themes. The fan product stays free to play.

**Technical highlights:** the whole game is a deterministic function of the
TxLINE feed. Six web captures are compiled into canonical replay tapes; the
France–England third-place capture is explicitly partial through 60′. The
complete Argentina–Switzerland tape is the judge fixture and carries
their real 1X2 StablePrice series; a stat-aware question engine precomputes
each lobby's schedule and only asks about stats the tape has signal for;
during a live match window the web app polls real TxLINE odds/score updates
through a serverless proxy (credentials server-side, graceful replay
fallback); lobby randomness comes from a real ORAO VRF request; and the
the Argentina 3–1 Switzerland final score is proven with a real `validateStatV2`
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
- `SSE GET /api/scores/stream?fixtureId=` — upstream real-time stream, consumed by iOS through the credential-safe `/api/txline-stream` bridge
- `GET /api/scores/stat-validation?fixtureId=&seq=&statKeys=` — Merkle proofs
- `validateStatV2` on devnet program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` — one on-chain final-score validation
- All data calls: dual headers `Authorization: Bearer <jwt>` + `X-Api-Token: <token>`

---

## Demo video script (≤5:00)

The canonical click-by-click stage runbook, deterministic answer key, preflight,
and recovery plan live in [DEMO-SCRIPT.md](DEMO-SCRIPT.md). The short recording
outline below uses the same safe path.

Record the browser at hilo-royale.vercel.app (desktop, clean profile, 1080p).
Have a second browser window ready for the ghost link and Solscan tabs
preloaded. Voiceover lines are suggestions — keep the energy of a match
commentator, not a pitch deck.

| Time | Scene | On screen | Voiceover |
|---|---|---|---|
| 0:00–0:12 | Hook | Cold open mid-cascade: alive counter falling | "One wrong call just killed 35 rivals." |
| 0:12–0:25 | Product | Hero line over the arena | "Hi-Lo Royale turns every live match into a shared survival game." |
| 0:25–0:55 | Play | Open `/login?fixture=18222446&demo=1`, join and settle one Argentina–Switzerland round | "Join 100 fans, predict the next match stat, and stay alive—one wrong answer knocks you out." |
| 0:55–1:18 | Growth loop | Die, press **Copy challenge link**, then **Open challenge** | "Losing is the growth loop: your exact run becomes the rival your friend must beat." |
| 1:18–1:55 | Data flow | Show TxLINE feed → question → lock → settlement | "Confirmed match events become deterministic questions and one shared crowd reveal." |
| 1:55–2:20 | Receipts | Open the Argentina–Switzerland score proof, then the ORAO request | "This transaction proves this fixture's 3–1 score. This ORAO request proves the prototype seed source—not yet a full per-lobby transcript." |
| 2:20–2:38 | iPhone | Native replay-mode round and HTTPS challenge | "The same canonical tape and rules run natively with haptics." |
| 2:38–3:00 | Business + close | Sponsored lobby mock and crown | "Free for fans; branded lobbies for clubs, broadcasters and sponsors. The interactive game layer for live sport." |

---

## Judge quickstart

**Play in 60 seconds:** open https://hilo-royale.vercel.app/login?fixture=18222446&demo=1 → enter the
Argentina–Switzerland lobby → click **START 3-MINUTE DEMO** → answer round 1
**YES** → deliberately answer round 2 **HIGHER** → use the immediate result and
ghost challenge to show the viral loop. A full correct run can still take the
crown.

**Test the ghost challenge:** finish (or die in) a run → share → open the
generated link in another tab: same match, your recorded picks racing you.

**Test live connectivity:** `GET /api/txline?fixtureId=<id>` on the
deployed app returns `{ok:true, p1, draw, p2, ts}` when TxLINE credentials are
configured and the fixture has a current odds window, and an honest
`{ok:false, reason}` otherwise — the app itself falls back to replay tapes, so
nothing ever breaks. The stage experience uses the complete proof-backed replay;
the iOS live path resolves questions from incoming SSE events when a valid match
is active.

**Run the tests:** clone the repo, then `node web/test.js` (no install needed —
the web build is dependency-free).

**Verify the chain:** both Solscan links above are real devnet transactions;
the score-proof transaction executes `validateStatV2` against TxODDS's
published root. Gameplay round and player settlement remain local today.

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
- **Monetization path** — sponsored and branded lobbies for clubs,
  broadcasters, and brands, plus cosmetic crowns and ticket-card themes.
- **Completeness** — deployed web app, iOS app, tested shared engine
  (`node web/test.js`), two real on-chain transactions, real captured data
  from six web fixture captures and four canonical iOS replays, an honest ledger of what is simulated, and this submission
  pack.
