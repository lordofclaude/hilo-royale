"use strict";
const fs = require("node:fs");
const path = require("node:path");

let pass = 0, fail = 0;
function ok(name, value) { if (value) { pass++; console.log("  ok ", name); } else { fail++; console.error("FAIL", name); } }
function eq(name, got, want) { ok(`${name} (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want)); }

function loadHandler(env, fetchImpl, settlementOverride) {
  let src = fs.readFileSync(path.join(__dirname, "api", "rooms.js"), "utf8");
  src = src.replace(/export default async function handler/, "async function handler");
  const localRequire = id => {
    if (id === "../lib/settlement") return settlementOverride || require(path.join(__dirname, "lib", "settlement.js"));
    return require(id);
  };
  return new Function("process", "fetch", "AbortSignal", "Buffer", "require", `${src}\nreturn handler;`)({ env }, fetchImpl, AbortSignal, Buffer, localRequire);
}

function response() {
  return { statusCode: 200, headers: {}, body: null, headersSent: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(v) { this.body = v; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; },
  };
}

async function call(handler, req) {
  const res = response();
  await handler({ query: {}, headers: {}, socket: { remoteAddress: "127.0.0.1" }, ...req }, res);
  return res;
}

function fakeRedis() {
  const strings = new Map(), hashes = new Map();
  const hash = key => { if (!hashes.has(key)) hashes.set(key, new Map()); return hashes.get(key); };
  return async (_url, options) => {
    const [rawCommand, ...args] = JSON.parse(options.body);
    const command = String(rawCommand).toUpperCase();
    let result;
    if (command === "INCR") { result = Number(strings.get(args[0]) || 0) + 1; strings.set(args[0], result); }
    else if (command === "SET") { const nx = String(args[2] || "").toUpperCase() === "NX"; if (nx && strings.has(args[0])) result = null; else { strings.set(args[0], args[1]); result = "OK"; } }
    else if (command === "GET") result = strings.get(args[0]) ?? null;
    else if (command === "DEL") { result = strings.delete(args[0]) || hashes.delete(args[0]) ? 1 : 0; }
    else if (command === "EXPIRE") result = 1;
    else if (command === "HGET") result = hash(args[0]).get(args[1]) ?? null;
    else if (command === "HLEN") result = hash(args[0]).size;
    else if (command === "HSET") { const target = hash(args[0]); const existed = target.has(args[1]); target.set(args[1], args[2]); result = existed ? 0 : 1; }
    else if (command === "HSETNX") { const target = hash(args[0]); if (target.has(args[1])) result = 0; else { target.set(args[1], args[2]); result = 1; } }
    else if (command === "HGETALL") { result = [...hash(args[0]).entries()].flat(); }
    else throw new Error(`unsupported fake redis command ${command}`);
    return { ok: true, status: 200, json: async () => ({ result }) };
  };
}

async function main() {
  const baseEnv = { KV_REST_API_URL: "https://redis.invalid", KV_REST_API_TOKEN: "test-token", ROOM_SIGNING_SECRET: "test-signing-secret" };
  let handler = loadHandler({}, async () => { throw new Error("fetch should not run"); });
  eq("missing storage is explicit", (await call(handler, { method: "GET", query: { roomId: "ABC" } })).statusCode, 503);

  const redis = fakeRedis();
  handler = loadHandler(baseEnv, redis);
  eq("hostile web origin denied", (await call(handler, { method: "GET", query: { roomId: "ABC" }, headers: { origin: "https://evil.example" } })).statusCode, 403);
  eq("invalid room rejected", (await call(handler, { method: "GET", query: { roomId: "bad room" } })).statusCode, 400);

  const joinA = await call(handler, { method: "POST", body: { action: "join", roomId: "private-TEST", playerKey: "device-a", name: "Alice" } });
  eq("first friend joins", joinA.statusCode, 200);
  ok("join returns signed session", typeof joinA.body.sessionToken === "string" && joinA.body.sessionToken.includes("."));
  const joinB = await call(handler, { method: "POST", body: { action: "join", roomId: "private-TEST", playerKey: "device-b", name: "Bob" } });
  eq("second friend joins", joinB.statusCode, 200);
  eq("two-device room snapshot", joinB.body.players.map(player => player.name), ["Alice", "Bob"]);

  const pick = { action: "pick", roomId: "private-TEST", sessionToken: joinA.body.sessionToken, fixtureId: "18222446", round: 1, questionId: "goal-before-half", pick: "hi", msRemaining: 4200 };
  eq("first pick is durably accepted", (await call(handler, { method: "POST", body: pick })).statusCode, 201);
  const duplicate = await call(handler, { method: "POST", body: { ...pick, pick: "lo" } });
  eq("locked pick cannot be overwritten", { status: duplicate.statusCode, reason: duplicate.body.reason }, { status: 409, reason: "pick-already-locked" });
  eq("invalid token rejected", (await call(handler, { method: "POST", body: { ...pick, sessionToken: "bad.token", round: 2 } })).statusCode, 400);
  const pickB = await call(handler, { method: "POST", body: { ...pick, sessionToken: joinB.body.sessionToken, pick: "lo" } });
  eq("second friend's vote is stored", pickB.statusCode, 201);

  const settlementLib = require(path.join(__dirname, "lib", "settlement.js"));
  let chainWrites = 0;
  const settlementOverride = {
    ...settlementLib,
    async recordSolanaSettlement(details) {
      chainWrites += 1;
      return {
        signature: "test-solana-signature",
        payer: "test-payer",
        memo: settlementLib.settlementMemo(details),
        network: "devnet",
        explorerUrl: "https://solscan.io/tx/test-solana-signature?cluster=devnet",
      };
    },
  };
  const settlementHandler = loadHandler({ ...baseEnv, SOLANA_SETTLEMENT_SECRET: "test" }, redis, settlementOverride);
  const settled = await call(settlementHandler, { method: "POST", body: { action: "settle", roomId: "private-TEST", sessionToken: joinA.body.sessionToken, fixtureId: "18222446", round: 1, answer: "hi" } });
  eq("round settles to Solana", settled.statusCode, 201);
  eq("both votes are committed", settled.body.settlement.counts, { hi: 1, lo: 1, total: 2 });
  ok("every returned vote has a valid Merkle proof", settled.body.settlement.entries.every(entry => settlementLib.verifyVoteProof("private-TEST", entry, settled.body.settlement.root)));
  ok("settlement exposes pseudonyms, not friend names", !/Alice|Bob/.test(JSON.stringify(settled.body.settlement)));
  eq("one Solana write is made", chainWrites, 1);
  const settledAgain = await call(settlementHandler, { method: "POST", body: { action: "settle", roomId: "private-TEST", sessionToken: joinA.body.sessionToken, fixtureId: "18222446", round: 1, answer: "hi" } });
  eq("repeat settlement returns same receipt", { status: settledAgain.statusCode, sig: settledAgain.body.settlement.signature }, { status: 200, sig: "test-solana-signature" });
  eq("repeat settlement does not write again", chainWrites, 1);
  const conflictingSettlement = await call(settlementHandler, { method: "POST", body: { action: "settle", roomId: "private-TEST", sessionToken: joinA.body.sessionToken, fixtureId: "18222446", round: 1, answer: "lo" } });
  eq("a settled answer cannot be rewritten", { status: conflictingSettlement.statusCode, reason: conflictingSettlement.body.reason }, { status: 409, reason: "settlement-answer-conflict" });
  const settlementLookup = await call(settlementHandler, { method: "GET", query: { roomId: "private-TEST", fixtureId: "18222446", round: "1" } });
  eq("settlement is publicly queryable", { status: settlementLookup.statusCode, sig: settlementLookup.body.settlement.signature }, { status: 200, sig: "test-solana-signature" });

  const result = await call(handler, { method: "POST", body: { action: "result", roomId: "private-TEST", sessionToken: joinA.body.sessionToken, fixtureId: "18222446", result: { pts: 321, streak: 4, outlivedCount: 88, won: false } } });
  eq("result stored", result.statusCode, 201);
  const snapshot = await call(handler, { method: "GET", query: { roomId: "private-TEST" } });
  eq("stored result appears in room leaderboard", snapshot.body.results.map(item => [item.name, item.pts]), [["Alice", 321]]);
  ok("snapshots never expose session tokens", !JSON.stringify(snapshot.body).includes(joinA.body.sessionToken));

  console.log(`\nrooms-api.test.js: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
