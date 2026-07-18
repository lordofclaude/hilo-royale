#!/usr/bin/env node
/* Regenerate src/lib/real-data/<fixtureId>.ts from a cached raw pull.
   Mirrors ../../shared/build-real-tapes.js but emits a typed TS module
   (FIXTURE + EVENTS: ScoreEvent[]) instead of a browser window.TXLINE_TAPE
   preload, since Expo/RN has no synchronous script-tag loading.

   Prereq: the raw fixture must already be pulled into
   ../../shared/fixtures-cache/<fixtureId>.json (via
   `cd ../../shared && node txline-cli.js pull <fixtureId>`).

   Usage: node scripts/gen-real-data.js <fixtureId> ["Human label for the comment"]
*/
const fs = require("fs");
const path = require("path");
const TxReal = require("../../shared/txline-real.js");

const fid = process.argv[2] || "18222446";
const label = process.argv[3] || "";

const CACHE = path.join(__dirname, "../../shared/fixtures-cache", fid + ".json");
const OUT_DIR = path.join(__dirname, "../src/lib/real-data");
const raw = JSON.parse(fs.readFileSync(CACHE, "utf8"));

const KEEP = new Set(["goal", "yellow_card", "red_card", "corner", "shot", "free_kick",
  "penalty", "penalty_outcome", "var", "var_end", "substitution", "kickoff",
  "halftime_finalised", "game_finalised", "additional_time", "action_amend", "suspend"]);
const filtered = raw.historical.filter(e => KEEP.has(e.Action));
const tape = TxReal.buildTape({ fixture: raw.fixture, historical: filtered, odds: raw.odds });

const FIXTURE = {
  FixtureId: tape.fixture.FixtureId,
  Competition: "FIFA World Cup 2026",
  Participant1: tape.fixture.Participant1,
  Participant2: tape.fixture.Participant2,
  Participant1IsHome: tape.fixture.Participant1IsHome,
  StartTime: new Date(tape.fixture.StartTime).toISOString(),
};

const EVENTS = tape.events.map(e => ({
  seq: e.seq, minute: e.minute, type: e.type, team: e.team, detail: e.detail,
  stats: e.stats, teamName: e.teamName,
}));

const header = `/* AUTO-GENERATED from shared/fixtures-cache/${fid}.json via shared/txline-real.js\n` +
  `   buildTape(). Regenerate: node scripts/gen-real-data.js ${fid}\n` +
  (label ? `   Fixture: ${label} */\n` : `   Fixture: ${FIXTURE.Participant1} vs ${FIXTURE.Participant2}, ${FIXTURE.Competition}. */\n`);

const out = header +
  `import type { ScoreEvent } from "../txline-mock";\n\n` +
  `export const FIXTURE = ${JSON.stringify(FIXTURE, null, 2)} as const;\n\n` +
  `export const EVENTS: ScoreEvent[] = ${JSON.stringify(EVENTS, null, 2)};\n`;

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, fid + ".ts");
fs.writeFileSync(outFile, out);
console.log(`wrote ${EVENTS.length} events -> ${outFile} (${(out.length / 1024).toFixed(0)} KB)`);
