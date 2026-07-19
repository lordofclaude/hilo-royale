import type { Answer, Side } from "./lib/game-logic";
import type { RoundSettlement } from "./lib/room-service";

export interface RoundRecord {
  round: number;
  kind: string;
  key: string;
  prompt: string;
  pick: Side | null;
  answer: Answer;
  matchMinute: number;
  correct: boolean;
  points: number;
  correctShare: number;
}

export interface ChallengeRun {
  fixtureId: string;
  picks: Array<Side | null>;
  targetPoints: number;
}

export interface DeathMoment {
  round: number;
  prompt: string;
  pick: Side | null;
  answer: Answer;
  correctShare: number;
  matchMinute: number;
  eliminatedWith: number;
}

export interface GameResult {
  fixtureId: string;
  dailyKey: string;
  won: boolean;
  survivedToEnd: boolean;
  streak: number;
  outlivedCount: number;
  predictionPoints: number;
  survivalPoints: number;
  crownBonus: number;
  pts: number;
  rounds: number;
  aliveAtEnd: number;
  challengeTargetPoints?: number;
  ghostRankAtEnd?: number;
  death?: DeathMoment;
  badges: string[];
  history: RoundRecord[];
  settlement?: RoundSettlement;
}
