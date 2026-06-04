import { useRef } from "react";
import { Animated, Pressable, type PressableProps } from "react-native";
import { haptics } from "@/lib/haptics";

type HapticKind = keyof typeof haptics;

interface Props extends Omit<PressableProps, "style"> {
  className?: string;
  /** Scale at the bottom of the press. 0.96 by default. */
  scaleTo?: number;
  /** Haptic on press (null to disable). "light" by default. */
  haptic?: HapticKind | null;
  /** Style on the animated wrapper (rarely needed). */
  style?: PressableProps["style"];
}

/**
 * The base micro-interaction: a spring scale-down on press + a haptic tap.
 * Wraps a core Pressable (so NativeWind className works) in an Animated.View
 * (which carries the native-driven scale). Used by every tappable surface.
 */
export function PressableScale({
  className,
  scaleTo = 0.96,
  haptic = "light",
  disabled,
  onPress,
  onPressIn,
  onPressOut,
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
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        className={className}
        disabled={disabled}
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
      </Pressable>
    </Animated.View>
  );
}
