import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { getActiveQueue, createVisit, bringInNow, type Visit } from "@saral/core";
import { ScreenHeader } from "@/components/staff/ScreenHeader";
import { EmergencyBadge } from "@/components/staff/EmergencyBadge";
import { EmergencyAddedSheet } from "@/components/staff/EmergencyAddedSheet";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { PressableScale } from "@/components/ui/PressableScale";
import { useToast } from "@/components/ui/toast";
import { useActiveClinic } from "@/lib/auth";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

type Gender = "Female" | "Male" | "Other";

export default function WalkinScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { clinic } = useActiveClinic();
  const { emergency } = useLocalSearchParams<{ emergency?: string }>();
  const isEmergency = emergency === "1";
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState(isEmergency ? "Emergency" : "");
  const [saving, setSaving] = useState(false);
  // Emergency post-add flow
  const [added, setAdded] = useState<Visit | null>(null);
  const [hasNowServing, setHasNowServing] = useState(false);
  const [bringing, setBringing] = useState(false);

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter the patient's name";
    // Emergency intake is name-first — everything else is optional so a patient
    // in distress isn't held up by a form. Validate the rest only if provided.
    if (!isEmergency) {
      const a = parseInt(age, 10);
      if (!Number.isFinite(a) || a < 0 || a > 120) return "Please enter a valid age";
      if (!gender) return "Please pick a gender";
      if (mobile.replace(/\D/g, "").length < 10) return "Please enter a 10-digit mobile";
    } else if (age.trim()) {
      const a = parseInt(age, 10);
      if (!Number.isFinite(a) || a < 0 || a > 120) return "Please enter a valid age";
    }
    return null;
  }

  async function onAdd() {
    const msg = validate();
    if (msg) {
      haptics.warning();
      show({ tone: "error", title: "Hold on", desc: msg });
      return;
    }
    if (!clinic || saving) return;
    setSaving(true);
    const digits = mobile.replace(/\D/g, "").slice(-10);
    try {
      const visit = await createVisit({
        clinicId: clinic.id,
        patientName: name.trim(),
        age: age.trim() ? parseInt(age, 10) : null,
        gender,
        mobile: digits.length === 10 ? digits : null,
        source: "qr",
        priority: isEmergency ? 1 : 0,
        reason: reason.trim() || null,
      });
      haptics.success();
      if (isEmergency) {
        // Don't navigate away — offer the escalations (interrupt / push wait).
        const q = await getActiveQueue(clinic.id);
        setHasNowServing(q.some((v) => v.status === "now_serving" && v.id !== visit.id));
        setAdded(visit);
        setSaving(false);
      } else {
        show({ tone: "success", title: `${name.trim()} added to the queue`, desc: "They'll show under Waiting." });
        router.back();
      }
    } catch (e) {
      show({ tone: "error", title: "Couldn't add", desc: e instanceof Error ? e.message : undefined });
      setSaving(false);
    }
  }

  async function handleBringInNow() {
    if (!clinic || !added || bringing) return;
    setBringing(true);
    try {
      await bringInNow(added.id, clinic.id);
      haptics.success();
      router.replace("/queue");
    } catch (e) {
      show({ tone: "error", title: "Couldn't bring in", desc: e instanceof Error ? e.message : undefined });
      setBringing(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <ScreenHeader
        title={isEmergency ? "Emergency walk-in" : "Add walk-in"}
        right={isEmergency ? <View className="mr-2"><EmergencyBadge /></View> : undefined}
      />
      <KeyboardAvoider>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 gap-5"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-body-sm text-text-secondary px-1 leading-relaxed">
          {isEmergency
            ? "Just the name gets them in — they jump to the top of the queue right away. Everything else is optional and can be filled in later."
            : "Fill the patient's details — they join the queue right away with the next token."}
        </Text>

        <Input
          label="Full name"
          placeholder={isEmergency ? "Name (or “Emergency patient”)" : "e.g. Riya Sharma"}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="next"
        />

        <View className="flex-row gap-3">
          <View className="w-24">
            <Input
              label={isEmergency ? "Age (opt.)" : "Age"}
              placeholder="34"
              keyboardType="number-pad"
              value={age}
              onChangeText={(t) => setAge(t.replace(/\D/g, ""))}
              className="text-center"
              maxLength={3}
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-label-md font-medium text-text-secondary">
              {isEmergency ? "Gender (opt.)" : "Gender"}
            </Text>
            <View className="flex-row gap-2">
              {(["Female", "Male", "Other"] as Gender[]).map((g) => {
                const active = gender === g;
                return (
                  <PressableScale
                    key={g}
                    haptic="selection"
                    onPress={() => setGender(g)}
                    className={cn(
                      "flex-1 h-12 rounded-xl items-center justify-center border",
                      active
                        ? "bg-surface-inverse border-transparent"
                        : "bg-surface-canvas border-border-default",
                    )}
                  >
                    <Text
                      className={cn(
                        "text-label-md font-medium",
                        active ? "text-text-inverse" : "text-text-primary",
                      )}
                    >
                      {g}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        </View>

        <Input
          label={isEmergency ? "Mobile number (opt.)" : "Mobile number"}
          placeholder="10-digit mobile"
          keyboardType="phone-pad"
          value={mobile}
          onChangeText={(t) => setMobile(t.replace(/\D/g, "").slice(0, 10))}
          maxLength={10}
          helperText="Their queue link goes here on WhatsApp."
        />

        <Input
          label="Reason"
          placeholder="Fever, body ache… (optional)"
          value={reason}
          onChangeText={setReason}
        />
      </ScrollView>

      <View className="p-4 border-t border-border-subtle">
        <Button
          block
          size="lg"
          variant={isEmergency ? "danger" : "primary"}
          disabled={saving}
          onPress={onAdd}
        >
          {saving ? "Adding…" : isEmergency ? "Add as emergency" : "Add to queue"}
        </Button>
      </View>
      </KeyboardAvoider>

      <EmergencyAddedSheet
        visible={!!added}
        token={added?.token ?? null}
        patientName={added?.patient_name ?? ""}
        hasNowServing={hasNowServing}
        pending={bringing}
        onBringInNow={handleBringInNow}
        onPushWait={() => router.replace("/queue?runningBehind=1")}
        onClose={() => router.replace("/queue")}
      />
    </SafeAreaView>
  );
}
