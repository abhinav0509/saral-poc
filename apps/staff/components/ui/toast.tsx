import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, AlertCircle, Info, X, type LucideIcon } from "lucide-react-native";
import { PressableScale } from "./PressableScale";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

type Tone = "success" | "error" | "info";
export interface ToastData {
  tone: Tone;
  title: string;
  desc?: string;
}

const TONE: Record<Tone, { surface: string; border: string; accent: string; text: string; Icon: LucideIcon; color: string }> = {
  success: { surface: "bg-sage-50", border: "border-sage-200", accent: palette.sage, text: "text-text-success", Icon: CheckCircle2, color: palette.sage },
  error: { surface: "bg-sindoor-50", border: "border-sindoor-200", accent: palette.sindoor, text: "text-text-critical", Icon: AlertCircle, color: palette.sindoor },
  info: { surface: "bg-surface-brand-subtle", border: "border-primary-200", accent: palette.brand, text: "text-text-brand", Icon: Info, color: palette.brand },
};

const ToastContext = createContext<{ show: (t: ToastData) => void }>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastData | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [anim]);

  const show = useCallback(
    (t: ToastData) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(t);
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 5 }).start();
      timer.current = setTimeout(hide, 4200);
    },
    [anim, hide],
  );

  const s = toast ? TONE[toast.tone] : null;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && s && (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            right: 16,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
          }}
        >
          <View
            className={cn("flex-row items-start gap-3 pl-4 pr-3 py-3 rounded-xl border overflow-hidden", s.surface, s.border)}
            style={{ shadowColor: "#0F1419", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}
          >
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: s.accent }} />
            <s.Icon size={18} color={s.color} style={{ marginTop: 1 }} />
            <View className="flex-1">
              <Text className={cn("text-label-md font-semibold", s.text)}>{toast.title}</Text>
              {toast.desc ? <Text className={cn("text-caption mt-0.5 opacity-80", s.text)}>{toast.desc}</Text> : null}
            </View>
            <PressableScale haptic={null} onPress={hide} className="p-1 rounded-md">
              <X size={16} color={s.color} />
            </PressableScale>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}
