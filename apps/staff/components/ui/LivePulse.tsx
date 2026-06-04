import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { palette } from "@/lib/colors";

/**
 * A "live" dot — a solid core with an outward expanding, fading ring.
 * The signal that the queue is breathing in real time (matches the web's
 * pulsing sage dot on the Now-serving card).
 */
export function LivePulse({
  size = 10,
  color = palette.sage,
}: {
  size?: number;
  color?: string;
}) {
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(a, {
        toValue: 1,
        duration: 1700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);

  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}
