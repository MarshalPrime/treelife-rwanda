"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { DashboardKpi, DashboardKpiGrid } from "@/components/dashboard-ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Overview = {
  total_tonnes_co2e: number;
  distinct_trees: number;
  distinct_species: number;
  agents: number;
  accepted_measurements: number;
  pending_measurements: number;
  correction_measurements: number;
  methodology: string;
  methodology_version: string;
};

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 3 });

export function CarbonOverview({ detail = false }: { detail?: boolean }) {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>("/carbon/overview").then(setData).catch((caught: Error) => setError(caught.message));
  }, []);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!data) return <p className="loading">Loading carbon monitoring…</p>;

  return (
    <section className="card" aria-label="Carbon monitoring">
      <div className="page-head">
        <div>
          {detail ? <h1>Carbon monitoring</h1> : <h2>Carbon monitoring</h2>}
          <p className="lede">Project standing stock from accepted field measurements. Repeated visits to the same tree count once, using the latest accepted result.</p>
        </div>
        {user?.role === "admin" ? <Link className="secondary" href="/carbon/review">Review measurements</Link> : null}
      </div>
      <p className="carbon-total" aria-label="Total estimated carbon stock">
        <span>Total estimated carbon stock</span>
        <strong>{number(data.total_tonnes_co2e)} tCO₂e</strong>
        <small>Estimate. Standing stock, not annual sequestration, and not a certified credit.</small>
      </p>
      <DashboardKpiGrid label="Carbon monitoring summary">
        <DashboardKpi label="Trees measured" value={number(data.distinct_trees)} hint="Distinct trees with an accepted measurement" />
        <DashboardKpi label="Species measured" value={number(data.distinct_species)} hint="Distinct species in that tree set" />
        <DashboardKpi label="Agents" value={number(data.agents)} hint="Authorized agents with an accepted measurement" />
        <DashboardKpi label="Accepted" value={number(data.accepted_measurements)} hint="Accepted submissions, including earlier visits" />
        <DashboardKpi label="Pending" value={number(data.pending_measurements)} hint="Waiting for review" />
        <DashboardKpi label="Needs correction" value={number(data.correction_measurements)} hint="Sent back to the agent" />
      </DashboardKpiGrid>
      <p className="help">Only accepted measurements enter the stock. Methodology {data.methodology}, version {data.methodology_version}. A species without a published wood specific gravity is measured, and its stock is left uncalculated.</p>
    </section>
  );
}
