/* Persistent streak/ladder profile via AsyncStorage. */
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Profile {
  bestStreak: number;
  ladderPoints: number;
  crowns: number;
  lobbies: number;
  totalQuestions: number;
  totalCorrect: number;
  perKeyCorrect: Record<string, number>;
  badges: Record<string, true>;
}

export const EMPTY_PROFILE: Profile = {
  bestStreak: 0, ladderPoints: 0, crowns: 0, lobbies: 0,
  totalQuestions: 0, totalCorrect: 0, perKeyCorrect: {}, badges: {},
};

const KEY = "hilo.profile.v1";

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // non-fatal — profile just won't persist this session
  }
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
