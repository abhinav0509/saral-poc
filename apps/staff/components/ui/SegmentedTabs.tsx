import { View, Text, Pressable } from "react-native";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

export interface SegTab {
  key: string;
  label: string;
  count?: number;
}

const ACTIVE_SHADOW = {
  shadowColor: "#0F1419",
  shadowOpacity: 0.06,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

export function SegmentedTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: SegTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <View className="h-10 p-1 bg-surface-sunken rounded-xl flex-row">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              if (!isActive) haptics.selection();
              onChange(t.key);
            }}
            className={cn(
              "flex-1 rounded-lg flex-row items-center justify-center gap-1.5",
              isActive && "bg-surface-canvas",
            )}
            style={isActive ? ACTIVE_SHADOW : undefined}
          >
            <Text
              className={cn(
                "text-label-md font-medium",
                isActive ? "text-text-primary" : "text-text-secondary",
              )}
            >
              {t.label}
            </Text>
            {typeof t.count === "number" && isActive && (
              <View className="min-w-[20px] h-[18px] px-1.5 rounded-full bg-surface-brand items-center justify-center">
                <Text className="text-white text-[11px] font-semibold">{t.count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
