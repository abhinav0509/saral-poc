import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { signInWithOtp } from "@saral/core";
import { SaralArch } from "@/components/brand/SaralArch";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast";
import { haptics } from "@/lib/haptics";

export default function SignInScreen() {
  const router = useRouter();
  const { show } = useToast();
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);

  const digits = phone.replace(/\D/g, "").slice(-10);
  const valid = digits.length === 10;

  async function onContinue() {
    if (!valid || sending) return;
    setSending(true);
    try {
      await signInWithOtp(digits);
      haptics.success();
      router.push({ pathname: "/(auth)/verify", params: { phone: digits } });
    } catch (e) {
      haptics.warning();
      show({ tone: "error", title: "Couldn't send code", desc: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 px-6 justify-center gap-8">
          <View className="items-center gap-4">
            <SaralArch size={56} />
            <View className="items-center gap-1">
              <Text className="text-h1 font-bold text-text-primary">Welcome to Saral</Text>
              <Text className="text-body-md text-text-secondary text-center">
                Sign in with your mobile number to manage your clinic.
              </Text>
            </View>
          </View>

          <View className="gap-3">
            <Input
              label="Mobile number"
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={onContinue}
              autoFocus
              helperText="We'll text you a 6-digit code."
            />
            <Button block size="lg" disabled={!valid || sending} onPress={onContinue}>
              {sending ? "Sending…" : "Send code"}
            </Button>
          </View>
        </View>

        <Text className="text-caption text-text-tertiary text-center pb-4 px-8">
          By continuing you agree to Saral&apos;s terms. Your details stay private.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
