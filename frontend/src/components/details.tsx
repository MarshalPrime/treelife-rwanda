"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Banner, OriginBadge } from "@/components/AppShell";
import { HealthBadge, TreeCard } from "@/components/tree-card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { coordinateText, formatWhen, label, treeStatuses } from "@/lib/labels";
import { choiceLabel, plantingMethods, soilTypes, terrains, waterSources, yesNoUnknown } from "@/lib/planting-choices";
import { plantedAge } from "@/lib/health";
import type { LifecycleEvent, Page, PlantingRecord, Site } from "@/lib/types";
import { newRequestId, todayInput, validateCoordinates, validateDate } from "@/lib/validation";
import "./details.css";

function visibleToViewer<T extends [string, React.ReactNode]>(rows: T[], role: string | undefined): T[] {
  if (role !== "viewer") return rows;
  return rows.filter(([name]) => name !== "Farmer" && name !== "Registered by");
}

function booleanOrChoice(value: string | boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (!value) return "—";
  return choiceLabel(yesNoUnknown, value);
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

function CoordinatesPanel({
  recordId,
  latitude,
  longitude,
  hasCoordinates,
  placeLabel,
  canWrite,
  patchPath,
  openForm,
  onToggleForm,
  onSaved,
}: {
  recordId: string;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates: boolean;
  placeLabel: string;
  canWrite: boolean;
  patchPath: string;
  openForm: boolean;
  onToggleForm: () => void;
  onSaved: () => void;
}) {
  const [latInput, setLatInput] = useState(latitude != null ? String(latitude) : "");
  const [lngInput, setLngInput] = useState(longitude != null ? String(longitude) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLatInput(latitude != null ? String(latitude) : "");
    setLngInput(longitude != null ? String(longitude) : "");
  }, [latitude, longitude]);

  async function saveCoords(event: React.FormEvent) {
    event.preventDefault();
    const coordErr = validateCoordinates(latInput, lngInput);
    if (coordErr) {
      setError(coordErr);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(patchPath, {
        method: "PATCH",
        body: JSON.stringify({
          latitude: Number(latInput),
          longitude: Number(lngInput),
        }),
      });
      onToggleForm();
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save coordinates.");
    } finally {
      setSaving(false);
    }
  }

  function fillDeviceGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Device GPS is unavailable in this browser.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatInput(pos.coords.latitude.toFixed(5));
        setLngInput(pos.coords.longitude.toFixed(5));
      },
      () => setError("Could not read current location. Enter coordinates manually."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function copyCoords() {
    if (latitude == null || longitude == null) return;
    navigator.clipboard?.writeText(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="card" aria-label="Coordinates">
      <div className="detail-card-head">
        <span className="detail-kicker">Coordinates</span>
        {hasCoordinates && latitude != null && longitude != null ? (
          <button type="button" className="compact-toggle" onClick={copyCoords}>
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>

      {hasCoordinates && latitude != null && longitude != null ? (
        <>
          <div className="detail-coord-preview" aria-hidden="true">
            <svg viewBox="0 0 240 120" fill="none">
              <path d="M0 24H240M0 48H240M0 72H240M0 96H240M40 0V120M80 0V120M120 0V120M160 0V120M200 0V120" stroke="currentColor" strokeWidth="1" />
              <circle cx="120" cy="60" r="34" stroke="#b9ccb9" strokeDasharray="3 3" strokeWidth="1.2" />
            </svg>
            <div className="detail-coord-pin">
              <span>
                <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3.2-4.5 8.5-4.5 8.5S3.5 9.2 3.5 6A4.5 4.5 0 0 1 8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="8" cy="6" r="1.4" fill="currentColor" /></svg>
              </span>
              <code>{placeLabel}</code>
            </div>
          </div>
          <div className="detail-coord-pair">
            <div className="detail-coord-cell"><span>Latitude</span><strong>{latitude.toFixed(5)}</strong></div>
            <div className="detail-coord-cell"><span>Longitude</span><strong>{longitude.toFixed(5)}</strong></div>
          </div>
          <div className="detail-coord-actions">
            <Link className="secondary" href={`/map?focus=${recordId}`}>Show on map</Link>
            {canWrite ? <button type="button" className="ghost" onClick={onToggleForm}>{openForm ? "Cancel" : "Update pin"}</button> : null}
          </div>
        </>
      ) : (
        <div className="detail-coord-empty">
          <strong>No coordinates recorded</strong>
          <p>{coordinateText(latitude, longitude)}</p>
          {canWrite ? (
            <button type="button" className="primary" onClick={onToggleForm}>
              {openForm ? "Hide coordinate form" : "+ Add coordinates"}
            </button>
          ) : null}
        </div>
      )}

      {canWrite && openForm ? (
        <form className="detail-coord-form" onSubmit={saveCoords}>
          {error ? <Banner tone="error">{error}</Banner> : null}
          <div className="detail-coord-inputs">
            <label>Latitude
              <input value={latInput} onChange={(event) => setLatInput(event.target.value)} placeholder="-1.9441" aria-label="Latitude" required />
            </label>
            <label>Longitude
              <input value={lngInput} onChange={(event) => setLngInput(event.target.value)} placeholder="30.0619" aria-label="Longitude" required />
            </label>
          </div>
          <div className="detail-coord-actions">
            <button type="button" className="secondary" onClick={fillDeviceGps}>Use current GPS</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : "Save coordinates"}</button>
          </div>
        </form>
      ) : null}
    </section>
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
  const [showCoordForm, setShowCoordForm] = useState(false);
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

  const locationLine = [site.province, site.district, site.sector, site.cell, site.village, site.isibo, site.household].filter(Boolean).join(", ") || "—";

  return (
    <div className="page detail-page">
      {search.get("created") ? <Banner tone="success">Site saved.</Banner> : null}
      {search.get("updated") ? <Banner tone="success">Changes saved.</Banner> : null}

      <div className="detail-nav-strip">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>
          <span aria-hidden="true">/</span>
          <Link href="/sites">Sites</Link>
          <span aria-hidden="true">/</span>
          <code>{site.public_code}</code>
        </nav>
        <Link className="detail-back-btn" href="/dashboard">← Back to Dashboard</Link>
      </div>

      <section className="card detail-hero">
        <div className="detail-hero-main">
          <div className="detail-hero-badges">
            <code className="detail-code-pill">{site.public_code}</code>
            <span className="badge">{label(site.status)}</span>
            <span className={`detail-coord-pill ${site.has_coordinates ? "ok" : "missing"}`}>
              {site.has_coordinates ? "Coordinates verified" : "No coordinates"}
            </span>
            <OriginBadge origin={site.data_origin} />
          </div>
          <div className="detail-hero-title">
            <h1>{site.name}</h1>
          </div>
          <div className="detail-hero-meta">
            <span>{label(site.site_type)}</span>
            {site.area_hectares != null ? <><span>·</span><span>{site.area_hectares} ha</span></> : null}
            {site.district ? <><span>·</span><span>{site.district}</span></> : null}
          </div>
        </div>
        <div className="detail-hero-actions">
          {canWrite ? <Link className="primary" href={`/sites/${site.id}/edit`}>Edit</Link> : null}
          {canWrite ? <Link className="secondary" href={`/trees/new?site=${site.id}`}>Register a tree</Link> : null}
          {canWrite ? <Link className="secondary" href={`/batches/new?site=${site.id}`}>Register a batch</Link> : null}
        </div>
      </section>

      <div className="detail-grid">
        <div className="detail-col-main">
          <section className="card">
            <div className="detail-card-head">
              <h2>Site Overview</h2>
              <span className="detail-kicker">Registry metadata</span>
            </div>
            <dl className="detail-facts-grid">
              <div className="detail-fact full"><dt>Location</dt><dd>{locationLine}</dd></div>
              <div className="detail-fact"><dt>Type</dt><dd>{label(site.site_type)}</dd></div>
              <div className="detail-fact"><dt>Organization</dt><dd>{site.organization_name ?? "—"}</dd></div>
              <div className="detail-fact"><dt>Farmer</dt><dd>{site.farmer_name ?? "—"}</dd></div>
              <div className="detail-fact"><dt>Area</dt><dd>{site.area_hectares === null ? "—" : `${site.area_hectares} ha`}</dd></div>
              <div className="detail-fact"><dt>Registered by</dt><dd>{site.registered_by_name ?? "—"}</dd></div>
              <div className="detail-fact"><dt>Registered</dt><dd>{formatWhen(site.registered_at)}</dd></div>
            </dl>
            <div className="detail-notes-box">
              <span>Notes</span>
              <p>{site.notes ?? "—"}</p>
            </div>
          </section>

          <section className="card">
            <div className="detail-card-head">
              <h2>Trees & batches at this site</h2>
              <span className="detail-kicker">{trees.length + batches.length} records</span>
            </div>
            {trees.length === 0 && batches.length === 0 ? <p className="help">No trees or planting batches recorded at this site yet.</p> : (
              <div className="detail-site-records">
                {trees.map((tree) => (
                  <TreeCard
                    key={tree.id}
                    href={`/trees/${tree.id}`}
                    code={tree.public_code}
                    species={tree.species_common_name ?? "Tree"}
                    status={tree.status}
                    when={tree.planting_date}
                    action="Tree"
                  />
                ))}
                {batches.map((batch) => (
                  <TreeCard
                    key={batch.id}
                    href={`/batches/${batch.id}`}
                    code={batch.public_code}
                    species={batch.species_common_name ?? "Batch"}
                    status={batch.status}
                    when={batch.planting_date}
                    detail={`${batch.quantity} trees`}
                    action="Batch"
                  />
                ))}
              </div>
            )}
          </section>

          <EventSection events={events} canWrite={canWrite} show={showEvent} onToggle={() => setShowEvent((value) => !value)} target={{ site_id: site.id }} onSaved={() => { setShowEvent(false); setVersion((value) => value + 1); }} />
        </div>

        <div className="detail-col-side">
          <CoordinatesPanel
            recordId={site.id}
            latitude={site.latitude}
            longitude={site.longitude}
            hasCoordinates={site.has_coordinates}
            placeLabel={site.district ?? site.name}
            canWrite={canWrite}
            patchPath={`/sites/${site.id}`}
            openForm={showCoordForm}
            onToggleForm={() => setShowCoordForm((open) => !open)}
            onSaved={() => setVersion((value) => value + 1)}
          />
        </div>
      </div>
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
  hideRecorder = false,
}: {
  events: LifecycleEvent[];
  canWrite: boolean;
  show: boolean;
  onToggle: () => void;
  target: { tree_id?: string; batch_id?: string; site_id?: string };
  onSaved: () => void;
  hideRecorder?: boolean;
}) {
  return (
    <section className="card">
      <div className="detail-card-head">
        <h2>Inspections and events</h2>
        {canWrite ? <button className="secondary compact-action-link" type="button" onClick={onToggle}>{show ? "Close" : "Record an event"}</button> : null}
      </div>
      {show ? <InspectionForm target={target} onSaved={onSaved} /> : null}
      {events.length === 0 ? <p className="help">No events recorded.</p> : (
        <ul className="detail-timeline">
          {events.map((event) => (
            <li key={event.id} className="detail-timeline-item">
              <div className="detail-timeline-top">
                <div className="detail-timeline-left">
                  <strong>{event.event_date}</strong>
                  <span>{label(event.event_type)}</span>
                  {event.status_after ? <HealthBadge status={event.status_after} /> : null}
                  {event.survival_count != null ? <span className="badge">{event.survival_count} surviving</span> : null}
                  <code>{event.public_code}</code>
                </div>
                {!hideRecorder && event.recorded_by_name ? <span className="help">{event.recorded_by_name}</span> : null}
              </div>
              {event.notes ? <p className="detail-timeline-note">{event.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}
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
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showEvent, setShowEvent] = useState(false);
  const [showCoordForm, setShowCoordForm] = useState(false);
  const [version, setVersion] = useState(0);
  const base = mode === "tree" ? "trees" : "batches";
  const isViewer = user?.role === "viewer";

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

  async function handleStatusChange(nextStatus: string) {
    if (!record || nextStatus === record.status) return;
    setUpdatingStatus(true);
    setStatusError(null);
    try {
      const updated = await api<PlantingRecord>(`/${base}/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setRecord(updated);
    } catch (caught) {
      setStatusError(caught instanceof Error ? caught.message : "Could not update status.");
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!record) return <p className="loading">Loading record…</p>;

  const placeParts = isViewer
    ? [record.province, record.district, record.sector, record.cell, record.village]
    : [record.province, record.district, record.sector, record.cell, record.village, record.isibo, record.household];
  const placeLine = placeParts.filter(Boolean).join(", ") || "—";

  const overviewRows = visibleToViewer<[string, React.ReactNode]>([
    ["Site", record.site_id && !isViewer ? <Link key="site" href={`/sites/${record.site_id}`}>{record.site_name ?? "Open site"}</Link> : (record.site_name ?? "—")],
    ["Species", `${record.species_common_name ?? "—"} (${record.species_scientific_name ?? "—"})`],
    ["Category", label(record.category)],
    ["Planting date", record.planting_date],
    ["Quantity", String(record.quantity)],
    ["Farmer", record.farmer_name ?? "—"],
    ["Place", placeLine],
    ["Registered by", record.registered_by_name ?? "—"],
    ["Registered", formatWhen(record.registered_at)],
  ], user?.role);

  const contextRows: [string, string][] = [
    ["Planting method", record.planting_method ? choiceLabel(plantingMethods, record.planting_method) : ""],
    ["Soil type", record.soil_type ? choiceLabel(soilTypes, record.soil_type) : ""],
    ["Terrain", record.terrain ? choiceLabel(terrains, record.terrain) : ""],
    ["Water availability", record.water_availability ? choiceLabel(waterSources, record.water_availability) : ""],
    ["Spacing", record.spacing ?? ""],
    ["Fertilizer", record.fertilizer_applied != null ? booleanOrChoice(record.fertilizer_applied) : ""],
    ["Mulching", record.mulching_applied != null ? booleanOrChoice(record.mulching_applied) : ""],
    ["Watering", record.watering_provided != null ? booleanOrChoice(record.watering_provided) : ""],
    ["Method note", record.planting_method_note ?? ""],
  ].filter(([, value]) => Boolean(value)) as [string, string][];

  const healthAssessed = record.status !== "planted" && record.status !== "unknown";
  const openTasksCount = (!record.has_coordinates ? 1 : 0) + (!healthAssessed ? 1 : 0) + (events.length === 0 ? 1 : 0);

  return (
    <div className="page detail-page">
      {search.get("created") ? <Banner tone="success">Record saved.</Banner> : null}
      {search.get("updated") ? <Banner tone="success">Changes saved.</Banner> : null}
      {statusError ? <Banner tone="error">{statusError}</Banner> : null}

      <div className="detail-nav-strip">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/${base}`}>{mode === "tree" ? "Trees" : "Batches"}</Link>
          <span aria-hidden="true">/</span>
          <code>{record.public_code}</code>
        </nav>
        <Link className="detail-back-btn" href="/dashboard">← Back to Dashboard</Link>
      </div>

      <section className="card detail-hero">
        <div className="detail-hero-main">
          <div className="detail-hero-badges">
            <code className="detail-code-pill">{record.public_code}</code>
            {canWrite ? (
              <select
                className="detail-status-select"
                aria-label="Update status"
                value={record.status}
                disabled={updatingStatus}
                onChange={(event) => handleStatusChange(event.target.value)}
              >
                {treeStatuses.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
              </select>
            ) : <HealthBadge status={record.status} />}
            <span className={`detail-coord-pill ${record.has_coordinates ? "ok" : "missing"}`}>
              {record.has_coordinates ? "Coordinates verified" : "No coordinates"}
            </span>
            <OriginBadge origin={record.data_origin} />
          </div>

          <div className="detail-hero-title">
            <h1>{record.species_common_name ?? (mode === "tree" ? "Tree" : "Planting batch")}</h1>
            {record.species_scientific_name ? <span className="detail-scientific">{record.species_scientific_name}</span> : null}
          </div>

          <div className="detail-hero-meta">
            <span>{label(record.category)}</span>
            <span>·</span>
            <span>Planted {record.planting_date} ({plantedAge(record.planting_date)})</span>
            <span>·</span>
            <span>Qty {record.quantity}</span>
          </div>
        </div>

        <div className="detail-hero-actions">
          {canWrite ? <Link className="primary" href={`/${base}/${record.id}/edit`}>Edit</Link> : null}
          {isViewer || !record.site_id ? null : <Link className="secondary" href={`/sites/${record.site_id}`}>Open site</Link>}
          {canWrite ? <button type="button" className="secondary" onClick={() => setShowEvent((open) => !open)}>+ Log inspection</button> : null}
        </div>
      </section>

      <div className="detail-grid">
        <div className="detail-col-main">
          <section className="card">
            <div className="detail-card-head">
              <h2>Record Overview</h2>
              <span className="detail-kicker">Registry metadata</span>
            </div>
            <dl className="detail-facts-grid">
              {overviewRows.map(([name, value]) => (
                <div key={name} className={`detail-fact ${name === "Site" ? "full" : ""}`}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="detail-notes-box">
              <span>Notes</span>
              <p>{record.notes ?? "—"}</p>
            </div>
          </section>

          {contextRows.length ? (
            <section className="card">
              <div className="detail-card-head">
                <h2>Planting Context</h2>
                <span className="detail-kicker">Site & care</span>
              </div>
              <dl className="detail-facts-grid">
                {contextRows.map(([name, value]) => (
                  <div key={name} className="detail-fact">
                    <dt>{name}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <EventSection
            events={events}
            canWrite={canWrite}
            show={showEvent}
            onToggle={() => setShowEvent((value) => !value)}
            target={mode === "tree" ? { tree_id: record.id } : { batch_id: record.id }}
            onSaved={() => { setShowEvent(false); setVersion((value) => value + 1); }}
            hideRecorder={isViewer}
          />
        </div>

        <div className="detail-col-side">
          <CoordinatesPanel
            recordId={record.id}
            latitude={record.latitude}
            longitude={record.longitude}
            hasCoordinates={record.has_coordinates}
            placeLabel={record.district ?? record.site_name ?? "Rwanda"}
            canWrite={canWrite}
            patchPath={`/${base}/${record.id}`}
            openForm={showCoordForm}
            onToggleForm={() => setShowCoordForm((open) => !open)}
            onSaved={() => setVersion((value) => value + 1)}
          />

          <section className="card" aria-label="Follow-up checklist">
            <div className="detail-card-head">
              <span className="detail-kicker">Follow-up checklist</span>
              <span className="help">{openTasksCount} open</span>
            </div>
            <ul className="detail-checklist">
              <li className={`detail-check-item ${record.has_coordinates ? "done" : ""}`}>
                <span>{record.has_coordinates ? "✓ GPS coordinates recorded" : "Capture GPS coordinates"}</span>
                {!record.has_coordinates && canWrite ? (
                  <button type="button" onClick={() => setShowCoordForm(true)}>Add now</button>
                ) : null}
              </li>
              <li className={`detail-check-item ${healthAssessed ? "done" : ""}`}>
                <span>{healthAssessed ? "✓ Health status assessed" : "Assess initial health status"}</span>
                {!healthAssessed && canWrite ? (
                  <button type="button" onClick={() => handleStatusChange("surviving")}>Mark surviving</button>
                ) : null}
              </li>
              <li className={`detail-check-item ${events.length > 0 ? "done" : ""}`}>
                <span>{events.length > 0 ? `✓ ${events.length} inspection${events.length === 1 ? "" : "s"} logged` : "Log first field inspection"}</span>
                {events.length === 0 && canWrite ? (
                  <button type="button" onClick={() => setShowEvent(true)}>Log</button>
                ) : null}
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
