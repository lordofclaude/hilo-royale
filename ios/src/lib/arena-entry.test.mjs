import assert from "node:assert/strict";
import { arenaEntryMode } from "./arena-entry.ts";

assert.equal(arenaEntryMode("replay", false), "replay");
assert.equal(arenaEntryMode("live", true), "live");
assert.equal(
  arenaEntryMode("live", false),
  "replay",
  "an unavailable live fixture must fall back to SIM LIVE instead of blocking entry",
);

console.log("arena-entry.test.mjs: 3 passed, 0 failed");
