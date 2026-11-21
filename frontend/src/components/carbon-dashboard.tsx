"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
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
  const [showInfo, setShowInfo] = useState(detail);

  useEffect(() => {
    api<Overview>("/carbon/overview").then(setData).catch((caught: Error) => setError(caught.message));
  }, []);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!data) return <p className="loading">Loading carbon monitoring…</p>;

  const metrics = [
    { label: "Trees measured", value: number(data.distinct_trees), hint: "Distinct trees with an accepted measurement" },
    { label: "Species", value: number(data.distinct_species), hint: "Distinct species measured" },
    { label: "Agents", value: number(data.agents), hint: "Authorized agents with accepted measurements" },
    { label: "Accepted", value: number(data.accepted_measurements), hint: "Accepted submissions" },
    { label: "Pending", value: number(data.pending_measurements), hint: "Waiting for review" },
    { label: "Corrections", value: number(data.correction_measurements), hint: "Sent back to the agent" },
  ];

  return (
    <section className="card compact-carbon-card" aria-label="Carbon monitoring">
      <div className="compact-panel-head">
        <div className="compact-panel-title">
          {detail ? <h1>Carbon monitoring</h1> : <h2>Carbon monitoring</h2>}
          <button
            type="button"
            className="info-icon-btn"
            aria-label="Carbon monitoring details"
            aria-expanded={showInfo}
            title="Methodology and estimate notes"
            onClick={() => setShowInfo((open) => !open)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 7.2v4.1M8 4.8v.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {user?.role === "admin" ? <Link className="secondary compact-action-link" href="/carbon/review">Review measurements</Link> : null}
      </div>

      <div className="carbon-compact-strip">
        <div className="carbon-hero-compact" aria-label="Total estimated carbon stock">
          <span>Total estimated carbon stock</span>
          <strong>{number(data.total_tonnes_co2e)} <small>tCO₂e</small></strong>
        </div>
        <div className="carbon-mini-grid" role="region" aria-label="Carbon monitoring summary">
          {metrics.map((item) => (
            <article key={item.label} className="carbon-mini-stat" title={item.hint}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </div>

      {showInfo ? (
        <p className="help compact-panel-note">
          Standing stock estimate ({data.methodology}, v{data.methodology_version}) from latest accepted measurements per tree; not annual sequestration or a certified credit. Species without published wood specific gravity remain measured without calculated stock.
        </p>
      ) : null}
    </section>
  );
}
