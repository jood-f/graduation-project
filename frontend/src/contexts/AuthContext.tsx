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

function buildFallbackUser(supabaseUser: SupabaseUser, role: UserRole = "operator"): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || "",
    name: supabaseUser.email?.split("@")[0] || "User",
    role,
    avatar: undefined,
    createdAt: new Date().toISOString(),
  };
}

async function fetchUserProfile(supabaseUser: SupabaseUser): Promise<User | null> {
  const normalizeRole = (r: string): UserRole => {
    const normalized = r.toLowerCase().replace(/\s+/g, "_");
    if (["admin", "operator"].includes(normalized)) {
      return normalized as UserRole;
    }
    return "operator";
  };

  const [
    { data: profile, error: profileError },
    { data: roleRow, error: roleError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, name, avatar, created_at")
      .eq("user_id", supabaseUser.id)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", supabaseUser.id)
      .maybeSingle(),
  ]);

  if (roleError) {
    console.warn("Error fetching user role:", roleError);
  }

  const role: UserRole = normalizeRole(roleRow?.role ?? "operator");

  if (profileError) {
    console.error("Error fetching profile:", profileError);
    return buildFallbackUser(supabaseUser, role);
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
      try {
        const u = await fetchUserProfile(newSession.user);
        if (!isMounted) return;
        setUser(u);
      } catch (error) {
        console.error("Failed to load authenticated user profile:", error);
        if (!isMounted) return;
        setUser(buildFallbackUser(newSession.user));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    supabase.auth.getSession()
      .then(({ data }) => {
        handleSession(data.session ?? null);
      })
      .catch((error) => {
        console.error("Failed to restore Supabase session:", error);
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setIsLoading(false);
      });

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
