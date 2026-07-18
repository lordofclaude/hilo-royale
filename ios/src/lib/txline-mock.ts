/* ============================================================
   TxLINE mock feed (TypeScript port of ../../t2-hilo-royale
   shared/txline-mock.js — same scripted France–Morocco semi).

   ⟨REAL⟩ swap map (see 01-research/txline-api-reference.md):
     auth:   POST https://txline.txodds.com/auth/guest/start → guest JWT
     token:  POST /api/token/activate (after on-chain subscribe)
     live:   GET  /api/scores/stream?fixtureId=…  — SSE.
             In React Native use fetch-based SSE (expo/fetch supports
             streaming bodies) or react-native-sse; parse `data:` JSON
             lines into ScoreEvent below; resume with Last-Event-ID.
     replay: GET  /api/scores/historical/{fixtureId} → ScoreEvent[]
             (exactly what EVENTS below stands in for)
     proofs: GET  /api/scores/stat-validation?fixtureId&seq&statKeys
   ============================================================ */

export interface StatMap {
  c1: number; c2: number; s1: number; s2: number;
  y1: number; y2: number; r1: number; r2: number;
  g1: number; g2: number;
}

export interface ScoreEvent {
  seq: number;
  minute: number;
  type: string;
  team: number;
  detail: string;
  stats: StatMap;
  teamName: string;
}

export const FIXTURE = {
  FixtureId: 17952170,
  Competition: "FIFA World Cup 2026 — Semi-final",
  Participant1: "France",
  Participant2: "Morocco",
  Participant1IsHome: true,
  StartTime: "2026-07-14T19:00:00Z",
};

// [matchMinute, type, team (1|2|0), detail]
const TIMELINE: Array<[number, string, number, string]> = [
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
  [119,"shot",1,"OnTarget"],[120,"game_finalised",0,"FT 2-3"],
];

function buildEvents(): ScoreEvent[] {
  const evs: ScoreEvent[] = [];
  const stats: StatMap = { c1:0,c2:0,g1:0,g2:0,y1:0,y2:0,r1:0,r2:0,s1:0,s2:0 };
  TIMELINE.forEach((t, i) => {
    const [minute, type, team, detail] = t;
    const bump = (k: keyof StatMap) => { stats[k] = stats[k] + 1; };
    if (type === "goal" || (type === "penalty" && detail === "Scored")) bump(("g" + team) as keyof StatMap);
    if (type === "corner") bump(("c" + team) as keyof StatMap);
    if (type === "card" && detail === "Yellow") bump(("y" + team) as keyof StatMap);
    if (type === "card" && detail === "Red") bump(("r" + team) as keyof StatMap);
    if (type === "shot") bump(("s" + team) as keyof StatMap);
    evs.push({
      seq: 900 + i, minute, type, team, detail, stats: { ...stats },
      teamName: team === 1 ? FIXTURE.Participant1 : team === 2 ? FIXTURE.Participant2 : "—",
    });
  });
  return evs;
}

// ⟨REAL⟩ replace with GET /api/scores/historical/{fixtureId}
export const EVENTS: ScoreEvent[] = buildEvents();

export interface StreamHandle { stop: () => void; }

/** Streaming simulator: speed = sim-minutes per real second.
 *  ⟨REAL⟩ replace body with an SSE reader over GET /api/scores/stream
 *  (keep the same onEvent/onDone surface — the game code won't change). */
export function stream(opts: {
  speed?: number;
  from?: number;
  onEvent?: (e: ScoreEvent) => void;
  onDone?: (e: ScoreEvent) => void;
}): StreamHandle {
  const { speed = 2, from = 0, onEvent, onDone } = opts;
  let i = 0, stopped = false;
  while (i < EVENTS.length && EVENTS[i].minute < from) i++;
  let simMin = from;
  const iv = setInterval(() => {
    if (stopped) return;
    simMin += speed * 0.25;
    while (i < EVENTS.length && EVENTS[i].minute <= simMin) {
      const e = EVENTS[i++];
      onEvent && onEvent(e);
      if (e.type === "game_finalised") { clearInterval(iv); onDone && onDone(e); }
    }
  }, 250);
  return { stop() { stopped = true; clearInterval(iv); } };
}
