import assert from "node:assert/strict";

process.env.EXPO_PUBLIC_HILO_API_URL = "https://rooms.example";
const calls = [];
let duplicate = false;
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url: String(url), method: init.method || "GET", body });
  if (body?.action === "join") return response(200, { ok: true, roomId: body.roomId, players: [], results: [], updatedAt: new Date().toISOString(), sessionToken: "signed.session" });
  if (body?.action === "pick") return response(duplicate ? 409 : 201, { ok: !duplicate, accepted: !duplicate });
  if (body?.action === "result") return response(201, { ok: true });
  if (body?.action === "settle") return response(201, { ok: true, settlement: { version: 1, roomId: body.roomId, fixtureId: body.fixtureId, round: body.round, answer: body.answer, counts: { hi: 1, lo: 0, total: 1 }, root: "a".repeat(64), entries: [], signature: "sig", explorerUrl: "https://solscan.io/tx/sig?cluster=devnet" } });
  return response(200, { ok: true, roomId: "private-TEST", players: [], results: [], updatedAt: new Date().toISOString() });
};

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const service = await import("./room-service.ts");
const identity = { id: "guest-device", name: "Test Fan", provider: "guest" };
await service.joinRoom("private-TEST", identity);
assert.equal(calls[0].url, "https://rooms.example/api/rooms");
assert.deepEqual(calls[0].body, { action: "join", roomId: "private-TEST", playerKey: "guest-device", name: "Test Fan" });

const accepted = await service.submitPrediction("private-TEST", identity, { fixtureId: "18222446", round: 1, questionId: "goal:0:45", pick: "hi", msRemaining: 4100 });
assert.equal(accepted, true);
assert.equal(calls[1].body.sessionToken, "signed.session");

duplicate = true;
assert.equal(await service.submitPrediction("private-TEST", identity, { fixtureId: "18222446", round: 1, questionId: "goal:0:45", pick: "lo", msRemaining: 3000 }), false);
await service.submitRoomResult("private-TEST", identity, { fixtureId: "18222446", pts: 120, streak: 3, outlivedCount: 40, won: false });
const settlement = await service.submitRoundSettlement("private-TEST", identity, { fixtureId: "18222446", round: 1, answer: "hi" });
assert.equal(settlement.signature, "sig");
await service.getRoom("private-TEST");
assert.equal(calls.at(-1).url, "https://rooms.example/api/rooms?roomId=private-TEST");

console.log("room-service.test.mjs: 8 passed, 0 failed");
