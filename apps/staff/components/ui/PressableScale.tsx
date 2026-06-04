import { useRef } from "react";
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { cssInterop } from "nativewind";
import { haptics } from "@/lib/haptics";

// A single animated Pressable so NativeWind's className (flex-1, w-full, bg,
// padding…) applies directly to the touch target — no wrapper that would
// swallow layout. cssInterop maps className → style; the animated scale rides
// alongside in the style prop.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
cssInterop(AnimatedPressable, { className: "style" });

type HapticKind = keyof typeof haptics;

interface Props extends Omit<PressableProps, "style"> {
  className?: string;
  /** Scale at the bottom of the press. 0.96 by default. */
  scaleTo?: number;
  /** Haptic on press (null to disable). "light" by default. */
  haptic?: HapticKind | null;
  /** Extra static style, merged with the animated transform. */
  style?: StyleProp<ViewStyle>;
}

export function PressableScale({
  className,
  scaleTo = 0.96,
  haptic = "light",
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  style,
  children,
  ...props
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();

  return (
    <AnimatedPressable
      className={className}
      disabled={disabled}
      style={[{ transform: [{ scale }] }, style]}
      onPressIn={(e) => {
        spring(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic && !disabled) haptics[haptic]();
        onPress?.(e);
      }}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}
