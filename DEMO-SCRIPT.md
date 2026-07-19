# Hi-Lo Royale judge demo runbook

Use the complete, proof-backed Argentina–Switzerland replay for every judged
demo. The stage URL is:

**https://hilo-royale.vercel.app/login?fixture=18222446&demo=1**

The purpose of this demo is not to tour every screen. It is to make the jury
feel the elimination, show why the losing result is the viral loop, and then
prove that the experience is driven by TxLINE with honestly scoped Solana
receipts.

## Ten-minute preflight

1. Open **https://hilo-royale.vercel.app/demo** in the first browser tab.
   Confirm every readiness check turns green.
2. Open the judge URL above in a second tab. If an old guest is still signed in,
   click the **X / Leave arena** control in the top-right, reopen the judge URL,
   type `STAGE` in **Fan handle**, and click **ENTER THE ARENA**.
3. If the first-visit guide appears, click **GOT IT — LET ME IN** before the
   presentation begins. Leave the arena on the **START 3-MINUTE DEMO** screen.
4. Pre-open the score receipt in a third tab:
   **https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet**
5. Pre-open the randomness receipt in a fourth tab:
   **https://solscan.io/tx/4Fn4icgVJEftWm5TuWKWejY3p1adboCydqvragTyEXrsN6yBPx12bdeynrsW6pkuFR3xgMYovV3bXp7DTEuuwikH?cluster=devnet**
6. Set the browser to 100% zoom and 1440×900 or 1920×1080. Turn system
   notifications off. Keep the product sound on, but set volume around 35%.
7. If showing iOS, open the same Argentina–Switzerland replay before going on
   stage. Use replay mode unless a live fixture has passed the online preflight.
8. Keep a local fallback ready: from the repository root run `npm run dev`,
   then use `http://127.0.0.1:8080/login?fixture=18222446&demo=1`.

## The three-minute golden path

| Time | Exact action | What to say | Why this beat exists |
| --- | --- | --- | --- |
| 0:00 | On the arena tab, click **START 3-MINUTE DEMO**. Let the countdown land on the first question. | “One hundred fans enter one real match. Every match window becomes one six-second call.” | Start inside the product. The jury understands the mechanic before hearing infrastructure. |
| 0:10 | On **ROUND 1**, wait until the crowd bar starts moving, then click **YES** for “Will there be a goal before halftime?” | “I am not betting money. I am betting my place in the crowd.” | The choice is instantly legible and the moving crowd makes it feel shared. |
| 0:19 | Do not click anything. Let the lock, correct reveal, fan dots, and elimination ticker play. Point at **OPEN → LOCKED → SETTLED** and the falling alive count. | “The pick locks. The real TxLINE tape advances. One answer settles the entire lobby—and the wrong dots disappear together.” | This is the emotional money shot and the settlement model in one view. |
| 0:36 | On **ROUND 2**, deliberately click **HIGHER**. The correct answer is **LOWER**. | “Now I will lose on purpose, because losing is where our growth loop starts.” | A controlled loss is more useful than trying to win twelve rounds on stage. Demo mode ends the run immediately after the reveal. |
| 0:49 | When the result opens, point to the personalized survival ticket and the “outlived” count. | “Even a loss creates an identity artifact: my fixture, my streak, my rank, and how many rivals I outlived.” | Makes the result feel collectible instead of punitive. |
| 1:02 | Click **Copy challenge link**. Wait for **Challenge link copied**, then click **Open challenge**. | “That link carries my exact run. A friend replays the same match with my picks riding beside them as a ghost. Ninety-nine losing outcomes become ninety-nine acquisition surfaces.” | Demonstrates the viral mechanic with a real product action, not a growth slide. |
| 1:20 | Switch to **/demo** and point across the data-to-settlement flow. | “TxLINE scores and StablePrice odds enter our credential-safe proxy. A deterministic compiler creates the question. Picks lock, one outcome settles, and web and iOS render the same canonical match.” | Connects the spectacle to the sponsor technology without losing the product story. |
| 1:43 | Switch to the pre-opened `validateStatV2` Solscan tab. | “This shipped transaction proves the Argentina–Switzerland 3–1 final score against TxODDS’s devnet root. It demonstrates the on-chain settlement path; I am not claiming every round is already on-chain.” | Shows a real receipt while keeping the claim precise. |
| 2:03 | Switch to the pre-opened ORAO tab. | “This fulfilled ORAO request supplies the prototype seed source for bot picks and tie-breaks. Per-lobby transcript commitments are the next step.” | Proves real Solana integration without overstating end-to-end fairness. |
| 2:20 | Return to **/demo** and show the jury checklist and web/iOS evidence. If a phone is available, hold up the native result screen for five seconds. | “The judge path is always available as a complete TxLINE replay. Live mode enhances it when the feed is inside a valid match window. The same canonical data and parity-tested rules power web and native iOS.” | Removes live-feed risk and establishes shipped cross-platform execution. |
| 2:42 | Scroll to the final trophy visual and stop clicking. | “Hi-Lo Royale is free for fans and sold as sponsored match lobbies to clubs, brands, broadcasters, and rights holders. We start with 104 World Cup moments, then become the interactive game layer for every live sport.” | Ends on market scale and a clear business model rather than implementation detail. |

## The deterministic stage answers

Only the first two are needed for the golden path. The full answer key is useful
for rehearsal or a longer judge session.

| Round | Prompt shorthand | Correct control |
| --- | --- | --- |
| 1 | Goal before halftime | **YES** |
| 2 | Switzerland probability at 15′ | **LOWER** |
| 3 | Card in next 10 minutes | **NO** |
| 4 | Shot in next 10 minutes | **NO** |
| 5 | Corner in next 10 minutes | **YES** |
| 6 | Cards versus prior window | **HIGHER** |
| 7 | Three or more second-half goals | **YES** |
| 8 | Early second-half substitution | **NO** |
| 9 | Corners versus prior window | **LOWER** |
| 10 | More shots by Argentina or Switzerland | **SWITZERLAND** |
| 11 | Switzerland probability at 75′ | **HIGHER** |
| 12 | VAR call upheld | **OVERTURNED** |

## Failure recovery without breaking the story

- **Accidental wrong click:** let the result open and continue at the viral beat.
  The loss is already part of the intended story. Click **Restart judge run** if
  a judge asks to see another round.
- **No internet:** use the local replay URL. The core arena, question compiler,
  share-card generation, and ghost encoding are static and continue to work.
- **Solscan is slow:** keep both receipts pre-opened and show their loaded tabs.
  Never wait on a blockchain explorer during the spoken demo.
- **Live TxLINE is outside its match window:** do not force Live. Say, “The safe
  judge path is a complete TxLINE replay; the same server-side bridge activates
  live only when fixture, kickoff, and both team labels agree.”
- **iPhone or Expo tunnel fails:** show the web result and the iOS screenshots on
  `/demo`. The native app is evidence, not a dependency for the core demo.
- **Clipboard permission is denied:** use **Share** or **Save streak card** and
  continue. The challenge URL is still created by the same run.

## Claims to make precisely

- **Real now:** six TxLINE web captures, four cross-platform canonical replays,
  credential-safe live proxy/SSE, deterministic question and settlement engine,
  deployed web product, native Expo iOS experience, one score-proof transaction,
  and one fulfilled ORAO randomness request.
- **Simulated now:** the other 99 fans and most leaderboard entries.
- **Next:** hosted real-time rooms, per-lobby seed and transcript commitments,
  fully on-chain crown settlement, club identity, and sponsored lobby inventory.

Do not say every round is already Merkle-anchored, that the bots are real users,
or that a TestFlight build exists unless one has been produced and verified.
