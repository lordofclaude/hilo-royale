"use strict";

const crypto = require("node:crypto");

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function canonicalVote(roomId, record) {
  return [
    "v1",
    roomId,
    String(record.fixtureId),
    String(record.round),
    String(record.playerId),
    String(record.questionId),
    String(record.pick),
    String(record.lockedAt),
  ].join("|");
}

function buildVoteTranscript(roomId, records) {
  const entries = records
    .filter(record => record && (record.pick === "hi" || record.pick === "lo"))
    .map(record => ({ ...record, canonical: canonicalVote(roomId, record) }))
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
  if (!entries.length) throw new Error("no-locked-picks");

  const levels = [entries.map(entry => sha256(entry.canonical))];
  while (levels[levels.length - 1].length > 1) {
    const current = levels[levels.length - 1];
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1] || left;
      next.push(sha256(Buffer.concat([left, right])));
    }
    levels.push(next);
  }

  return {
    root: levels[levels.length - 1][0].toString("hex"),
    entries: entries.map((entry, leafIndex) => {
      let index = leafIndex;
      const proof = [];
      for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
        const level = levels[levelIndex];
        const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
        const sibling = level[siblingIndex] || level[index];
        proof.push({ side: index % 2 === 0 ? "right" : "left", hash: sibling.toString("hex") });
        index = Math.floor(index / 2);
      }
      return {
        playerId: entry.playerId,
        fixtureId: entry.fixtureId,
        round: entry.round,
        questionId: entry.questionId,
        pick: entry.pick,
        lockedAt: entry.lockedAt,
        leaf: levels[0][leafIndex].toString("hex"),
        proof,
      };
    }),
  };
}

function verifyVoteProof(roomId, entry, root) {
  let hash = sha256(canonicalVote(roomId, entry));
  for (const step of entry.proof || []) {
    const sibling = Buffer.from(String(step.hash), "hex");
    hash = step.side === "left"
      ? sha256(Buffer.concat([sibling, hash]))
      : sha256(Buffer.concat([hash, sibling]));
  }
  return hash.toString("hex") === root;
}

function settlementMemo({ roomId, fixtureId, round, answer, hi, lo, root }) {
  const roomHash = sha256(String(roomId)).toString("hex").slice(0, 16);
  return [
    "HILO_SETTLE_V1",
    `room=${roomHash}`,
    `fixture=${fixtureId}`,
    `round=${round}`,
    `answer=${answer}`,
    `hi=${hi}`,
    `lo=${lo}`,
    `root=${root}`,
  ].join("|");
}

function secretKeyBytes(rawSecret) {
  let parsed;
  try { parsed = JSON.parse(String(rawSecret || "")); } catch { throw new Error("solana-secret-invalid"); }
  if (!Array.isArray(parsed) || parsed.length !== 64 || parsed.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new Error("solana-secret-invalid");
  }
  return Uint8Array.from(parsed);
}

async function recordSolanaSettlement(details, env = process.env, web3Override) {
  const web3 = web3Override || require("@solana/web3.js");
  const payer = web3.Keypair.fromSecretKey(secretKeyBytes(env.SOLANA_SETTLEMENT_SECRET));
  const memo = settlementMemo(details);
  const instruction = new web3.TransactionInstruction({
    programId: new web3.PublicKey(MEMO_PROGRAM_ID),
    keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });
  const transaction = new web3.Transaction().add(instruction);
  const connection = new web3.Connection(env.SOLANA_RPC_URL || DEFAULT_RPC_URL, "confirmed");
  const signature = await web3.sendAndConfirmTransaction(connection, transaction, [payer], {
    commitment: "confirmed",
    maxRetries: 3,
  });
  const cluster = String(env.SOLANA_CLUSTER || "devnet").replace(/[^a-z0-9-]/gi, "") || "devnet";
  return {
    signature,
    payer: payer.publicKey.toBase58(),
    memo,
    network: cluster,
    explorerUrl: `https://solscan.io/tx/${signature}?cluster=${cluster}`,
  };
}

module.exports = {
  MEMO_PROGRAM_ID,
  buildVoteTranscript,
  canonicalVote,
  recordSolanaSettlement,
  settlementMemo,
  verifyVoteProof,
};
