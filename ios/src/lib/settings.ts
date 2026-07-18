import AsyncStorage from "@react-native-async-storage/async-storage";

export type GameMode = "replay" | "live";

export interface GameSettings {
  mode: GameMode;
  /** Replay speed relative to real match time. Live mode is always 1x. */
  playbackRate: 1 | 15 | 30 | 60;
  answerSeconds: 8 | 10 | 15;
  revealSeconds: 2 | 4 | 6;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  mode: "replay",
  playbackRate: 30,
  answerSeconds: 10,
  revealSeconds: 4,
};

const KEY = "hilo.game-settings.v2";

export async function loadGameSettings(): Promise<GameSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_GAME_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...DEFAULT_GAME_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
}

export async function saveGameSettings(settings: GameSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Settings persistence is helpful, but never blocks a match.
  }
}

export function playbackLabel(settings: GameSettings): string {
  return settings.mode === "live" ? "LIVE · 1x" : `REPLAY · ${settings.playbackRate}x`;
}

