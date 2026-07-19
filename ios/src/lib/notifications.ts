/* Push/local notification wiring.
   Demo mode uses LOCAL notifications so everything works in Expo Go
   with no push server. ⟨REAL⟩ notes mark where the production lobby
   scheduler sends remote pushes via Expo Push API instead. */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** "Lobby opening in 5 min" — demo fires after `seconds` (default 10s so
 *  you can lock the phone and watch it arrive).
 *  ⟨REAL⟩ the lobby scheduler service sends this as a remote push
 *  (Expo Push API, to token from getExpoPushTokenAsync) 5 min before
 *  each replay lobby of a famous match opens. */
export async function scheduleLobbyReminder(
  seconds = 10,
  lobbyId = "LOBBY-001",
  matchLabel = "a classic match"
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Lobby opening in 5 minutes",
      body: `Replay lobby #${lobbyId} (${matchLabel}) is about to open. Claim your spot.`,
      sound: true,
      data: { lobbyId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
    },
  });
}

/** "You survived round N" — fired locally the moment you survive a round,
 *  so backgrounded players feel the game's pulse.
 *  ⟨REAL⟩ server-side push when multiplayer lobbies go live. */
export async function notifySurvival(round: number, aliveCount: number): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `You survived round ${round}`,
      body: `${aliveCount} fans still alive. The cascade is coming — get back in.`,
      sound: Platform.OS === "ios" ? true : undefined,
      data: { round },
    },
    trigger: null, // immediate
  });
}
