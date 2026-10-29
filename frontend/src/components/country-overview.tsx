"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { speciesPhoto } from "@/components/report";
import { api } from "@/lib/api";
import { label } from "@/lib/labels";
import type { MapFeature, MapResponse } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <p className="loading">Loading map…</p>,
});

type Overview = {
  recorded_trees: number;
  species_counts: { species_common_name: string; trees: number }[];
  districts: { district: string; trees: number }[];
};

function formatCount(value: number) {
  return value.toLocaleString("en-GB");
}

function CountryCard({ feature }: { feature: MapFeature }) {
  const title = feature.properties.species_common_name || feature.properties.title;
  return (
    <article className="record-card">
      <p className="kicker">{feature.properties.kind === "site" ? "Planting site" : "Trees"}</p>
      <h3>{title}</h3>
      <p>{label(feature.properties.status)}</p>
      <p>{feature.properties.subtitle}</p>
    </article>
  );
}

export function CountryOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>("/overview/country")
      .then(setOverview)
      .catch((caught: Error) => setError(caught.message));
    api<MapResponse>("/map")
      .then((data) => setFeatures(data.features))
      .catch(() => setFeatures([]));
  }, []);

  return (
    <div className="page report-page">
      <div className="page-head">
        <div>
          <h1>Trees across Rwanda</h1>
          <p className="lede">Recorded trees by species and district. Farmer and officer accounts are not on this page.</p>
        </div>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <section className="kpi-grid" aria-label="Country totals">
        <div className="kpi"><strong>{overview ? formatCount(overview.recorded_trees) : "—"}</strong><span>Trees recorded</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.species_counts.length) : "—"}</strong><span>Species</span></div>
        <div className="kpi"><strong>{overview ? formatCount(overview.districts.length) : "—"}</strong><span>Districts</span></div>
      </section>
      <section className="card">
        <h2>Species</h2>
        {overview && overview.species_counts.length === 0 ? <p>No trees are recorded yet.</p> : (
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
        <h2>Districts</h2>
        {overview && overview.districts.length === 0 ? <p>No district has been recorded yet.</p> : (
          <ul className="planting-list">
            {overview?.districts.map((row) => (
              <li key={row.district}>
                <span>{row.district}</span>
                <strong>{formatCount(row.trees)} trees</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card report-map-card" aria-label="Recorded locations">
        <div className="page-head">
          <h2>Recorded locations</h2>
          <span className="help">{features.length} on the map</span>
        </div>
        <div className="map-frame report-map">
          <MapView
            features={features}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focusOnSelect={false}
            popupFor={(feature) => <CountryCard feature={feature} />}
          />
        </div>
        <p className="help">Zoom in, then select a point. The card shows the species and place.</p>
      </section>
    </div>
  );
}
