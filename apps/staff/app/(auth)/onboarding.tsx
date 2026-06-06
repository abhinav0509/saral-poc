import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createClinicAndAdmin } from "@saral/core";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { useToast } from "@/components/ui/toast";
import { useAuth, useActiveClinic } from "@/lib/auth";
import { haptics } from "@/lib/haptics";

/** Slugify a clinic name into a URL-safe code (the patient link uses /walkin/[code]). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

export default function OnboardingScreen() {
  const { show } = useToast();
  const { signOut } = useAuth();
  const { refresh } = useActiveClinic();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [doctor, setDoctor] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const effectiveCode = (codeTouched ? code : slugify(name)).trim();
  const valid = name.trim().length >= 2 && effectiveCode.length >= 3;

  async function onCreate() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await createClinicAndAdmin({
        name: name.trim(),
        code: effectiveCode,
        address: address.trim() || null,
        doctorName: doctor.trim() || null,
      });
      haptics.success();
      await refresh(); // memberships now non-empty → the gate moves us into the app
    } catch (e) {
      haptics.warning();
      show({ tone: "error", title: "Couldn't create clinic", desc: e instanceof Error ? e.message : undefined });
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 gap-6"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <Text className="text-h1 font-bold text-text-primary">Set up your clinic</Text>
          <Text className="text-body-md text-text-secondary">
            This is your space. You can invite your team after.
          </Text>
        </View>

        <View className="gap-5">
          <Input
            label="Clinic name"
            placeholder="e.g. Dr. Mehta's Clinic"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
          />
          <Input
            label="Clinic code"
            placeholder="drmehta"
            value={effectiveCode}
            onChangeText={(t) => {
              setCodeTouched(true);
              setCode(t.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24));
            }}
            autoCapitalize="none"
            helperText="Used in your patient link: saral.live/walkin/<code>"
          />
          <Input
            label="Doctor name (optional)"
            placeholder="Dr. Asha Mehta"
            value={doctor}
            onChangeText={setDoctor}
            autoCapitalize="words"
          />
          <Input
            label="Address (optional)"
            placeholder="Powai, Mumbai"
            value={address}
            onChangeText={setAddress}
          />
        </View>

        <View className="gap-2">
          <Button block size="lg" disabled={!valid || saving} onPress={onCreate}>
            {saving ? "Creating…" : "Create clinic"}
          </Button>
          <PressableScale
            haptic="light"
            onPress={() => void signOut()}
            className="h-10 items-center justify-center"
          >
            <Text className="text-label-md font-semibold text-text-secondary">Sign out</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
