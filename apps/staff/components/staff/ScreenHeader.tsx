import { type ReactNode } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { palette } from "@/lib/colors";

export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View className="flex-row items-center h-14 px-2 border-b border-border-subtle">
      <PressableScale
        haptic="light"
        onPress={() => router.back()}
        className="size-10 items-center justify-center rounded-full"
      >
        <ChevronLeft size={24} color={palette.ink} />
      </PressableScale>
      <Text className="flex-1 text-label-lg font-semibold text-text-primary">{title}</Text>
      {right}
    </View>
  );
}
