import { View, Text, Linking } from "react-native";
import { Phone } from "lucide-react-native";
import type { Visit } from "@saral/core";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { cn } from "@/lib/cn";

/**
 * The "human touch" drop flow (mirrors the web): never drop a patient silently.
 * Lead with a call-to-confirm; demote the actual drop to a quiet text button.
 */
export function DropConfirmSheet({
  visit,
  pending,
  onConfirm,
  onClose,
}: {
  visit: Visit | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const first = visit?.patient_name.split(" ")[0] ?? "";
  const dial = visit?.mobile ? visit.mobile.replace(/\D/g, "").slice(-10) : null;

  return (
    <BottomSheet visible={!!visit} onClose={onClose}>
      {visit && (
        <View>
          <View className="flex-row items-center gap-2 mb-1">
            <View className="h-7 px-2 rounded-md bg-surface-sunken items-center justify-center">
              <Text className="text-label-sm font-semibold text-text-primary">{visit.token}</Text>
            </View>
            <Text className="text-label-md font-semibold text-text-primary">{visit.patient_name}</Text>
          </View>

          <Text className="mt-3 text-h3 font-bold text-text-primary">Did {first} leave?</Text>
          <Text className="mt-1 text-body-sm text-text-secondary leading-relaxed">
            Quick call confirms it. We never drop a patient silently — the human touch matters.
          </Text>

          <View className="mt-5 gap-2">
            <PressableScale
              haptic="light"
              disabled={!dial}
              onPress={() => dial && Linking.openURL(`tel:${dial}`)}
              className={cn(
                "h-12 rounded-xl bg-surface-brand flex-row items-center justify-center gap-2",
                !dial && "opacity-40",
              )}
            >
              <Phone size={18} color="#fff" />
              <Text className="text-label-lg font-semibold text-white">Call {first} to confirm</Text>
            </PressableScale>

            <PressableScale
              haptic="warning"
              disabled={pending}
              onPress={onConfirm}
              className="h-12 items-center justify-center"
            >
              <Text className="text-label-md font-semibold text-text-critical">
                {pending ? "Dropping…" : "Skip & drop from queue"}
              </Text>
            </PressableScale>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}
