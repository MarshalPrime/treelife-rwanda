"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { LocationCard, speciesPhoto } from "@/components/report";
import { api } from "@/lib/api";
import { label } from "@/lib/labels";
import type { MapFeature, MapResponse } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <p className="loading">Loading map…</p>,
});

type Planting = {
  id: string;
  kind: "tree" | "batch";
  species_common_name: string;
  site_name: string | null;
  status: string;
  planting_date: string;
  quantity: number;
};

type Overview = {
  linked: boolean;
  farmer_id: string | null;
  farmer_name: string;
  sites: number;
  trees: number;
  batches: number;
  recorded_trees: number;
  surviving_trees: number;
  harvested_kg: number;
  sales_rwf: number;
  species_counts: { species_common_name: string; trees: number }[];
  plantings: Planting[];
  district: string | null;
  organization_name: string | null;
  phone: string | null;
  metal: "bronze" | "silver" | "gold" | null;
};

function formatCount(value: number) {
  return value.toLocaleString("en-GB");
}

function plantedOn(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FarmerOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>("/overview/mine")
      .then((next) => {
        setOverview(next);
        if (!next.farmer_id) return;
        api<MapResponse>(`/map?farmer_id=${next.farmer_id}`)
          .then((data) => setFeatures(data.features))
          .catch(() => setFeatures([]));
      })
      .catch((caught: Error) => setError(caught.message));
  }, []);

  return (
    <div className="page report-page">
      <div className="page-head">
        <div>
          <h1>Your overview</h1>
          <p className="lede">Your sites, trees, and harvests. Other farmers’ records stay off this page.</p>
        </div>
        <div className="actions">
          <Link className="primary" href="/trees/new">Register a tree</Link>
          <Link className="secondary" href="/batches/new">Register a batch</Link>
          <Link className="secondary" href="/sites/new">Register a site</Link>
        </div>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {overview && !overview.linked ? (
        <Banner tone="warning">This login is not linked to a farmer record yet.</Banner>
      ) : null}
      <section className="kpi-grid" aria-label="Your totals">
        <div className="kpi"><strong>{overview ? formatCount(overview.recorded_trees) : "—"}</strong><span>Trees recorded</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.surviving_trees) : "—"}</strong><span>Trees marked surviving</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.sites) : "—"}</strong><span>Your sites</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.harvested_kg) : "—"}</strong><span>Kilograms harvested</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.sales_rwf) : "—"}</strong><span>Sales in RWF</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.batches) : "—"}</strong><span>Planting batches</span></div>
      </section>
      <section className="card">
        <h2>Your species</h2>
        {overview && overview.species_counts.length === 0 ? <p>You have not recorded a tree yet.</p> : (
          <div className="species-strip">
            {overview?.species_counts.map((row) => {
              const photo = speciesPhoto(row.species_common_name);
              return (
                <article className="species-tile" key={row.species_common_name}>
                  <div className="species-swatch" style={photo ? undefined : { background: "#1b7f4e" }}>
                    {photo ? <Image src={photo} alt="" fill sizes="220px" className="species-photo" /> : null}
                  </div>
                  <strong>{formatCount(row.trees)}</strong>
                  <span>{row.species_common_name}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="card">
        <h2>Your plantings</h2>
        {overview && overview.plantings.length === 0 ? <p>A tree or batch you register will appear here.</p> : (
          <ul className="planting-list">
            {overview?.plantings.map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                <div>
                  <Link href={`/${row.kind === "tree" ? "trees" : "batches"}/${row.id}`}>{row.species_common_name}</Link>
                  <p className="help">{row.site_name ?? "Site not named"} · {label(row.status)} · planted {plantedOn(row.planting_date)}</p>
                </div>
                <strong>{row.kind === "batch" ? `${formatCount(row.quantity)} trees` : "1 tree"}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card report-map-card" aria-label="Your locations">
        <div className="page-head">
          <h2>Your locations</h2>
          <span className="help">{features.length} on the map</span>
        </div>
        <div className="map-frame report-map">
          <MapView
            features={features}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focusOnSelect={false}
            popupFor={(feature) => <LocationCard feature={feature} />}
          />
        </div>
        <p className="help">Zoom in, then select a point. The card shows that record.</p>
      </section>
    </div>
  );
}
