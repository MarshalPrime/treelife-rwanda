"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type FormEvent } from "react";
import { Banner, Field } from "@/components/AppShell";
import { ApiError, api, apiUpload } from "@/lib/api";
import { todayInput } from "@/lib/validation";
import type { Page, PlantingRecord, Species } from "@/lib/types";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => <p className="help">Loading the map…</p>,
});

type Estimate = {
  aboveground_biomass_kg: number;
  carbon_kg: number;
  co2_equivalent_kg: number;
  label: string;
  tonnes_co2e: number;
  wood_specific_gravity: number;
  methodology: string;
  methodology_version: string;
  source: string;
  assumptions: string[];
};
type Measurement = {
  id: string;
  public_code: string;
  tree_id: string | null;
  tree_code: string | null;
  species_id: string;
  species_common_name: string | null;
  species_verified: boolean;
  species_note: string | null;
  latitude: number;
  longitude: number;
  dbh_cm: number;
  height_m: number | null;
  status: string;
  measured_on: string;
  notes: string | null;
  collected_by_name: string | null;
  created_at: string;
  has_photo: boolean;
  review_status: string;
  estimate_note: string | null;
  estimate: Estimate | null;
  history: { id: string; created_at: string }[];
};

const HEALTH = [
  ["surviving", "Healthy"],
  ["stressed", "Needs attention"],
  ["dead", "Dead"],
  ["planted", "Planted"],
  ["unknown", "Not assessed"],
] as const;

const empty = {
  tree_id: "",
  species_id: "",
  species_verified: false,
  species_note: "",
  latitude: "",
  longitude: "",
  dbh_cm: "",
  height_m: "",
  status: "unknown",
  measured_on: todayInput(),
  notes: "",
};

export function CarbonMeasurements() {
  const [rows, setRows] = useState<Measurement[] | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [trees, setTrees] = useState<PlantingRecord[]>([]);
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api<Measurement[]>("/carbon/measurements")
      .then(setRows)
      .catch((caught: Error) => setError(caught.message));
  }

  useEffect(() => {
    load();
    api<Species[]>("/species").then(setSpecies).catch(() => undefined);
    api<Page<PlantingRecord>>("/trees?page_size=100").then((page) => setTrees(page.items)).catch(() => undefined);
  }, []);

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api<Measurement>(editingId ? `/carbon/measurements/${editingId}` : "/carbon/measurements", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({
          tree_id: form.tree_id || null,
          species_id: form.species_id,
          species_verified: form.species_verified,
          species_note: form.species_note.trim() || null,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          dbh_cm: Number(form.dbh_cm),
          height_m: form.height_m.trim() ? Number(form.height_m) : null,
          status: form.status,
          measured_on: form.measured_on,
          notes: form.notes.trim() || null,
        }),
      });
      setNotice(`${saved.public_code} is saved. Carbon figures, when shown, are estimates.`);
      setForm({ ...empty, measured_on: todayInput() });
      setAdding(false);
      setEditingId(null);
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The measurement could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(id: string, file: File | null) {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    try {
      await apiUpload(`/carbon/measurements/${id}/photo`, body);
      setNotice("The photo is saved with the measurement.");
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The photo could not be saved.");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Carbon measurements</h1>
          <p className="lede">Measure a tree that is already registered. Any carbon number on this page is an estimate, not a certified credit and not a verified emission reduction.</p>
          <Banner tone="success">Authorized Carbon Monitoring Agent</Banner>
        </div>
        <button className="primary" type="button" aria-expanded={adding} onClick={() => setAdding((open) => !open)}>+ Measurement</button>
      </div>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <section className="card">
        <h2>How the estimate is calculated</h2>
        <ul>
          <li>Each tree uses Chave et al. 2014, equation 4, with that species published basic wood specific gravity.</li>
          <li>Height is required. A species with no stored wood specific gravity is saved, and its carbon stock is not calculated.</li>
          <li>Carbon is 47% of the dry aboveground biomass. The result is standing stock, labelled Estimate. It is not annual sequestration and not a certified credit.</li>
        </ul>
      </section>
      {adding ? (
        <form className="card form" onSubmit={submit}>
          <h2>Field measurement</h2>
          <Field label="Registered tree" name="tree_id" help="Choose a tree already on your list. Species and location fill in from that record, and you can correct them after a field check.">
            <select id="tree_id" value={form.tree_id} onChange={(event) => {
              const treeId = event.target.value;
              const tree = trees.find((item) => item.id === treeId);
              setForm((current) => ({
                ...current,
                tree_id: treeId,
                species_id: tree?.species_id || current.species_id,
                latitude: tree?.latitude != null ? String(tree.latitude) : current.latitude,
                longitude: tree?.longitude != null ? String(tree.longitude) : current.longitude,
              }));
            }}>
              <option value="">No linked tree</option>
              {trees.map((tree) => <option key={tree.id} value={tree.id}>{tree.public_code} · {tree.species_common_name}</option>)}
            </select>
          </Field>
          <Field label="Species" name="species_id">
            <select id="species_id" value={form.species_id} onChange={(event) => set("species_id", event.target.value)} required>
              <option value="">Choose</option>
              {species.map((item) => <option key={item.id} value={item.id}>{item.common_name}</option>)}
            </select>
          </Field>
          <label className="check-line">
            <input type="checkbox" checked={form.species_verified} onChange={(event) => set("species_verified", event.target.checked)} />
            <span>Species checked in the field</span>
          </label>
          <Field label="Species note" name="species_note" help="Optional. What you checked, or why the name is uncertain.">
            <input id="species_note" value={form.species_note} onChange={(event) => set("species_note", event.target.value)} />
          </Field>
          <LocationPicker latitude={form.latitude} longitude={form.longitude} onPick={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))} />
          <div className="row">
            <Field label="Latitude" name="latitude"><input id="latitude" value={form.latitude} onChange={(event) => set("latitude", event.target.value)} required /></Field>
            <Field label="Longitude" name="longitude"><input id="longitude" value={form.longitude} onChange={(event) => set("longitude", event.target.value)} required /></Field>
          </div>
          <div className="row">
            <Field label="DBH in centimetres" name="dbh_cm" help="Diameter at breast height, about 1.3 m above the ground.">
              <input id="dbh_cm" inputMode="decimal" value={form.dbh_cm} onChange={(event) => set("dbh_cm", event.target.value)} required />
            </Field>
            <Field label="Height in metres" name="height_m" help="Required for the carbon estimate. The measurement can still be saved without it.">
              <input id="height_m" inputMode="decimal" value={form.height_m} onChange={(event) => set("height_m", event.target.value)} />
            </Field>
          </div>
          <div className="row">
            <Field label="Health" name="status">
              <select id="status" value={form.status} onChange={(event) => set("status", event.target.value)}>
                {HEALTH.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Measurement date" name="measured_on">
              <input id="measured_on" type="date" value={form.measured_on} onChange={(event) => set("measured_on", event.target.value)} required />
            </Field>
          </div>
          <Field label="Field notes" name="notes" help="Optional. Do not enter a national ID.">
            <textarea id="notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={3} />
          </Field>
          <div className="actions">
            <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Save measurement"}</button>
            <button className="secondary" type="button" onClick={() => { setAdding(false); setEditingId(null); }}>Cancel</button>
          </div>
        </form>
      ) : null}
      {!rows ? <p className="loading">Loading measurements…</p> : rows.length === 0 ? <p>No carbon measurements yet.</p> : rows.map((row) => (
        <article className="card" key={row.id}>
          <h2>{row.public_code}</h2>
          <p>{row.species_common_name ?? "Species not named"}{row.species_verified ? " · species checked" : ""}{row.tree_code ? ` · ${row.tree_code}` : ""}</p>
          <dl className="definition">
            <dt>Collected by</dt><dd>{row.collected_by_name ?? "—"}</dd>
            <dt>Recorded</dt><dd>{new Date(row.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd>
            <dt>Measured</dt><dd>{row.measured_on}</dd>
            <dt>Location</dt><dd>{row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}</dd>
            <dt>DBH</dt><dd>{row.dbh_cm} cm</dd>
            <dt>Height</dt><dd>{row.height_m == null ? "Not recorded" : `${row.height_m} m`}</dd>
            <dt>Health</dt><dd>{HEALTH.find(([value]) => value === row.status)?.[1] ?? row.status}</dd>
            <dt>Notes</dt><dd>{row.notes || "—"}</dd>
            <dt>Carbon stock estimate</dt><dd>{row.estimate ? `${row.estimate.label}: ${row.estimate.tonnes_co2e} tCO₂e` : row.estimate_note ?? "Not calculated."}</dd>
          </dl>
          {row.estimate ? <p className="help">{row.estimate.assumptions[0]} Wood specific gravity {row.estimate.wood_specific_gravity}. {row.estimate.source} Methodology {row.estimate.methodology}, version {row.estimate.methodology_version}.</p> : null}
          {row.history.length ? <p className="help">{row.history.length} earlier version{row.history.length === 1 ? "" : "s"} kept.</p> : null}
          <Field label="Photograph" name={`photo-${row.id}`} help="Optional JPEG, PNG, or WebP, up to 2 MB.">
            <input id={`photo-${row.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void uploadPhoto(row.id, file); }} />
          </Field>
          {row.has_photo ? <p className="help">A photograph is saved.</p> : null}
          <button className="secondary" type="button" onClick={() => {
            setEditingId(row.id);
            setAdding(true);
            setForm({
              tree_id: row.tree_id ?? "",
              species_id: row.species_id,
              species_verified: row.species_verified,
              species_note: row.species_note ?? "",
              latitude: String(row.latitude),
              longitude: String(row.longitude),
              dbh_cm: String(row.dbh_cm),
              height_m: row.height_m == null ? "" : String(row.height_m),
              status: row.status,
              measured_on: row.measured_on,
              notes: row.notes ?? "",
            });
            document.getElementById("main")?.scrollIntoView({ block: "start" });
          }}>Edit measurement</button>
        </article>
      ))}
    </div>
  );
}
