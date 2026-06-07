import { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * App-wide keyboard avoidance. `behavior="padding"` works on both platforms —
 * critical on Android where `edgeToEdgeEnabled` stops the window auto-resizing
 * for the IME, so without this the keyboard covers focused inputs. Wrap a
 * screen's content (a centered View or a ScrollView) in this.
 */
export function KeyboardAvoider({
  children,
  style,
  offset = 0,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  offset?: number;
}) {
  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? offset : offset}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
