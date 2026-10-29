"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { LocationCard, speciesPhoto } from "@/components/report";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
  farmer_name: string | null;
  status: string;
  planting_date: string;
  quantity: number;
};

type Overview = {
  officer_name: string;
  farmers_helped: number;
  sites: number;
  trees: number;
  batches: number;
  recorded_trees: number;
  surviving_trees: number;
  harvested_kg: number;
  sales_rwf: number;
  species_counts: { species_common_name: string; trees: number }[];
  plantings: Planting[];
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

export function OfficerOverview() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>("/overview/officer")
      .then((next) => {
        setOverview(next);
        if (!user?.id) return;
        api<MapResponse>(`/map?entered_by=${user.id}`)
          .then((data) => setFeatures(data.features))
          .catch(() => setFeatures([]));
      })
      .catch((caught: Error) => setError(caught.message));
  }, [user?.id]);

  return (
    <div className="page report-page">
      <div className="page-head">
        <div>
          <h1>{overview?.officer_name ?? "Your overview"}</h1>
          <p className="lede">Sites, trees, and harvests you recorded with farmers. Other officers’ records stay off this page.</p>
        </div>
        <div className="actions">
          <Link className="primary" href="/trees/new">Register a tree</Link>
          <Link className="secondary" href="/batches/new">Register a batch</Link>
          <Link className="secondary" href="/sites/new">Register a site</Link>
          <Link className="secondary" href="/farmers">Add a farmer</Link>
        </div>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <section className="kpi-grid" aria-label="Your totals">
        <div className="kpi"><strong>{overview ? formatCount(overview.farmers_helped) : "—"}</strong><span>Farmers helped</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.recorded_trees) : "—"}</strong><span>Trees recorded</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.surviving_trees) : "—"}</strong><span>Trees marked surviving</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.sites) : "—"}</strong><span>Sites recorded</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.harvested_kg) : "—"}</strong><span>Kilograms harvested</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.sales_rwf) : "—"}</strong><span>Sales in RWF</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.batches) : "—"}</strong><span>Planting batches</span></div>
      </section>
      <section className="card">
        <h2>Species you recorded</h2>
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
        <h2>Plantings you recorded</h2>
        {overview && overview.plantings.length === 0 ? <p>A tree or batch you register will appear here.</p> : (
          <ul className="planting-list">
            {overview?.plantings.map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                <div>
                  <Link href={`/${row.kind === "tree" ? "trees" : "batches"}/${row.id}`}>{row.species_common_name}</Link>
                  <p className="help">{[row.farmer_name, row.site_name ?? "Site not named", label(row.status), `planted ${plantedOn(row.planting_date)}`].filter(Boolean).join(" · ")}</p>
                </div>
                <strong>{row.kind === "batch" ? `${formatCount(row.quantity)} trees` : "1 tree"}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card report-map-card" aria-label="Locations you recorded">
        <div className="page-head">
          <h2>Locations you recorded</h2>
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
