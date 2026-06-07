import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BellRing, CheckCircle2, Phone } from "lucide-react-native";
import { getPatientsWithFollowUps, type ReminderRow } from "@saral/core";
import { ScreenHeader } from "@/components/staff/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { PressableScale } from "@/components/ui/PressableScale";
import { WhatsAppIcon } from "@/components/brand/WhatsAppIcon";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { useActiveClinic } from "@/lib/auth";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

type Tab = "due" | "upcoming" | "sent";
type Enriched = ReminderRow & { days: number | null; dueAt: Date | null };

export default function RemindersScreen() {
  const { show } = useToast();
  const { clinic } = useActiveClinic();
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("due");

  useEffect(() => {
    if (!clinic) return;
    (async () => {
      try {
        setReminders(await getPatientsWithFollowUps(clinic.id));
      } finally {
        setLoading(false);
      }
    })();
  }, [clinic]);

  const enriched = useMemo<Enriched[]>(
    () =>
      reminders.map((r) => {
        const days = parseDays(r.followUpNote);
        const dueAt =
          days != null ? new Date(new Date(r.lastVisitAt).getTime() + days * 86_400_000) : null;
        return { ...r, days, dueAt };
      }),
    [reminders],
  );

  const now = Date.now();
  const dueToday = enriched.filter(
    (r) => r.dueAt && r.dueAt.getTime() - now <= 86_400_000 && !r.sentAt,
  );
  const upcoming = enriched.filter(
    (r) => !r.sentAt && (!r.dueAt || r.dueAt.getTime() - now > 86_400_000),
  );
  const sent = enriched.filter((r) => r.sentAt);
  const visible = tab === "due" ? dueToday : tab === "upcoming" ? upcoming : sent;

  function handleSend(r: Enriched) {
    if (!r.mobile) {
      show({ tone: "info", title: "No mobile on file", desc: "Can't reach this patient on WhatsApp without a mobile number." });
      return;
    }
    const intl = `91${r.mobile.replace(/\D/g, "").slice(-10)}`;
    const firstName = r.patientName.split(" ")[0];
    const whenLabel = r.dueAt
      ? r.dueAt.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })
      : "soon";
    const msg = [
      `Namaste ${firstName}, hope you're feeling better.`,
      "",
      `This is a gentle reminder from ${clinic?.name ?? "the clinic"} — your follow-up is due ${whenLabel}.`,
      "",
      "Reply here on WhatsApp or call us to confirm a time. Take care.",
    ].join("\n");
    void Linking.openURL(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`);
    show({ tone: "success", title: "Message ready in WhatsApp", desc: `Drafted for ${firstName} — review and tap send.` });
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
      <ScreenHeader title="Send reminders" />
      {loading ? (
        <View className="px-4 pt-4 gap-4">
          <Skeleton className="h-[72px] rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-4 pt-4 pb-10 gap-4">
          {/* Hero */}
          <Card surface="raised" bordered className="p-4 flex-row items-center gap-3">
            <View className="size-11 rounded-full bg-surface-brand-subtle items-center justify-center">
              <BellRing size={20} color={palette.brand} />
            </View>
            <View className="flex-1">
              <Text className="text-label-lg font-semibold text-text-primary">
                {dueToday.length === 0 ? "All caught up" : `${dueToday.length} due today`}
              </Text>
              <Text className="text-caption text-text-secondary mt-0.5">
                {dueToday.length === 0
                  ? "No follow-ups to chase right now."
                  : "A short WhatsApp nudge brings most patients back."}
              </Text>
            </View>
          </Card>

          <SegmentedTabs
            tabs={[
              { key: "due", label: "Due", count: dueToday.length },
              { key: "upcoming", label: "Upcoming", count: upcoming.length },
              { key: "sent", label: "Sent", count: sent.length },
            ]}
            active={tab}
            onChange={(k) => setTab(k as Tab)}
          />

          {visible.length === 0 ? (
            <Card surface="raised" className="p-6 items-center gap-2 mt-2">
              <CheckCircle2 size={28} color={palette.tertiary} />
              <Text className="text-label-md font-semibold text-text-primary">
                {tab === "sent" ? "No reminders sent yet" : "Nothing here"}
              </Text>
              <Text className="text-body-sm text-text-secondary text-center">
                {tab === "due"
                  ? "When patients have follow-ups due, they show up here."
                  : tab === "upcoming"
                    ? "Future follow-ups will appear as the date approaches."
                    : "Once you send a reminder, it logs here for the record."}
              </Text>
            </Card>
          ) : (
            <View className="gap-2">
              {visible.map((r) => (
                <ReminderCard key={r.prescriptionId} row={r} onSend={() => handleSend(r)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ReminderCard({ row, onSend }: { row: Enriched; onSend: () => void }) {
  const last = new Date(row.lastVisitAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const whenLabel = row.dueAt
    ? formatRelative(row.dueAt)
    : row.followUpNote.length > 32
      ? row.followUpNote.slice(0, 30) + "…"
      : row.followUpNote;
  const overdue = !!row.dueAt && row.dueAt.getTime() < Date.now() && !row.sentAt;
  const dialer = row.mobile ? row.mobile.replace(/\D/g, "").slice(-10) : null;

  return (
    <Card surface="raised" bordered className="p-3 flex-row items-center gap-3">
      <View className="size-11 rounded-full bg-surface-canvas border border-border-subtle items-center justify-center">
        <Text className="text-label-lg font-semibold text-text-primary">
          {row.patientName[0]?.toUpperCase()}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-label-md font-semibold text-text-primary" numberOfLines={1}>
          {row.patientName}
        </Text>
        <Text className="text-caption text-text-tertiary mt-0.5" numberOfLines={1}>
          Last visit {last}
          {row.lastReason ? ` · ${row.lastReason}` : ""}
        </Text>
        <Text
          className={cn("text-caption font-medium mt-0.5", overdue ? "text-text-critical" : "text-text-brand")}
          numberOfLines={1}
        >
          {row.sentAt
            ? `Sent ${new Date(row.sentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
            : `Follow-up · ${whenLabel}`}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        {dialer ? (
          <PressableScale
            haptic="light"
            onPress={() => Linking.openURL(`tel:${dialer}`)}
            className="size-10 rounded-full bg-surface-canvas border border-border-default items-center justify-center"
          >
            <Phone size={16} color={palette.brand} />
          </PressableScale>
        ) : null}
        <PressableScale
          haptic="success"
          onPress={onSend}
          className="size-10 rounded-full bg-surface-brand items-center justify-center"
        >
          <WhatsAppIcon size={18} color="#fff" />
        </PressableScale>
      </View>
    </Card>
  );
}

/* Helpers — kept identical to the web. */
function parseDays(note: string): number | null {
  const m = note.toLowerCase().match(/(\d{1,3})\s*(d|day|days)?\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0 || n > 365) return null;
  return n;
}

function formatRelative(d: Date): string {
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
