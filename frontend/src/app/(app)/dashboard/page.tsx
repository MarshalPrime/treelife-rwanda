"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { CountryOverview } from "@/components/country-overview";
import { FarmerOverview } from "@/components/farmer-overview";
import { OfficerOverview } from "@/components/officer-overview";
import { AdminReport } from "@/components/report";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Role, Stats } from "@/lib/types";

function roleNote(role: Role | undefined) {
  if (role === "viewer") {
    return "You are signed in as a viewer. You can see the map and the trees. You cannot change records.";
  }
  if (role === "farmer") {
    return "You are signed in as a farmer. A tree or batch you register uses your own name.";
  }
  if (role === "field_officer") {
    return "You are signed in as a field officer. When you register a tree or batch, you name the farmer you are helping.";
  }
  return "A field officer or a farmer can create a site, register a tree or a planting batch, then find the record on the map.";
}

export default function DashboardPage() {
  const { canWrite, user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/stats").then(setStats).catch((caught: Error) => setError(caught.message));
  }, []);

  if (user?.role === "admin") return <AdminReport />;
  if (user?.role === "farmer") return <FarmerOverview />;
  if (user?.role === "field_officer") return <OfficerOverview />;
  if (user?.role === "viewer") return <CountryOverview />;

  return (
    <div className="page">
      <div>
        <h1>Registration overview</h1>
        <p className="lede">{roleNote(user?.role)}</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite ? (
        <div className="actions">
          <Link className="primary" href="/sites/new">Register a site</Link>
          <Link className="secondary" href="/trees/new">Register a tree</Link>
          <Link className="secondary" href="/batches/new">Register a batch</Link>
          <Link className="secondary" href="/farmers">Add a farmer</Link>
          <Link className="secondary" href="/nursery">Nursery</Link>
          <Link className="secondary" href="/field">Field work</Link>
          <Link className="secondary" href="/harvest">Harvest</Link>
          <Link className="secondary" href="/analytics">Analytics</Link>
          <Link className="secondary" href="/map">Open map</Link>
        </div>
      ) : <p>Your account can see the map and the trees. It cannot change records.</p>}
      <section className="stats" aria-label="Record counts">
        <div className="stat"><strong>{stats?.sites ?? "—"}</strong><span>Planting sites</span></div>
        <div className="stat"><strong>{stats?.trees ?? "—"}</strong><span>Individual trees</span></div>
        <div className="stat"><strong>{stats?.batches ?? "—"}</strong><span>Planting batches</span></div>
        <div className="stat"><strong>{stats?.records_missing_coordinates ?? "—"}</strong><span>Records without coordinates</span></div>
      </section>
    </div>
  );
}
