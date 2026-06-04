import { View, Text } from "react-native";
import type { VisitSource } from "@saral/core";
import { cn } from "@/lib/cn";

const MAP: Record<VisitSource, { label: string; bg: string; text: string }> = {
  online: { label: "Online", bg: "bg-surface-brand-subtle", text: "text-text-brand" },
  qr: { label: "QR walk-in", bg: "bg-surface-accent-subtle", text: "text-text-accent" },
  phone: { label: "Phone", bg: "bg-surface-sunken", text: "text-text-secondary" },
};

export function SourceBadge({ source }: { source: VisitSource }) {
  const s = MAP[source];
  return (
    <View className={cn("h-[18px] px-2 rounded-full items-center justify-center", s.bg)}>
      <Text className={cn("text-label-sm font-medium", s.text)}>{s.label}</Text>
    </View>
  );
}
