export type ArenaEntryMode = "live" | "replay";

/**
 * A requested live game must degrade to the replay arena when the real-time
 * fixture is unavailable. Joining should never become a silent no-op.
 */
export function arenaEntryMode(requestedMode: ArenaEntryMode, liveReady: boolean): ArenaEntryMode {
  return requestedMode === "live" && liveReady ? "live" : "replay";
}
