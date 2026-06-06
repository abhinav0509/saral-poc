import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { cssInterop } from "nativewind";
import { cn } from "@/lib/cn";

const AnimatedView = Animated.View;
cssInterop(AnimatedView, { className: "style" });

/** A pulsing placeholder block. Compose with className for size/shape. */
export function Skeleton({ className }: { className?: string }) {
  const a = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.6, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <AnimatedView className={cn("bg-surface-sunken rounded-lg", className)} style={{ opacity: a }} />;
}
