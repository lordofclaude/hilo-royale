# TxLINE API feedback — from building Hi-Lo Royale

Written for the TxODDS team as part of our hackathon submission. Context: we
built a prediction battle royale whose entire game state is a deterministic
function of the TxLINE feed — historical score pulls compiled into replay
tapes, live odds/score window polling during matches, StablePrice 1X2 series
driving win-probability questions, and `validateStatV2` settling a final score
on devnet. So we exercised auth, historical, updates, SSE, odds intervals, and
the validation path against real fixtures (including capturing France–England
live on July 18). Everything below is from that real usage.

## What we loved

- **The normalized schema across competitions.** One fixture/scores/odds shape
  for everything meant our tape builder and question engine are genuinely
  game-agnostic — we added our fourth fixture by pulling it, with zero code
  changes. That is rare in sports data.
- **StablePrice 1X2 quality.** The consensus win-probability series is smooth,
  sensible, and reacts to match events the way you'd hope. It was good enough
  to build a whole question category on ("win probability higher or lower in
  10 minutes?") without any smoothing on our side. The implied-percentage
  `Pct` array being served alongside prices saved us de-vigging work.
- **On-chain anchoring is a real superpower, not a checkbox.** Because every
  stat is Merkle-anchored, our settlement story required no oracle and no
  trust: `stat-validation` + `validateStatV2` predicates let us prove
  "participant 1 goals > participant 2 goals" with a read-only view call and a
  real devnet transaction. This is the feature that makes paid prize pools
  feasible for a small team — the feed is the settlement layer.
- **No rate limits + a devnet sandbox** made iteration painless, and the
  tx-on-chain repo's runnable examples were the fastest path to first token.

## Friction we hit (specific, reproducible)

1. **`/api/scores/historical/{fixtureId}` is unavailable mid-match and only
   opens ~6h after kickoff.** This was our biggest gotcha: during a live match
   the endpoint returns empty, and there is no other way to backfill events
   you missed. Practical consequence: a client that joins (or crashes) at
   minute 60 cannot reconstruct minutes 0–59 until hours after full time. It
   cost us a live-demo path — we wanted "join a live lobby late, catch up on
   the match so far" and had to design around it by capturing continuously
   from kickoff. A `?since=` parameter, or simply letting historical serve
   whatever has been finalized so far mid-match, would unlock late-join
   experiences for every consumer app.

2. **The updates endpoints only serve the current ~5-minute window, with no
   cursor or backfill.** `GET /api/{scores,odds}/updates/{fixtureId}` is
   effectively "now"; combined with (1), every live client must implement its
   own poll + accumulate + dedupe-by-`Seq` layer to keep history. We wrote
   that layer twice (serverless proxy + browser client). It works, but a
   `?sinceSeq=` cursor — or historical-interval access during the match, not
   just after — would remove a whole class of client-side state machinery.

3. **Ordering: we captured out-of-order `Seq` values in live score updates.**
   In our France–England capture, updates arrived with sequence numbers out of
   order, which briefly made cumulative stats regress (a goal count going
   2 → 1 between consecutive captured updates). Our fix was to rebuild the
   tape: sort by `Seq`, dedupe, and enforce monotonic cumulative stats. Worth
   either guaranteeing order per fixture stream, or stating explicitly in the
   docs that consumers MUST sort by `Seq` and treat timestamps as advisory —
   we'd have designed for it from day one had the docs said so.

4. **`/api/scores/historical/{id}` responds as `text/event-stream` framing
   even for finished matches.** We expected JSON for a plain GET of a finished
   fixture and got SSE `data:` frames in the response body, which breaks a
   naive `res.json()`. Easy to handle once discovered (we parse the frames),
   but it surprised us; documenting the content type on that endpoint (or
   offering `Accept: application/json`) would save every team an hour.

5. **Dual-header auth (`Authorization: Bearer <jwt>` + `X-Api-Token`) is
   unusual.** We understand the design (session JWT vs. on-chain-activated
   entitlement), and it works fine once wired, but most HTTP tooling assumes
   one credential: default fetch wrappers, proxies, and SSE clients all needed
   custom header plumbing, and the 401-vs-403 distinction (refresh JWT vs.
   re-activate token) took trial and error to map. A short "auth
   troubleshooting" table in the docs — status code → which credential is
   wrong → exact fix — would be high leverage. (Ours: 401 = re-POST
   `/auth/guest/start` on the same host; 403 = token/subscription
   misalignment, re-activate.)

## Small wishlist

- A `Last-Event-ID`-style resume story for polling clients, not just SSE.
- A documented market-catalog note per fixture (we learned to branch off
  `SuperOddsType` from the payload rather than assume 1X2 exists — the docs
  hint at this; making it a loud callout would help).
- Webhooks or a push option for score updates, for serverless-heavy stacks
  where holding an SSE connection open is awkward.

## Bottom line

TxLINE let a solo builder ship a consumer game on institutional-grade data
with a genuinely trustless settlement path in days. The friction points above
are all client-side workaroundable — we workarounded them — but fixing (1) and
(2) in particular would make "live fan experience" apps dramatically easier to
build, and that's exactly the category this feed deserves to own.
