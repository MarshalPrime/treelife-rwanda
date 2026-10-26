"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, OriginBadge } from "@/components/AppShell";
import { api } from "@/lib/api";
import { label } from "@/lib/labels";
import type { MapFeature, MapResponse, Species } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <p className="loading">Loading map…</p>,
});

const paths: Record<string, string> = { site: "sites", tree: "trees", batch: "batches" };

export default function MapPage() {
  const search = useSearchParams();
  const [species, setSpecies] = useState<Species[]>([]);
  const [kind, setKind] = useState("all");
  const [speciesId, setSpeciesId] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(search.get("focus"));

  useEffect(() => {
    api<Species[]>("/species").then(setSpecies).catch(() => setSpecies([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (speciesId) params.set("species_id", speciesId);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    let active = true;
    setLoading(true);
    api<MapResponse>(`/map?${params}`)
      .then((next) => { if (active) setData(next); })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category, kind, speciesId, status]);

  const selected = data?.features.find((feature) => feature.properties.id === selectedId) ?? null;
  const nothingLocated = !loading && data && data.features.length === 0;
  return (
    <div className="page">
      <div>
        <h1>Map</h1>
        <p className="lede">Markers use the coordinates stored on each record. The opening view is a map of Rwanda, not a surveyed tree.</p>
      </div>
      <Banner tone="warning">Synthetic demonstration points are labelled on each record. They are not verified field observations.</Banner>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="filters">
        <select aria-label="Record type" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="all">Sites, trees, and batches</option>
          <option value="site">Sites</option>
          <option value="tree">Trees</option>
          <option value="batch">Batches</option>
        </select>
        <select aria-label="Species" value={speciesId} onChange={(event) => setSpeciesId(event.target.value)}>
          <option value="">All species</option>
          {species.map((item) => <option key={item.id} value={item.id}>{item.common_name}</option>)}
        </select>
        <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          <option value="urban">Urban</option>
          <option value="fruit">Fruit</option>
          <option value="agroforestry">Agroforestry</option>
          <option value="other">Other</option>
        </select>
        <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active sites</option>
          <option value="planted">Planted</option>
          <option value="surviving">Surviving</option>
          <option value="stressed">Stressed</option>
          <option value="dead">Dead</option>
        </select>
      </div>
      <div className="map-layout">
        <div className="map-frame" aria-label="Registration map">
          {data ? <MapView features={data.features} selectedId={selectedId} onSelect={setSelectedId} /> : <p className="loading">Loading map…</p>}
        </div>
        <aside className="card">
          {nothingLocated ? (
            <>
              <h2>No located records</h2>
              <p>Register a site, tree, or batch with latitude and longitude to see it here.</p>
            </>
          ) : null}
          {selected ? <RecordSummary feature={selected} /> : !nothingLocated ? <p>Select a marker or a record to see its summary.</p> : null}
          <h2>Records on this map</h2>
          <div className="record-list">
            {data?.features.map((feature) => (
              <button
                key={feature.properties.id}
                className="record-button"
                type="button"
                aria-current={feature.properties.id === selectedId ? "true" : undefined}
                onClick={() => setSelectedId(feature.properties.id)}
              >
                <strong>{feature.properties.title}</strong>
                <br />
                <span>{feature.properties.subtitle}</span>
              </button>
            ))}
          </div>
          {data && data.unlocated.length > 0 ? (
            <>
              <h2>No coordinates</h2>
              {data.unlocated.map((record) => (
                <p key={record.id}>
                  <Link href={`/${paths[record.kind]}/${record.id}`}>
                    {record.title.startsWith(record.public_code) ? record.title : `${record.public_code} · ${record.title}`}
                  </Link>
                  {" · "}{record.reason}
                </p>
              ))}
            </>
          ) : null}
          {data?.truncated ? <p className="help">The map is showing the first 2000 matching records.</p> : null}
        </aside>
      </div>
    </div>
  );
}

function RecordSummary({ feature }: { feature: MapFeature }) {
  const path = paths[feature.properties.kind];
  return (
    <div>
      <OriginBadge origin={feature.properties.data_origin} />
      <h2>{feature.properties.title}</h2>
      <p>{feature.properties.subtitle}</p>
      <p>{label(feature.properties.status)}{feature.properties.category ? ` · ${label(feature.properties.category)}` : ""}</p>
      <p className="help">{feature.geometry.coordinates[1].toFixed(5)}, {feature.geometry.coordinates[0].toFixed(5)}</p>
      <Link href={`/${path}/${feature.properties.id}`}>Open record</Link>
    </div>
  );
}
