"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Banner, Field, OriginBadge, Pager } from "@/components/AppShell";
import type { Corner } from "@/components/boundary-draw";
import { HealthBadge } from "@/components/tree-card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCoordinates, polygonCenter } from "@/lib/coordinates";
import type { MapFeature, Page, Species } from "@/lib/types";
import { newRequestId } from "@/lib/validation";

const BoundaryDraw = dynamic(() => import("@/components/boundary-draw").then((mod) => mod.BoundaryDraw), {
  ssr: false,
  loading: () => <p className="loading">Loading map…</p>,
});

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <p className="loading">Loading map…</p>,
});

export type ForestRecord = {
  id: string;
  public_code: string;
  name: string;
  species_id: string;
  species_common_name: string | null;
  estimated_trees: number;
  distribution: string;
  status: string;
  description: string | null;
  province: string | null;
  district: string | null;
  area_hectares: number;
  boundary: { longitude: number; latitude: number }[];
  data_origin: string;
  registered_by_name: string | null;
  registered_at: string;
};

const distributions = [
  ["natural", "Natural or random"],
  ["rows", "Organized rows"],
  ["clusters", "Clusters"],
  ["mixed", "Mixed"],
] as const;

const conditions = [
  ["surviving", "Healthy"],
  ["stressed", "Needs attention"],
  ["dead", "Dead"],
  ["unknown", "Not assessed"],
] as const;

export function distributionName(value: string) {
  return distributions.find(([code]) => code === value)?.[1] ?? value;
}

function canRegister(role: string | undefined) {
  return role === "admin" || role === "field_officer";
}

function forestCenter(boundary: { latitude: number; longitude: number }[]) {
  return polygonCenter(boundary.map((point) => [point.latitude, point.longitude]));
}

export function ForestList() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [distribution, setDistribution] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<ForestRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "10" });
    if (submitted) params.set("q", submitted);
    if (distribution) params.set("distribution", distribution);
    if (status) params.set("status", status);
    let active = true;
    setLoading(true);
    api<Page<ForestRecord>>(`/forests?${params}`)
      .then((next) => { if (active) setData(next); })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [distribution, page, status, submitted]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Forests</h1>
          <p className="lede">A forest is a batch of trees across an area. Draw the stand once instead of registering every tree.</p>
        </div>
        {canRegister(user?.role) ? <Link className="primary" href="/forests/new">Register a forest</Link> : null}
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form className="filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmitted(query); }}>
        <input aria-label="Search forests" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, or district" />
        <select aria-label="Distribution" value={distribution} onChange={(event) => { setDistribution(event.target.value); setPage(1); }}>
          <option value="">All distributions</option>
          {distributions.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
        <select aria-label="Condition" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All conditions</option>
          {conditions.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
        <button className="secondary" type="submit">Search</button>
      </form>
      {loading ? <p className="loading">Loading forests…</p> : null}
      {!loading && data?.total === 0 ? (
        <div className="card">
          <h2>No forests match</h2>
          <p>Register a stand by drawing its boundary on the map.</p>
        </div>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Species</th>
                  <th>Area</th>
                  <th>Trees</th>
                  <th>Distribution</th>
                  <th>Condition</th>
                  <th>District</th>
                  <th>Center</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((forest) => {
                  const center = forestCenter(forest.boundary);
                  return (
                  <tr key={forest.id}>
                    <td data-label="Code"><Link href={`/forests/${forest.id}`}>{forest.public_code}</Link></td>
                    <td data-label="Name">{forest.name}</td>
                    <td data-label="Species">{forest.species_common_name ?? "—"}</td>
                    <td data-label="Area">{forest.area_hectares.toLocaleString("en-GB")} ha</td>
                    <td data-label="Trees">{forest.estimated_trees.toLocaleString("en-GB")}</td>
                    <td data-label="Distribution">{distributionName(forest.distribution)}</td>
                    <td data-label="Condition"><HealthBadge status={forest.status} /></td>
                    <td data-label="District">{forest.district ?? "—"}</td>
                    <td data-label="Center">{center ? formatCoordinates(center[0], center[1]) : "—"}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </div>
      ) : null}
    </div>
  );
}

export function ForestForm({ forestId }: { forestId?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [requestId] = useState(newRequestId);
  const [species, setSpecies] = useState<Species[]>([]);
  const [name, setName] = useState("");
  const [speciesId, setSpeciesId] = useState("");
  const [trees, setTrees] = useState("");
  const [distribution, setDistribution] = useState("mixed");
  const [status, setStatus] = useState("unknown");
  const [description, setDescription] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [ring, setRing] = useState<Corner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(forestId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Species[]>("/species").then(setSpecies).catch(() => setSpecies([]));
  }, []);

  useEffect(() => {
    if (!forestId) return;
    let active = true;
    api<ForestRecord>(`/forests/${forestId}`)
      .then((forest) => {
        if (!active) return;
        setName(forest.name);
        setSpeciesId(forest.species_id);
        setTrees(String(forest.estimated_trees));
        setDistribution(forest.distribution);
        setStatus(forest.status);
        setDescription(forest.description ?? "");
        setProvince(forest.province ?? "");
        setDistrict(forest.district ?? "");
        setRing(forest.boundary.map((point) => [point.latitude, point.longitude]));
      })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [forestId]);

  if (!canRegister(user?.role)) {
    return <Banner tone="error">Only an administrator or field officer can register a forest.</Banner>;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const count = Number(trees);
    if (name.trim().length < 2 || !speciesId || !Number.isInteger(count) || count < 1 || ring.length < 3) {
      setError("Add a name, species, estimated tree count, and at least three corners.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      species_id: speciesId,
      estimated_trees: count,
      distribution,
      status,
      description: description.trim() || null,
      province: province.trim() || null,
      district: district.trim() || null,
      boundary: ring.map(([latitude, longitude]) => ({ latitude, longitude })),
      client_request_id: forestId ? null : requestId,
    };
    try {
      const saved = await api<ForestRecord>(forestId ? `/forests/${forestId}` : "/forests", {
        method: forestId ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      router.push(`/forests/${saved.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the forest.");
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{forestId ? "Edit forest" : "Register a forest"}</h1>
          <p className="lede">Use this when the planting is a batch or a whole stand, not one tree at a time.</p>
        </div>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading ? <p className="loading">Loading forest…</p> : (
        <form className="card form-grid" onSubmit={(event) => void save(event)}>
          <Field label="Forest name" name="name">
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} />
          </Field>
          <Field label="Main species" name="species_id">
            <select id="species_id" value={speciesId} onChange={(event) => setSpeciesId(event.target.value)} required>
              <option value="">Choose a species</option>
              {species.map((item) => <option key={item.id} value={item.id}>{item.common_name}</option>)}
            </select>
          </Field>
          <Field label="Estimated trees" name="estimated_trees" help="An estimate entered by a person. TreeLife does not count trees from the image.">
            <input id="estimated_trees" inputMode="numeric" value={trees} onChange={(event) => setTrees(event.target.value)} required />
          </Field>
          <Field label="Distribution" name="distribution">
            <select id="distribution" value={distribution} onChange={(event) => setDistribution(event.target.value)}>
              {distributions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Condition" name="status">
            <select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {conditions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="District" name="district">
            <input id="district" value={district} onChange={(event) => setDistrict(event.target.value)} maxLength={120} />
          </Field>
          <Field label="Province" name="province">
            <input id="province" value={province} onChange={(event) => setProvince(event.target.value)} maxLength={120} />
          </Field>
          <Field label="Description" name="description">
            <textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} />
          </Field>
          <Field label="Boundary" name="boundary" help="Draw the outline on the map. The area in hectares is calculated from that boundary.">
            <BoundaryDraw ring={ring} onChange={setRing} />
          </Field>
          <div className="actions">
            <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save forest"}</button>
            <Link className="secondary" href={forestId ? `/forests/${forestId}` : "/forests"}>Cancel</Link>
          </div>
        </form>
      )}
    </div>
  );
}

export function ForestDetail() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [forest, setForest] = useState<ForestRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<ForestRecord>(`/forests/${params.id}`)
      .then((next) => { if (active) setForest(next); })
      .catch((caught: Error) => { if (active) setError(caught.message); });
    return () => { active = false; };
  }, [params.id]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!forest) return <p className="loading">Loading forest…</p>;
  const closed = forest.boundary.map((point) => [point.longitude, point.latitude] as [number, number]);
  const center = forestCenter(forest.boundary);
  if (closed.length > 0) closed.push(closed[0]);
  const feature: MapFeature = {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [closed] },
    properties: {
      id: forest.id,
      kind: "forest",
      public_code: forest.public_code,
      title: forest.name,
      subtitle: forest.district ?? "Forest stand",
      status: forest.status,
      category: null,
      data_origin: forest.data_origin,
      species_common_name: forest.species_common_name,
      area_hectares: forest.area_hectares,
      estimated_trees: forest.estimated_trees,
      distribution: forest.distribution,
    },
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="lede">{forest.public_code}</p>
          <h1>{forest.name}</h1>
        </div>
        <OriginBadge origin={forest.data_origin} />
      </div>
      <div className="actions">
        {canRegister(user?.role) ? <Link className="primary" href={`/forests/${forest.id}/edit`}>Edit forest</Link> : null}
        <Link className="secondary" href={`/map?focus=${forest.id}`}>Show on map</Link>
      </div>
      <section className="card">
        <dl className="definition">
          <dt>Condition</dt><dd><HealthBadge status={forest.status} /></dd>
          <dt>Area</dt><dd>{forest.area_hectares.toLocaleString("en-GB")} hectares</dd>
          <dt>Estimated trees</dt><dd>{forest.estimated_trees.toLocaleString("en-GB")}</dd>
          <dt>Main species</dt><dd>{forest.species_common_name ?? "—"}</dd>
          <dt>Distribution</dt><dd>{distributionName(forest.distribution)}</dd>
          <dt>Place</dt><dd>{[forest.province, forest.district].filter(Boolean).join(", ") || "—"}</dd>
          <dt>Center</dt><dd>{center ? formatCoordinates(center[0], center[1]) : "—"}</dd>
          <dt>Description</dt><dd>{forest.description ?? "—"}</dd>
          <dt>Registered by</dt><dd>{forest.registered_by_name ?? "—"}</dd>
        </dl>
      </section>
      <div className="map-frame report-map" aria-label="Forest boundary">
        <MapView features={[feature]} selectedId={forest.id} onSelect={() => undefined} focusOnSelect />
      </div>
    </div>
  );
}
