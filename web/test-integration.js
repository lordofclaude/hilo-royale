#!/usr/bin/env node
/* ============================================================
   HI-LO ROYALE — INTEGRATION HARNESS (W8, zero-dep, plain node)

   Validates the whole web/ tree against CONTRACTS.md (2026-07-18).
   Designed to run REPEATEDLY while other agents land their modules
   in parallel: every section reports PASS / FAIL / SKIP(missing)
   without ever crashing, even against half-edited or legacy files.

   Run:            node web/test-integration.js
   Exit code:      0 iff no section FAILed (SKIPs are fine).
   Sections:
     0 UNIT       node web/test.js as a child process (baseline)
     1 LOBBIES    tape integrity + v2 lobby shape + normalized odds
     2 ENGINE     buildSchedule contract: signal-aware, balanced,
                  re-derivable answers, no emoji in user strings
     3 SHARE      encode/parseGhost round-trip + hostile inputs
     4 LIVE FEED  API surface + isLive boundary math
     5 SERVERLESS static lint of web/api/txline.js
     6 UI STATIC  3-page structure: index.html (landing, og: meta),
                  login.html (handle gate, forwards search, guest),
                  play.html (the game: all engine scripts), emoji
                  scan across all three, og.png present on disk
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname; // .../web
const p = (...a) => path.join(ROOT, ...a);
const exists = f => { try { return fs.existsSync(f); } catch (_) { return false; } };
const readText = f => fs.readFileSync(f, "utf8");

// Pictographs + emoji (incl. all astral 1Fxxx blocks, misc symbols,
// dingbats, 2Bxx stars/shapes, variation selector). Plain arrows
// (2190-21FF) are allowed styled text per the contract.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{1FB00}-\u{1FBFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const hasEmoji = s => EMOJI_RE.test(String(s == null ? "" : s));

const STAT_KEYS = ["c1", "c2", "g1", "g2", "y1", "y2", "r1", "r2", "s1", "s2"];

// deterministic PRNG for the share fuzz (reproducible failures)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- reporting scaffolding ---------- */
const sections = [];
function runSection(name, requiresPaths, fn) {
  const missing = (requiresPaths || []).filter(f => !exists(f));
  const rec = { name, status: "PASS", ok: 0, failed: 0, notes: [], warns: [] };
  if (missing.length) {
    rec.status = "SKIP";
    rec.notes.push("missing: " + missing.map(m => path.relative(ROOT, m)).join(", "));
    sections.push(rec);
    return rec;
  }
  const t = {
    ok(cond, msg) {
      if (cond) { rec.ok++; }
      else { rec.failed++; if (rec.notes.length < 14) rec.notes.push(msg); else if (rec.notes.length === 14) rec.notes.push("...more failures truncated"); }
      return !!cond;
    },
    warn(msg) { if (rec.warns.length < 8) rec.warns.push(msg); },
    skip(msg) { rec.status = "SKIP"; rec.notes.push(msg); throw { __skip: true }; },
  };
  try {
    fn(t);
  } catch (e) {
    if (!(e && e.__skip)) {
      rec.failed++;
      rec.notes.push("threw: " + String(e && e.stack ? e.message : e).slice(0, 220));
    }
  }
  if (rec.status !== "SKIP") rec.status = rec.failed ? "FAIL" : "PASS";
  sections.push(rec);
  return rec;
}

/* ---------- shared loaders (tolerant of missing/broken modules) ---------- */
function loadLobbies() {
  global.window = global.window || {};
  delete global.window.LOBBIES; delete global.window.UPCOMING;
  delete require.cache[require.resolve(p("lobbies.js"))];
  require(p("lobbies.js"));
  return { LOBBIES: global.window.LOBBIES, UPCOMING: global.window.UPCOMING };
}
function loadLogic() {
  delete require.cache[require.resolve(p("game-logic.js"))];
  return require(p("game-logic.js"));
}

// Independent signal computation — deliberately NOT via the engine.
// Uses max-over-all-events for totals so a corrupt (non-monotonic)
// tape still yields honest signal flags.
function tapeSignal(lobby) {
  const ev = lobby.events || [];
  const types = new Set(ev.map(e => e.type));
  const max = {}; STAT_KEYS.forEach(k => { max[k] = 0; });
  for (const e of ev) {
    const s = e.stats || {};
    for (const k of STAT_KEYS) if (typeof s[k] === "number" && s[k] > max[k]) max[k] = s[k];
  }
  let varPair = false, open = false;
  for (const e of ev) {
    if (e.type === "var") open = true;
    else if (e.type === "var_verdict" && open) { varPair = true; open = false; }
  }
  return {
    corners: types.has("corner") || (max.c1 + max.c2) > 0,
    shots:   types.has("shot")   || (max.s1 + max.s2) > 0,
    cards:   types.has("card")   || (max.y1 + max.y2 + max.r1 + max.r2) > 0,
    goals:   types.has("goal")   || (max.g1 + max.g2) > 0,
    subs:    types.has("sub"),
    varPair,
    odds: !!(lobby.odds && Array.isArray(lobby.odds.winpct) && lobby.odds.winpct.length),
  };
}

// question key/kind -> which signal it needs (null = unknown, warn only)
function requiredSignal(q, sig) {
  const kind = String(q.kind || ""), key = String(q.key || "");
  if (kind === "odds_swing" || key === "odds" || key === "odds_swing") return ["odds", sig.odds];
  if (kind === "var_reactive" || key === "var") return ["varPair", sig.varPair];
  if (kind === "next_goal" || kind === "goals_ou") return ["goals", sig.goals];
  switch (key) {
    case "corners": case "corner": return ["corners", sig.corners];
    case "shots": case "shot": return ["shots", sig.shots];
    case "cards": case "card": return ["cards", sig.cards];
    case "goal": case "goals": case "next_goal": case "goals_ou": return ["goals", sig.goals];
    case "sub": case "subs": return ["subs", sig.subs];
    default: return null;
  }
}

/* ============================================================
   0 UNIT — node web/test.js baseline
   ============================================================ */
runSection("0 UNIT (web/test.js)", [p("test.js")], (t) => {
  const r = spawnSync(process.execPath, [p("test.js")], { encoding: "utf8", timeout: 60000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const tail = out.trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 200);
  t.ok(r.status === 0, `web/test.js exited ${r.status}: ${tail}`);
  if (r.status === 0) t.warn(tail);
});

/* ============================================================
   1 LOBBIES — tape + lobby-shape contract
   ============================================================ */
let LOBBIES = null, UPCOMING;
runSection("1 LOBBIES", [p("lobbies.js")], (t) => {
  let data;
  try { data = loadLobbies(); }
  catch (e) { t.ok(false, "lobbies.js failed to load in node: " + e.message); return; }
  LOBBIES = data.LOBBIES; UPCOMING = data.UPCOMING;
  if (!t.ok(Array.isArray(LOBBIES) && LOBBIES.length >= 1, "window.LOBBIES is a non-empty array")) return;

  for (const lb of LOBBIES) {
    const id = lb.fixtureId || "?";
    const ev = lb.events || [];
    t.ok(Array.isArray(ev) && ev.length >= 12, `${id}: >=12 events (got ${ev.length})`);

    // seq non-decreasing: real TxLINE feeds emit EQUAL seqs when one raw
    // update moves two stats (seen in 18257865/18222446/17588232), so only
    // DECREASES are forbidden. Minutes non-decreasing within 0..130.
    // Football stoppage-time collapse is legal: a drop is allowed only when
    // it lands exactly on a period start (45/90/105/120) and is <= 20 min
    // (e.g. H1 ends 45+8=53', H2 kickoff stamps 45'). Anything else fails.
    const PERIOD_STARTS = [45, 90, 105, 120];
    let seqOk = true, minOk = true, minWhy = null, prevSeq = -Infinity, prevMin = -Infinity;
    for (const e of ev) {
      if (!(typeof e.seq === "number" && e.seq >= prevSeq)) seqOk = false;
      const m = e.minute;
      const inRange = typeof m === "number" && m >= 0 && m <= 130;
      const boundaryDrop = m < prevMin && PERIOD_STARTS.indexOf(m) !== -1 && (prevMin - m) <= 20;
      if (!inRange || (m < prevMin && !boundaryDrop)) {
        minOk = false; minWhy = minWhy || `seq ${e.seq}: minute ${prevMin} -> ${m} (${e.type})`;
      }
      prevSeq = e.seq; prevMin = m;
    }
    t.ok(seqOk, `${id}: seq non-decreasing (equal seqs allowed for multi-stat raw updates; decreases forbidden)`);
    t.ok(minOk, `${id}: minutes 0..130, non-decreasing outside period boundaries (${minWhy || ""})`);

    // cumulative stats monotonic non-decreasing across ALL keys
    let statOk = true, firstBad = null;
    let prev = null;
    for (const e of ev) {
      const s = e.stats || {};
      for (const k of STAT_KEYS) {
        const v = s[k];
        if (typeof v !== "number" || !isFinite(v)) { statOk = false; firstBad = firstBad || `${k} non-numeric at seq ${e.seq}`; }
        else if (prev && v < prev[k]) { statOk = false; firstBad = firstBad || `${k} regresses ${prev[k]} -> ${v} at seq ${e.seq} (min ${e.minute})`; }
      }
      prev = s;
    }
    t.ok(statOk, `${id}: cumulative stats monotonic (${firstBad || ""})`);

    // Tape completeness: a full tape ends in game_finalised. A PARTIAL
    // capture is legal by design (nothing fabricated) IFF the lobby carries
    // a truthful `note` explaining where the capture ends -> warn, not FAIL.
    const last = ev[ev.length - 1] || {};
    if (last.type === "game_finalised") {
      t.ok(true, "");
    } else {
      const note = typeof lb.note === "string" ? lb.note : "";
      const honest = /captur/i.test(note) && (/end/i.test(note) || /~?\s*\d+\s*'/.test(note));
      if (t.ok(honest, `${id}: tape ends with '${last.type}' (min ${last.minute}) and lobby.note does not truthfully explain the partial capture (note=${JSON.stringify(note).slice(0, 120)})`)) {
        t.warn(`${id}: partial capture — tape ends '${last.type}' at min ${last.minute}, honest note present: ${JSON.stringify(note.slice(0, 90))}`);
      }
    }
    const ls = last.stats || {};
    const fsOk = lb.finalScore && ls.g1 === lb.finalScore.g1 && ls.g2 === lb.finalScore.g2;
    t.ok(fsOk, `${id}: finalScore ${JSON.stringify(lb.finalScore)} == final stats ${ls.g1}-${ls.g2}`);

    const fx = lb.fixture || {};
    const fxOk = fx.FixtureId != null && fx.Competition && fx.Participant1 && fx.Participant2 && fx.StartTime && typeof fx.Participant1IsHome === "boolean";
    t.ok(fxOk, `${id}: fixture fields present (FixtureId/Competition/Participant1/Participant2/Participant1IsHome/StartTime)`);
    if ("kickoffMs" in lb) t.ok(typeof lb.kickoffMs === "number" && isFinite(lb.kickoffMs), `${id}: kickoffMs numeric`);

    // odds.winpct: NORMALIZED {m,p1,draw,p2}, triples sum 95..105, m non-decreasing
    if (lb.odds && lb.odds.winpct != null) {
      const wp = lb.odds.winpct;
      if (t.ok(Array.isArray(wp) && wp.length > 0, `${id}: odds.winpct is a non-empty array`)) {
        let shapeOk = true, sumOk = true, mOk = true, why = null, pm = -Infinity;
        for (const row of wp) {
          const norm = ["m", "p1", "draw", "p2"].every(k => typeof row[k] === "number" && isFinite(row[k]));
          if (!norm) { shapeOk = false; why = why || ("row keys " + Object.keys(row).join("/") + " (need m/p1/draw/p2)"); continue; }
          const sum = row.p1 + row.draw + row.p2;
          if (sum < 95 || sum > 105) { sumOk = false; why = why || `m=${row.m} sums ${sum.toFixed(1)}`; }
          if (row.m < pm) mOk = false;
          pm = row.m;
        }
        t.ok(shapeOk, `${id}: odds.winpct uses normalized {m,p1,draw,p2} — ${why || ""} [legacy fra/eng keys are a contract violation]`);
        t.ok(!shapeOk || sumOk, `${id}: each winpct triple sums 95..105 (${why || ""})`);
        t.ok(!shapeOk || mOk, `${id}: winpct m non-decreasing`);
      }
    }
  }

  if (UPCOMING != null) {
    if (t.ok(Array.isArray(UPCOMING), "window.UPCOMING is an array when present")) {
      UPCOMING.forEach((u, i) => {
        const ok = u && u.fixtureId != null && u.t1 && u.t2 && typeof u.kickoffMs === "number";
        t.ok(ok, `UPCOMING[${i}] has fixtureId/t1/t2/kickoffMs`);
      });
    }
  }
});

/* ============================================================
   2 ENGINE — buildSchedule against every lobby tape
   ============================================================ */
runSection("2 ENGINE", [p("game-logic.js")], (t) => {
  if (!LOBBIES) t.skip("lobbies unavailable (see section 1) — cannot exercise engine on real tapes");
  let L;
  try { L = loadLogic(); }
  catch (e) { t.ok(false, "game-logic.js failed to load in node: " + e.message); return; }
  if (!t.ok(typeof L.buildSchedule === "function", "HiLoLogic.buildSchedule exported")) return;
  if (typeof L.availableStats !== "function") t.warn("availableStats() not exported yet (engine v2 addition)");

  for (const lb of LOBBIES) {
    const id = lb.fixtureId || "?";
    const sig = tapeSignal(lb);
    let sched;
    try {
      sched = L.buildSchedule(lb.events, lb.fixture, { odds: lb.odds && lb.odds.winpct });
    } catch (e) { t.ok(false, `${id}: buildSchedule threw: ${e.message}`); continue; }
    if (!t.ok(Array.isArray(sched) && sched.length >= 8 && sched.length <= 14, `${id}: schedule 8..14 questions (got ${sched && sched.length})`)) continue;

    let fieldsOk = true, ansOk = true, orderOk = true, signalOk = true, emojiOk = true;
    let signalWhy = null, emojiWhy = null, fieldsWhy = null;
    let prevFrom = -Infinity, run = 1, runOk = true;
    const tally = { hi: 0, lo: 0, push: 0 };
    let rederived = 0, rederiveBad = 0, rederiveWhy = null;

    sched.forEach((q, i) => {
      for (const k of ["n", "kind", "key", "promptText", "hiLabel", "loLabel", "answer"]) {
        if (q[k] == null) { fieldsOk = false; fieldsWhy = fieldsWhy || `Q${i + 1} missing '${k}'`; }
      }
      if (typeof q.fromMin !== "number" || typeof q.windowLen !== "number") { fieldsOk = false; fieldsWhy = fieldsWhy || `Q${i + 1} fromMin/windowLen not numeric`; }
      if (q.answer !== "hi" && q.answer !== "lo" && q.answer !== "push") ansOk = false;
      else tally[q.answer]++;
      if (typeof q.fromMin === "number") { if (q.fromMin < prevFrom) orderOk = false; prevFrom = q.fromMin; }

      // no question about a stat with zero signal in THIS tape
      const need = requiredSignal(q, sig);
      if (need === null) t.warn(`${id}: Q${i + 1} unknown key/kind '${q.key}'/'${q.kind}' — signal not checkable`);
      else if (!need[1]) { signalOk = false; signalWhy = signalWhy || `Q${i + 1} kind=${q.kind} key=${q.key} but tape has no ${need[0]}`; }

      // no 3 consecutive same-key questions
      if (i > 0 && sched[i - 1].key === q.key) { run++; if (run >= 3) runOk = false; } else run = 1;

      // user-facing strings must be emoji-free
      for (const k of ["promptText", "hiLabel", "loLabel", "label"]) {
        if (hasEmoji(q[k])) { emojiOk = false; emojiWhy = emojiWhy || `Q${i + 1}.${k} = ${JSON.stringify(String(q[k]).slice(0, 40))}`; }
      }

      // independent answer re-derivation
      try {
        if (q.kind === "compare_window" && q.prevVal != null && Array.isArray(L.STAT_DEFS)) {
          const si = L.STAT_DEFS.findIndex(d => d.key === q.key);
          if (si >= 0 && typeof L.windowValue === "function") {
            const val = L.windowValue(lb.events, si, q.fromMin, q.fromMin + q.windowLen);
            const expect = val > q.prevVal ? "hi" : val < q.prevVal ? "lo" : "push";
            rederived++;
            if (expect !== q.answer) { rederiveBad++; rederiveWhy = rederiveWhy || `Q${i + 1} compare_window ${q.key}: derived ${expect} (val ${val} vs prev ${q.prevVal}) != ${q.answer}`; }
          }
        } else if (q.kind === "occurrence" && Array.isArray(L.OCCURRENCE_DEFS) && typeof L.occurrenceInWindow === "function") {
          const def = L.OCCURRENCE_DEFS.find(d => d.key === q.key);
          if (def) {
            const happened = L.occurrenceInWindow(lb.events, def, q.fromMin, q.fromMin + q.windowLen);
            const expect = happened ? "hi" : "lo";
            rederived++;
            if (expect !== q.answer) { rederiveBad++; rederiveWhy = rederiveWhy || `Q${i + 1} occurrence ${q.key}: derived ${expect} != ${q.answer}`; }
          }
        }
      } catch (e) { rederiveBad++; rederiveWhy = rederiveWhy || `Q${i + 1} rederivation threw: ${e.message}`; }
    });

    t.ok(fieldsOk, `${id}: question field shape (${fieldsWhy || ""})`);
    t.ok(ansOk, `${id}: answers only hi/lo/push`);
    t.ok(orderOk, `${id}: fromMin ordered non-decreasing`);
    t.ok(signalOk, `${id}: every question has real signal in the tape (${signalWhy || ""})`);
    t.ok(runOk, `${id}: no 3 consecutive same-key questions`);
    t.ok(emojiOk, `${id}: no emoji in promptText/labels (${emojiWhy || ""})`);

    const total = tally.hi + tally.lo + tally.push;
    const decided = tally.hi + tally.lo;
    t.ok(total > 0 && decided / total >= 0.6, `${id}: non-push share >= 60% (${decided}/${total})`);
    if (decided >= 4) {
      const maxShare = Math.max(tally.hi, tally.lo) / decided;
      t.ok(maxShare <= 0.751, `${id}: hi/lo imbalance <= 75/25 (hi ${tally.hi} / lo ${tally.lo})`);
    }
    t.ok(rederiveBad === 0, `${id}: answers re-derivable (${rederived} checked, ${rederiveBad} mismatched: ${rederiveWhy || ""})`);
    if (rederived === 0) t.warn(`${id}: no compare_window/occurrence questions were rederivable`);

    // Thin-tape guarantee (France-England-style): zero shot/card/sub questions
    if (!sig.shots && !sig.cards && !sig.subs) {
      const bad = sched.filter(q => {
        const need = requiredSignal(q, sig);
        return need && (need[0] === "shots" || need[0] === "cards" || need[0] === "subs");
      });
      t.ok(bad.length === 0, `${id}: thin tape (goals+corners only) yields zero shot/card/sub questions (found ${bad.length}: ${bad.map(q => q.kind + "/" + q.key).join(", ")})`);
    }
  }
});

/* ============================================================
   3 SHARE — encode/parseGhost + captions
   ============================================================ */
runSection("3 SHARE", [p("share.js")], (t) => {
  let Share;
  try {
    global.window = global.window || {};
    delete require.cache[require.resolve(p("share.js"))];
    Share = require(p("share.js")) || global.window.HiLoShare;
  } catch (e) { t.ok(false, "share.js failed to load in node: " + e.message); return; }
  if (!t.ok(Share && typeof Share.encodeGhost === "function" && typeof Share.parseGhost === "function" && typeof Share.caption === "function",
    "HiLoShare exports encodeGhost/parseGhost/caption")) return;

  // -- 200 randomized round-trips (seeded, reproducible) --
  const rnd = mulberry32(0xC0FFEE);
  // no spaces in fuzz names: whether the encoder preserves spaces is a
  // design choice, probed separately below as a warn-only check
  const NAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let rtFail = 0, rtWhy = null, encFail = 0;
  for (let i = 0; i < 200; i++) {
    const nameLen = 1 + Math.floor(rnd() * 12);
    let name = ""; for (let j = 0; j < nameLen; j++) name += NAME_CHARS[Math.floor(rnd() * NAME_CHARS.length)];
    name = name.trim() || "x";
    const picks = [];
    const nPicks = Math.floor(rnd() * 13);
    for (let j = 0; j < nPicks; j++) {
      const r = rnd();
      picks.push({ n: j + 1, pick: r < 0.4 ? "hi" : r < 0.8 ? "lo" : null, msLeft: Math.floor(rnd() * 8000) });
    }
    const payload = {
      fixtureId: String(10000000 + Math.floor(rnd() * 89999999)),
      name, picks,
      streak: Math.floor(rnd() * 15),
      outlived: Math.floor(rnd() * 100),
    };
    let enc, parsed;
    try {
      enc = Share.encodeGhost(payload);
      if (typeof enc !== "string" || !enc.length || /[+/=&?#%\s]/.test(enc)) { encFail++; continue; }
      parsed = Share.parseGhost("?fixture=" + payload.fixtureId + "&ghost=" + enc);
    } catch (e) { rtFail++; rtWhy = rtWhy || ("run " + i + " threw: " + e.message); continue; }
    const ok = parsed
      && String(parsed.fixtureId) === payload.fixtureId
      && parsed.name === payload.name
      && parsed.streak === payload.streak
      && parsed.outlived === payload.outlived
      && Array.isArray(parsed.picks) && parsed.picks.length === picks.length
      && parsed.picks.every((pk, j) => pk && pk.pick === picks[j].pick && pk.n === picks[j].n
        && (picks[j].msLeft == null || (typeof pk.msLeft === "number" && Math.abs(pk.msLeft - picks[j].msLeft) <= 1000)));
    if (!ok) { rtFail++; rtWhy = rtWhy || ("run " + i + ": " + JSON.stringify(parsed).slice(0, 160)); }
  }
  t.ok(encFail === 0, `encodeGhost output URL-safe compact string (${encFail}/200 bad)`);
  t.ok(rtFail === 0, `200 randomized round-trips (${rtFail} failed; first: ${rtWhy || ""})`);

  // warn-only: does a spaced display name survive the round trip?
  try {
    const spaced = { fixtureId: "18257865", name: "Big Ron", picks: [{ n: 1, pick: "hi", msLeft: 500 }], streak: 1, outlived: 3 };
    const par = Share.parseGhost("?fixture=18257865&ghost=" + Share.encodeGhost(spaced));
    if (!par || par.name !== spaced.name) t.warn(`spaced names are lossy: "Big Ron" -> ${JSON.stringify(par && par.name)} (check vs UI display expectations)`);
  } catch (e) { t.warn("spaced-name probe threw: " + e.message); }

  // -- hostile inputs -> null, never throw --
  const b64u = s => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hostile = [
    "", "?", "?ghost=", "?ghost=%%%", "?ghost=!!!***(((",
    "?ghost=" + "A".repeat(5000),
    "?ghost=" + b64u('{"foo":"bar"}'),
    "?ghost=" + b64u('{"__proto__":{"polluted":1}}'),
    "?fixture=<script>&ghost=<script>alert(1)</script>",
    "?ghost= ", "?ghost=undefined", "?ghost=null",
  ];
  let hostileBad = 0, hostileWhy = null;
  for (const h of hostile) {
    try {
      const out = Share.parseGhost(h);
      if (out !== null) { hostileBad++; hostileWhy = hostileWhy || (JSON.stringify(h.slice(0, 40)) + " -> " + JSON.stringify(out).slice(0, 80)); }
    } catch (e) { hostileBad++; hostileWhy = hostileWhy || (JSON.stringify(h.slice(0, 40)) + " threw " + e.message); }
  }
  t.ok(hostileBad === 0, `hostile parseGhost inputs return null without throwing (${hostileBad} bad; ${hostileWhy || ""})`);
  t.ok(({}).polluted === undefined, "parseGhost does not prototype-pollute");

  // -- captions: string, <280 chars, emoji-free --
  const combos = [
    { won: true, streak: 8, outlived: 99, lobbyId: "18257865" },
    { won: true, streak: 1, outlived: 50, lobbyId: "18222446", nearDeath: true },
    { won: false, streak: 0, outlived: 0 },
    { won: false, streak: 4, outlived: 57, nearDeath: true },
    { won: false, streak: 12, outlived: 98, lobbyId: "18241006" },
    {},
  ];
  let capBad = 0, capWhy = null;
  for (const c of combos) {
    try {
      const s = Share.caption(c);
      if (typeof s !== "string" || !s.length || s.length >= 280 || hasEmoji(s)) {
        capBad++; capWhy = capWhy || (JSON.stringify(c) + " -> " + JSON.stringify(String(s).slice(0, 60)) + ` (len ${String(s).length}${hasEmoji(s) ? ", has emoji" : ""})`);
      }
    } catch (e) { capBad++; capWhy = capWhy || (JSON.stringify(c) + " threw " + e.message); }
  }
  t.ok(capBad === 0, `captions non-empty, <280 chars, emoji-free (${capBad} bad; ${capWhy || ""})`);
});

/* ============================================================
   4 LIVE FEED — surface + isLive boundary math
   ============================================================ */
runSection("4 LIVE FEED", [p("live-feed.js")], (t) => {
  let Feed;
  try {
    global.window = global.window || {};
    delete require.cache[require.resolve(p("live-feed.js"))];
    const mod = require(p("live-feed.js"));
    Feed = (mod && (mod.latestOdds || mod.isLive)) ? mod : global.window.LiveFeed;
  } catch (e) { t.ok(false, "live-feed.js failed to load in node: " + e.message); return; }
  if (!t.ok(!!Feed, "window.LiveFeed (or module export) present after load")) return;
  t.ok(typeof Feed.latestOdds === "function", "LiveFeed.latestOdds is a function");
  t.ok(typeof Feed.poll === "function", "LiveFeed.poll is a function");
  if (!t.ok(typeof Feed.isLive === "function", "LiveFeed.isLive is a function")) return;

  const ko = 1784408400000, MIN = 60000;
  const cases = [
    [ko - 11 * MIN, false, "11min before kickoff -> not live"],
    [ko - 9 * MIN, true, "9min before kickoff -> live"],
    [ko, true, "at kickoff -> live"],
    [ko + 60 * MIN, true, "60min after kickoff -> live"],
    [ko + 149 * MIN, true, "149min after kickoff -> live"],
    [ko + 151 * MIN, false, "151min after kickoff -> not live"],
  ];
  for (const [now, expect, label] of cases) {
    let got;
    try { got = Feed.isLive(ko, now); } catch (e) { t.ok(false, `isLive threw: ${e.message}`); continue; }
    t.ok(got === expect, `isLive boundary: ${label} (got ${got})`);
  }
});

/* ============================================================
   5 SERVERLESS — static lint of web/api/txline.js
   ============================================================ */
runSection("5 SERVERLESS", [p("api", "txline.js")], (t) => {
  const src = readText(p("api", "txline.js"));
  t.ok(/export\s+default\s+(async\s+)?function|export\s+default\s+handler/.test(src),
    "exports a default handler");
  t.ok(/if\s*\(\s*!\s*fixtureId\s*\)|missing-fixtureId/i.test(src),
    "handles missing fixtureId");
  t.ok(/no-store/.test(src), "sets Cache-Control: no-store");

  // no env secrets interpolated into response bodies: any line that writes
  // a response must not mention the secret vars / process.env
  const SECRET = /\bjwt\b|\bapiToken\b|TXLINE_JWT|TXLINE_API_TOKEN|process\.env/;
  const leaks = [];
  src.split(/\r?\n/).forEach((line, i) => {
    if (/\.json\s*\(|\.send\s*\(|\.end\s*\(|\.write\s*\(/.test(line) && SECRET.test(line)) {
      leaks.push(`line ${i + 1}: ${line.trim().slice(0, 100)}`);
    }
  });
  t.ok(leaks.length === 0, "no env secrets in response bodies (" + leaks.join("; ") + ")");
  if (!/mode/.test(src)) t.warn("no `mode` param handling yet (contract adds mode=odds1x2|scores|odds)");
});

/* ============================================================
   6 UI STATIC — 3-page structure
   index.html = marketing landing, login.html = fan-handle gate,
   play.html = THE GAME (engine + LiveFeed + share + vrf).
   ============================================================ */
runSection("6 UI STATIC", [p("index.html"), p("login.html"), p("play.html")], (t) => {
  const PAGES = ["index.html", "login.html", "play.html"];
  const html = {};
  for (const f of PAGES) html[f] = readText(p(f));

  // every page: balanced <script> tags + zero emoji
  for (const f of PAGES) {
    const opens = (html[f].match(/<script\b/gi) || []).length;
    const closes = (html[f].match(/<\/script>/gi) || []).length;
    t.ok(opens === closes, `${f}: balanced <script> tags (${opens} open vs ${closes} close)`);
    const emojis = html[f].match(new RegExp(EMOJI_RE.source, "gu")) || [];
    t.ok(emojis.length === 0, `${f}: no emoji characters (found ${emojis.length}: ${[...new Set(emojis)].slice(0, 8).join(" ")})`);
  }

  // play.html: THE GAME — all engine scripts must load here
  for (const s of ["lobbies.js", "game-logic.js", "live-feed.js", "share.js", "vrf-proof.js"]) {
    t.ok(new RegExp('<script[^>]*src=["\'][^"\']*' + s.replace(".", "\\."), "i").test(html["play.html"]),
      `play.html: includes <script src=${s}>`);
  }

  // index.html: marketing landing — og: meta for share cards
  t.ok(/property=["']og:|name=["']og:/i.test(html["index.html"]), "index.html: has og: meta tags");

  // login.html: must forward location.search to /play and offer a guest path
  t.ok(/location\.(href|replace)\s*[=(]\s*['"`]\/play['"`]\s*\+\s*location\.search|['"`]\/play['"`]\s*\+\s*location\.search/.test(html["login.html"]),
    "login.html: forwards location.search to /play");
  t.ok(/guest/i.test(html["login.html"]), "login.html: has a guest path (mentions 'guest')");

  // og:image must reference /og.png and the file must exist on disk
  let ogRefs = 0, ogBad = null;
  for (const f of PAGES) {
    const m = html[f].match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html[f].match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (m) { ogRefs++; if (!/\/og\.png(\?|#|$)/.test(m[1])) ogBad = ogBad || `${f}: og:image -> ${m[1]}`; }
  }
  t.ok(ogRefs >= 1, "at least one page declares og:image");
  t.ok(ogBad === null, `og:image references point at /og.png (${ogBad || ""})`);
  t.ok(exists(p("og.png")), "web/og.png exists on disk (1200x630 share card)");
});

/* ============================================================
   report
   ============================================================ */
console.log("");
console.log("HI-LO ROYALE INTEGRATION HARNESS  (contract 2026-07-18)");
console.log("=".repeat(64));
let pass = 0, fail = 0, skip = 0;
for (const s of sections) {
  if (s.status === "PASS") pass++; else if (s.status === "FAIL") fail++; else skip++;
  const counts = s.status === "SKIP" ? "" : `  (${s.ok} ok, ${s.failed} failed)`;
  console.log(`[${s.status.padEnd(4)}] ${s.name}${counts}`);
  for (const n of s.notes) console.log(`         - ${n}`);
  for (const w of s.warns) console.log(`         ~ warn: ${w}`);
}
console.log("=".repeat(64));
console.log(`INTEGRATION: ${pass} pass, ${fail} fail, ${skip} skip`);
process.exitCode = fail ? 1 : 0;
