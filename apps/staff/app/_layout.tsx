import "../global.css";
import "../lib/supabase";
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "@/components/ui/toast";
import { SessionProvider, ActiveClinicProvider, useAuth, useActiveClinic } from "@/lib/auth";
import { palette } from "@/lib/colors";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ToastProvider>
        <SessionProvider>
          <ActiveClinicProvider>
            <AuthGate />
          </ActiveClinicProvider>
        </SessionProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

/**
 * Routes by auth state:
 *   no session            → (auth)/sign-in
 *   session, no clinic     → (auth)/onboarding
 *   session + clinic       → (tabs) / app screens
 */
function AuthGate() {
  const { session, loading: authLoading } = useAuth();
  const { loading: clinicLoading, memberships } = useActiveClinic();
  const segments = useSegments();
  const router = useRouter();

  // Don't decide until auth is known, and (when signed in) memberships loaded.
  const ready = !authLoading && (!session || !clinicLoading);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === "(auth)";
    const onOnboarding = segments[1] === "onboarding";

    if (!session) {
      if (!inAuth) router.replace("/(auth)/sign-in");
    } else if (memberships.length === 0) {
      if (!onOnboarding) router.replace("/(auth)/onboarding");
    } else if (inAuth) {
      router.replace("/(tabs)");
    }
  }, [ready, session, memberships.length, segments, router]);

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-canvas">
        <ActivityIndicator color={palette.brand} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
