import { type ReactNode } from "react";
import { Text } from "react-native";
import { PressableScale } from "./PressableScale";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const SURFACE: Record<Variant, string> = {
  primary: "bg-surface-brand",
  secondary: "bg-surface-canvas border border-border-default",
  ghost: "bg-transparent",
  danger: "bg-sindoor-500",
};
const LABEL: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-text-primary",
  ghost: "text-text-primary",
  danger: "text-white",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 rounded-md gap-1.5",
  md: "h-11 px-4 rounded-lg gap-2",
  lg: "h-12 px-5 rounded-xl gap-2",
};
const LABEL_SIZE: Record<Size, string> = {
  sm: "text-label-sm",
  md: "text-label-md",
  lg: "text-label-lg",
};

interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  block?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  className?: string;
  haptic?: keyof typeof haptics | null;
}

export function Button({
  children,
  variant = "primary",
  size = "lg",
  leadingIcon,
  trailingIcon,
  block,
  disabled,
  onPress,
  className,
  haptic,
}: ButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={disabled ? null : (haptic ?? "medium")}
      className={cn(
        "flex-row items-center justify-center",
        SURFACE[variant],
        SIZE[size],
        block && "w-full",
        disabled && "opacity-50",
        className,
      )}
    >
      {leadingIcon}
      <Text className={cn("font-semibold", LABEL[variant], LABEL_SIZE[size])}>
        {children}
      </Text>
      {trailingIcon}
    </PressableScale>
  );
}
