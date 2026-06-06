import { View, Text } from "react-native";
import { HeartPulse } from "lucide-react-native";
import { palette } from "@/lib/colors";

/**
 * The unmistakable "Emergency" marker — sindoor pill with a heart-pulse glyph.
 * `compact` drops the label to just the icon for tight rows.
 */
export function EmergencyBadge({ compact = false }: { compact?: boolean }) {
  return (
    <View className="flex-row items-center gap-1 h-[18px] px-1.5 rounded-full bg-sindoor-50">
      <HeartPulse size={11} strokeWidth={2.6} color={palette.sindoor} />
      {!compact && (
        <Text className="text-label-sm font-semibold text-text-critical">Emergency</Text>
      )}
    </View>
  );
}
