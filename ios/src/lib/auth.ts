import AsyncStorage from "@react-native-async-storage/async-storage";

export interface FanIdentity {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  provider: "google" | "guest";
}

const KEY = "hilo.identity.v1";

export async function loadIdentity(): Promise<FanIdentity | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FanIdentity) : null;
  } catch {
    return null;
  }
}

export async function saveIdentity(identity: FanIdentity): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(identity));
}

export async function clearIdentity(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export function makeGuestIdentity(name = "Demo Fan"): FanIdentity {
  return {
    id: `guest-${Date.now().toString(36)}`,
    name,
    provider: "guest",
  };
}

