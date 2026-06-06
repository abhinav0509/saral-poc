import { View, Text } from "react-native";
import { Clock, Check } from "lucide-react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { palette } from "@/lib/colors";

/**
 * "Running behind" — push every waiting patient's ETA forward by a chunk.
 * The offset is clinic-wide and shows up live on each patient's visit page,
 * so this is how "the doctor took an emergency, everyone's a bit later" is
 * communicated honestly instead of silently.
 */
const BUMPS = [15, 30, 60] as const;

export function RunningBehindSheet({
  visible,
  delayMinutes,
  pending,
  onBump,
  onReset,
  onClose,
}: {
  visible: boolean;
  delayMinutes: number;
  pending: boolean;
  onBump: (minutes: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const behind = delayMinutes > 0;
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>
        <View className="flex-row items-start gap-3 mb-1">
          <View className="size-11 rounded-full bg-amber-100 items-center justify-center">
            <Clock size={22} strokeWidth={2.2} color={palette.amber} />
          </View>
          <View className="flex-1">
            <Text className="text-h3 font-bold text-text-primary">Running behind</Text>
            <Text className="text-body-sm text-text-secondary mt-1 leading-relaxed">
              {behind
                ? `Waiting patients are seeing ~${delayMinutes} min added to their turn.`
                : "Push everyone's wait forward. Each waiting patient sees the longer time on their live page."}
            </Text>
          </View>
        </View>

        <Text className="text-label-sm font-medium text-text-tertiary uppercase tracking-wider mt-5 mb-2 px-1">
          {behind ? "Add more time" : "Push the queue"}
        </Text>
        <View className="flex-row gap-2">
          {BUMPS.map((m) => (
            <PressableScale
              key={m}
              haptic="medium"
              disabled={pending}
              onPress={() => onBump(m)}
              className="flex-1 h-14 rounded-xl bg-surface-canvas border border-border-default items-center justify-center"
            >
              <Text className="text-h4 font-bold text-text-primary">+{m}</Text>
              <Text className="text-caption text-text-tertiary">min</Text>
            </PressableScale>
          ))}
        </View>

        {behind && (
          <PressableScale
            haptic="success"
            disabled={pending}
            onPress={onReset}
            className="mt-3 h-12 rounded-xl bg-sage-100 flex-row items-center justify-center gap-2"
          >
            <Check size={18} strokeWidth={2.4} color={palette.sage} />
            <Text className="text-label-lg font-semibold text-text-success">We&apos;re back on time</Text>
          </PressableScale>
        )}

        <PressableScale haptic="light" onPress={onClose} className="mt-3 h-11 items-center justify-center">
          <Text className="text-label-md font-semibold text-text-secondary">Close</Text>
        </PressableScale>
      </View>
    </BottomSheet>
  );
}
