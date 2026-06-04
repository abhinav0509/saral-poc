import { type ReactNode } from "react";
import { View, Text } from "react-native";
import { CheckCircle2, ChevronRight } from "lucide-react-native";
import type { Visit } from "@saral/core";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { WhatsAppIcon } from "@/components/brand/WhatsAppIcon";
import { palette } from "@/lib/colors";

/** The row "⋮ more" menu — same actions as the web dropdown, as a native sheet. */
export function RowActionsSheet({
  visit,
  onBringIn,
  onSendWhatsapp,
  onOpenHistory,
  onClose,
}: {
  visit: Visit | null;
  onBringIn: () => void;
  onSendWhatsapp: () => void;
  onOpenHistory: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={!!visit} onClose={onClose}>
      {visit && (
        <View>
          <View className="flex-row items-center gap-2 mb-3 px-1">
            <View className="h-7 px-2 rounded-md bg-surface-sunken items-center justify-center">
              <Text className="text-label-sm font-semibold text-text-primary">{visit.token}</Text>
            </View>
            <Text className="text-label-md font-semibold text-text-primary">{visit.patient_name}</Text>
          </View>

          <View className="rounded-2xl border border-border-subtle overflow-hidden">
            <Action
              icon={<CheckCircle2 size={18} color={palette.brand} />}
              label="Bring into chair now"
              onPress={() => {
                onClose();
                onBringIn();
              }}
            />
            <View className="h-px bg-border-subtle" />
            <Action
              icon={<WhatsAppIcon size={18} />}
              label="Send link on WhatsApp"
              onPress={() => {
                onClose();
                onSendWhatsapp();
              }}
            />
            <View className="h-px bg-border-subtle" />
            <Action
              icon={<ChevronRight size={18} color={palette.muted} />}
              label="Open patient history"
              onPress={() => {
                onClose();
                onOpenHistory();
              }}
            />
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

function Action({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <PressableScale
      haptic="light"
      scaleTo={0.98}
      onPress={onPress}
      className="flex-row items-center gap-3 px-3.5 py-3.5 bg-surface-canvas"
    >
      <View className="w-5 items-center">{icon}</View>
      <Text className="text-label-md font-medium text-text-primary">{label}</Text>
    </PressableScale>
  );
}
