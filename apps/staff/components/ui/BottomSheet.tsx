import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Reusable bottom sheet — backdrop fade + spring slide-up, a drag handle, and
 * tap-backdrop / Android-back to dismiss. The foundation for every confirm /
 * action sheet (drop, delay, emergency…). Animates out before unmounting so
 * the exit reads as deliberate, not a cut.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(height)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 14,
          bounciness: 3,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: height, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(15,20,25,0.55)", opacity: backdrop }]}
        >
          <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View
          className="bg-surface-canvas rounded-t-3xl px-5 pt-3"
          style={{ transform: [{ translateY }], paddingBottom: insets.bottom + 16 }}
        >
          <View className="self-center w-10 h-1.5 rounded-full bg-border-default mb-4" />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
