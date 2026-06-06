import { View, Text } from "react-native";
import { CalendarX } from "lucide-react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

/**
 * Stop the day after an emergency. Bulk-cancels everyone still waiting and
 * tells them — warmly — on their live page that the clinic had to close.
 * The patient currently in the room is left untouched.
 */
export function CancelDaySheet({
  visible,
  waitingCount,
  pending,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  waitingCount: number;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const none = waitingCount === 0;
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>
        <View className="flex-row items-start gap-3 mb-1">
          <View className="size-11 rounded-full bg-sindoor-50 items-center justify-center">
            <CalendarX size={22} strokeWidth={2.2} color={palette.sindoor} />
          </View>
          <View className="flex-1">
            <Text className="text-h3 font-bold text-text-primary">Cancel the rest of today?</Text>
            <Text className="text-body-sm text-text-secondary mt-1 leading-relaxed">
              {none
                ? "No one is waiting right now, so there's nothing to cancel."
                : `${waitingCount} waiting patient${waitingCount === 1 ? "" : "s"} will be removed from the queue and told the clinic had to stop for today. The patient in the room isn't affected.`}
            </Text>
          </View>
        </View>

        <View className="mt-5 gap-2">
          <PressableScale
            haptic="warning"
            disabled={pending || none}
            onPress={onConfirm}
            className={cn(
              "h-12 rounded-xl bg-sindoor-500 items-center justify-center",
              (pending || none) && "opacity-40",
            )}
          >
            <Text className="text-label-lg font-semibold text-white">
              {pending
                ? "Cancelling…"
                : none
                  ? "Nothing to cancel"
                  : `Cancel ${waitingCount} appointment${waitingCount === 1 ? "" : "s"}`}
            </Text>
          </PressableScale>
          <PressableScale haptic="light" onPress={onClose} className="h-11 items-center justify-center">
            <Text className="text-label-md font-semibold text-text-secondary">Keep the queue</Text>
          </PressableScale>
        </View>
      </View>
    </BottomSheet>
  );
}
