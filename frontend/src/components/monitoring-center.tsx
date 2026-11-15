"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Banner } from "@/components/AppShell";
import { HealthLegend, MapPopup } from "@/components/tree-card";
import { api } from "@/lib/api";
import { markerColor, matchesHealth, type HealthId } from "@/lib/health";
import { useAuth } from "@/lib/auth";
import type { MapResponse } from "@/lib/types";
import "./monitoring-center.css";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <p className="loading">Loading the monitoring map…</p>,
});

type SourceState = "ready" | "pending" | "exploring";
type Scope = "all" | "forest" | "plantings";

const sourceCopy: Record<SourceState, { label: string; className: string }> = {
  ready: { label: "Ready now", className: "ready" },
  pending: { label: "Connection pending", className: "pending" },
  exploring: { label: "Option to explore", className: "exploring" },
};

function SourceCard({
  icon,
  title,
  state,
  description,
  details,
  action,
}: {
  icon: string;
  title: string;
  state: SourceState;
  description: string;
  details: string[];
  action: ReactNode;
}) {
  const status = sourceCopy[state];
  return (
    <article className={`monitoring-source-card ${status.className}`}>
      <div className="monitoring-source-topline">
        <span className="monitoring-source-icon" aria-hidden="true">{icon}</span>
        <span className={`monitoring-status ${status.className}`}>{status.label}</span>
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <ul>{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
      <div className="monitoring-source-action">{action}</div>
    </article>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <article className="monitoring-step">
      <span className="monitoring-step-number">{number}</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </article>
  );
}

function QueueItem({
  label,
  value,
  tone,
  description,
  href,
}: {
  label: string;
  value: string;
  tone: "ready" | "pending" | "neutral";
  description: string;
  href?: string;
}) {
  const content = (
    <>
      <span className={`monitoring-queue-dot ${tone}`} aria-hidden="true" />
      <span className="monitoring-queue-copy"><strong>{label}</strong><small>{description}</small></span>
      <b>{value}</b>
    </>
  );
  return href ? <Link className="monitoring-queue-item" href={href}>{content}</Link> : <div className="monitoring-queue-item">{content}</div>;
}

export function MonitoringCenter() {
  const { user } = useAuth();
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [health, setHealth] = useState<"" | HealthId>("");
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

  const filteredFeatures = useMemo(() => {
    const features = data?.features ?? [];
    return features.filter((feature) => {
      if (!matchesHealth(feature, health)) return false;
      if (scope === "forest") return feature.properties.kind === "forest";
      if (scope === "plantings") return feature.properties.kind !== "forest";
      return true;
    });
  }, [data, health, scope]);

  useEffect(() => {
    if (selectedId && !filteredFeatures.some((feature) => feature.properties.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredFeatures, selectedId]);

  const locatedCount = data?.features.length ?? 0;
  const unlocatedCount = data?.unlocated.length ?? 0;
  const forestCount = data?.features.filter((feature) => feature.properties.kind === "forest").length ?? 0;
  const countLabel = (value: number) => `${value.toLocaleString("en-GB")}${data?.truncated ? "+" : ""}`;
  const canRecordFieldVisit = user?.role === "field_officer" || user?.role === "farmer";
  const canCreateMonitoringArea = user?.role === "field_officer" || user?.role === "admin";
  const fieldAction = canRecordFieldVisit ? { href: "/field", label: "Record a field check" } : { href: "/map", label: "Review field coverage" };
  const areaAction = canCreateMonitoringArea ? { href: "/forests/new", label: "Add a monitoring area" } : { href: "/forests", label: "View monitoring areas" };

  return (
    <div className="page monitoring-page">
      <section className="monitoring-hero">
        <div>
          <p className="monitoring-eyebrow">Programme monitoring</p>
          <h1>See what needs attention, then verify it on the ground.</h1>
          <p className="monitoring-lede">TreeLife combines field records with future imagery signals. The map works today; satellite and drone connections will be added only when the data, permissions, and review process are ready.</p>
          <div className="monitoring-hero-actions"><Link className="primary" href={fieldAction.href}>{fieldAction.label}</Link><Link className="secondary" href="/map">Open full map</Link></div>
        </div>
        <div className="monitoring-hero-note"><span className="monitoring-hero-note-icon" aria-hidden="true">✓</span><div><strong>Field evidence is the source of truth</strong><p>Imagery will flag areas for review. It will not silently change a tree’s status.</p></div></div>
      </section>

      <section aria-labelledby="sources-heading">
        <div className="monitoring-section-heading"><div><p className="monitoring-eyebrow">Choose a source</p><h2 id="sources-heading">Three ways to monitor</h2></div><p className="help">Each option has a different scale and confidence level.</p></div>
        <div className="monitoring-source-grid">
          <SourceCard icon="◎" title="Field records" state="ready" description="Record individual-tree condition, photos, measurements, maintenance, and harvest directly from a visit." details={["Best for individual trees", "Works with the current TreeLife workflow", "Creates verified lifecycle evidence"]} action={<Link className="monitoring-text-link" href={fieldAction.href}>{canRecordFieldVisit ? "Start a field visit →" : "Review field coverage →"}</Link>} />
          <SourceCard icon="◌" title="Satellite imagery" state="pending" description="Use stand- and plot-level imagery to compare vegetation condition and highlight change over time." details={["Best for forests and planting blocks", "Requires an approved RSA/provider connection", "Will show acquisition date and data quality"]} action={<a className="monitoring-text-link" href="#readiness">See what is pending →</a>} />
          <SourceCard icon="⌁" title="Drone / aerial capture" state="exploring" description="Use high-resolution capture where individual trees or small plots need more detail than satellites can provide." details={["Best for sample plots and validation", "Requires a flight partner and consent", "Evidence stays linked to a monitoring area"]} action={<a className="monitoring-text-link" href="#workflow">See the review workflow →</a>} />
        </div>
      </section>

      <section className="monitoring-workflow" id="workflow" aria-labelledby="workflow-heading">
        <div className="monitoring-section-heading"><div><p className="monitoring-eyebrow">One review loop</p><h2 id="workflow-heading">From signal to action</h2></div><p className="help">The same workflow works whether the signal comes from a field officer, satellite, or drone.</p></div>
        <div className="monitoring-steps"><Step number="01" title="Define the area">Register a site, forest stand, or planting batch with a boundary or location.</Step><Step number="02" title="Collect a signal">Use a field visit now; add satellite or aerial evidence when the connection is approved.</Step><Step number="03" title="Review the change">Compare the new signal with the baseline, source date, and quality information.</Step><Step number="04" title="Verify and act">Create a field task, confirm the condition, and save the decision as a lifecycle event.</Step></div>
      </section>

      <section className="monitoring-map-section" aria-labelledby="map-heading">
        <div className="monitoring-section-heading"><div><p className="monitoring-eyebrow">Working map</p><h2 id="map-heading">Current programme coverage</h2></div><div className="monitoring-map-actions"><Link className="secondary" href={areaAction.href}>{areaAction.label}</Link><Link className="monitoring-text-link" href="/map">Open registry map →</Link></div></div>
        <div className="monitoring-map-layout">
          <div className="monitoring-map-card">
            <div className="monitoring-map-toolbar" aria-label="Map scope"><span className="monitoring-toolbar-label">Show</span>{(["all", "plantings", "forest"] as Scope[]).map((option) => <button key={option} className={scope === option ? "active" : ""} type="button" aria-pressed={scope === option} onClick={() => setScope(option)}>{option === "all" ? "Everything" : option === "plantings" ? "Planting records" : "Forest areas"}</button>)}</div>
            <div className="monitoring-map-context"><span><i className="monitoring-dot field" />Field records</span><span><i className="monitoring-dot forest" />Forest boundaries</span><span><i className="monitoring-dot imagery" />Basemap only · not an analysis result</span></div>
            <div className="map-frame monitoring-map-frame" aria-label="Current programme coverage map">{error ? <Banner tone="error">{error} <button className="inline-link" type="button" onClick={() => setRefresh((value) => value + 1)}>Retry current coverage</button></Banner> : loading || !data ? <p className="loading" role="status">Loading current coverage…</p> : filteredFeatures.length ? <MapView features={filteredFeatures} selectedId={selectedId} onSelect={setSelectedId} focusOnSelect={false} colorOf={markerColor} popupFor={(feature) => <MapPopup feature={feature} viewer={user?.role === "viewer"} />} /> : <p className="monitoring-map-empty">No records match this scope yet.</p>}</div>
            <HealthLegend selected={health} onSelect={setHealth} site />
            <p className="monitoring-map-note">The Reference imagery button on the map is a visual basemap for orientation. It is not yet a TreeLife monitoring product and is not used to calculate health or survival.</p>
          </div>
          <aside className="monitoring-queue-card" aria-labelledby="queue-heading">
            <div className="monitoring-section-heading compact"><div><p className="monitoring-eyebrow">Next actions</p><h2 id="queue-heading">Review queue</h2><p className="monitoring-queue-scope">Counts use your access scope; map results may be capped at 2,000 and show a +.</p></div></div>
            <QueueItem label="Located records" value={countLabel(locatedCount)} tone="ready" description="Available on the working map" href="/map" />
            <QueueItem label="Missing locations" value={countLabel(unlocatedCount)} tone={unlocatedCount ? "pending" : "ready"} description={unlocatedCount ? "Add coordinates before imagery review" : data?.truncated ? "Map results are capped; review the full registry" : "No location gaps in your access scope"} href="/map" />
            <QueueItem label="Forest areas" value={countLabel(forestCount)} tone="neutral" description="Boundaries ready for future imagery" href="/forests" />
            <QueueItem label="Satellite alerts" value="Not active" tone="pending" description="Waiting for approved data access" />
            <QueueItem label="Drone captures" value="Not active" tone="neutral" description="Exploration and permissions needed" />
            <div className="monitoring-queue-footer"><strong>{data?.truncated ? "Map results are capped" : "Nothing is hidden"}</strong><p>{data?.truncated ? "These counts are lower bounds because the map returns the first 2,000 matching records. Open the registry for the full paged list." : "When a new source becomes available, its date, quality, and review status will appear beside the field evidence."}</p></div>
          </aside>
        </div>
      </section>

      <section className="monitoring-readiness" id="readiness" aria-labelledby="readiness-heading">
        <div><p className="monitoring-eyebrow">Integration readiness</p><h2 id="readiness-heading">What is ready, and what still needs agreement</h2><p>TreeLife can work as a field registry today. Before imagery is treated as monitoring evidence, the project needs a data-sharing agreement, a source endpoint, a review owner, and a way to validate imagery signals against field observations.</p>{user?.role === "admin" ? <Link className="monitoring-text-link monitoring-readiness-link" href="/fmes-preparation">Open FMES preparation →</Link> : null}</div>
        <div className="monitoring-readiness-list"><div><span className="monitoring-status ready">Ready</span><strong>Field records and inspections</strong><small>Available now in TreeLife</small></div><div><span className="monitoring-status pending">Pending</span><strong>Satellite API or imagery feed</strong><small>Confirm RSA/provider access, licence, dates, and resolution</small></div><div><span className="monitoring-status exploring">Exploring</span><strong>Drone/aerial workflow</strong><small>Choose partner, flight rules, consent, storage, and validation sites</small></div><div><span className="monitoring-status pending">Pending</span><strong>FMES / institutional exchange</strong><small>Agree identifiers and ownership with the system owner</small></div></div>
      </section>
    </div>
  );
}
