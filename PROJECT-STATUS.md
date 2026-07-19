# Hi-Lo Royale — Project Status

**Everything that works, why it's built this way, what talks to what, and what's left before submission.**
Last verified: 2026-07-19 (~02:30 UTC). Companion docs: [ABOUT.md](ABOUT.md) (product explainer), [SUBMISSION.md](SUBMISSION.md) (form draft + demo script), [HACKATHON-REVIEW.md](HACKATHON-REVIEW.md) (strategy review).

---

## 1. What it is

**100 fans enter a real World Cup match. Every stat window is a hi/lo question. Wrong answer = eliminated live. Last fan standing takes the crown.**

A prediction battle royale where the wager is your place in the lobby, not money. Built for the **TxODDS × Solana World Cup hackathon, Track 2 (Consumer & Fan Experiences)**. Runs on TxODDS's institutional TxLINE feed and ships one final-score proof plus one fulfilled randomness-source receipt on Solana devnet.

| Surface | Where | Status |
|---|---|---|
| Web (landing → login → arena) | **https://hilo-royale.vercel.app** | ✅ deployed, verified |
| iOS (Expo SDK 54) | `exp://jomg54w-lordofclaude-8081.exp.direct` (dev tunnel) | ✅ bundles clean, runs in Expo Go |
| Repo | https://github.com/lordofclaude/hilo-royale | ⚠️ private — flip public before submitting |

---

## 2. What's working (verified)

### The game loop (canonical data, parity-tested core rules)
- **11-round schedule on the featured fixture** (France–England), precomputed by `buildSchedule` from real events + real odds: pregame prop, occurrence bets, team side-picks, **odds-swing rounds** (England win-% higher/lower — settled against the real 1X2 series), next-goal, goals over/under, halftime special, and a **real VAR round** that fires at the actual VAR moment.
- **Engine v2** (`web/game-logic.js`, with parity-tested core behavior in iOS,
  **159 unit tests passing**): web is stat-aware, guards occurrence base rates,
  balances hi/lo answers, and avoids adjacent topic repeats. Both clients consume
  canonical match events; web currently has additional question types and guards.
- **Window-in-play pacing** (iOS): pick → LOCKED → the match visibly fast-forwards through the real window (score/minute/feed updating) under a gold `WINDOW IN PLAY · SETTLES AT N'` chip → settlement when the match clock crosses the boundary. Honesty subline: "replay ×30 — this is 10 real minutes in live mode."
- **SIM LIVE** (iOS): the lobby always presents a match about to start — rolling 2-minute "NEXT KICK-OFF IN" countdown, join always enabled. If Match Control is set to LIVE with no real match in its window, joining falls through to SIM LIVE on real data instead of a dead button. Labeled honestly everywhere.
- Crowd bar with progressive bot-pick reveal, heartbeat timer + haptics, near-death detection ("survived by 0.4s"), elimination cascade with named fans, sudden-death (3s windows for the final three), ghost mode after death, crowd-difficulty scoring (rare correct picks earn more).

### Web (3 pages, neon broadcast design system)
- `/` — snap-scroll landing: "arena at night" canvas hero (100 drifting fan dots, eliminations flash red, your dot gold), icon snap-nav rail, tonight's lobbies, on-chain receipts strip.
- `/login` — one-tap guest identity (mints @FANxxxx or custom handle, device-local).
- `/play` — the full arena, auth-gated, personalized (your handle on your dot, header, ladder), 6 real lobbies with a fixture switcher, ladder + top-10 wall, canvas survival-ticket/death-replay share card, ghost-challenge URLs (`share.js`, bit-packed picks, <120 chars).
- Extras: `/pitch` (product story), `/privacy`, `og.png` social cards, `app-icon.svg`.

### iOS (9 screens, floating tab dock)
- Login (guest + Google-OAuth-ready) → four tabs: **PLAY** (SIM LIVE lobby) / **RANK** (leaderboard) / **SQUAD** (rooms + invite deep links) / **ME** (profile: level, win rate, badges) + Settings (Match Control: replay/live, 1×–60×, answer/reveal timing).
- Result screen: survival ticket or death replay (image share via view-shot), badges, points breakdown, WhatsApp/Instagram/copy-link sharing, ghost challenge links, **"SCORE PROOF · SOLANA DEVNET"** + **"VERIFIABLE SEED SOURCE — ORAO VRF"** tappable receipt pills.
- HTTPS challenge links work as web fallbacks; native universal-link handoff is
  roadmap until the production AASA file and signed Associated Domains entitlement
  are deployed. Custom `hiloroyale://challenge/…` / `squad/…` routes are wired in
  the native app.

### Design system (Tiago's Track-2 directive, both platforms)
- **No emojis anywhere in UI** — shared SVG/vector icon set (`web` sprite + `ios/src/components/Icon.tsx`).
- **Cabinet Grotesk** (900 italic broadcast display) + **DM Sans** body.
- Neon sports-broadcast palette ported 1:1 from `ios/src/theme.ts`: pure black arena `#050608`, **cyan-vs-red duel** (`#2ee6ff`/`#ff3b5c`), gold rewards `#ffd54a`, colored glows.

---

## 3. Data & integrations — what, why, and what it's connected to

```
TxODDS TxLINE (devnet) ──[on-chain subscription: txoracle program]──> API token
       │
       ├─ captured tapes (6 real fixtures) ──> web/lobbies.js + ios/src/lib/real-data/*  ──> buildSchedule ──> the game
       ├─ live: /api/{scores,odds}/updates + /stream (SSE)
       │        └──> Vercel serverless (web/api/txline.js + txline-stream.js — creds server-side)
       │             ├──> web/live-feed.js (poll/accumulate, dedupe by Seq)
       │             └──> iOS live-service.ts (SSE bridge client, zero creds in bundle)
       │
Solana devnet
       ├─ validateStatV2 tx ──> proves ARG–SUI final score vs TxODDS Merkle root ──> Solscan pill in both UIs
       ├─ one fulfilled ORAO source ──> reusable deterministic prototype seed ──> receipt link
       └─ solora-anchor state machine ──> round lifecycle OPEN→LOCKED→SETTLED in the engine (deploy = roadmap)
```

| Integration | What we did | Why it matters for judges |
|---|---|---|
| **TxLINE feed** (TxODDS) | On-chain wallet subscription → token activation → captured 6 real fixtures incl. **France–England live during the match** (historical locks ~6h post-KO; we used `/updates` + `/stream`). Live proxy + SSE bridge deployed with creds server-side. | The core requirement: real institutional data, consumed the hard (correct) way. `TXLINE-FEEDBACK.md` documents feed gotchas for the organizers. |
| **validateStatV2** (TxODDS on-chain) | Real devnet tx proving ARG–SUI's final score against the on-chain Merkle root; sig ships as data, rendered as Solscan link on result tickets. | "Results provable on Solana" is a demoable claim, not copy. |
| **ORAO VRF** (`orao-network/solana-vrf`) | One real fulfilled randomness request on devnet (`onchain/request-vrf.js`) supplies the reusable prototype seed for deterministic rival simulation. | Proves the seed-source path. Per-lobby commitments and output transcripts are next. |
| **solora-anchor** (`meditatingsloth/solora-anchor`) | Its lock→settle lifecycle informed the local `OPEN→LOCKED→SETTLED` engine. Gameplay state and winners are not committed on-chain today. | Demonstrates a clean settlement model without overstating the current prototype. |
| **solana-escrow-gambling** (`dariusjvc/`) | Roadmap reference only (ABOUT.md): escrowed staked lobbies. | Deliberate: Hi-Lo is stakes-free today; shows we know the path without faking it. |

### The six real fixtures (lobbies)
| Fixture | Match | Notes |
|---|---|---|
| **18257865** | **France 2–4 England** | **FEATURED/default** — captured live Jul 18 during the match; partial through 60' (labeled); real VAR review + odds collapse (FRA 43% → ENG 96%) |
| 18222446 | Argentina 3–1 Switzerland | Complete 110-event tape; **the on-chain score proof**; judge-safe full match |
| 18237038 | France 0–2 Spain | Complete |
| 18241006 | England 1–2 Argentina | Complete |
| 18213979 | Norway v England | Complete (QF) |
| 17588232 | Spain 5–0 Saudi Arabia | Complete (group) |
| 18257739 | **Spain v Argentina — THE FINAL** | **Live-mode target**: KO Jul 19 19:00 UTC, allowlisted on the proxy; LIVE lights up automatically in its match window |

---

## 4. Honest ledger (what's simulated)

- The 99 other fans are **simulated rivals**, deterministically seeded from one
  fulfilled ORAO source. Real multiplayer needs the room server deployed
  (`ios/server/`, works on LAN, not hosted); per-lobby seed commitments are next.
- Leaderboard wall beyond your own stats is demo data, labeled.
- Guest identity is device-local; Google OAuth is code-complete but needs client IDs.
- solora-anchor runs **in-engine**, not as a deployed program (no Anchor toolchain on the build machine — documented as roadmap).
- FRA–ENG capture ends at 60' (labeled "PARTIAL" in-UI; full-match lobbies available one tap away).

---

## 5. Left to do before final submission (deadline **Jul 19, 23:59 UTC**)

### Must do (manual, Tiago)
1. **Flip the repo public** — github.com/lordofclaude/hilo-royale.
2. **Record the demo video** (≤5 min; script in SUBMISSION.md). Suggested arc: landing → claim handle → SIM LIVE France–England run (lock → window-in-play → cascade → ticket) → receipts (both Solscan links) → flip Match Control to LIVE for the final's countdown.
3. **Submit the Superteam Earn form** — all fields drafted in SUBMISSION.md.
4. If demoing **during the final (19:00–22:00 UTC)**: live mode lights up on the real feed automatically — the strongest possible beat. Verify Vercel env vars are still set (they are project-level now) with one click of "Refresh" on the market card.

### Should do (small, code — any session can pick up)
5. Sync the **monorepo submission snapshot** (`SolanaTxODDsHackathon/06-builds/t2-hilo-royale*`) or point the submission solely at the canonical repo (cleaner).
6. Commit the currently-dirty polish files (docs + screens touch-ups in the working tree).
7. Optional: EAS build → TestFlight if judges should install without Expo Go (not required; Expo Go + web cover the demo).

### Explicit roadmap (post-hackathon, already documented)
- Deploy the solora-anchor program with a TxLINE oracle adapter (locks/settles as real txs).
- Escrowed staked lobbies (solana-escrow-gambling pattern).
- Hosted room server → real multiplayer lobbies; authoritative global ladder.
- Google OAuth client IDs; App Store submission (icon + preflight exist).

---

## 6. Runbook (for whoever demos)

```powershell
# Web — nothing to run, it's live:
#   https://hilo-royale.vercel.app

# iOS — dev tunnel (works from anywhere):
cd Desktop\hilo-royale\ios
corepack pnpm install          # once
npx expo start --tunnel        # then open exp://jomg54w-lordofclaude-8081.exp.direct in Expo Go

# Engine tests
cd ..\web && node test.js      # 159 passing

# Redeploy web
cd ..\web && npx vercel deploy --prod --yes

# Fresh VRF lobby seed (optional, devnet)
cd ..\onchain && node request-vrf.js
```

Credentials: TxLINE JWT + API token live in `SolanaTxODDsHackathon/06-builds/shared/.txline.json` (gitignored) and as project-level Vercel env vars (`TXLINE_JWT`, `TXLINE_API_TOKEN`, `TXLINE_HOST`). Nothing secret ships in either client bundle.
