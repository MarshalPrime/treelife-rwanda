"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Stats } from "@/lib/types";

export default function DashboardPage() {
  const { canWrite } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/stats").then(setStats).catch((caught: Error) => setError(caught.message));
  }, []);

  return (
    <div className="page">
      <div>
        <h1>Registration overview</h1>
        <p className="lede">Create a site, register a tree or a planting batch, then find the record on the map.</p>
      </div>
      <Banner tone="warning">
        Demonstration workspace. Records marked synthetic are not verified field observations. TreeLife is not integrated with FMES.
      </Banner>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite ? (
        <div className="actions">
          <Link className="primary" href="/sites/new">Register a site</Link>
          <Link className="secondary" href="/trees/new">Register a tree</Link>
          <Link className="secondary" href="/batches/new">Register a batch</Link>
          <Link className="secondary" href="/map">Open map</Link>
        </div>
      ) : <p>Your account can review records but cannot change them.</p>}
      <section className="stats" aria-label="Record counts">
        <div className="stat"><strong>{stats?.sites ?? "—"}</strong><span>Planting sites</span></div>
        <div className="stat"><strong>{stats?.trees ?? "—"}</strong><span>Individual trees</span></div>
        <div className="stat"><strong>{stats?.batches ?? "—"}</strong><span>Planting batches</span></div>
        <div className="stat"><strong>{stats?.records_missing_coordinates ?? "—"}</strong><span>Records without coordinates</span></div>
      </section>
    </div>
  );
}
