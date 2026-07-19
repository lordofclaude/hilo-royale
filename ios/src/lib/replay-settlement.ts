export const MAX_REPLAY_ROUND_MS = 30_000;

export function replaySettlementDeadline(lockedAt: number): number {
  return lockedAt + MAX_REPLAY_ROUND_MS;
}

export function replaySettlementBoundary(fromMinute: number, windowMinutes: number): number {
  return Math.max(0, fromMinute) + Math.max(0, windowMinutes);
}

export function replaySettlementSecondsLeft(lockedAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((replaySettlementDeadline(lockedAt) - now) / 1000));
}
