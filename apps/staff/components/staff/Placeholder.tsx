import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SaralArch } from "@/components/brand/SaralArch";

export function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
      <View className="flex-1 items-center justify-center px-10 gap-3">
        <SaralArch size={44} />
        <Text className="text-h3 font-bold text-text-primary text-center">{title}</Text>
        <Text className="text-body-md text-text-secondary text-center leading-relaxed">
          {subtitle}
        </Text>
      </View>
    </SafeAreaView>
  );
}
