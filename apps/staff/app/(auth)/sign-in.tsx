import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { signInWithOtp, signInWithEmailPassword, signUpWithEmailPassword } from "@saral/core";
import { SaralArch } from "@/components/brand/SaralArch";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast";
import { haptics } from "@/lib/haptics";

// Dev-only: skip OTP and sign in with email + password (no SMS provider needed).
const DEV_AUTH = process.env.EXPO_PUBLIC_DEV_AUTH === "1";

export default function SignInScreen() {
  const router = useRouter();
  const { show } = useToast();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);

  const digits = phone.replace(/\D/g, "").slice(-10);
  const valid = DEV_AUTH
    ? /\S+@\S+\.\S+/.test(email) && password.length >= 6
    : digits.length === 10;

  async function onContinue() {
    if (!valid || sending) return;
    setSending(true);
    try {
      if (DEV_AUTH) {
        // Sign in; if the user doesn't exist yet, create it (works when
        // "Confirm email" is off), then sign in.
        try {
          await signInWithEmailPassword(email, password);
        } catch {
          await signUpWithEmailPassword(email, password);
          await signInWithEmailPassword(email, password);
        }
        haptics.success();
        // Auth gate takes over from here.
        return;
      }
      await signInWithOtp(digits);
      haptics.success();
      router.push({ pathname: "/(auth)/verify", params: { phone: digits } });
    } catch (e) {
      haptics.warning();
      show({ tone: "error", title: "Couldn't sign in", desc: e instanceof Error ? e.message : undefined });
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
            {DEV_AUTH ? (
              <>
                <Input
                  label="Email"
                  placeholder="dev@saral.test"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  autoFocus
                  helperText="Dev mode · email + password"
                />
                <Input
                  label="Password"
                  placeholder="At least 6 characters"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                  onSubmitEditing={onContinue}
                />
              </>
            ) : (
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
            )}
            <Button block size="lg" disabled={!valid || sending} onPress={onContinue}>
              {sending ? (DEV_AUTH ? "Signing in…" : "Sending…") : DEV_AUTH ? "Sign in" : "Send code"}
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
