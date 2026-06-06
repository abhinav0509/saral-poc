import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import {
  getSupabase,
  getSession,
  onAuthChange,
  signOut as coreSignOut,
  getMyMemberships,
  getMyProfile,
  type Clinic,
  type ClinicMembership,
  type StaffRole,
} from "@saral/core";

const ACTIVE_CLINIC_KEY = "saral.activeClinicId";

/* ============================================================
   Session
   ============================================================ */

interface AuthState {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
const AuthCtx = createContext<AuthState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getSession()
      .then((s) => mounted && setSession(s))
      .finally(() => mounted && setLoading(false));
    const unsub = onAuthChange((s) => setSession(s));
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Keep the token fresh while the app is foregrounded (RN best practice).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") getSupabase().auth.startAutoRefresh();
      else getSupabase().auth.stopAutoRefresh();
    });
    getSupabase().auth.startAutoRefresh();
    return () => sub.remove();
  }, []);

  const signOut = useCallback(async () => {
    await coreSignOut();
    await AsyncStorage.removeItem(ACTIVE_CLINIC_KEY);
  }, []);

  return <AuthCtx.Provider value={{ session, loading, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used within SessionProvider");
  return c;
}

/* ============================================================
   Active clinic
   ============================================================ */

interface ClinicState {
  loading: boolean;
  memberships: ClinicMembership[];
  clinic: Clinic | null;
  clinicId: string | null;
  role: StaffRole | null;
  /** The signed-in user's display name (profile full_name), or null if unset. */
  userName: string | null;
  setActiveClinic: (id: string) => void;
  refresh: () => Promise<void>;
}
const ClinicCtx = createContext<ClinicState | null>(null);

export function ActiveClinicProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [memberships, setMemberships] = useState<ClinicMembership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) {
      setMemberships([]);
      setActiveId(null);
      setUserName(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [mem, profile] = await Promise.all([getMyMemberships(), getMyProfile()]);
      setMemberships(mem);
      setUserName(profile?.full_name?.trim() || null);
      const ids = mem.map((m) => m.clinic.id);
      const stored = await AsyncStorage.getItem(ACTIVE_CLINIC_KEY);
      setActiveId(stored && ids.includes(stored) ? stored : (ids[0] ?? null));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setActiveClinic = useCallback((id: string) => {
    setActiveId(id);
    void AsyncStorage.setItem(ACTIVE_CLINIC_KEY, id);
  }, []);

  const active = memberships.find((m) => m.clinic.id === activeId) ?? null;

  return (
    <ClinicCtx.Provider
      value={{
        loading,
        memberships,
        clinic: active?.clinic ?? null,
        clinicId: active?.clinic.id ?? null,
        role: active?.role ?? null,
        userName,
        setActiveClinic,
        refresh,
      }}
    >
      {children}
    </ClinicCtx.Provider>
  );
}

export function useActiveClinic(): ClinicState {
  const c = useContext(ClinicCtx);
  if (!c) throw new Error("useActiveClinic must be used within ActiveClinicProvider");
  return c;
}
