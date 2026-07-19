# Hi-Lo Royale — end-to-end hackathon review

Date: 2026-07-18

## Executive verdict

The strongest version of the company is not “sports betting on Solana.” It is:

> **Hi-Lo Royale turns every live football match into a shared survival game.**

The fan's place in the lobby is the stake. The elimination cascade is the show.
The losing result is the growth surface: a fan can send the exact run to a
friend as a ghost challenge. The business model is free for fans and sponsored
or branded lobbies for clubs, broadcasters, brands, and rights holders.

The judge build should use Argentina–Switzerland (`18222446`): it is a complete
110-event tape and is the only fixture with the shipped `validateStatV2` score
proof. France–England (`18257865`) is a partial third-place capture through 60′
and must remain labeled as such.

## The top 20 improvements — implemented

1. **Lead with the product, not infrastructure.** Added a product-first purpose,
   problem, solution, why-now, business, proof, vision, and three-minute story
   at `/pitch`.

2. **Create a deterministic judge path.** Added `?fixture=18222446&demo=1`, a
   12× judge replay, a prominent start action, and a proof-aligned run-of-show.

3. **Put Join above the fold on mobile.** Added the stage-level quick-start CTA
   so the core action is no longer buried under feed/market/ladder cards.

4. **Make the result viral-first.** “Challenge a friend” is now the primary
   result action; save/share are secondary, and “Play another” advances to a
   different fixture instead of reloading the same lobby.

5. **Repair production ghost routing.** Challenge URLs land on `/play` and keep
   all query parameters through guest login instead of being dropped on `/`.

6. **Bridge web and iOS challenge formats.** Web URLs now carry both compact
   binary `ghost` data and readable `p=hlx` picks. iOS-generated readable runs
   are parsed into real round objects on web.

7. **Keep challenge links clickable beside images.** Web and iOS image-share
   messages now include the HTTPS run URL rather than sharing a dead image.

8. **Ship valid social presentation.** The 1200×630 `og.png` is present and
   tested; landing, login, play, and pitch metadata point to it.

9. **Use one canonical match compiler.** `shared/build-lobbies.js` now produces
   both `web/lobbies.js` and iOS `canonical.ts`, removing provisional goals,
   stat regressions, double-counted shots, and fabricated iOS finals.

10. **Tell the truth about partial data and proofs.** Partial captures are
    explicitly labeled in the arena and result card; proof copy names the one
    proven fixture; VRF copy says it proves the seed source, not a full lobby
    transcript.

11. **Make live ingestion revision-aware and recoverable.** Provisional semantic
    actions wait for confirmation; `action_discarded` can no longer become a
    bogus card; initial silence and later stalls trigger visible replay fallback
    without rewinding the match.

12. **Harden the TxLINE web API.** Added GET-only contracts, fixture/mode
    allowlists, upstream timeout and size bounds, structured status codes,
    consensus-bookmaker/full-match odds filtering, maximum-timestamp selection,
    range checks, and short CDN caching for public odds.

13. **Keep TxLINE credentials out of iOS.** Native live mode uses the server-side
    SSE bridge. The bridge now validates requests, aborts idle/disconnected
    upstreams, and iOS normalizes raw TxLINE fields, dedupes actions, isolates
    malformed frames, reconnects, and only finishes on a confirmed final event.

14. **Fix round-settlement races.** Live rounds synchronously mark themselves
    resolved, replay answers wait for the match window boundary, and stream
    completion is single-fire. Survival notifications no longer double-subtract
    eliminated bots.

15. **Make the Daily Lobby truly shared.** Web and iOS now use the same UTC key,
    FNV hash, ordered four-fixture intersection, and canonical data.

16. **Make timed play accessible and lifecycle-safe.** Added answer labels,
    selected/disabled states, H/L and arrow shortcuts, controlled live regions,
    timer semantics, dialog labeling/initial focus/Escape behavior, arena text
    alternatives, 44px controls, higher contrast, reduced motion, and timer pause
    while the web tab is hidden.

17. **Improve native conversion, trust, and control.** Fixed platform-specific
    Google configuration, added accessible tabs/answers/status, stopped room
    presence from blocking Join, added HTTPS challenges, minimized stored Google
    fields, linked a privacy notice, and added “Delete local data.”

18. **Bound the prototype room service.** Malformed room URLs no longer crash the
    process; origins, IDs, rooms, players, clients, and join rates are bounded;
    empty rooms expire; native uses a per-room pseudonym and no avatar.

19. **Make local and CI verification one command.** Added a clean-URL dev server,
    GET/HEAD-only static contract, root scripts, canonical generation, and
    `npm run verify` for web unit/fuzz/live/integration tests plus iOS typecheck.

20. **Synchronize every claim and demo artifact.** Updated README, ABOUT,
    SUBMISSION, iOS runbooks, landing copy, privacy page, data-flow pitch, fixture
    count/stage/proof language, and the three-minute script around the same
    complete proof-backed fixture.

## Verification completed

- Core game engine: **159/159 passing**.
- Ghost/share fuzz suite: **14,933/14,933 passing**.
- Live-feed suite: **32/32 passing**.
- Integration contract: **7/7 sections passing**.
- Expo/iOS TypeScript: **passing**.
- Canonical compiler: **six web lobbies + four iOS replays generated**.
- OG asset: **PNG, 1200×630**.
- Manual web walkthrough: landing, guest gate, arena, pick/lock/reveal,
  elimination, mobile layout, and challenge path exercised.

## Demo run-of-show

1. Cold-open the elimination cascade: “One wrong call just killed half this
   lobby.”
2. Say the one-liner, then enter the Argentina–Switzerland judge URL.
3. Play one round and point to the crowd split, lock, and visible deaths.
4. Die, choose Challenge a friend, and open the ghost in a second window.
5. Show TxLINE → deterministic questions → locked picks → result.
6. Open the matching Argentina–Switzerland score proof, then precisely describe
   the ORAO transaction as the prototype's seed-source proof.
7. Cut to iPhone in replay mode for native haptics and the same canonical tape.
8. Close on sponsored match lobbies and “the interactive game layer for live
   sport.”

## Manual/external preflight still required

- Deploy the current worktree and smoke `/`, `/login`, `/play`, `/pitch`,
  `/privacy`, `/og.png`, and the two API routes.
- Make the GitHub repository public or correct the submission URL; the current
  public URL returned 404 during review.
- Run the iOS build on macOS/Xcode and a physical iPhone. This Windows review
  could typecheck and inspect Expo config, but could not produce or device-test
  an IPA.
- Native Universal Links require the Apple Team ID, Associated Domains
  entitlement, and a deployed AASA file. Canonical HTTPS links already work as
  web fallbacks; complete native handoff when those signing details are known.
- Use iOS replay mode on stage unless a fixture is demonstrably inside its live
  window and the backend stream passes preflight.
