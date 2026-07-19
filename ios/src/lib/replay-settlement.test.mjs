import assert from "node:assert/strict";
import {
  MAX_REPLAY_ROUND_MS,
  replaySettlementBoundary,
  replaySettlementSecondsLeft,
} from "./replay-settlement.ts";
import { CANONICAL_REPLAYS } from "./real-data/canonical.ts";
import { buildSchedule } from "./game-logic.ts";

assert.equal(MAX_REPLAY_ROUND_MS, 30_000);
assert.equal(replaySettlementBoundary(0, 45), 45);
assert.equal(replaySettlementBoundary(15, 5), 20);
assert.equal(replaySettlementSecondsLeft(1_000, 1_000), 30);
assert.equal(replaySettlementSecondsLeft(1_000, 30_001), 1);
assert.equal(replaySettlementSecondsLeft(1_000, 31_000), 0);

const franceEngland = CANONICAL_REPLAYS.find(replay => replay.fixtureId === "18257865");
assert.ok(franceEngland);
assert.deepEqual([franceEngland.fixture.Participant1, franceEngland.fixture.Participant2], ["France", "England"]);
const schedule = buildSchedule(franceEngland.events, franceEngland.fixture);
assert.ok(schedule.length > 0 && schedule.every(question => ["hi", "lo", "push"].includes(question.answer)));
assert.deepEqual(
  schedule[0] && { prompt: schedule[0].promptText, answer: schedule[0].answer },
  { prompt: "Will there be a goal before halftime?", answer: "hi" },
);

console.log("replay-settlement.test.mjs: 10 passed, 0 failed");
