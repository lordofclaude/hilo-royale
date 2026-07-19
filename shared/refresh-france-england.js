#!/usr/bin/env node
/* Refresh the committed France–England replay from the credential-safe
   production bridge. The bridge returns the completed TxLINE score history;
   this script keeps only replay-relevant actions and preserves the previously
   captured StablePrice timeline already stored in the tape.

   Usage: node shared/refresh-france-england.js
   Override the bridge for staging with HILO_API_URL=https://example.test.
*/
"use strict";

const fs = require("fs");
const path = require("path");

const FIXTURE_ID = "18257865";
const EXPECTED_SCORE = { g1: 4, g2: 6 };
const ROOT = path.resolve(__dirname, "..");
const TAPE_PATH = path.join(__dirname, "real-data", `${FIXTURE_ID}.tape.js`);
const API_ROOT = String(process.env.HILO_API_URL || "https://hilo-royale.vercel.app").replace(/\/$/, "");
const SCORES_URL = `${API_ROOT}/api/txline?fixtureId=${FIXTURE_ID}&mode=scores`;
const KEEP = new Set([
  "goal", "yellow_card", "red_card", "corner", "shot", "free_kick",
  "penalty", "penalty_outcome", "var", "var_end", "substitution", "kickoff",
  "halftime_finalised", "game_finalised", "additional_time", "action_amend", "suspend",
]);

function readTape(file) {
  const source = fs.readFileSync(file, "utf8").trim();
  const prefix = "window.TXLINE_TAPE = ";
  if (!source.startsWith(prefix)) throw new Error(`Unexpected tape format: ${file}`);
  return JSON.parse(source.slice(prefix.length).replace(/;\s*$/, ""));
}

function scoreFrom(update) {
  const stats = update && (update.Stats || update.stats) || {};
  return { g1: Number(stats[1] || 0), g2: Number(stats[2] || 0) };
}

async function main() {
  const response = await fetch(SCORES_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Replay refresh failed: HTTP ${response.status}`);
  const historical = await response.json();
  if (!Array.isArray(historical) || historical.length < 100) {
    throw new Error(`Replay refresh returned only ${Array.isArray(historical) ? historical.length : 0} updates`);
  }

  const completed = historical.filter(row => row && row.Action === "game_finalised").at(-1);
  if (!completed) throw new Error("Replay refresh is not complete: game_finalised is missing");
  const finalScore = scoreFrom(completed);
  if (finalScore.g1 !== EXPECTED_SCORE.g1 || finalScore.g2 !== EXPECTED_SCORE.g2) {
    throw new Error(`Unexpected final score ${finalScore.g1}-${finalScore.g2}; expected ${EXPECTED_SCORE.g1}-${EXPECTED_SCORE.g2}`);
  }

  const tape = readTape(TAPE_PATH);
  const relevant = historical.filter(row => row && KEEP.has(row.Action));
  if (!relevant.some(row => row.Action === "game_finalised")) {
    throw new Error("Filtered replay lost game_finalised");
  }
  tape.fixture = {
    ...(tape.fixture || {}),
    FixtureId: Number(FIXTURE_ID),
    Competition: "FIFA World Cup 2026",
    Participant1: "France",
    Participant2: "England",
    Participant1IsHome: true,
    StartTime: 1784408400000,
  };
  tape.historical = relevant;
  fs.writeFileSync(TAPE_PATH, `window.TXLINE_TAPE = ${JSON.stringify(tape)};\n`);

  const rel = path.relative(ROOT, TAPE_PATH);
  console.log(`refreshed ${rel}: ${relevant.length} replay events from ${historical.length} TxLINE updates`);
  console.log(`validated completed fixture ${FIXTURE_ID}: France ${finalScore.g1}-${finalScore.g2} England`);
}

main().catch(error => {
  console.error(error && error.message || error);
  process.exitCode = 1;
});
