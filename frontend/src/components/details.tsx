"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Banner, OriginBadge } from "@/components/AppShell";
import { HealthBadge } from "@/components/tree-card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { coordinateText, formatWhen, label } from "@/lib/labels";
import type { LifecycleEvent, Page, PlantingRecord, Site } from "@/lib/types";
import { newRequestId, todayInput, validateDate } from "@/lib/validation";

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="definition">
      {rows.map(([name, value]) => (
        <span key={name} style={{ display: "contents" }}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </span>
      ))}
    </dl>
  );
}

function visibleToViewer(rows: [string, React.ReactNode][], role: string | undefined) {
  if (role !== "viewer") return rows;
  return rows.filter(([name]) => name !== "Farmer" && name !== "Registered by");
}

function InspectionForm({
  target,
  onSaved,
}: {
  target: { tree_id?: string; batch_id?: string; site_id?: string };
  onSaved: () => void;
}) {
  const [eventType, setEventType] = useState("inspection");
  const [eventDate, setEventDate] = useState(todayInput());
  const [statusAfter, setStatusAfter] = useState("");
  const [survivalCount, setSurvivalCount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId] = useState(newRequestId);
  const statuses = target.site_id ? ["active", "inactive"] : ["planted", "surviving", "stressed", "dead", "removed", "unknown"];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const dateError = validateDate(eventDate, "Event date");
    if (dateError) {
      setError(dateError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/events", {
        method: "POST",
        body: JSON.stringify({
          ...target,
          event_type: eventType,
          event_date: eventDate,
          status_after: statusAfter || null,
          survival_count: target.batch_id && survivalCount ? Number(survivalCount) : null,
          notes: notes.trim() || null,
          client_request_id: requestId,
        }),
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The event could not be saved.");
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="row">
        <label>Event type
          <select value={eventType} onChange={(event) => setEventType(event.target.value)} aria-label="Event type">
            <option value="inspection">Inspection</option>
            <option value="survival_check">Survival check</option>
            <option value="maintenance">Maintenance</option>
            <option value="harvest_observation">Harvest observation</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Event date
          <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} aria-label="Event date" />
        </label>
      </div>
      <div className="row">
        <label>Status after
          <select value={statusAfter} onChange={(event) => setStatusAfter(event.target.value)} aria-label="Status after">
            <option value="">Do not change status</option>
            {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </label>
        {target.batch_id ? (
          <label>Survival count
            <input inputMode="numeric" value={survivalCount} onChange={(event) => setSurvivalCount(event.target.value)} aria-label="Survival count" />
          </label>
        ) : <span />}
      </div>
      <label>Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="Inspection notes" />
      </label>
      <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save event"}</button>
    </form>
  );
}

export function SiteDetail() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { canWrite } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [trees, setTrees] = useState<PlantingRecord[]>([]);
  const [batches, setBatches] = useState<PlantingRecord[]>([]);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showEvent, setShowEvent] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Site>(`/sites/${params.id}`),
      api<Page<PlantingRecord>>(`/trees?site_id=${params.id}&page_size=20`),
      api<Page<PlantingRecord>>(`/batches?site_id=${params.id}&page_size=20`),
      api<Page<LifecycleEvent>>(`/events?site_id=${params.id}&page_size=20`),
    ]).then(([nextSite, nextTrees, nextBatches, nextEvents]) => {
      if (!active) return;
      setSite(nextSite);
      setTrees(nextTrees.items);
      setBatches(nextBatches.items);
      setEvents(nextEvents.items);
    }).catch((caught: Error) => {
      if (active) setError(caught.message);
    });
    return () => {
      active = false;
    };
  }, [params.id, version]);
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!site) return <p className="loading">Loading site…</p>;
  return (
    <div className="page">
      {search.get("created") ? <Banner tone="success">Site saved.</Banner> : null}
      {search.get("updated") ? <Banner tone="success">Changes saved.</Banner> : null}
      <div className="page-head">
        <div>
          <p className="lede">{site.public_code}</p>
          <h1>{site.name}</h1>
        </div>
        <OriginBadge origin={site.data_origin} />
      </div>
      <div className="actions">
        {canWrite ? <Link className="primary" href={`/sites/${site.id}/edit`}>Edit</Link> : null}
        {canWrite ? <Link className="secondary" href={`/trees/new?site=${site.id}`}>Register a tree</Link> : null}
        {canWrite ? <Link className="secondary" href={`/batches/new?site=${site.id}`}>Register a batch</Link> : null}
        {site.has_coordinates ? <Link className="secondary" href={`/map?focus=${site.id}`}>Show on map</Link> : <span className="badge muted">No coordinates</span>}
      </div>
      <section className="card">
        <Facts rows={[
          ["Type", label(site.site_type)],
          ["Organization", site.organization_name ?? "—"],
          ["Farmer", site.farmer_name ?? "—"],
          ["Location", [site.province, site.district, site.sector, site.cell, site.village, site.isibo, site.household].filter(Boolean).join(", ") || "—"],
          ["Coordinates", coordinateText(site.latitude, site.longitude)],
          ["Area", site.area_hectares === null ? "—" : `${site.area_hectares} ha`],
          ["Status", label(site.status)],
          ["Registered by", site.registered_by_name ?? "—"],
          ["Registered", formatWhen(site.registered_at)],
          ["Notes", site.notes ?? "—"],
        ]} />
      </section>
      <section className="card">
        <h2>Trees at this site</h2>
        {trees.length === 0 ? <p>No individual trees yet.</p> : trees.map((tree) => <Link key={tree.id} href={`/trees/${tree.id}`}>{tree.public_code} · {tree.species_common_name}</Link>)}
        <h2>Batches at this site</h2>
        {batches.length === 0 ? <p>No planting batches yet.</p> : batches.map((batch) => <Link key={batch.id} href={`/batches/${batch.id}`}>{batch.public_code} · {batch.quantity} {batch.species_common_name}</Link>)}
      </section>
      <EventSection events={events} canWrite={canWrite} show={showEvent} onToggle={() => setShowEvent((value) => !value)} target={{ site_id: site.id }} onSaved={() => { setShowEvent(false); setVersion((value) => value + 1); }} />
    </div>
  );
}

function EventSection({
  events,
  canWrite,
  show,
  onToggle,
  target,
  onSaved,
}: {
  events: LifecycleEvent[];
  canWrite: boolean;
  show: boolean;
  onToggle: () => void;
  target: { tree_id?: string; batch_id?: string; site_id?: string };
  onSaved: () => void;
}) {
  return (
    <section className="card">
      <div className="split">
        <h2>Inspections and events</h2>
        {canWrite ? <button className="secondary" type="button" onClick={onToggle}>{show ? "Close" : "Record an event"}</button> : null}
      </div>
      {show ? <InspectionForm target={target} onSaved={onSaved} /> : null}
      {events.length === 0 ? <p>No events recorded.</p> : events.map((event) => (
        <p key={event.id}>{event.public_code} · {label(event.event_type)} · {event.event_date}{event.status_after ? ` · ${label(event.status_after)}` : ""}</p>
      ))}
    </section>
  );
}

export function PlantingDetail({ mode }: { mode: "tree" | "batch" }) {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { canWrite, user } = useAuth();
  const [record, setRecord] = useState<PlantingRecord | null>(null);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showEvent, setShowEvent] = useState(false);
  const [version, setVersion] = useState(0);
  const base = mode === "tree" ? "trees" : "batches";

  useEffect(() => {
    let active = true;
    Promise.all([
      api<PlantingRecord>(`/${base}/${params.id}`),
      api<Page<LifecycleEvent>>(`/events?${mode === "tree" ? "tree_id" : "batch_id"}=${params.id}&page_size=20`),
    ]).then(([nextRecord, nextEvents]) => {
      if (!active) return;
      setRecord(nextRecord);
      setEvents(nextEvents.items);
    }).catch((caught: Error) => {
      if (active) setError(caught.message);
    });
    return () => {
      active = false;
    };
  }, [base, mode, params.id, version]);
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!record) return <p className="loading">Loading record…</p>;
  return (
    <div className="page">
      {search.get("created") ? <Banner tone="success">Record saved.</Banner> : null}
      {search.get("updated") ? <Banner tone="success">Changes saved.</Banner> : null}
      <div className="page-head">
        <div>
          <p className="lede">{record.public_code}</p>
          <h1>{record.species_common_name}</h1>
        </div>
        <OriginBadge origin={record.data_origin} />
      </div>
      <div className="actions">
        {canWrite ? <Link className="primary" href={`/${base}/${record.id}/edit`}>Edit</Link> : null}
        {user?.role === "viewer" || !record.site_id ? null : <Link className="secondary" href={`/sites/${record.site_id}`}>Open site</Link>}
        {record.has_coordinates ? <Link className="secondary" href={`/map?focus=${record.id}`}>Show on map</Link> : <span className="badge muted">No coordinates</span>}
      </div>
      <section className="card">
        <Facts rows={visibleToViewer([
          ["Site", record.site_name ?? "—"],
          ["Farmer", record.farmer_name ?? "—"],
          ["Place", [record.province, record.district, record.sector, record.cell, record.village, record.isibo, record.household].filter(Boolean).join(", ") || "—"],
          ["Species", `${record.species_common_name ?? "—"} (${record.species_scientific_name ?? "—"})`],
          ["Category", label(record.category)],
          ["Planting date", record.planting_date],
          ["Quantity", String(record.quantity)],
          ["Status", <HealthBadge key="status" status={record.status} />],
          ["Coordinates", coordinateText(record.latitude, record.longitude)],
          ["Registered by", record.registered_by_name ?? "—"],
          ["Registered", formatWhen(record.registered_at)],
          ["Notes", record.notes ?? "—"],
        ], user?.role)} />
      </section>
      <EventSection
        events={events}
        canWrite={canWrite}
        show={showEvent}
        onToggle={() => setShowEvent((value) => !value)}
        target={mode === "tree" ? { tree_id: record.id } : { batch_id: record.id }}
        onSaved={() => { setShowEvent(false); setVersion((value) => value + 1); }}
      />
    </div>
  );
}
