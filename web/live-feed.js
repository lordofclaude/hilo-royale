/* ============================================================
   HI-LO ROYALE — LiveFeed (browser client for /api/txline).

   Turns the raw TxLINE ~5-minute update windows served by the
   serverless proxy (web/api/txline.js) into the game's cumulative
   Tape-event shape:
     { seq, minute, type, team (0|1|2), detail,
       stats: {c1,c2,g1,g2,y1,y2,r1,r2,s1,s2} }   // cumulative, monotonic

   Public API (window.LiveFeed / module.exports):
     LiveFeed.latestOdds(fixtureId)
       -> Promise<{ok:true,p1,draw,p2,ts} | {ok:false,reason}>   // percents 0-100
     LiveFeed.poll(fixtureId, {intervalMs=15000, onScoreEvent, onOdds, onStatus, onHeartbeat})
       -> {stop(), tick()}    // tick() is exposed for tests: runs/joins one cycle
     LiveFeed.isLive(kickoffMs, nowMs=Date.now())
       -> bool                // kickoff-10min .. kickoff+150min inclusive
     LiveFeed.configure({fetchImpl, base})   // node tests: inject fetch + base URL

   Behavior notes (from the real France-England capture, 18257865):
     - The same physical action repeats across several Seq values
       (unconfirmed then confirmed, sharing the same "Id") — we dedupe
       windows by Seq and dedupe EMISSION by action Id, so one goal is
       one tape event even though the feed sends it 3 times.
     - GameState can stay "scheduled" the whole match; StatusId and
       Clock.Seconds (absolute match seconds, H2 starts at 2700) are
       the truth for the minute.
     - Stats maps carry statKeys 1..8 (goals/yellow/red/corners per
       participant); shots are NOT in the map and are accumulated from
       shot actions. Cumulative stats are clamped monotonic.
     - Network failures never throw; the poller degrades to 'idle'.
   Action mapping ported from shared/txline-real.js (web/ must stay
   self-contained — no ../shared imports).
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.LiveFeed = api;
  else if (root) root.LiveFeed = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ---------------------------------------------------------- config
  var cfg = { fetchImpl: null, base: "" };
  function configure(opts) {
    opts = opts || {};
    if (opts.fetchImpl !== undefined) cfg.fetchImpl = opts.fetchImpl;
    if (opts.base !== undefined) cfg.base = String(opts.base || "");
    return cfg;
  }
  function getFetch() {
    if (cfg.fetchImpl) return cfg.fetchImpl;
    if (typeof fetch !== "undefined") return fetch.bind(typeof globalThis !== "undefined" ? globalThis : null);
    return null;
  }
  function cleanId(fixtureId) { return String(fixtureId == null ? "" : fixtureId).replace(/\D/g, ""); }

  /** GET {base}/api/txline?<qs>. Resolves the parsed JSON (array or object); never rejects. */
  function apiGet(qs) {
    var f = getFetch();
    if (!f) return Promise.resolve({ ok: false, reason: "no-fetch" });
    try {
      return Promise.resolve(f(cfg.base + "/api/txline?" + qs))
        .then(function (r) { return r.json(); })
        .catch(function () { return { ok: false, reason: "fetch-failed" }; });
    } catch (e) {
      return Promise.resolve({ ok: false, reason: "fetch-failed" });
    }
  }

  // ---------------------------------------------------------- generic pickers
  function pick(o) {
    if (!o) return undefined;
    for (var i = 1; i < arguments.length; i++) {
      var k = arguments[i];
      if (o[k] !== undefined && o[k] !== null) return o[k];
    }
    return undefined;
  }
  function normSeq(u) { var v = pick(u, "Seq", "seq", "Sequence", "sequence"); return v == null ? null : Number(v); }
  function normTs(u) { var v = pick(u, "Ts", "ts", "Timestamp", "timestamp"); return v == null ? NaN : Number(v); }

  // ---------------------------------------------------------- action mapping (port of shared/txline-real.js)
  function normAction(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }

  var ACTION_MAP = {
    goal: "goal", owngoal: "goal", goalscored: "goal",
    corner: "corner", cornerkick: "corner", cornerawarded: "corner",
    card: "card", yellowcard: "card", redcard: "card", secondyellowcard: "card", booking: "card",
    "var": "var", varreview: "var", varunderway: "var", varinprogress: "var", varstarted: "var",
    videoassistantreferee: "var", varcheck: "var",
    varverdict: "var_verdict", varresult: "var_verdict", vardecision: "var_verdict",
    varoutcome: "var_verdict", varend: "var_verdict", varended: "var_verdict",
    varcomplete: "var_verdict", varcompleted: "var_verdict", varover: "var_verdict",
    shot: "shot", shotontarget: "shot", shotofftarget: "shot", shotwoodwork: "shot",
    shotblocked: "shot", attempt: "shot", woodwork: "shot",
    freekick: "freekick", dangerousfreekick: "freekick",
    penalty: "penalty", penaltyawarded: "penalty", penaltyscored: "penalty",
    penaltymissed: "penalty", penaltyretake: "penalty",
    substitution: "sub", sub: "sub", playersubstitution: "sub",
    kickoff: "kickoff", periodstart: "kickoff", matchstart: "kickoff", matchstarted: "kickoff",
    halftime: "halftime", halftimefinalised: "halftime", ht: "halftime",
    fulltime: "fulltime", finished: "fulltime", matchfinished: "fulltime", ft: "fulltime",
    additionaltime: "additionaltime",
    gamefinalised: "game_finalised", finalised: "game_finalised", gamefinal: "game_finalised",
    matchfinalised: "game_finalised",
  };

  /* Feed lifecycle/control messages are not football events. Check these
     before fuzzy matching: "action_discarded" contains the substring
     "card" and previously appeared as a bogus booking. */
  var DROP_ACTIONS = {
    actiondiscarded: 1, actionamend: 1, actionamended: 1,
    possible: 1, possibleaction: 1, actionpossible: 1,
  };

  var VERDICT_WORDS = /(confirm|amend|uphold|upheld|overturn|cancel|noaction|rejected|awarded|decision|stands)/;

  function rawAction(u) {
    var a = pick(u, "Action", "action", "ActionType", "actionType", "event", "Event", "type", "Type");
    if (a && typeof a === "object") a = pick(a, "Type", "type", "Name", "name", "Action", "action");
    return a;
  }

  function detailFields(u) {
    var a = pick(u, "Action", "action");
    var src = (a && typeof a === "object") ? a : u;
    var data = (u && u.Data && typeof u.Data === "object") ? u.Data : (u && u.data && typeof u.data === "object") ? u.data : {};
    var out = {};
    var names = ["VarType", "varType", "VarResult", "varResult", "VarOutcome", "varOutcome",
      "ShotType", "shotType", "CardType", "cardType", "Card", "card", "GoalType", "goalType",
      "Danger", "danger", "FreeKickType", "freeKickType", "FreeKickDanger", "freeKickDanger",
      "PenaltyOutcome", "penaltyOutcome", "Outcome", "outcome", "Result", "result",
      "Detail", "detail", "SubType", "subType", "Verdict", "verdict", "Type", "type"];
    for (var i = 0; i < names.length; i++) {
      var v = data[names[i]] !== undefined ? data[names[i]]
        : (src[names[i]] !== undefined && src !== u ? src[names[i]] : undefined);
      if (v !== undefined && v !== null && typeof v !== "object") out[names[i]] = v;
    }
    return out;
  }

  /** Map a raw action string (+ full update for context) to a tape event type. */
  function mapAction(raw, u) {
    var n = normAction(raw);
    if (DROP_ACTIONS[n]) return "unknown";
    var statusId = u ? Number(pick(u, "StatusId", "statusId")) : NaN;
    if (statusId === 100) return "game_finalised";
    if (ACTION_MAP[n]) {
      if (ACTION_MAP[n] === "var" && u && VERDICT_WORDS.test(normAction(JSON.stringify(detailFields(u))))) return "var_verdict";
      return ACTION_MAP[n];
    }
    if (n.indexOf("var") !== -1) return VERDICT_WORDS.test(n) ? "var_verdict" : "var";
    if (n.indexOf("goalkick") !== -1) return n; // goal_kick is NOT a goal
    if (n.indexOf("goal") !== -1) return "goal";
    if (n.indexOf("corner") !== -1) return "corner";
    if (n.indexOf("card") !== -1 || n.indexOf("yellow") !== -1 || n.indexOf("red") !== -1) return "card";
    if (n.indexOf("penal") !== -1) return "penalty";
    if (n.indexOf("free") !== -1) return "freekick";
    if (n.indexOf("shot") !== -1 || n.indexOf("woodwork") !== -1 || n.indexOf("attempt") !== -1) return "shot";
    if (n.indexOf("sub") !== -1) return "sub";
    if (n.indexOf("final") !== -1) return "game_finalised";
    if (n.indexOf("kickoff") !== -1) return "kickoff";
    if (n.indexOf("half") !== -1) return "halftime";
    if (n.indexOf("full") !== -1 || n.indexOf("finish") !== -1) return "fulltime";
    return n || "unknown";
  }

  function extractDetail(u, type) {
    var d = detailFields(u);
    var prefs = {
      "var": ["VarType", "varType", "Type", "type"],
      var_verdict: ["VarResult", "varResult", "VarOutcome", "varOutcome", "Verdict", "verdict", "Outcome", "outcome", "Result", "result"],
      shot: ["ShotType", "shotType", "Outcome", "outcome"],
      goal: ["GoalType", "goalType"],
      card: ["CardType", "cardType", "Card", "card"],
      freekick: ["Danger", "danger", "FreeKickDanger", "freeKickDanger", "FreeKickType", "freeKickType"],
      penalty: ["PenaltyOutcome", "penaltyOutcome", "Outcome", "outcome", "Result", "result"],
    };
    var order = (prefs[type] || []).concat(["Detail", "detail", "Result", "result", "Outcome", "outcome"]);
    for (var i = 0; i < order.length; i++) if (d[order[i]] !== undefined) return String(d[order[i]]);
    if (type === "card") {
      var n = normAction(rawAction(u));
      if (n.indexOf("red") !== -1 || n.indexOf("secondyellow") !== -1) return "Red";
      if (n.indexOf("yellow") !== -1) return "Yellow";
    }
    return "";
  }

  /** Resolve which side (1|2) a score update belongs to; 0 = neutral/unknown. */
  function resolveTeam(u) {
    if (!u) return 0;
    var a = pick(u, "Action", "action");
    var src = (a && typeof a === "object") ? a : {};
    var data = (u.Data && typeof u.Data === "object") ? u.Data : (u.data && typeof u.data === "object") ? u.data : {};
    var v = pick(u, "Participant", "participant", "ParticipantId", "participantId", "Team", "team", "Side", "side");
    if (v === undefined) v = pick(src, "Participant", "participant", "ParticipantId", "participantId", "Team", "team");
    if (v === undefined) v = pick(data, "Participant", "participant", "Team", "team");
    if (v === undefined || v === null) return 0;
    if (v && typeof v === "object") v = pick(v, "Id", "id", "Name", "name");
    if (v === 1 || v === 2 || v === "1" || v === "2") return Number(v);
    var num = Number(v);
    // ParticipantId form: match against the fixture participant ids carried on the update itself.
    var p1 = Number(pick(u, "Participant1Id", "participant1Id"));
    var p2 = Number(pick(u, "Participant2Id", "participant2Id"));
    if (!isNaN(num)) {
      if (num === p1) return 1;
      if (num === p2) return 2;
    }
    return 0;
  }

  // Real stats map keys 1..8 (total period) → tape stats fields. Shots are NOT in the map.
  var STATKEY_TO_STAT = { 1: "g1", 2: "g2", 3: "y1", 4: "y2", 5: "r1", 6: "r2", 7: "c1", 8: "c2" };

  // StatusId → base match minute when no Clock is present (Clock.Seconds is absolute).
  var STATUS_BASE = { 1: 0, 2: 0, 3: 45, 4: 45, 5: 90, 6: 90, 7: 90, 8: 105, 9: 105, 10: 120, 11: 120, 12: 120, 13: 120 };

  // Tape event types worth emitting (everything else — possession, throw_in,
  // weather, lineups, comment, possible, action_discarded... — is feed noise).
  var EMIT_TYPES = {
    kickoff: 1, goal: 1, corner: 1, shot: 1, card: 1, sub: 1, "var": 1, var_verdict: 1,
    penalty: 1, freekick: 1, halftime: 1, fulltime: 1, additionaltime: 1, game_finalised: 1,
  };
  var REQUIRE_CONFIRMED = { goal: 1, corner: 1, shot: 1, card: 1, sub: 1, "var": 1, penalty: 1, freekick: 1 };

  // ---------------------------------------------------------- public: latestOdds
  function latestOdds(fixtureId) {
    var fid = cleanId(fixtureId);
    if (!fid) return Promise.resolve({ ok: false, reason: "missing-fixtureId" });
    return apiGet("fixtureId=" + fid).then(function (body) {
      if (body && body.ok === true) {
        var p1 = Number(body.p1), draw = Number(body.draw), p2 = Number(body.p2);
        if ([p1, draw, p2].every(function (v) { return isFinite(v) && v >= 0 && v <= 100; })) {
          return { ok: true, p1: p1, draw: draw, p2: p2, ts: Number(body.ts) || null };
        }
        return { ok: false, reason: "bad-odds" };
      }
      return { ok: false, reason: (body && body.reason) || "bad-response" };
    });
  }

  // ---------------------------------------------------------- public: isLive
  /** Live window: kickoff-10min .. kickoff+150min (inclusive both ends). */
  function isLive(kickoffMs, nowMs) {
    var k = Number(kickoffMs);
    var now = nowMs == null ? Date.now() : Number(nowMs);
    if (!isFinite(k) || !isFinite(now)) return false;
    return now >= k - 10 * 60000 && now <= k + 150 * 60000;
  }

  // ---------------------------------------------------------- public: poll
  /**
   * Poll /api/txline?mode=scores|odds, accumulate the ~5-minute windows,
   * dedupe, and emit NEW tape events / odds / status transitions.
   * Returns {stop(), tick()} — tick() runs (or joins) one cycle, for tests.
   */
  function poll(fixtureId, opts) {
    opts = opts || {};
    var fid = cleanId(fixtureId);
    var intervalMs = opts.intervalMs == null ? 15000 : Number(opts.intervalMs);
    var st = {
      seenSeq: Object.create(null),     // dedupe of score updates (by Seq, fallback Id+Ts)
      emitted: Object.create(null),     // dedupe of tape-event emission (by action Id + type)
      seenOdds: Object.create(null),    // dedupe of odds payloads (by MessageId, fallback Ts+market)
      running: { c1: 0, c2: 0, g1: 0, g2: 0, y1: 0, y2: 0, r1: 0, r2: 0, s1: 0, s2: 0 },
      lastMinute: 0,
      lastOddsTs: null, lastOddsKey: "",
      status: null, stopped: false, inFlight: null, timer: null,
    };

    function safeCall(fn, arg) { if (!fn) return; try { fn(arg); } catch (e) { /* user callback errors never kill the loop */ } }
    function setStatus(s) { if (s !== st.status) { st.status = s; safeCall(opts.onStatus, s); } }

    function minuteOf(u) {
      var clock = pick(u, "Clock", "clock");
      var m;
      if (clock && typeof clock === "object" && isFinite(Number(clock.Seconds != null ? clock.Seconds : clock.seconds))) {
        m = Math.floor(Number(clock.Seconds != null ? clock.Seconds : clock.seconds) / 60);
      } else {
        var base = STATUS_BASE[Number(pick(u, "StatusId", "statusId"))];
        m = base != null ? base : st.lastMinute;
      }
      if (m < st.lastMinute) m = st.lastMinute; // minutes never go backwards
      st.lastMinute = m;
      return m;
    }

    function processScores(arr) {
      var fresh = [];
      for (var i = 0; i < arr.length; i++) {
        var u = arr[i];
        if (!u || typeof u !== "object") continue;
        var seq = normSeq(u);
        var key = seq != null && isFinite(seq) ? "q" + seq
          : "m" + String(pick(u, "MessageId", "messageId", "Id", "id")) + ":" + normTs(u);
        if (st.seenSeq[key]) continue;
        st.seenSeq[key] = 1;
        fresh.push(u);
      }
      // process strictly in Seq order (windows can arrive shuffled)
      fresh.sort(function (a, b) {
        var sa = normSeq(a), sb = normSeq(b);
        if (sa != null && sb != null && sa !== sb) return sa - sb;
        return (normTs(a) || 0) - (normTs(b) || 0);
      });

      var out = [];
      for (var j = 0; j < fresh.length; j++) {
        var v = fresh[j];
        var type = mapAction(rawAction(v), v);
        var team = resolveTeam(v);
        var detail = extractDetail(v, type);
        var minute = minuteOf(v);
        var aid = pick(v, "Id", "id");
        var seq2 = normSeq(v);
        var ekey = (aid != null ? "a" + aid : "q" + seq2) + ":" + type;
        var firstSighting = !st.emitted[ekey];
        var confirmed = pick(v, "Confirmed", "confirmed");
        var canEmit = !REQUIRE_CONFIRMED[type] || confirmed !== false;

        // Stats: trust the on-chain stats map (keys 1..8) when present, clamped
        // monotonic; shots and map-less first sightings accumulate from the action.
        var statsMap = pick(v, "Stats", "stats");
        var applied = false;
        if (canEmit && type !== "unknown" && statsMap && typeof statsMap === "object") {
          for (var k in statsMap) {
            var f = STATKEY_TO_STAT[Number(k)];
            if (f) {
              applied = true;
              var val = Number(statsMap[k]) || 0;
              if (val > st.running[f]) st.running[f] = val; // non-decreasing
            }
          }
        }
        if (canEmit && firstSighting && team) {
          if (type === "shot") st.running["s" + team]++;
          else if (!applied) {
            var d = String(detail || "");
            if (type === "goal" || (type === "penalty" && /scored/i.test(d))) st.running["g" + team]++;
            else if (type === "corner") st.running["c" + team]++;
            else if (type === "card" && /red/i.test(d)) st.running["r" + team]++;
            else if (type === "card") st.running["y" + team]++;
          }
        }

        if (EMIT_TYPES[type] && canEmit && firstSighting) {
          st.emitted[ekey] = 1;
          out.push({
            seq: seq2, minute: minute, type: type, team: team, detail: detail,
            stats: {
              c1: st.running.c1, c2: st.running.c2, g1: st.running.g1, g2: st.running.g2,
              y1: st.running.y1, y2: st.running.y2, r1: st.running.r1, r2: st.running.r2,
              s1: st.running.s1, s2: st.running.s2,
            },
          });
        }
      }
      for (var e = 0; e < out.length; e++) safeCall(opts.onScoreEvent, out[e]);
      return out.length;
    }

    function processOdds(arr) {
      var best = null;
      for (var i = 0; i < arr.length; i++) {
        var o = arr[i];
        if (!o || typeof o !== "object") continue;
        var mid = pick(o, "MessageId", "messageId");
        var ts = normTs(o);
        var market = pick(o, "SuperOddsType", "superOddsType", "type") || "";
        var bookmakerId = Number(pick(o, "BookmakerId", "bookmakerId"));
        var marketPeriod = pick(o, "MarketPeriod", "marketPeriod");
        var key = mid != null ? "m" + mid : "t" + ts + ":" + market;
        if (st.seenOdds[key]) continue;
        st.seenOdds[key] = 1;
        if (bookmakerId !== 10021 || marketPeriod != null || market !== "1X2_PARTICIPANT_RESULT") continue;
        var pct = pick(o, "Pct", "pct");
        if (!Array.isArray(pct) || pct.length !== 3) continue;
        var p1 = Number(pct[0]), draw = Number(pct[1]), p2 = Number(pct[2]); // "NA" → NaN → skipped
        if (![p1, draw, p2].every(function (n) { return isFinite(n) && n >= 0 && n <= 100; })) continue;
        var total = p1 + draw + p2;
        if (total < 95 || total > 105) continue;
        if (!best || !isFinite(best.ts) || (isFinite(ts) && ts >= best.ts)) best = { p1: p1, draw: draw, p2: p2, ts: ts };
      }
      if (!best) return false;
      var okey = best.p1 + "|" + best.draw + "|" + best.p2;
      if (okey === st.lastOddsKey && best.ts === st.lastOddsTs) return false;
      st.lastOddsKey = okey; st.lastOddsTs = best.ts;
      safeCall(opts.onOdds, best);
      return true;
    }

    /* The server's default odds1x2 mode digests the upstream history to one
       validated consensus point. Poll that compact shape instead of pulling a
       multi-megabyte raw odds window into every browser every 15 seconds. */
    function processOddsDigest(body) {
      if (!body || body.ok !== true) return false;
      var p1 = Number(body.p1), draw = Number(body.draw), p2 = Number(body.p2), ts = Number(body.ts) || null;
      if (![p1, draw, p2].every(function (n) { return isFinite(n) && n >= 0 && n <= 100; })) return false;
      var key = p1 + "|" + draw + "|" + p2;
      if (key === st.lastOddsKey && ts === st.lastOddsTs) return false;
      st.lastOddsKey = key; st.lastOddsTs = ts;
      safeCall(opts.onOdds, { p1: p1, draw: draw, p2: p2, ts: ts });
      return true;
    }

    // Proxy failure reasons that mean "upstream is broken" (vs quietly no data).
    var ERRORISH = /^(http-\d+|bad-json)$/;

    function tick() {
      if (st.stopped) return Promise.resolve();
      if (st.inFlight) return st.inFlight; // never overlap cycles; tests join the current one
      st.inFlight = Promise.all([
        apiGet("fixtureId=" + fid + "&mode=scores"),
        apiGet("fixtureId=" + fid),
      ]).then(function (res) {
        if (st.stopped) return;
        var scores = res[0], odds = res[1];
        var sawData = false, err = null;
        if (Array.isArray(scores)) { if (scores.length) sawData = true; processScores(scores); }
        else if (scores && scores.reason && ERRORISH.test(scores.reason)) err = scores.reason;
        if (odds && odds.ok === true) { sawData = true; processOddsDigest(odds); }
        else if (Array.isArray(odds)) { if (odds.length) sawData = true; processOdds(odds); }
        else if (!err && odds && odds.reason && ERRORISH.test(odds.reason)) err = odds.reason;
        if (sawData) setStatus("live");
        else if (err) setStatus("error:" + err);
        else setStatus("idle"); // no creds / empty window / network down → quiet idle
        // A quiet football match is still a healthy feed. Consumers should use
        // this transport heartbeat—not only new goals/odds—to detect stalls.
        if (Array.isArray(scores) && ((odds && odds.ok === true) || Array.isArray(odds))) {
          safeCall(opts.onHeartbeat, { at: Date.now(), scoresOk: true, oddsOk: true });
        }
      }).catch(function () {
        if (!st.stopped) setStatus("idle");
      }).then(function () { st.inFlight = null; });
      return st.inFlight;
    }

    function stop() {
      st.stopped = true;
      if (st.timer) { clearInterval(st.timer); st.timer = null; }
    }

    if (!fid) { setStatus("idle"); return { stop: stop, tick: function () { return Promise.resolve(); } }; }
    tick(); // first cycle immediately
    if (isFinite(intervalMs) && intervalMs > 0) st.timer = setInterval(tick, intervalMs);
    return { stop: stop, tick: tick };
  }

  // ---------------------------------------------------------- exports
  return {
    latestOdds: latestOdds,
    poll: poll,
    isLive: isLive,
    configure: configure,
    // internals exposed for unit tests
    _mapAction: mapAction,
    _resolveTeam: resolveTeam,
  };
});
