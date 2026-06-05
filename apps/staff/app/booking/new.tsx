import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Check, Calendar, Phone, Globe } from "lucide-react-native";
import {
  getClinicByCode,
  createBooking,
  SlotConflictError,
  combineDateTime,
  formatSlotTime,
  type Clinic,
  type VisitSource,
  type SlotSelection,
} from "@saral/core";
import { ScreenHeader } from "@/components/staff/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { SlotPicker, type SlotPickerHandle } from "@/components/booking/SlotPicker";
import { haptics } from "@/lib/haptics";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

const CLINIC_CODE = "drmehta";
type Gender = "Female" | "Male" | "Other";

export default function NewBookingScreen() {
  const router = useRouter();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState<VisitSource>("phone");
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [conflictHint, setConflictHint] = useState<{ time: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef<SlotPickerHandle>(null);

  useEffect(() => {
    (async () => setClinic(await getClinicByCode(CLINIC_CODE)))();
  }, []);

  function validate(): string | null {
    if (name.trim().length < 2) return "Please enter the patient's name";
    const a = parseInt(age, 10);
    if (!Number.isFinite(a) || a < 0 || a > 120) return "Please enter a valid age";
    if (!gender) return "Pick a gender";
    if (mobile.replace(/\D/g, "").length < 10) return "Please enter a valid mobile number";
    if (!slot) return "Pick a time slot";
    return null;
  }

  async function onSubmit() {
    const msg = validate();
    if (msg) {
      haptics.warning();
      Alert.alert("Hold on", msg);
      return;
    }
    if (!clinic || saving) return;
    setSaving(true);
    try {
      const bookedFor = combineDateTime(slot!.dateIso, slot!.time).toISOString();
      await createBooking({
        clinicId: clinic.id,
        patientName: name.trim(),
        age: parseInt(age, 10),
        gender,
        mobile: mobile.replace(/\D/g, "").slice(-10),
        source,
        reason: reason.trim() || null,
        bookedFor,
      });
      haptics.success();
      router.back();
    } catch (err) {
      if (err instanceof SlotConflictError) {
        setSlot(null);
        setConflictHint({ time: slot!.time });
        await pickerRef.current?.refresh();
        Alert.alert("Just taken", "Pick one of the suggested alternates below.");
      } else {
        Alert.alert("Couldn't save", err instanceof Error ? err.message : "");
      }
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top", "bottom"]}>
      <ScreenHeader title="New booking" />
      {!clinic ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.brand} />
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 py-5 gap-5"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <Card surface="raised" className="p-3 flex-row items-center gap-3">
              <View className="size-9 rounded-full bg-surface-sunken items-center justify-center">
                <Calendar size={18} color={palette.brand} />
              </View>
              <View className="flex-1">
                <Text className="text-label-md font-semibold text-text-primary" numberOfLines={1}>
                  {clinic.name}
                </Text>
                <Text className="text-caption text-text-secondary">Pick a date, then a time</Text>
              </View>
            </Card>

            {/* Source */}
            <View className="gap-1.5">
              <Text className="text-label-md font-medium text-text-secondary">How did they book?</Text>
              <View className="flex-row gap-2">
                {([
                  { value: "phone", label: "Phone", Icon: Phone },
                  { value: "online", label: "Online", Icon: Globe },
                ] as const).map((s) => {
                  const active = source === s.value;
                  return (
                    <PressableScale
                      key={s.value}
                      haptic="selection"
                      onPress={() => setSource(s.value)}
                      className={cn(
                        "flex-1 h-11 flex-row items-center justify-center gap-2 rounded-xl border",
                        active ? "bg-surface-inverse border-transparent" : "bg-surface-canvas border-border-default",
                      )}
                    >
                      <s.Icon size={16} color={active ? "#fff" : palette.ink} />
                      <Text className={cn("text-label-md font-medium", active ? "text-text-inverse" : "text-text-primary")}>
                        {s.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            <Input label="Patient name" placeholder="e.g. Riya Sharma" value={name} onChangeText={setName} autoCapitalize="words" />

            <View className="flex-row gap-3">
              <View className="w-24">
                <Input
                  label="Age"
                  placeholder="34"
                  keyboardType="number-pad"
                  value={age}
                  onChangeText={(t) => setAge(t.replace(/\D/g, ""))}
                  className="text-center"
                  maxLength={3}
                />
              </View>
              <View className="flex-1 gap-1.5">
                <Text className="text-label-md font-medium text-text-secondary">Gender</Text>
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
                          active ? "bg-surface-inverse border-transparent" : "bg-surface-canvas border-border-default",
                        )}
                      >
                        <Text className={cn("text-label-md font-medium", active ? "text-text-inverse" : "text-text-primary")}>
                          {g}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            </View>

            <Input
              label="Mobile number"
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              value={mobile}
              onChangeText={(t) => setMobile(t.replace(/\D/g, "").slice(0, 10))}
              maxLength={10}
            />
            <Input
              label="Reason (optional)"
              placeholder="Fever, body ache…"
              value={reason}
              onChangeText={setReason}
            />

            <SlotPicker
              ref={pickerRef}
              clinicId={clinic.id}
              selected={slot}
              onChange={(s) => {
                setSlot(s);
                setConflictHint(null);
              }}
              conflictHint={conflictHint}
              onNotice={(n) => Alert.alert(n.title, n.desc)}
            />
          </ScrollView>

          {/* Sticky CTA */}
          <View className="px-4 pt-3 pb-2 border-t border-border-subtle">
            {slot && (
              <Text className="text-caption text-text-secondary mb-2 px-1">
                Booking for{" "}
                <Text className="font-semibold text-text-primary">
                  {new Date(`${slot.dateIso}T00:00:00`).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {formatSlotTime(slot.time)}
                </Text>
              </Text>
            )}
            <Button
              block
              size="lg"
              disabled={saving || !slot}
              onPress={onSubmit}
              leadingIcon={!saving && slot ? <Check size={18} color="#fff" /> : undefined}
            >
              {saving ? "Saving…" : slot ? "Confirm booking" : "Pick a slot to continue"}
            </Button>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
