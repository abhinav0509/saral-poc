import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { signInWithOtp, verifyOtp } from "@saral/core";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { PressableScale } from "@/components/ui/PressableScale";
import { useToast } from "@/components/ui/toast";
import { palette } from "@/lib/colors";
import { haptics } from "@/lib/haptics";

const RESEND_SECONDS = 30;

export default function VerifyScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const valid = code.replace(/\D/g, "").length === 6;
  const masked = phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "your number";

  async function onVerify() {
    if (!valid || verifying || !phone) return;
    setVerifying(true);
    try {
      await verifyOtp(phone, code);
      haptics.success();
      // The auth gate takes over from here (session → memberships → tabs/onboarding).
    } catch (e) {
      haptics.warning();
      setVerifying(false);
      show({ tone: "error", title: "Wrong or expired code", desc: e instanceof Error ? e.message : undefined });
    }
  }

  async function onResend() {
    if (secondsLeft > 0 || !phone) return;
    try {
      await signInWithOtp(phone);
      setSecondsLeft(RESEND_SECONDS);
      setCode("");
      inputRef.current?.focus();
      show({ tone: "info", title: "Code resent", desc: `Sent again to ${masked}` });
    } catch (e) {
      show({ tone: "error", title: "Couldn't resend", desc: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <View className="h-14 px-2 flex-row items-center">
        <PressableScale
          haptic="light"
          onPress={() => router.back()}
          className="size-10 items-center justify-center rounded-full"
        >
          <ChevronLeft size={24} color={palette.ink} />
        </PressableScale>
      </View>

      <KeyboardAvoider>
        <View className="flex-1 px-6 gap-8 pt-4">
          <View className="gap-1">
            <Text className="text-h1 font-bold text-text-primary">Enter the code</Text>
            <Text className="text-body-md text-text-secondary">
              We sent a 6-digit code to {masked}.
            </Text>
          </View>

          <View className="gap-3">
            <Input
              ref={inputRef}
              label="Verification code"
              placeholder="······"
              keyboardType="number-pad"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onVerify}
              className="text-center text-h2 tracking-[8px]"
            />
            <Button block size="lg" disabled={!valid || verifying} onPress={onVerify}>
              {verifying ? "Verifying…" : "Verify & continue"}
            </Button>

            <PressableScale
              haptic="light"
              disabled={secondsLeft > 0}
              onPress={onResend}
              className="h-10 items-center justify-center"
            >
              <Text className="text-label-md font-semibold text-text-brand">
                {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
              </Text>
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
