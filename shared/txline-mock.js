/* ============================================================
   TxLINE MOCK CLIENT — placeholder for the real TxLINE API.
   Swap points (marked ⟨REAL⟩) map 1:1 to production endpoints:
     auth:    POST https://txline.txodds.com/auth/guest/start
     token:   POST /api/token/activate  (after on-chain subscribe)
     odds:    GET  /api/odds/stream (SSE), /api/odds/snapshot/{fixtureId}
     scores:  GET  /api/scores/stream (SSE), /api/scores/historical/{fixtureId}
     proofs:  GET  /api/scores/stat-validation?fixtureId&seq&statKeys
   The mock emits the same conceptual payloads: score events with
   seq + stats map + gameState phase, and odds updates with implied Pct.
   ============================================================ */

const TxMock = (() => {
  // A scripted "France vs Morocco" match — realistic knockout timeline.
  // Each event: [matchMinute, type, team (1|2), detail]
  const TIMELINE = [
    [1,"kickoff",0,"H1"],[3,"shot",1,"OffTarget"],[6,"corner",2,""],[9,"freekick",1,"Attack"],
    [12,"shot",2,"OnTarget"],[14,"corner",1,""],[17,"card",2,"Yellow"],[19,"shot",1,"Woodwork"],
    [23,"goal",1,"Open play"],[26,"shot",2,"OffTarget"],[29,"corner",2,""],[31,"freekick",2,"Danger"],
    [34,"shot",2,"OnTarget"],[36,"var",2,"Penalty"],[38,"var_verdict",2,"Upheld — penalty awarded"],
    [39,"penalty",2,"Scored"],[42,"card",1,"Yellow"],[45,"halftime",0,"HT"],
    [46,"kickoff",0,"H2"],[49,"corner",1,""],[52,"shot",1,"Blocked"],[55,"sub",2,""],
    [58,"freekick",2,"HighDanger"],[60,"shot",2,"Woodwork"],[63,"corner",2,""],[66,"card",2,"Yellow"],
    [69,"goal",2,"Counter attack"],[72,"sub",1,""],[75,"shot",1,"OnTarget"],[78,"corner",1,""],
    [81,"card",1,"Red"],[84,"shot",2,"OnTarget"],[87,"goal",1,"Set piece"],[90,"fulltime",0,"FT 2-2 → ET"],
    [93,"kickoff",0,"ET1"],[97,"corner",2,""],[101,"shot",2,"OnTarget"],[104,"goal",2,"Header"],
    [105,"halftime",0,"HT-ET"],[106,"kickoff",0,"ET2"],[112,"shot",1,"OffTarget"],[116,"corner",1,""],
    [119,"shot",1,"OnTarget"],[120,"game_finalised",0,"FT 2-3"]
  ];

  const FIXTURE = {
    FixtureId: 17952170, Competition: "FIFA World Cup 2026 — Semi-final",
    Participant1: "France", Participant2: "Morocco", Participant1IsHome: true,
    StartTime: "2026-07-14T19:00:00Z"
  };

  // Odds engine: base implied win prob for team1, nudged by events, with noise.
  function oddsAt(events) {
    let p1 = 0.62, drawW = 0.22; // pre-match consensus
    for (const e of events) {
      if (e.type === "goal") { p1 += e.team === 1 ? 0.14 : -0.15; }
      if (e.type === "penalty" && e.detail === "Scored") { p1 += e.team === 1 ? 0.12 : -0.13; }
      if (e.type === "card" && e.detail === "Red") { p1 += e.team === 1 ? -0.11 : 0.11; }
      if (e.type === "shot" && e.detail !== "OffTarget") { p1 += e.team === 1 ? 0.004 : -0.004; }
      if (e.type === "corner") { p1 += e.team === 1 ? 0.002 : -0.002; }
    }
    const min = events.length ? events[events.length - 1].minute : 0;
    if (min > 70) drawW *= Math.max(0.3, 1 - (min - 70) / 40);
    p1 = Math.min(0.95, Math.max(0.03, p1));
    const p2 = Math.min(0.95, Math.max(0.03, 1 - p1 - drawW));
    return { home: p1, draw: Math.max(0.02, 1 - p1 - p2), away: p2 };
  }

  // Build enriched event objects with running stats + seq.
  function buildEvents() {
    const evs = []; const stats = { c1:0,c2:0,g1:0,g2:0,y1:0,y2:0,r1:0,r2:0,s1:0,s2:0 };
    TIMELINE.forEach((t, i) => {
      const [minute, type, team, detail] = t;
      if (type==="goal"||(type==="penalty"&&detail==="Scored")) stats["g"+team]++;
      if (type==="corner") stats["c"+team]++;
      if (type==="card"&&detail==="Yellow") stats["y"+team]++;
      if (type==="card"&&detail==="Red") stats["r"+team]++;
      if (type==="shot") stats["s"+team]++;
      const e = { seq: 900+i, minute, type, team, detail, stats: {...stats},
        teamName: team===1?FIXTURE.Participant1:team===2?FIXTURE.Participant2:"—" };
      e.odds = oddsAt(evs.concat(e));
      evs.push(e);
    });
    return evs;
  }
  const EVENTS = buildEvents();

  // ⟨REAL⟩ GET /api/scores/stat-validation — returns Merkle proof.
  // Mock: fabricated-but-shaped proof object + deterministic pseudo-hashes.
  function hash(s){let h=0x811c9dc5;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,"0");}
  function fakeSig(seed){let out="";for(let i=0;i<8;i++)out+=hash(seed+":"+i);return out.slice(0,64);}
  function proofFor(statKey, value, seq) {
    const leaf = hash(`leaf:${FIXTURE.FixtureId}:${statKey}:${value}:${seq}`);
    const path = [1,2,3,4].map(i => ({ hash: hash(`node:${leaf}:${i}`), isRightSibling: i % 2 === 0 }));
    const root = hash(`root:${leaf}:${path.map(p=>p.hash).join("")}`);
    return { fixtureId: FIXTURE.FixtureId, statKey, value, seq, leaf, path, onChainRoot: root,
      rootPda: "9ExbZ…KaA/daily_scores_roots/" + Math.floor(Date.now()/86400000),
      txSig: fakeSig("settle:"+statKey+":"+seq), verified: true };
  }

  // Streaming simulator. speed = sim-minutes per real second.
  function stream({ speed = 2, onEvent, onOdds, onDone, from = 0 } = {}) {
    let i = 0, stopped = false;
    while (i < EVENTS.length && EVENTS[i].minute < from) { i++; }
    const seed = EVENTS.slice(0, i);
    let simMin = from;
    const iv = setInterval(() => {
      if (stopped) return;
      simMin += speed * 0.25;
      while (i < EVENTS.length && EVENTS[i].minute <= simMin) {
        const e = EVENTS[i++];
        onEvent && onEvent(e);
        onOdds && onOdds(e.odds, e.minute);
        if (e.type === "game_finalised") { clearInterval(iv); onDone && onDone(e); }
      }
    }, 250);
    return { stop(){ stopped = true; clearInterval(iv); }, seeded: seed };
  }

  return {
    FIXTURE, EVENTS, proofFor, stream, hash, fakeSig,
    // ⟨REAL⟩ GET /api/fixtures/snapshot
    fixtures: () => [FIXTURE],
    // ⟨REAL⟩ GET /api/odds/snapshot/{fixtureId}
    oddsSnapshot: () => EVENTS[0].odds,
    // ⟨REAL⟩ GET /api/scores/historical/{fixtureId}
    historical: () => EVENTS,
  };
})();
if (typeof module !== "undefined") module.exports = TxMock;
