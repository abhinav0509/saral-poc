import { View, Text } from "react-native";
import { HeartPulse, Stethoscope, Clock, ChevronRight } from "lucide-react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { palette } from "@/lib/colors";

/**
 * Shown right after an emergency is added. The default is already done — they
 * jumped to the top and are next. This just offers the two escalations:
 * interrupt the current consult, or push everyone else's wait honestly.
 */
export function EmergencyAddedSheet({
  visible,
  token,
  patientName,
  hasNowServing,
  pending,
  onBringInNow,
  onPushWait,
  onClose,
}: {
  visible: boolean;
  token: string | null;
  patientName: string;
  hasNowServing: boolean;
  pending: boolean;
  onBringInNow: () => void;
  onPushWait: () => void;
  onClose: () => void;
}) {
  const first = patientName.split(" ")[0] || "The patient";
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>
        <View className="flex-row items-start gap-3 mb-1">
          <View className="size-11 rounded-full bg-sindoor-50 items-center justify-center">
            <HeartPulse size={22} strokeWidth={2.2} color={palette.sindoor} />
          </View>
          <View className="flex-1">
            <Text className="text-h3 font-bold text-text-primary">
              {token ? `${token} is at the top` : "Added to the top"}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1 leading-relaxed">
              {hasNowServing
                ? `${first} is next — the doctor will see them after the current patient. Or bring them in now.`
                : `${first} is next in line.`}
            </Text>
          </View>
        </View>

        <View className="mt-5 gap-2">
          {hasNowServing && (
            <PressableScale
              haptic="warning"
              disabled={pending}
              onPress={onBringInNow}
              className="flex-row items-center gap-3 rounded-xl px-4 py-3.5 bg-sindoor-500"
            >
              <Stethoscope size={18} color="#fff" />
              <View className="flex-1">
                <Text className="text-label-lg font-semibold text-white">
                  {pending ? "Bringing in…" : "Bring in now"}
                </Text>
                <Text className="text-caption text-white/80 mt-0.5">
                  Pauses the current consult — they go back to the front
                </Text>
              </View>
              <ChevronRight size={18} color="rgba(255,255,255,0.7)" />
            </PressableScale>
          )}

          <PressableScale
            haptic="light"
            onPress={onPushWait}
            className="flex-row items-center gap-3 rounded-xl px-4 py-3.5 bg-surface-canvas border border-border-default"
          >
            <View className="size-9 rounded-lg bg-amber-100 items-center justify-center">
              <Clock size={18} strokeWidth={2.2} color={palette.amber} />
            </View>
            <View className="flex-1">
              <Text className="text-label-md font-semibold text-text-primary">Push everyone&apos;s wait</Text>
              <Text className="text-caption text-text-secondary mt-0.5">
                Let waiting patients know it&apos;ll be a bit longer
              </Text>
            </View>
            <ChevronRight size={18} color={palette.tertiary} />
          </PressableScale>
        </View>

        <PressableScale haptic="light" onPress={onClose} className="mt-4 h-11 items-center justify-center">
          <Text className="text-label-md font-semibold text-text-secondary">Done</Text>
        </PressableScale>
      </View>
    </BottomSheet>
  );
}
