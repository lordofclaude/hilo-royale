# Hi-Lo Royale 👑

**100 fans enter. One survives the stats.** A mobile prediction battle royale
on real World Cup data, with results provable on Solana.

→ **Read [ABOUT.md](ABOUT.md) for the full story** — what it is, how it works,
what's real vs. simulated, and the roadmap.

## Repo layout

```
ios/     Expo (SDK 54) React Native app — the main experience
web/     single-file browser build sharing the same game engine
shared/  bundled real TxLINE match data + feed adapters used by both
```

## Run the iOS app (Expo Go)

```powershell
cd ios
corepack pnpm install
corepack pnpm start        # same Wi-Fi, scan the QR with your iPhone
corepack pnpm tunnel       # or a tunnel link that works from anywhere
```

Requires the Expo Go app (App Store). Use **pnpm via corepack** — not npm.
More detail (TestFlight shipping, swapping fixtures, feed wiring): `ios/RUN.md`.

## Run the web build

Serve the **repo root** (the page loads `../shared/…`), then open `/web/`:

```powershell
python -m http.server 8080
# → http://localhost:8080/web/
```

## Run the engine tests

```powershell
cd web
node test.js               # ~100 assertions over the shared game logic
```

## Provenance

Built for the TxODDS × Solana World Cup hackathon (July 2026). Extracted from
the hackathon monorepo; match data pulled from the TxLINE devnet feed via an
on-chain subscription, and the featured fixture's final score is settled with
a real `validateStatV2` transaction —
[view it on Solscan (devnet)](https://solscan.io/tx/47rYc5tphp3y3MuyCfr4KSgHLtCYZfCVknhZB57SzTPVpyWSkVUgkkvmw4kS4nGyzN2Eb49oyAUYkPJsiX4uRdhA?cluster=devnet).
