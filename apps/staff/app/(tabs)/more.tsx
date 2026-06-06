import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Building2,
  BellRing,
  UserPlus,
  LogOut,
  ChevronRight,
  Check,
} from "lucide-react-native";
import { inviteStaff, type StaffRole } from "@saral/core";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { useToast } from "@/components/ui/toast";
import { useAuth, useActiveClinic } from "@/lib/auth";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  doctor: "Doctor",
  receptionist: "Receptionist",
};

export default function MoreTab() {
  const router = useRouter();
  const { show } = useToast();
  const { signOut } = useAuth();
  const { clinic, role, memberships, setActiveClinic } = useActiveClinic();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const isAdmin = role === "admin";
  const canSwitch = memberships.length > 1;

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
      <View className="px-5 pt-3 pb-3">
        <Text className="text-h2 font-bold text-text-primary">More</Text>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-10 gap-5" showsVerticalScrollIndicator={false}>
        {/* Active clinic */}
        <PressableScale
          haptic={canSwitch ? "light" : null}
          scaleTo={canSwitch ? 0.99 : 1}
          onPress={() => canSwitch && setSwitcherOpen(true)}
        >
          <Card surface="raised" bordered className="p-4 flex-row items-center gap-3">
            <View className="size-12 rounded-xl bg-surface-brand-subtle items-center justify-center">
              <Building2 size={22} color={palette.brand} />
            </View>
            <View className="flex-1">
              <Text className="text-label-lg font-semibold text-text-primary" numberOfLines={1}>
                {clinic?.name ?? "—"}
              </Text>
              <Text className="text-caption text-text-secondary">
                {role ? ROLE_LABEL[role] : "—"}
                {clinic?.doctor_name ? ` · ${clinic.doctor_name}` : ""}
              </Text>
            </View>
            {canSwitch && <ChevronRight size={20} color={palette.tertiary} />}
          </Card>
        </PressableScale>

        {/* Actions */}
        <View className="rounded-2xl border border-border-subtle overflow-hidden">
          <Row
            icon={<BellRing size={18} color={palette.brand} />}
            label="Reminders"
            onPress={() => router.push("/reminders")}
          />
          {isAdmin && (
            <>
              <View className="h-px bg-border-subtle" />
              <Row
                icon={<UserPlus size={18} color={palette.brand} />}
                label="Invite staff"
                onPress={() => setInviteOpen(true)}
              />
            </>
          )}
        </View>

        {/* Sign out */}
        <PressableScale
          haptic="light"
          onPress={() => void signOut()}
          className="h-12 rounded-xl border border-border-default flex-row items-center justify-center gap-2"
        >
          <LogOut size={18} color={palette.sindoor} />
          <Text className="text-label-md font-semibold text-text-critical">Sign out</Text>
        </PressableScale>

        <Text className="text-caption text-text-tertiary text-center">Saral · v1.0</Text>
      </ScrollView>

      {/* Clinic switcher */}
      <BottomSheet visible={switcherOpen} onClose={() => setSwitcherOpen(false)}>
        <Text className="text-h3 font-bold text-text-primary mb-3">Switch clinic</Text>
        <View className="rounded-2xl border border-border-subtle overflow-hidden">
          {memberships.map((m, i) => {
            const active = m.clinic.id === clinic?.id;
            return (
              <View key={m.clinic.id}>
                {i > 0 && <View className="h-px bg-border-subtle" />}
                <PressableScale
                  haptic="selection"
                  scaleTo={0.98}
                  onPress={() => {
                    setActiveClinic(m.clinic.id);
                    setSwitcherOpen(false);
                  }}
                  className="flex-row items-center gap-3 px-3.5 py-3.5 bg-surface-canvas"
                >
                  <View className="flex-1">
                    <Text className="text-label-md font-semibold text-text-primary" numberOfLines={1}>
                      {m.clinic.name}
                    </Text>
                    <Text className="text-caption text-text-secondary">{ROLE_LABEL[m.role]}</Text>
                  </View>
                  {active && <Check size={18} color={palette.brand} />}
                </PressableScale>
              </View>
            );
          })}
        </View>
      </BottomSheet>

      <InviteSheet
        visible={inviteOpen}
        clinicId={clinic?.id ?? null}
        onClose={() => setInviteOpen(false)}
        onResult={(msg) => show(msg)}
      />
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      haptic="light"
      scaleTo={0.98}
      onPress={onPress}
      className="flex-row items-center gap-3 px-3.5 py-3.5 bg-surface-canvas"
    >
      <View className="w-5 items-center">{icon}</View>
      <Text className="flex-1 text-label-md font-medium text-text-primary">{label}</Text>
      <ChevronRight size={18} color={palette.tertiary} />
    </PressableScale>
  );
}

const ROLES: StaffRole[] = ["receptionist", "doctor", "admin"];

function InviteSheet({
  visible,
  clinicId,
  onClose,
  onResult,
}: {
  visible: boolean;
  clinicId: string | null;
  onClose: () => void;
  onResult: (msg: { tone: "success" | "error" | "info"; title: string; desc?: string }) => void;
}) {
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>("receptionist");
  const [sending, setSending] = useState(false);
  const valid = phone.replace(/\D/g, "").length === 10;

  async function onSend() {
    if (!valid || !clinicId || sending) return;
    setSending(true);
    try {
      const id = await inviteStaff(clinicId, phone.replace(/\D/g, "").slice(-10), role);
      onResult(
        id
          ? { tone: "success", title: "Invite sent", desc: "They'll join when they sign in with this number." }
          : { tone: "info", title: "Already on the team", desc: "That number is already a member." },
      );
      setPhone("");
      onClose();
    } catch (e) {
      onResult({ tone: "error", title: "Couldn't invite", desc: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="text-h3 font-bold text-text-primary">Invite a teammate</Text>
      <Text className="text-body-sm text-text-secondary mt-1 mb-4 leading-relaxed">
        They&apos;ll join your clinic automatically the first time they sign in with this number.
      </Text>

      <View className="gap-4">
        <Input
          label="Mobile number"
          placeholder="10-digit mobile"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
          maxLength={10}
        />
        <View className="gap-1.5">
          <Text className="text-label-md font-medium text-text-secondary">Role</Text>
          <View className="flex-row gap-2">
            {ROLES.map((r) => {
              const active = role === r;
              return (
                <PressableScale
                  key={r}
                  haptic="selection"
                  onPress={() => setRole(r)}
                  className={cn(
                    "flex-1 h-11 rounded-xl items-center justify-center border",
                    active ? "bg-surface-inverse border-transparent" : "bg-surface-canvas border-border-default",
                  )}
                >
                  <Text
                    className={cn(
                      "text-label-sm font-semibold",
                      active ? "text-text-inverse" : "text-text-primary",
                    )}
                  >
                    {ROLE_LABEL[r]}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
        <Button block size="lg" disabled={!valid || sending} onPress={onSend}>
          {sending ? "Sending…" : "Send invite"}
        </Button>
      </View>
    </BottomSheet>
  );
}
