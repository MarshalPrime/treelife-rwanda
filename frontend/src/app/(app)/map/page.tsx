"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, OriginBadge } from "@/components/AppShell";
import { HealthBadge, HealthLegend, MapPopup } from "@/components/tree-card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { featureCenter, formatCoordinates } from "@/lib/coordinates";
import { markerColor, matchesHealth, type HealthId } from "@/lib/health";
import { label } from "@/lib/labels";
import type { Farmer, MapFeature, MapResponse, Species } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <p className="loading">Loading map…</p>,
});

const paths: Record<string, string> = { site: "sites", tree: "trees", batch: "batches", forest: "forests" };

export default function MapPage() {
  const search = useSearchParams();
  const { user } = useAuth();
  const viewer = user?.role === "viewer";
  const [species, setSpecies] = useState<Species[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [kind, setKind] = useState("all");
  const [speciesId, setSpeciesId] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState<HealthId | "">("");
  const [district, setDistrict] = useState("");
  const [farmerId, setFarmerId] = useState("");
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(search.get("focus"));

  useEffect(() => {
    api<Species[]>("/species").then(setSpecies).catch(() => setSpecies([]));
    if (viewer) return;
    api<Farmer[]>("/farmers").then(setFarmers).catch(() => setFarmers([]));
  }, [viewer]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (speciesId) params.set("species_id", speciesId);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (district.trim()) params.set("district", district.trim());
    if (farmerId) params.set("farmer_id", farmerId);
    let active = true;
    setLoading(true);
    api<MapResponse>(`/map?${params}`)
      .then((next) => { if (active) setData(next); })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category, district, farmerId, kind, speciesId, status]);

  const features = (data?.features ?? []).filter((feature) => matchesHealth(feature, health));
  const selected = features.find((feature) => feature.properties.id === selectedId) ?? null;
  const nothingLocated = !loading && data !== null && features.length === 0;
  return (
    <div className="page">
      <div>
        <h1>Map</h1>
        <p className="lede">Dots are trees, batches, and sites. Shaded areas are forest stands, with a pin at the center. The opening view is a map of Rwanda, not a surveyed boundary.</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="filters">
        <select aria-label="Record type" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="all">Sites, trees, batches, and forests</option>
          <option value="site">Sites</option>
          <option value="tree">Trees</option>
          <option value="batch">Batches</option>
          <option value="forest">Forests</option>
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
        <input aria-label="District" placeholder="District" value={district} onChange={(event) => setDistrict(event.target.value)} />
        {viewer ? null : (
          <select aria-label="Farmer" value={farmerId} onChange={(event) => setFarmerId(event.target.value)}>
            <option value="">All farmers</option>
            {farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.display_name}</option>)}
          </select>
        )}
        <select aria-label="Health" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All health</option>
          <option value="surviving">Healthy</option>
          <option value="stressed">Needs attention</option>
          <option value="dead">Dead</option>
          <option value="planted">Not assessed</option>
        </select>
      </div>
      <HealthLegend selected={health} onSelect={setHealth} site />
      <div className="map-layout">
        <div className="map-frame" aria-label="Registration map">
          {data ? <MapView features={features} selectedId={selectedId} onSelect={setSelectedId} colorOf={markerColor} popupFor={(feature) => <MapPopup feature={feature} viewer={viewer} />} /> : <p className="loading">Loading map…</p>}
        </div>
        <aside className="card">
          {nothingLocated ? (
            <>
              <h2>No located records</h2>
              <p>Register a site, tree, or batch with latitude and longitude to see it here.</p>
            </>
          ) : null}
          {selected ? <RecordSummary feature={selected} /> : !nothingLocated ? <p>Select a marker, a forest, or a record to see its summary.</p> : null}
          <h2>Records on this map</h2>
          <div className="record-list">
            {features.map((feature) => (
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
  const center = featureCenter(feature);
  return (
    <div>
      <OriginBadge origin={feature.properties.data_origin} />
      {feature.properties.kind === "site" ? null : <HealthBadge status={feature.properties.status} />}
      <h2>{feature.properties.title}</h2>
      <p>{feature.properties.subtitle}</p>
      <p>{feature.properties.kind === "forest"
        ? [feature.properties.area_hectares != null ? `${feature.properties.area_hectares.toLocaleString("en-GB")} ha` : null, feature.properties.estimated_trees != null ? `about ${feature.properties.estimated_trees.toLocaleString("en-GB")} trees` : null].filter(Boolean).join(" · ")
        : <>{label(feature.properties.status)}{feature.properties.category ? ` · ${label(feature.properties.category)}` : ""}</>}</p>
      {center ? <p className="help">{formatCoordinates(center[0], center[1])}</p> : <p className="help">Shaded boundary on the map</p>}
      <Link href={`/${path}/${feature.properties.id}`}>Open record</Link>
    </div>
  );
}
