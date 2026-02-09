import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import type { User, UserRole } from "@/types";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchUserProfile(supabaseUser: SupabaseUser): Promise<User | null> {
  // 1) profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, name, avatar, created_at, role")
    .eq("user_id", supabaseUser.id)
    .maybeSingle();

  if (profileError) {
    console.error("Error fetching profile:", profileError);
    // لو ما قدرنا نجيب بروفايل، على الأقل رجّعي يوزر minimal بدل ما يعلق
    return {
      id: supabaseUser.id,
      email: supabaseUser.email || "",
      name: supabaseUser.email?.split("@")[0] || "User",
      role: "operator",
      avatar: undefined,
      createdAt: new Date().toISOString(),
    };
  }

  // 2) role via RPC (احترافي)
  let role: UserRole = (profile?.role as UserRole) || "operator";
  try {
    const { data: roleData, error: roleError } = await (supabase as any).rpc("get_user_role", {
      user_id: supabaseUser.id, // ✅ لازم الاسم نفسه في SQL
    });

    if (roleError) {
      console.error("Error fetching role (RPC):", roleError);
    } else if (roleData) {
      role = roleData as UserRole;
    }
  } catch (e) {
    console.error("RPC exception:", e);
  }

  return {
    id: supabaseUser.id,
    email: supabaseUser.email || "",
    name: profile?.name || supabaseUser.email?.split("@")[0] || "User",
    role,
    avatar: profile?.avatar || undefined,
    createdAt: profile?.created_at || new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const handleSession = async (newSession: Session | null) => {
      if (!isMounted) return;

      setSession(newSession);

      if (!newSession?.user) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const u = await fetchUserProfile(newSession.user);
      if (!isMounted) return;
      setUser(u);
      setIsLoading(false);
    };

    // 1) أول ما يفتح التطبيق: جيبي السيشن الحالية
    supabase.auth.getSession().then(({ data }) => {
      handleSession(data.session ?? null);
    });

    // 2) أي تغيير تسجيل دخول/خروج
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      handleSession(newSession);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<User>) => {
      if (!session?.user) return;

      const { error } = await supabase
        .from("profiles")
        .update({
          name: updates.name ?? undefined,
          avatar: updates.avatar ?? undefined,
        })
        .eq("user_id", session.user.id);

      if (error) throw error;

      setUser((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    [session]
  );

  const hasRole = useCallback(
    (roles: UserRole[]) => {
      const r = user?.role ?? "operator";
      return roles.includes(r);
    },
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      session,
      isAuthenticated: !!session?.user,
      isLoading,
      login,
      logout,
      updateProfile,
      hasRole,
    }),
    [user, session, isLoading, login, logout, updateProfile, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
