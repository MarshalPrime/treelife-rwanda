"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken } from "@/lib/api";
import type { TokenResponse, User } from "@/lib/types";

type AuthValue = {
  user: User | null;
  loading: boolean;
  canWrite: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  rename: (fullName: string) => void;
  setPhoto: (updatedAt: string | null) => void;
  setCarbonMonitoring: (status: User["carbon_monitoring"]) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let active = true;
    api<User>("/auth/me")
      .then((next) => {
        if (active) setUser(next);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      canWrite: user?.role === "field_officer" || user?.role === "farmer",
      async login(email: string, password: string) {
        const token = await api<TokenResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setToken(token.access_token);
        const me = await api<User>("/auth/me");
        setUser(me);
        return me;
      },
      logout() {
        clearToken();
        setUser(null);
      },
      rename(fullName: string) {
        setUser((current) => (current ? { ...current, full_name: fullName } : current));
      },
      setPhoto(updatedAt: string | null) {
        setUser((current) => (current ? { ...current, profile_photo_at: updatedAt } : current));
      },
      setCarbonMonitoring(status) {
        setUser((current) => (current ? { ...current, carbon_monitoring: status } : current));
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
