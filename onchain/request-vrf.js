/* Request verifiable randomness from ORAO VRF on Solana devnet and save the
   proof (seed, randomness, tx signature, explorer links) to vrf-proof.json.
   This one devnet transaction seeds Hi-Lo Royale's lobby: bot skills, bot
   picks and tie-breaks all derive from the fulfilled randomness through a
   deterministic PRNG, so the "luck" in a lobby is provably fair.

   Wallet: the gitignored hackathon devnet wallet (override with VRF_WALLET).
   Run: corepack pnpm vrf                                                  */
const fs = require("fs");
const crypto = require("crypto");
const { Keypair, Connection } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const { Orao } = require("@orao-network/solana-vrf");

const WALLET =
  process.env.VRF_WALLET ||
  "C:/Users/lordo/Desktop/SolanaTxODDsHackathon/08-integration/tx-on-chain/_keys/hackathon-wallet.json";

(async () => {
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(WALLET, "utf8"))));
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(kp), { commitment: "confirmed" });
  const vrf = new Orao(provider);
  console.log("payer:", kp.publicKey.toBase58());

  // Client-chosen seed (also the request account seed on-chain).
  const builder = await vrf.request();
  const [seed, tx] = await builder.rpc();
  const seedHex = Buffer.from(seed).toString("hex");
  console.log("request tx:", tx);
  console.log("seed:", seedHex);

  console.log("waiting for fulfillment…");
  // waitFulfilled resolves to FulfilledRandomnessAccountData (randomness on it directly)
  const fulfilled = await vrf.waitFulfilled(seed);
  const rndBytes = Buffer.from(fulfilled.randomness);
  if (rndBytes.every((b) => b === 0)) throw new Error("randomness all zeros — not fulfilled");
  const rndHex = rndBytes.toString("hex");
  console.log("randomness:", rndHex);

  const proof = {
    network: "devnet",
    program: "ORAO VRF",
    payer: kp.publicKey.toBase58(),
    seed: seedHex,
    randomness: rndHex,
    requestTx: tx,
    explorerTx: `https://solscan.io/tx/${tx}?cluster=devnet`,
    requestedAt: new Date().toISOString(),
  };
  fs.writeFileSync(`${__dirname}/vrf-proof.json`, JSON.stringify(proof, null, 2));
  console.log("wrote vrf-proof.json");
})().catch((e) => { console.error("FAILED:", e.message || e); process.exit(1); });
