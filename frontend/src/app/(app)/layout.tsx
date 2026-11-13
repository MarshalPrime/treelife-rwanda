"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell, pathAllowed } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = user ? pathAllowed(user.role, pathname, user.carbon_monitoring) : true;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!pathAllowed(user.role, pathname, user.carbon_monitoring)) {
      router.replace("/dashboard");
    }
  }, [loading, pathname, router, user]);

  if (loading || !user || !allowed) return <p className="loading">Loading…</p>;
  return <AppShell>{children}</AppShell>;
}
