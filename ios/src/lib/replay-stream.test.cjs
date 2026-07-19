"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const fixture = {
  FixtureId: 1,
  Competition: "Test Cup",
  Participant1: "France",
  Participant2: "England",
  Participant1IsHome: true,
  StartTime: "2026-07-18T21:00:00.000Z",
};
const baseEvents = [
  { seq: 1, minute: 0, type: "kickoff", team: 0, detail: "", stats: { g1: 0, g2: 0 }, teamName: "—" },
  { seq: 2, minute: 10, type: "goal", team: 2, detail: "", stats: { g1: 0, g2: 1 }, teamName: "England" },
  { seq: 3, minute: 20, type: "game_finalised", team: 0, detail: "", stats: { g1: 0, g2: 1 }, teamName: "—" },
];

const source = fs.readFileSync(path.join(__dirname, "txline-real.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
const localRequire = id => {
  if (id === "./real-data/canonical") return { CANONICAL_REPLAYS: [{ fixtureId: "1", fixture, events: baseEvents, captureStatus: "complete", capturedThroughMinute: 20 }] };
  if (id === "./real-data/18222446.proof") return { ONCHAIN_PROOF: { txSig: "test" } };
  if (id === "./game-logic") return { buildSchedule: () => [], dailyIndex: () => 0, dailyKey: () => "test" };
  return require(id);
};
new Function("require", "module", "exports", compiled)(localRequire, loaded, loaded.exports);

const emitted = [];
let completed = 0;
const handle = loaded.exports.streamReplay({ fixtureId: "1", fixture, events: baseEvents }, {
  speed: 0,
  onEvent: event => emitted.push(event.seq),
  onDone: () => { completed += 1; },
});
handle.settleThrough(10);
assert.deepEqual(emitted, [1, 2]);
assert.equal(completed, 0);
handle.settleThrough(20);
assert.deepEqual(emitted, [1, 2, 3]);
assert.equal(completed, 1);
handle.settleThrough(30);
assert.equal(completed, 1);
handle.stop();

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "App.tsx"), "utf8");
assert.match(appSource, /TAB_SCREENS\.includes\(screen\) \|\| screen === "game"/);
assert.match(appSource, /screen === "game" \? "Exit" : "Play"/);

const gameSource = fs.readFileSync(path.join(__dirname, "..", "screens", "GameScreen.tsx"), "utf8");
assert.match(gameSource, /P\.settlementStartedAt = Date\.now\(\)/);
assert.match(gameSource, /function pick[\s\S]*?armReplaySettlement\(P\);/);
assert.match(gameSource, /settleThrough\(replaySettlementBoundary\(P\.q\.fromMin, P\.q\.windowLen\)\)/);

console.log("replay-stream.test.cjs: 10 passed, 0 failed");
