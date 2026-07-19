"use strict";

const { buildVoteTranscript, canonicalVote, settlementMemo, verifyVoteProof } = require("./lib/settlement");

let pass = 0;
let fail = 0;
function ok(name, value) {
  if (value) { pass += 1; console.log("  ok ", name); }
  else { fail += 1; console.error("FAIL", name); }
}
function eq(name, got, want) { ok(`${name} (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want)); }

const records = [
  { playerId: "fan-c", fixtureId: "18222446", round: 3, questionId: "corners:20:5", pick: "hi", lockedAt: "2026-07-18T01:00:02.000Z" },
  { playerId: "fan-a", fixtureId: "18222446", round: 3, questionId: "corners:20:5", pick: "lo", lockedAt: "2026-07-18T01:00:00.000Z" },
  { playerId: "fan-b", fixtureId: "18222446", round: 3, questionId: "corners:20:5", pick: "hi", lockedAt: "2026-07-18T01:00:01.000Z" },
];
const transcript = buildVoteTranscript("private-FINAL", records);
eq("entries are canonicalized by pseudonymous player", transcript.entries.map(entry => entry.playerId), ["fan-a", "fan-b", "fan-c"]);
ok("root is SHA-256", /^[a-f0-9]{64}$/.test(transcript.root));
ok("every odd-sized tree proof verifies", transcript.entries.every(entry => verifyVoteProof("private-FINAL", entry, transcript.root)));
const tampered = { ...transcript.entries[0], pick: "hi" };
ok("a changed vote fails proof verification", !verifyVoteProof("private-FINAL", tampered, transcript.root));
ok("canonical leaf includes the immutable lock time", canonicalVote("private-FINAL", records[0]).endsWith("|2026-07-18T01:00:02.000Z"));
const memo = settlementMemo({ roomId: "private-FINAL", fixtureId: "18222446", round: 3, answer: "lo", hi: 2, lo: 1, root: transcript.root });
ok("memo is compact and carries the Merkle root", memo.startsWith("HILO_SETTLE_V1|") && memo.includes(`root=${transcript.root}`) && Buffer.byteLength(memo) < 300);
ok("memo hashes the private room code", !memo.includes("private-FINAL"));

console.log(`\nsettlement.test.js: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
