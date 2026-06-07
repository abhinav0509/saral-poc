import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { upsertPushToken } from "@saral/core";

// Foreground presentation (SDK 53+ shape).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request permission, get this device's Expo push token, and register it for
 * the active clinic. Best-effort: no-ops (warns) if permission is denied or the
 * EAS projectId isn't set (Expo Go / un-initialised EAS) — needs a dev build.
 */
export async function registerForPush(clinicId: string): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    const status = existing === "granted" ? existing : (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await upsertPushToken(clinicId, token, Platform.OS);
  } catch (e) {
    console.warn("[push] registration skipped (needs a dev build + EAS projectId)", e);
  }
}

/** Route on notification tap (payload.data.route, e.g. "/queue"). */
export function addPushTapListener(onRoute: (route: string) => void) {
  return Notifications.addNotificationResponseReceivedListener((resp) => {
    const route = resp.notification.request.content.data?.route;
    if (typeof route === "string") onRoute(route);
  });
}
