# Hi-Lo Royale — Viral Playbook (launch + judging week)

**One-liner:** *100 fans enter a live match. Every stat window is a question. Wrong = dead. Last fan standing takes the crown.* It's HQ Trivia × battle royale, powered by a proof-anchored sports feed — the drama is real because the data is real.

**The loop we're growing:** watch match → join lobby → survive/die publicly → share the artifact → your invite fills the next lobby faster → repeat on all 104 matches.

---

## 1. Shareable artifacts (built, not planned)

| Artifact | Where it lives | Why it spreads |
|---|---|---|
| **Streak card PNG** — collectible ticket: giant streak number, "OUTLIVED 87 OF 99 FANS", match scoreline, ladder rank, pseudo-barcode hashed from your run | End-of-lobby modal → Save / native Share sheet | It's a flex object, not a screenshot. Ticket aesthetic = people collect them per match (104 possible tickets = a set to complete) |
| **"I outlived 99 people" elimination screen** | Auto-framed at death: *"Eliminated at streak 4 — you outlived 78 of 99 fans"* | Losing produces a brag too. Games where losing is shareable grow ~2× faster than win-only shares |
| **Crown moment** | Winner overlay + confetti + fanfare + on-chain streak stamp (devnet) | "My crown is stamped on Solana" is a screenshot with a story attached |
| **Ghost challenge link** — compact URL encoding your exact run (picks, timing, streak) | Result screen → "Send this to someone who thinks they'd survive" | The share IS a rematch invite: the friend replays the same real match against your ghost, pick for pick. Every loss recruits an opponent |

Post templates to seed (X/TikTok caption bank — no emojis, the anti-slop is the brand):
- "died on a CORNER COUNT with 0.8s left. SURVIVED BY badge then instant death next round. this game is evil"
- "outlived 91 of 99 fans on FRA–MAR and lost on the last question. running it back"
- "the crowd was 78% HI. the crowd was wrong. 41 people died at once"

## 2. Lobby scheduling — replayed famous matches as content calendar

All 104 World Cup matches replay 24/7 via `GET /api/scores/historical/{fixtureId}` — so **we program lobbies like TV**:

- **Prime-time headline lobbies:** the semi-final (this demo), the final, and the biggest group-stage upset, on the hour every hour. Named lobbies (#FRA-MAR-047) become memes ("047 killed me three times").
- **Anniversary hooks:** "One week ago today, this match broke the internet — can you survive it?" push notification 5 minutes before the lobby opens (already wired in the iOS app).
- **Live-match lobbies** during judging week: the web app already polls real TxLINE odds/score windows through `/api/txline` when a fixture is live — any real fixture streaming on TxLINE becomes a live lobby, no scriptable answers, maximum drama.
- **Ladder seasons:** the tournament-long Royale Ladder (streak×10 + fans outlived + 250 per crown) resets per round of the cup → recurring "season finale" spikes.

## 3. Referral loop — invite code = your lobby fills faster

Lobbies need 100 fans. That constraint IS the growth mechanic:

1. Every player gets a lobby code (their handle + lobby id).
2. Sharing your streak card embeds the code in the barcode/caption.
3. Friends joining via your code **queue into your lobby** — your lobby starts sooner and your kills/outlives happen against people you know (screenshots get personal: "outlived @YourActualFriend").
4. Referrer perk: +1 ladder point per invited fan who survives round 3 — points, not money, so it stays clean pre-monetization.

Bot backfill (already built) guarantees no lobby ever feels empty while the real graph grows.

## 4. TikTok-able moments (engineered into the build)

1. **The elimination cascade** — 40 avatars popping red→dead in a staggered wave with tick sounds while the alive-counter free-falls. Film the grid. 3 seconds, no context needed.
2. **The near-death badge** — heartbeat audio accelerates, timer goes red, you lock at 0.8s, "SURVIVED BY 0.8s" pops with confetti. Perfect POV-reaction format.
3. **The crowd-was-wrong reveal** — social-proof bar shows 78% HI, answer drops LO, majority dies on screen. "Never trust the crowd" is an infinitely remixable format.

Capture plan: screen-record 10 lobbies, cut vertical 9:16 with the UGC playbook (real-person reaction cam over the grid), post 3×/day during judging week from a fresh account; duet-bait caption "could you survive question 5?".

## 5. App Store positioning — the only native app in the hackathon

- **Category:** Sports / Games–Trivia crossover. Title: *"Hi-Lo Royale: Survive the Match"*. Subtitle: *"100 fans. 1 crown. Real stats."*
- The Expo/TestFlight build is our judging-week differentiator: while other Track 2 entries demo in a browser tab, we hand judges a phone with **push notifications** ("lobby opening in 5 min", "you survived round 3") and haptic heartbeats. Fan UX axis: won.
- ASO keywords: world cup game, trivia royale, sports prediction, last fan standing.
- Screenshots = streak cards + the cascade grid (assets already generated by the product itself — zero design budget).

## 6. Monetization one-liner

**Entry-fee lobbies with proof-settled prize pools later; cosmetic crowns now.** Because every question resolves from a TxLINE stat that's Merkle-anchored on Solana (`validateStatV2`), a paid lobby's payout needs **no oracle and no trust** — the feed *is* the settlement layer. Until then: cosmetic crown skins, ticket-card themes, and named-lobby sponsorships ("the Heineken 047 lobby") keep it app-store-safe and gambling-reg-safe.

## 7. Judging-week run of show

| Day | Move |
|---|---|
| D-2 | TestFlight build to 20 seed testers; record 10 lobbies of capture footage |
| D-1 | Post 3 cascade clips + 2 near-death POVs; seed streak cards in 3 football Discords |
| Demo day | Live lobby on a real fixture; judges join from their own phones via QR → they *are* the cascade |
| Demo close | Hand a judge their own streak card PNG airdropped from the app — the pitch is the product |

**Why we out-create the clones:** a naive hi-lo clone asks questions. We built *identity* (streak tickets, ladder, crowns), *spectacle* (cascade, heartbeat, crowd bar), *distribution* (share loop + native push), and *a settlement story only this feed enables*. That's the creativity axis, the monetization axis, and the completeness axis in one build.
