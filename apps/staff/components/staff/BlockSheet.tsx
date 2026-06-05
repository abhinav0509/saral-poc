import { useState, type ReactNode } from "react";
import { View, Text, TextInput, ScrollView, Alert, useWindowDimensions } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  X,
  Stethoscope,
  AlertTriangle,
  Plane,
  Users,
  Lock,
  Check,
  type LucideIcon,
} from "lucide-react-native";
import { createBlock, combineDateTime, isoLocalDate, type BlockKind } from "@saral/core";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

const KINDS: { key: BlockKind; label: string; Icon: LucideIcon }[] = [
  { key: "surgery", label: "Surgery", Icon: Stethoscope },
  { key: "emergency", label: "Emergency", Icon: AlertTriangle },
  { key: "leave", label: "Leave", Icon: Plane },
  { key: "meeting", label: "Meeting", Icon: Users },
  { key: "other", label: "Other", Icon: Lock },
];

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}
const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const fromHHMM = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

export function BlockSheet({
  visible,
  clinicId,
  initialDate,
  onClose,
  onCreated,
}: {
  visible: boolean;
  clinicId: string;
  initialDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { height } = useWindowDimensions();
  const [kind, setKind] = useState<BlockKind>("surgery");
  const [title, setTitle] = useState("");
  const [patientName, setPatientName] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<"date" | "start" | "end" | null>(null);

  async function onSubmit() {
    if (title.trim().length < 2) {
      Alert.alert("Hold on", "Please give this block a short title");
      return;
    }
    if (!allDay && combineDateTime(date, endTime).getTime() <= combineDateTime(date, startTime).getTime()) {
      Alert.alert("Hold on", "End time must be after start time");
      return;
    }
    setSaving(true);
    try {
      const startsAt = allDay
        ? new Date(`${date}T00:00:00`).toISOString()
        : combineDateTime(date, startTime).toISOString();
      const endsAt = allDay
        ? new Date(`${date}T23:59:59.999`).toISOString()
        : combineDateTime(date, endTime).toISOString();
      await createBlock({
        clinicId,
        startsAt,
        endsAt,
        kind,
        title: title.trim(),
        patientName: patientName.trim() || null,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "");
    } finally {
      setSaving(false);
    }
  }

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.74 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-start gap-3 mb-5">
          <View className="size-11 rounded-full bg-amber-50 items-center justify-center">
            <Lock size={20} color={palette.amber} />
          </View>
          <View className="flex-1">
            <Text className="text-h3 font-bold text-text-primary">Block doctor time</Text>
            <Text className="text-body-sm text-text-secondary mt-1 leading-relaxed">
              Mark slots unavailable so no one can book during this window.
            </Text>
          </View>
          <PressableScale haptic="light" onPress={onClose} className="size-9 items-center justify-center rounded-full">
            <X size={18} color={palette.muted} />
          </PressableScale>
        </View>

        <View className="gap-4">
          {/* Kind */}
          <View className="gap-1.5">
            <Text className="text-label-md font-medium text-text-secondary">Reason</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5">
              {KINDS.map((k) => {
                const active = kind === k.key;
                return (
                  <PressableScale
                    key={k.key}
                    haptic="selection"
                    onPress={() => setKind(k.key)}
                    className={cn(
                      "h-10 px-3.5 flex-row items-center gap-1.5 rounded-full border",
                      active ? "bg-surface-inverse border-transparent" : "bg-surface-canvas border-border-default",
                    )}
                  >
                    <k.Icon size={16} color={active ? "#fff" : palette.ink} />
                    <Text className={cn("text-label-sm font-semibold", active ? "text-text-inverse" : "text-text-primary")}>
                      {k.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>

          <Field label={kind === "surgery" ? "Procedure" : "Title"}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={
                kind === "surgery"
                  ? "e.g. Knee arthroscopy"
                  : kind === "leave"
                    ? "e.g. Personal leave"
                    : kind === "meeting"
                      ? "e.g. Quarterly review"
                      : "What's the doctor doing?"
              }
              placeholderTextColor={palette.tertiary}
              className="h-12 px-3 rounded-xl bg-surface-canvas border border-border-default text-body-md text-text-primary"
            />
          </Field>

          {kind === "surgery" && (
            <Field label="Patient (optional)">
              <TextInput
                value={patientName}
                onChangeText={setPatientName}
                placeholder="e.g. Mr. Aravind"
                placeholderTextColor={palette.tertiary}
                className="h-12 px-3 rounded-xl bg-surface-canvas border border-border-default text-body-md text-text-primary"
              />
            </Field>
          )}

          {/* Date */}
          <Field label="Date">
            <PressableScale
              haptic="light"
              onPress={() => setPicker(picker === "date" ? null : "date")}
              className="h-12 px-3 rounded-xl bg-surface-canvas border border-border-default justify-center"
            >
              <Text className="text-body-md text-text-primary">{dateLabel}</Text>
            </PressableScale>
            {picker === "date" && (
              <DateTimePicker
                value={new Date(`${date}T00:00:00`)}
                mode="date"
                minimumDate={new Date(`${isoLocalDate(new Date())}T00:00:00`)}
                onChange={(_, d) => {
                  setPicker(null);
                  if (d) setDate(isoLocalDate(d));
                }}
              />
            )}
          </Field>

          {/* All-day */}
          <PressableScale haptic="selection" onPress={() => setAllDay((a) => !a)} className="flex-row items-center gap-3">
            <View
              className={cn(
                "size-5 rounded-md items-center justify-center",
                allDay ? "bg-surface-inverse" : "bg-surface-canvas border border-border-default",
              )}
            >
              {allDay && <Check size={14} strokeWidth={3} color="#fff" />}
            </View>
            <Text className="text-body-sm text-text-primary">All day (9 AM – 8 PM)</Text>
          </PressableScale>

          {!allDay && (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="From">
                  <PressableScale
                    haptic="light"
                    onPress={() => setPicker(picker === "start" ? null : "start")}
                    className="h-12 px-3 rounded-xl bg-surface-canvas border border-border-default justify-center"
                  >
                    <Text className="text-body-md text-text-primary">{fmtTime(startTime)}</Text>
                  </PressableScale>
                  {picker === "start" && (
                    <DateTimePicker
                      value={fromHHMM(startTime)}
                      mode="time"
                      minuteInterval={30}
                      onChange={(_, d) => {
                        setPicker(null);
                        if (d) setStartTime(toHHMM(d));
                      }}
                    />
                  )}
                </Field>
              </View>
              <View className="flex-1">
                <Field label="To">
                  <PressableScale
                    haptic="light"
                    onPress={() => setPicker(picker === "end" ? null : "end")}
                    className="h-12 px-3 rounded-xl bg-surface-canvas border border-border-default justify-center"
                  >
                    <Text className="text-body-md text-text-primary">{fmtTime(endTime)}</Text>
                  </PressableScale>
                  {picker === "end" && (
                    <DateTimePicker
                      value={fromHHMM(endTime)}
                      mode="time"
                      minuteInterval={30}
                      onChange={(_, d) => {
                        setPicker(null);
                        if (d) setEndTime(toHHMM(d));
                      }}
                    />
                  )}
                </Field>
              </View>
            </View>
          )}

          <Field label="Notes">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Any details… (optional)"
              placeholderTextColor={palette.tertiary}
              className="h-12 px-3 rounded-xl bg-surface-canvas border border-border-default text-body-md text-text-primary"
            />
          </Field>

          <Button block size="lg" disabled={saving} onPress={onSubmit}>
            {saving ? "Saving…" : "Block this time"}
          </Button>
          <PressableScale haptic="light" onPress={onClose} className="h-11 items-center justify-center">
            <Text className="text-label-md font-semibold text-text-secondary">Cancel</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-label-md font-medium text-text-secondary">{label}</Text>
      {children}
    </View>
  );
}
