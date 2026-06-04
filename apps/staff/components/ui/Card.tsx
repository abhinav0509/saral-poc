import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";

type Surface =
  | "canvas"
  | "raised"
  | "sunken"
  | "inverse"
  | "brand"
  | "brand-subtle"
  | "accent-subtle";
type Elevation = "none" | "sm" | "md" | "lg";

const SURFACE: Record<Surface, string> = {
  canvas: "bg-surface-canvas",
  raised: "bg-surface-raised",
  sunken: "bg-surface-sunken",
  inverse: "bg-surface-inverse",
  brand: "bg-surface-brand",
  "brand-subtle": "bg-surface-brand-subtle",
  "accent-subtle": "bg-surface-accent-subtle",
};

// RN shadows (iOS shadow* + Android elevation), tuned to match the web tokens.
const ELEVATION: Record<Elevation, object> = {
  none: {},
  sm: { shadowColor: "#0F1419", shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  md: { shadowColor: "#0F1419", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  lg: { shadowColor: "#0F1419", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
};

interface CardProps extends ViewProps {
  surface?: Surface;
  elevation?: Elevation;
  bordered?: boolean;
  className?: string;
}

export function Card({
  surface = "canvas",
  elevation = "none",
  bordered = false,
  className,
  style,
  ...props
}: CardProps) {
  return (
    <View
      className={cn("rounded-xl", SURFACE[surface], bordered && "border border-border-subtle", className)}
      style={[ELEVATION[elevation], style]}
      {...props}
    />
  );
}
