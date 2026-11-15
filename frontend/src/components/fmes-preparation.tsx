"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { api } from "@/lib/api";
import type { MapResponse } from "@/lib/types";
import "./fmes-preparation.css";

type PreparationStatus = "available" | "agreement" | "not-connected" | "outside";

const statusLabels: Record<PreparationStatus, string> = {
  available: "Available in TreeLife",
  agreement: "Needs agreement",
  "not-connected": "Not connected",
  outside: "Outside TreeLife",
};

function PreparationStatus({ status }: { status: PreparationStatus }) {
  return <span className={`fmes-preparation-status ${status}`}>{statusLabels[status]}</span>;
}

function EvidenceCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <article className="fmes-evidence-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{description}</small>
    </article>
  );
}

export function FmesPreparation() {
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api<MapResponse>("/map")
      .then((next) => { if (active) setData(next); })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const located = data?.features.length ?? 0;
  const missingLocations = data?.unlocated.length ?? 0;
  const forestAreas = data?.features.filter((feature) => feature.properties.kind === "forest").length ?? 0;
  const countLabel = (value: number) => `${value.toLocaleString("en-GB")}${data?.truncated ? "+" : ""}`;

  return (
    <div className="page fmes-preparation-page">
      <section className="fmes-preparation-hero">
        <div>
          <p className="fmes-preparation-eyebrow">Institutional preparation</p>
          <h1>Prepare a clear exchange boundary for FMES.</h1>
          <p className="fmes-preparation-lede">TreeLife can organise field evidence for a future, authorised exchange with Rwanda Forestry Authority’s FMES. This workspace shows what is ready, what needs agreement, and what remains outside TreeLife.</p>
          <div className="fmes-preparation-actions"><Link className="primary" href="/monitoring">Back to monitoring</Link><Link className="secondary" href="/about">View integration boundary</Link></div>
        </div>
        <div className="fmes-preparation-badge"><span aria-hidden="true">!</span><div><strong>Proposed preparation only</strong><p>TreeLife is not connected to FMES and does not produce official FMES outputs.</p></div></div>
      </section>

      <section className="fmes-preparation-section" aria-labelledby="evidence-heading">
        <div className="fmes-preparation-heading"><div><p className="fmes-preparation-eyebrow">Current evidence</p><h2 id="evidence-heading">What TreeLife can prepare</h2></div><p>Counts use the records available to this administrator account. They are TreeLife evidence, not FMES indicators.</p></div>
        {error ? <Banner tone="error">{error} <button className="inline-link" type="button" onClick={() => setRefresh((value) => value + 1)}>Retry evidence</button></Banner> : null}
        <div className="fmes-evidence-grid">
          <EvidenceCard title="Located records" value={loading ? "…" : countLabel(located)} description="TreeLife records with map coordinates" />
          <EvidenceCard title="Forest areas" value={loading ? "…" : countLabel(forestAreas)} description="Boundaries available for future review" />
          <EvidenceCard title="Location gaps" value={loading ? "…" : countLabel(missingLocations)} description="Unlocated planting records needing coordinates" />
        </div>
        {data?.truncated ? <p className="fmes-preparation-note"><strong>Map results are capped at 2,000.</strong> The counts above are lower bounds from the map response, not full programme totals.</p> : null}
        <div className="fmes-preparation-capabilities">
          <div><PreparationStatus status="available" /><strong>Field records and inspections</strong><span>Dates, species, lifecycle events, condition notes, and field provenance.</span></div>
          <div><PreparationStatus status="available" /><strong>Boundaries and locations</strong><span>TreeLife site and forest geometry, with gaps visible for review.</span></div>
          <div><PreparationStatus status="available" /><strong>Record context</strong><span>Public codes, source, timestamps, and local ownership context for mapping discussions.</span></div>
        </div>
      </section>

      <section className="fmes-preparation-section fmes-agreement-section" aria-labelledby="agreement-heading">
        <div className="fmes-preparation-heading"><div><p className="fmes-preparation-eyebrow">Decisions before integration</p><h2 id="agreement-heading">What still requires agreement</h2></div><p>These are questions for the responsible system owner. TreeLife should fail closed instead of guessing official codes or definitions.</p></div>
        <div className="fmes-agreement-grid">
          <div><span className="fmes-agreement-number">01</span><div><strong>Object mapping</strong><p>Decide how sites, forest areas, planting batches, agroforestry blocks, and individual trees correspond to FMES records.</p></div></div>
          <div><span className="fmes-agreement-number">02</span><div><strong>Identifiers and spatial data</strong><p>Agree the official identifier, coordinate format, coordinate reference system, and who may see exact locations.</p></div></div>
          <div><span className="fmes-agreement-number">03</span><div><strong>Exchange ownership</strong><p>Confirm whether the exchange is one-way or two-way, who approves corrections, and who owns the integration credentials.</p></div></div>
          <div><span className="fmes-agreement-number">04</span><div><strong>Imagery and validation</strong><p>Define how satellite or drone signals are dated, quality-checked, and confirmed by field observations before use.</p></div></div>
        </div>
      </section>

      <section className="fmes-preparation-section" aria-labelledby="mapping-heading">
        <div className="fmes-preparation-heading"><div><p className="fmes-preparation-eyebrow">Synthetic preview</p><h2 id="mapping-heading">Proposed package mapping</h2></div><p>Illustrative only. This is not an FMES schema, export, or official field dictionary.</p></div>
        <div className="fmes-mapping-table-wrap">
          <table className="fmes-mapping-table">
            <thead><tr><th scope="col">TreeLife evidence</th><th scope="col">Possible exchange concept</th><th scope="col">Current state</th></tr></thead>
            <tbody>
              <tr><td>Forest area boundary</td><td>Forest stand or management unit</td><td><PreparationStatus status="agreement" /></td></tr>
              <tr><td>Planting site or batch</td><td>Plantation or agroforestry record</td><td><PreparationStatus status="agreement" /></td></tr>
              <tr><td>Inspection and field event</td><td>Monitoring observation</td><td><PreparationStatus status="agreement" /></td></tr>
              <tr><td>Coordinates</td><td>Spatial record with agreed CRS</td><td><PreparationStatus status="agreement" /></td></tr>
            </tbody>
          </table>
        </div>
        <p className="fmes-preparation-note"><strong>No export is active.</strong> A future adapter should validate an approved mapping, record the exchange attempt, and only attach an external identifier after the receiving system accepts the record.</p>
      </section>

      <section className="fmes-preparation-section fmes-readiness-section" aria-labelledby="readiness-heading">
        <div className="fmes-preparation-heading"><div><p className="fmes-preparation-eyebrow">Readiness</p><h2 id="readiness-heading">The integration boundary</h2></div><p>Use this checklist to decide when a technical conversation can begin.</p></div>
        <div className="fmes-readiness-list">
          <div><PreparationStatus status="available" /><strong>TreeLife field registry</strong><small>Available in the current application</small></div>
          <div><PreparationStatus status="agreement" /><strong>Data dictionary and object mapping</strong><small>Needs confirmation with the system owner</small></div>
          <div><PreparationStatus status="not-connected" /><strong>FMES endpoint or file exchange</strong><small>No endpoint, credentials, or schedule is configured</small></div>
          <div><PreparationStatus status="outside" /><strong>Official FMES evaluation and indicators</strong><small>Remain with FMES and the responsible authority</small></div>
        </div>
      </section>

      <footer className="fmes-preparation-footer">
        <div><strong>Reference materials</strong><span>These links describe FMES and its institutional context; they are not integration specifications.</span></div>
        <div className="fmes-preparation-links"><a href="https://ees.kuleuven.be/en/desira-af-rwanda/news/desira-conference-20221004/documents/20-jacques-peeters-fmes.pdf" target="_blank" rel="noreferrer" aria-label="FMES overview (opens in a new tab)">FMES overview ↗</a><a href="https://luxdev.lu/en/news/fmes-rwandas-flagship-digital-innovation-improving-forest-management" target="_blank" rel="noreferrer" aria-label="FMES institutional context (opens in a new tab)">Institutional context ↗</a></div>
      </footer>
    </div>
  );
}
