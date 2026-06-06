import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { updateMyName } from "@saral/core";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { useToast } from "@/components/ui/toast";
import { useAuth, useActiveClinic } from "@/lib/auth";
import { haptics } from "@/lib/haptics";

export default function NameScreen() {
  const { show } = useToast();
  const { signOut } = useAuth();
  const { refresh } = useActiveClinic();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length >= 2;

  async function onSave() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await updateMyName(name.trim());
      haptics.success();
      await refresh(); // userName populates → the gate moves us on
    } catch (e) {
      haptics.warning();
      show({ tone: "error", title: "Couldn't save", desc: e instanceof Error ? e.message : undefined });
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 px-6 justify-center gap-8">
          <View className="gap-1">
            <Text className="text-h1 font-bold text-text-primary">What&apos;s your name?</Text>
            <Text className="text-body-md text-text-secondary">
              So your team knows who&apos;s on the desk. You can change it later.
            </Text>
          </View>

          <View className="gap-3">
            <Input
              label="Your name"
              placeholder="e.g. Phoolwati Devi"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onSave}
            />
            <Button block size="lg" disabled={!valid || saving} onPress={onSave}>
              {saving ? "Saving…" : "Continue"}
            </Button>
            <PressableScale
              haptic="light"
              onPress={() => void signOut()}
              className="h-10 items-center justify-center"
            >
              <Text className="text-label-md font-semibold text-text-secondary">Sign out</Text>
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
