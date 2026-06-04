import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Home, Users, Search, Calendar, MoreHorizontal, type LucideIcon } from "lucide-react-native";
import { palette } from "@/lib/colors";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = {
  index: Home,
  queue: Users,
  search: Search,
  calendar: Calendar,
  more: MoreHorizontal,
};
const LABELS: Record<string, string> = {
  index: "Home",
  queue: "Queue",
  search: "Search",
  calendar: "Calendar",
  more: "More",
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row bg-surface-canvas border-t border-border-subtle"
      style={{ paddingBottom: insets.bottom || 8 }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const Icon = ICONS[route.name] ?? MoreHorizontal;
        const label = LABELS[route.name] ?? route.name;
        return (
          <Pressable
            key={route.key}
            className="flex-1 items-center pt-1.5 pb-1.5"
            onPress={() => {
              haptics.selection();
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
          >
            <View
              className="w-6 h-[3px] rounded-full mb-1.5"
              style={{ backgroundColor: focused ? palette.brand : "transparent" }}
            />
            <Icon size={22} strokeWidth={2} color={focused ? palette.brand : palette.tertiary} />
            <Text
              className={cn(
                "text-[11px] font-medium mt-1",
                focused ? "text-text-brand" : "text-text-tertiary",
              )}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
