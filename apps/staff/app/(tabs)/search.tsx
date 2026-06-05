import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Search, X, ChevronRight, Users } from "lucide-react-native";
import { getClinicByCode, searchPatients, type PatientSearchRow } from "@saral/core";
import { Card } from "@/components/ui/Card";
import { PressableScale } from "@/components/ui/PressableScale";
import { palette } from "@/lib/colors";

const CLINIC_CODE = "drmehta";
const tnum = { fontVariant: ["tabular-nums" as const] };

export default function SearchScreen() {
  const router = useRouter();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const c = await getClinicByCode(CLINIC_CODE);
      setClinicId(c?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!clinicId || query.trim().length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setResults(await searchPatients(clinicId, query));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, clinicId]);

  const isEmpty = query.trim().length < 2;
  const noMatches = !loading && !isEmpty && results.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-surface-canvas" edges={["top"]}>
      <View className="px-5 pt-3 pb-3">
        <Text className="text-h2 font-bold text-text-primary">Search patients</Text>
        <Text className="text-body-sm text-text-secondary mt-0.5">By name, mobile, or token number</Text>
      </View>

      {/* Search input */}
      <View className="px-4 pb-3">
        <View className="flex-row items-center gap-2.5 h-12 rounded-xl bg-surface-canvas border border-border-default px-3">
          <Search size={18} color={palette.tertiary} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. Riya, 98765, T-04"
            placeholderTextColor={palette.tertiary}
            className="flex-1 text-body-md text-text-primary"
            returnKeyType="search"
          />
          {query ? (
            <PressableScale
              haptic="light"
              onPress={() => setQuery("")}
              className="size-7 items-center justify-center rounded-full"
            >
              <X size={16} color={palette.tertiary} />
            </PressableScale>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <Card surface="raised" className="mt-6 p-6 items-center gap-3">
            <View className="size-12 rounded-full bg-surface-brand-subtle items-center justify-center">
              <Users size={22} color={palette.brand} />
            </View>
            <Text className="text-label-lg font-semibold text-text-primary">Find any patient instantly</Text>
            <Text className="text-body-sm text-text-secondary text-center leading-relaxed">
              Type a name, mobile number, or token to see their history, prescriptions, and visit timeline.
            </Text>
          </Card>
        ) : loading ? (
          <Text className="text-body-sm text-text-secondary text-center pt-8">Searching…</Text>
        ) : noMatches ? (
          <Card surface="raised" className="mt-4 p-6 items-center">
            <Text className="text-label-md font-semibold text-text-primary text-center">
              No patients matching “{query}”
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1 text-center leading-relaxed">
              Try a different spelling, or the last few digits of their mobile.
            </Text>
          </Card>
        ) : (
          <View className="gap-2 mt-2">
            <Text className="text-caption text-text-tertiary px-1">
              {results.length} {results.length === 1 ? "patient" : "patients"}
            </Text>
            {results.map((p) => (
              <ResultRow
                key={p.visitId}
                patient={p}
                onPress={() => router.push(`/patient/${lookupKey(p)}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function lookupKey(p: PatientSearchRow): string {
  return p.mobile ? p.mobile.replace(/\D/g, "").slice(-10) || p.visitId : p.visitId;
}

function ResultRow({ patient, onPress }: { patient: PatientSearchRow; onPress: () => void }) {
  const dateLabel = new Date(patient.lastVisitAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const masked = (() => {
    if (!patient.mobile) return null;
    const d = patient.mobile.replace(/\D/g, "").slice(-10);
    return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
  })();

  return (
    <PressableScale haptic="light" scaleTo={0.99} onPress={onPress}>
      <Card surface="raised" bordered className="flex-row items-center gap-3 p-3">
        <View className="size-11 rounded-full bg-surface-canvas border border-border-subtle items-center justify-center">
          <Text className="text-label-lg font-semibold text-text-primary">
            {patient.patientName[0]?.toUpperCase()}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-label-lg font-semibold text-text-primary" numberOfLines={1}>
            {patient.patientName}
          </Text>
          <Text className="text-caption text-text-secondary mt-0.5" numberOfLines={1}>
            {patient.age != null ? `${patient.age}y · ` : ""}
            {masked ?? "no mobile"}
          </Text>
          <Text className="text-caption text-text-tertiary mt-0.5" numberOfLines={1} style={tnum}>
            {patient.visitCount} {patient.visitCount === 1 ? "visit" : "visits"} · last on {dateLabel}
            {patient.lastReason ? ` · ${patient.lastReason}` : ""}
          </Text>
        </View>
        <ChevronRight size={18} color={palette.tertiary} />
      </Card>
    </PressableScale>
  );
}
