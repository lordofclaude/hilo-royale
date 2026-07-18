# Hi-Lo Royale iOS — run & ship (from this Windows machine)

Expo SDK 53 · TypeScript · no navigation lib (single state machine) · works in Expo Go.

## 1. Install (pnpm via corepack — never npm)

```powershell
cd Desktop\SolanaTxODDsHackathon\06-builds\t2-hilo-royale-ios
corepack pnpm install
```

## 2. Test on your iPhone with Expo Go (Windows dev machine is fine)

1. Install **Expo Go** from the App Store on the iPhone.
2. Phone and PC on the **same Wi-Fi**, then:

```powershell
corepack pnpm start        # runs: expo start (LAN mode)
```

3. Scan the QR code with the iPhone camera → opens in Expo Go.
4. If the Windows firewall / router blocks LAN discovery, use a tunnel instead:

```powershell
corepack pnpm tunnel       # runs: expo start --tunnel
```

What to demo on device:
- Open the **Daily Lobby**: every local calendar date deterministically selects
  the same named real replay for everyone, with no backend required.
- Lobby → **"Notify me before the next lobby"** → grant permission → lock the phone → the
  *"Lobby opening in 5 minutes"* push arrives ~10s later (local notification demo — no push
  server needed; works in Expo Go).
- Join lobby → 3-2-1 countdown → hi-lo rounds with **haptic heartbeat** in the last 2 seconds,
  crowd bar, elimination cascade with haptic ticks.
- Survive round 3 → *"You survived round 3"* notification fires immediately.
- When only three fans remain, the answer window snaps to **3-second Sudden Death**.
- Death → keep watching in **Ghost Mode** → share the generated **Death Replay** card and
  deterministic `hiloroyale://challenge/<fixtureId>` link so a friend can beat the same run.
- Win → survival ticket → **Share** sheet → streak profile persists across relaunches.

## 3. Ship to TestFlight via EAS (cloud build — no Mac needed)

One-time setup:

```powershell
corepack pnpm dlx eas-cli login          # Expo account
corepack pnpm dlx eas-cli init           # writes the real projectId into app.json
```

Then verify `app.json`:
- `ios.bundleIdentifier` is currently `com.lordofclaude.hiloroyale`; change it only if the Apple Developer account uses another identifier.
- Add `"icon": "./assets/icon.png"` once you drop a 1024×1024 PNG in `assets/`
  (expo start works without one; App Store submission requires it).

Build + submit:

```powershell
corepack pnpm dlx eas-cli build --platform ios --profile preview     # internal .ipa for testers
corepack pnpm dlx eas-cli build --platform ios --profile production  # store build
corepack pnpm dlx eas-cli submit --platform ios                      # → TestFlight
```

EAS asks for your Apple Developer account on first build and manages certificates/profiles
in the cloud. `production` auto-increments the build number (`appVersionSource: remote`).

## 4. Real feed — replay + true 1× live mode

`GameScreen`/`LobbyScreen`/`ResultScreen` now run a deterministic Daily Lobby
selected from three named real World Cup tapes: Argentina–Switzerland
(`18222446`), France–Spain (`18237038`) and England–Argentina (`18241006`).
`src/lib/txline-mock.ts`
is kept as-is (still used as a reference/fallback); the swap was a new module,
`src/lib/txline-real.ts`, with the exact same exports (`FIXTURE`, `EVENTS`,
`stream()`), so no screen logic changed — only the import path.

How it's built:
- `scripts/gen-real-data.js <fixtureId>` pulls the cached raw historical events
  from `../shared/fixtures-cache/<fixtureId>.json` (via `../shared/txline-real.js`'s
  `buildTape()`), trims them to the `ScoreEvent` shape, and writes a typed TS
  module to `src/lib/real-data/<fixtureId>.ts`. This is bundled at build time —
  the phone needs no network call or embedded API credentials to replay a real
  match (same "recommended demo path" philosophy as `window.TXLINE_TAPE` in the
  browser apps).
- **Bug fixed upstream** in `../shared/txline-real.js` (`buildTape`'s period
  tracking): it read the string `GameState` field to detect half/ET transitions,
  but this feed leaves that field stuck at `"scheduled"` for the whole match —
  only the numeric `StatusId` is reliable (it maps directly to the same
  `GS_INPLAY_BASE` codes). Without the fix, minute-bucketing degenerated after
  ~5 duplicate kickoff-shaped events per period (periods collapsed into minute
  120), producing nonsense stat windows. Fixed by preferring `StatusId` in the
  `pick()` call; verified against `../shared/test-real.js` (136/136 still pass)
  and a runtime simulation of all 7 question windows.
- Team codes (first 3 letters, e.g. `ARG`/`SWI`), the lobby ID, and the final
  score are all derived from `FIXTURE`/`EVENTS` at
  runtime (`teamCode()`, `LOBBY_ID`, `FINAL_SCORE` in `txline-real.ts`) instead
  of hardcoded strings, so re-running the generator against a different
  fixture needs no UI changes.

To add a **different** real match:
```powershell
cd ../shared && node txline-cli.js pull <fixtureId>   # writes fixtures-cache/<id>.json
cd ../t2-hilo-royale-ios && node scripts/gen-real-data.js <fixtureId> "optional label"
```
Then import it and add it to `REPLAYS` in `txline-real.ts`. Daily selection hashes
the local `YYYY-MM-DD`; challenge links pin a fixture id so both players receive
the same schedule.

The app now keeps these as two explicit modes:

- **Replay** uses the bundled historical tape. Playback rates are relative to
  actual match time: 1×, 15×, 30× (recommended demo), or 60×. Answer and reveal
  timing are configurable in Match Control.
- **Live** uses `src/lib/live-service.ts` to read
  `GET /api/scores/stream?fixtureId=…` over SSE. Predictions lock in 8–15 seconds
  but resolve only when the real five-minute stat window closes; outcomes are
  never precomputed.

Configure live mode without committing credentials:

```powershell
$env:EXPO_PUBLIC_TXLINE_BASE_URL='https://txline.txodds.com'
$env:EXPO_PUBLIC_TXLINE_FIXTURE_ID='<live fixture id>'
$env:EXPO_PUBLIC_TXLINE_TOKEN='<activated TxLINE bearer token>'
$env:EXPO_PUBLIC_LIVE_TEAM_1='Argentina'
$env:EXPO_PUBLIC_LIVE_TEAM_2='Morocco'
pnpm start
```

Google OAuth is implemented with `expo-auth-session`. It requests profile
identity only — never Gmail/IMAP mailbox access:

```powershell
$env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID='<web OAuth client id>'
$env:EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID='<iOS OAuth client id>'
pnpm start
```

Without OAuth client IDs the code shows a transparent configuration note and
allows a local demo identity. Without live TxLINE variables the Live button is
disabled and explains which variable is missing.

For real cross-device lobby/squad presence, run the included zero-dependency
room service (locally on the same Wi-Fi or deployed behind HTTPS):

```powershell
$env:PORT=8787
pnpm room-server
# in the app terminal:
$env:EXPO_PUBLIC_HILO_API_URL='http://YOUR-LAN-IP:8787'
pnpm start
```

The room client joins by Google/guest identity and listens to SSE room
snapshots. See `server/README.md`. The included server is intentionally small
and in-memory for hackathon demos; production should add durable storage and
authenticated room tokens.

## 5. Richer question engine (precomputed schedule)

Rounds are no longer just "more/fewer corners|shots|cards in a 15-min window,"
cycled round-robin. `game-logic.ts`'s `buildSchedule(events, fixture)` — mirrored
in `../t2-hilo-royale/game-logic.js` and covered by that file's `test.js`
(91/91 assertions, up from 63) — precomputes the **entire** ~9-10 round
schedule up front, since a replay's events are fully known ahead of time:

- **1 pregame prop**: "Will there be a goal before halftime?"
- **up to 7 rolling 10-min windows**, each picking the most engaging resolvable
  template: **side-pick** head-to-heads ("more corners this window — ARG or
  SUI?"), **occurrence** yes/no bets ("a card in the next 10 min?" — never
  pushes, so it's a safe filler), or the original stat-comparison as a fallback.
- **1 halftime special**, scheduled right at the real second-half kickoff:
  "1+ substitutions in the first 10 min of the second half?"
- **1 entry per real VAR review** in the match: "will the call be upheld?",
  scheduled at the real `var` event's minute, answer read from the real
  `var_verdict`'s outcome text (`classifyVarVerdict`).

All answers stay in the existing `hi`/`lo` space (`judge`/`survives`/
`nextStreak`/`botPick`/`crowdSplit` untouched) — only the label/prompt per
question kind differs, so risk to the core elimination loop is minimal.

Found a second real bug in `shared/txline-real.js` while wiring VAR questions:
`detailFields()` only read top-level fields, but this feed nests the actual
VAR outcome under `Data.Outcome` (e.g. `"Overturned"`) — it never surfaced.
Fixed by also checking `u.Data`/`u.data`; verified against `test-real.js`
(136/136) and the real fixture's VAR entry now correctly resolves to
"Overturned" → `lo`.

To regenerate the schedule for a different fixture: nothing to do — it's
derived from `EVENTS`/`FIXTURE` at import time in `txline-real.ts`
for every entry in `REPLAYS`, so adding a generated tape requires no question UI changes.

## 6. Neon product system + viral surfaces

Two mockup decks were used as visual inspiration
(`04-pitch-decks/track2/GOOD/hilo-ios-layout-options/`,
`hilo-ios-neon-expanded-flow/` — images only, no design docs). What shipped:

- **Lobby**: "Hot Predictions" preview strip (3 cards from the schedule).
- **Game**: round counter `ROUND n/N`, an "up next" strip of the next 2 questions
  with kind icons, side-pick questions colored team-blue vs red instead of
  green vs red.
- **Result**: badges row (`src/lib/badges.ts` — Ice Veins, Comeback King,
  Perfect Round, Crowd Breaker, computed from the match's round history), and
  real **image** sharing via `react-native-view-shot` (captures the ticket to
  a PNG) alongside the existing text share.
- **Profile**: level/title from a lifetime-score table, win rate, favorite
  pick category, a badges grid (locked/unlocked) — `storage.ts`'s `Profile`
  gained `totalQuestions`/`totalCorrect`/`perKeyCorrect`/`badges`.
- **New Rank tab** (`src/screens/RankScreen.tsx`): a leaderboard built from
  this lobby's 100 simulated fan bots (`theme.ts`'s `fanName`/`FANS`) plus the
  player — explicitly labeled as local/simulated, not a real global ranking.
- **Bottom tab bar** (Play / Rank / Me) added in `App.tsx`, visible on
  Lobby/Rank/Profile, hidden during the immersive Game/Result screens.

New in the expanded product pass:

- Four-tab navigation: Play / Rank / Squad / Me.
- Secure Google OAuth-ready login plus a clearly labeled local demo identity.
- Match Control for replay/live mode, 1×–60× speed, answer time and reveal pause.
- A separate live game engine backed by the TxLINE SSE adapter.
- Squad Room with shareable `hiloroyale://squad/<code>` deep links.
- Direct WhatsApp challenge text, Instagram-compatible image sharing through
  the native share sheet, and copyable challenge links.
- **Daily Lobby** rotation, **3-second Sudden Death** for the final three,
  post-elimination **Ghost Mode**, loss-first **Death Replay** image cards, and
  deterministic beat-my-run links carrying only fixture, picks and target score.
- Global/Friends/Squads leaderboard views. Until a room API is connected the
  population and movement are explicitly labeled demo data.

### Crowd-difficulty scoring

Correct predictions earn more when fewer fans found the winning side. The
reward curve is `round(10 + 40 × (1 - correct-fan-share))`, so a correct pick
made by 90% of fans earns 14 points, a 50/50 pick earns 30, and a rare correct
pick made by only 5% earns 48. Wrong picks, timeouts, and pushes earn zero
prediction points. Final ladder points are prediction points + fans outlived +
a 250-point crown bonus.

Cross-device room presence and authoritative global rankings require a
deployed service at the future `EXPO_PUBLIC_HILO_API_URL`. The UI does not
misrepresent the local fallback as production multiplayer.

`react-native-view-shot` is pinned to `4.0.3` (Expo SDK 53's expected version,
confirmed via `expo install --check`) rather than the newer `5.x` npm gives by
default.

## File map

```
App.tsx                     auth gate, deep links, screen state + four-tab bar
src/theme.ts                palette, fan names, top-10 wall
src/types.ts                GameResult (+ badges, history), RoundRecord
src/lib/txline-mock.ts      TS port of shared/txline-mock.js (scripted fallback, unused by screens now)
src/lib/txline-real.ts      named replay catalog + deterministic Daily Lobby selector
src/lib/live-service.ts     TxLINE SSE client for true 1× live fixtures
src/lib/settings.ts         persisted replay/live pacing controls
src/lib/auth.ts             persisted Google/guest fan identity
src/lib/real-data/*.ts      generated real-match event tapes (see scripts/gen-real-data.js)
scripts/gen-real-data.js    regenerates src/lib/real-data/<fixtureId>.ts from a shared/ raw pull
src/lib/game-logic.ts       mirror of ../t2-hilo-royale/game-logic.js (tested there: node test.js)
src/lib/badges.ts           badge id -> label/icon/description
src/lib/storage.ts          AsyncStorage profile (streak/ladder + question stats + badges)
src/lib/notifications.ts    permission flow + local notification demos
src/screens/LobbyScreen     join + hot predictions preview + notification opt-in
src/screens/GameScreen      countdown → schedule-driven question loop → cascade → endgame
src/screens/ResultScreen    survival ticket + badges + image/text share + ladder stats
src/screens/ProfileScreen   level/title, win rate, favorite pick, badges grid, top-10 wall
src/screens/RankScreen      this-lobby leaderboard (simulated bots + you)
```
