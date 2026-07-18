#!/usr/bin/env node
/* Compact a raw fixtures-cache/<id>.json (huge: all score updates + all odds
   payloads) into browser-sized preload artifacts that drive the four apps on
   REAL TxLINE data:
     <id>.tape.js      window.TXLINE_TAPE   — meaningful score events + a
                        downsampled 1X2 StablePrice consensus timeline.
                        Drives VAR Court, Hi-Lo Royale, SurpriseIndex via
                        txline-real.js (which aliases window.TxMock).
     <id>.surface.js   window.TXLINE_SURFACE — real multi-market surfaces
                        (1X2 + Over/Under + Asian Handicap) sampled at several
                        timestamps, for Coherence Agent's real-data mode.
   Usage: node build-real-tapes.js <fixtureId>
*/
const fs = require("fs"), path = require("path");
const CACHE = path.join(__dirname, "fixtures-cache");   // raw pulls (gitignored)
const OUT = path.join(__dirname, "real-data");           // compact, committed artifacts
fs.mkdirSync(OUT, { recursive: true });
const fid = process.argv[2] || "18222446";
const raw = JSON.parse(fs.readFileSync(path.join(CACHE, fid + ".json"), "utf8"));

// ---- 1. meaningful score events (drop possession/coverage spam) ----
const KEEP = new Set(["goal","yellow_card","red_card","corner","shot","free_kick",
  "penalty","penalty_outcome","var","var_end","substitution","kickoff",
  "halftime_finalised","game_finalised","additional_time","action_amend","suspend"]);
const events = raw.historical.filter(e => KEEP.has(e.Action));

// ---- 2. downsampled 1X2 StablePrice consensus timeline ----
// Bookmaker 10021 = TXLineStablePriceDemargined. Pct = implied % per PriceName.
// CRITICAL: the raw pull interleaves FULL-MATCH 1X2 with H1-only ("half=1"),
// ET-only ("et") and pre-match variants of the same SuperOddsType — mixing them
// makes the timeline oscillate between price sets. Full-match = MarketPeriod null.
const isConsensus = o => o.BookmakerId === 10021 && o.MarketPeriod == null;
const oneX2 = raw.odds
  .filter(o => o.SuperOddsType === "1X2_PARTICIPANT_RESULT" && isConsensus(o)
    && Array.isArray(o.Pct) && o.Pct[0] !== "NA" && o.Pct[0] != null)
  .map(o => ({ Ts: o.Ts, SuperOddsType: o.SuperOddsType,
    PriceNames: o.PriceNames, Pct: o.Pct }))
  .sort((a, b) => a.Ts - b.Ts);
// keep >= 8s apart to bound size while preserving the move shape
const odds = [];
let lastTs = -1e15;
for (const o of oneX2) { if (o.Ts - lastTs >= 8000) { odds.push(o); lastTs = o.Ts; } }

const bundle = { fixture: raw.fixture || { FixtureId: Number(fid) }, historical: events, odds };
const tapeJs = path.join(OUT, fid + ".tape.js");
fs.writeFileSync(tapeJs, "window.TXLINE_TAPE = " + JSON.stringify(bundle) + ";\n");

// ---- 3. real multi-market surface samples for Coherence ----
// Group all three families by nearest sample timestamp; emit surfaces that
// carry >=1 market from each family (so C1/C2/C3 have inputs).
function toDecimal(prices) { return prices.map(p => p / 1000); } // integer prices → decimal odds
const families = { "1X2_PARTICIPANT_RESULT": [], "OVERUNDER_PARTICIPANT_GOALS": [], "ASIANHANDICAP_PARTICIPANT_GOALS": [] };
// Same period/bookmaker discipline as the tape: a surface mixing an H1 total
// with a full-match 1X2 would "violate" coherence constraints for fake reasons.
for (const o of raw.odds) if (families[o.SuperOddsType] && isConsensus(o)) families[o.SuperOddsType].push(o);
function latestAtOrBefore(list, ts, keyFn) {
  const seen = {};
  for (const o of list) {
    if (o.Ts > ts) continue;
    const k = keyFn(o);
    if (!seen[k] || o.Ts > seen[k].Ts) seen[k] = o;
  }
  return Object.values(seen);
}
// sample timestamps: spread across the in-play window
const tsAll = events.map(e => e.Ts).filter(Boolean).sort((a, b) => a - b);
const t0 = tsAll[0], t1 = tsAll[tsAll.length - 1];
const N = 8, surfaces = [];
for (let i = 0; i < N; i++) {
  const ts = Math.round(t0 + (t1 - t0) * (i + 1) / (N + 1));
  const markets = [];
  const r = latestAtOrBefore(families["1X2_PARTICIPANT_RESULT"], ts, () => "1x2")[0];
  if (r) markets.push({ family: "1X2", key: "1x2", selections: r.PriceNames.map((n, j) => ({ name: n, odds: r.Prices[j] / 1000 })) });
  for (const ou of latestAtOrBefore(families["OVERUNDER_PARTICIPANT_GOALS"], ts, o => o.MarketParameters))
    markets.push({ family: "OU", key: "ou_" + ou.MarketParameters, params: ou.MarketParameters, selections: ou.PriceNames.map((n, j) => ({ name: n, odds: ou.Prices[j] / 1000 })) });
  for (const ah of latestAtOrBefore(families["ASIANHANDICAP_PARTICIPANT_GOALS"], ts, o => o.MarketParameters))
    markets.push({ family: "AH", key: "ah_" + ah.MarketParameters, params: ah.MarketParameters, selections: ah.PriceNames.map((n, j) => ({ name: n, odds: ah.Prices[j] / 1000 })) });
  if (markets.length >= 2) surfaces.push({ ts, minute: Math.round((ts - t0) / 60000), markets });
}
const surfaceJs = path.join(OUT, fid + ".surface.js");
fs.writeFileSync(surfaceJs, "window.TXLINE_SURFACE = " + JSON.stringify({ fixture: bundle.fixture, surfaces }) + ";\n");

// ---- report ----
const sz = f => (fs.statSync(f).size / 1024).toFixed(0) + " KB";
const actionCounts = {}; events.forEach(e => actionCounts[e.Action] = (actionCounts[e.Action] || 0) + 1);
console.log(`fixture ${fid}: ${raw.fixture ? raw.fixture.Participant1 + " vs " + raw.fixture.Participant2 : ""}`);
console.log(`  events kept:   ${events.length} (from ${raw.historical.length})  ${JSON.stringify(actionCounts)}`);
console.log(`  1X2 timeline:  ${odds.length} points (from ${oneX2.length})`);
console.log(`  surfaces:      ${surfaces.length} real multi-market snapshots`);
console.log(`  ${fid}.tape.js    ${sz(tapeJs)}`);
console.log(`  ${fid}.surface.js ${sz(surfaceJs)}`);
