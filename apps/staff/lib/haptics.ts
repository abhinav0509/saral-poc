import * as Haptics from "expo-haptics";

// Thin, never-throwing wrapper. Haptics are a delight layer — if the platform
// can't deliver one, we silently skip rather than break the interaction.
const safe = (fn: () => Promise<unknown>) => () => {
  void fn().catch(() => {});
};

export const haptics = {
  light: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  selection: safe(() => Haptics.selectionAsync()),
  success: safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  ),
  warning: safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  ),
  error: safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  ),
};
