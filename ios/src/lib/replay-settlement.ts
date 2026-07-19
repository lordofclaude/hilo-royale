export const MAX_REPLAY_ROUND_MS = 30_000;

export function replaySettlementBoundary(fromMinute: number, windowMinutes: number): number {
  return Math.max(0, fromMinute) + Math.max(0, windowMinutes);
}

export function replaySettlementSecondsLeft(startedAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((startedAt + MAX_REPLAY_ROUND_MS - now) / 1000));
}
