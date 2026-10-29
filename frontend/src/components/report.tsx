"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { api } from "@/lib/api";
import { label } from "@/lib/labels";
import type { MapFeature, MapResponse, PlantingRecord, Site } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <p className="loading">Loading map…</p>,
});

const palette = ["#1b7f4e", "#d97706", "#7c3aed", "#db2777", "#2563eb", "#ea580c", "#0f766e", "#65a30d"];

const speciesPhotos: Record<string, string> = {
  mango: "/species/mango.jpg",
  papaya: "/species/papaya.jpg",
  avocado: "/species/avocado.jpg",
  grevillea: "/species/grevillea.jpg",
  jacaranda: "/species/jacaranda.jpg",
};

export function speciesPhoto(name: string) {
  return speciesPhotos[name.trim().toLowerCase()];
}

type Report = {
  farmers: number;
  seedlings_distributed: number;
  harvested_kg: number;
  sales_rwf: number;
  recorded_trees: number;
  checked_trees: number;
  survival_percent: number | null;
  sites: number;
  sites_visited: number;
  includes_demonstration: boolean;
  species_counts: { species_common_name: string; trees: number }[];
  activity: { day: string; checks: number; by_species: { species_common_name: string; checks: number }[] }[];
};

function formatCount(value: number) {
  return value.toLocaleString("en-GB");
}

function dayLabel(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function briefDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function recordPath(kind: MapFeature["properties"]["kind"]) {
  if (kind === "site") return "sites";
  if (kind === "tree") return "trees";
  return "batches";
}

const kindLabel: Record<MapFeature["properties"]["kind"], string> = {
  site: "Planting site",
  tree: "Individual tree",
  batch: "Planting batch",
};

export function LocationCard({ feature }: { feature: MapFeature }) {
  const [detail, setDetail] = useState<Site | PlantingRecord | null>(null);
  const kind = feature.properties.kind;
  const path = recordPath(kind);

  useEffect(() => {
    let active = true;
    api<Site | PlantingRecord>(`/${path}/${feature.properties.id}`)
      .then((row) => { if (active) setDetail(row); })
      .catch(() => { if (active) setDetail(null); });
    return () => { active = false; };
  }, [feature.properties.id, path]);

  const planting = detail && "species_common_name" in detail ? detail : null;
  const site = detail && "site_type" in detail ? detail : null;
  const title = planting?.species_common_name ?? site?.name ?? feature.properties.species_common_name ?? feature.properties.title;
  const place = site
    ? [site.district, site.sector].filter(Boolean).join(", ")
    : planting?.site_name ?? feature.properties.subtitle;
  const notes = detail?.notes?.trim();

  return (
    <article className="record-card">
      <p className="kicker">{kindLabel[kind]}</p>
      <h3>{title}</h3>
      {planting?.species_scientific_name ? <p className="scientific">{planting.species_scientific_name}</p> : null}
      <p>{label(detail?.status ?? feature.properties.status)}{planting?.category ? ` · ${label(planting.category)}` : ""}{site ? ` · ${label(site.site_type)}` : ""}</p>
      {place ? <p>{place}</p> : null}
      {planting?.farmer_name || site?.farmer_name ? <p>Farmer: {planting?.farmer_name ?? site?.farmer_name}</p> : null}
      {planting ? <p>Planted {briefDate(planting.planting_date)}{kind === "batch" ? ` · ${planting.quantity} trees` : ""}</p> : null}
      {site?.area_hectares ? <p>{site.area_hectares} hectares</p> : null}
      {notes ? <p className="help">{notes.length > 140 ? `${notes.slice(0, 140)}…` : notes}</p> : null}
      <Link href={`/${path}/${feature.properties.id}`}>Open record</Link>
    </article>
  );
}

export function AdminReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Report>("/analytics").then(setReport).catch((caught: Error) => setError(caught.message));
    api<MapResponse>("/map").then((data) => setFeatures(data.features)).catch(() => setFeatures([]));
  }, []);

  const peak = Math.max(1, ...(report?.activity.map((day) => day.checks) ?? [1]));
  const speciesNames = report?.species_counts.map((row) => row.species_common_name) ?? [];
  for (const day of report?.activity ?? []) {
    for (const slice of day.by_species) {
      if (!speciesNames.includes(slice.species_common_name)) speciesNames.push(slice.species_common_name);
    }
  }
  const colorOfName = (name: string) => {
    const index = speciesNames.indexOf(name);
    return index >= 0 ? palette[index % palette.length] : "#1c4636";
  };
  const survival = report?.survival_percent == null ? "—" : `${report.survival_percent}%`;

  return (
    <div className="page report-page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="lede">
            Totals from the records entered in TreeLife. Use them in a progress report. They are not a national census.
          </p>
        </div>
        <div className="actions">
          <Link className="secondary" href="/analytics">Harvest and sales</Link>
          <Link className="secondary" href="/audit">Audit log</Link>
        </div>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {report?.includes_demonstration ? (
        <Banner tone="warning">These totals include demonstration records. They are not a field survey.</Banner>
      ) : null}
      <div className="report-board">
        <div className="report-main">
          <section className="kpi-grid" aria-label="Report totals">
            <div className="kpi"><strong>{report ? formatCount(report.recorded_trees) : "—"}</strong><span>Trees recorded</span></div>
            <div className="kpi"><strong>{report ? formatCount(report.checked_trees) : "—"}</strong><span>Trees checked</span></div>
            <div className="kpi"><strong>{report ? survival : "—"}</strong><span>Survival rate</span></div>
            <div className="kpi"><strong>{report ? formatCount(report.farmers) : "—"}</strong><span>Farmers</span></div>
            <div className="kpi"><strong>{report ? formatCount(report.sites) : "—"}</strong><span>Planting sites</span></div>
            <div className="kpi"><strong>{report ? formatCount(report.sites_visited) : "—"}</strong><span>Sites visited</span></div>
          </section>
          <section className="card">
            <h2>Trees by species</h2>
            {report && report.species_counts.length === 0 ? <p>No trees have been recorded yet.</p> : (
              <div className="species-strip">
                {report?.species_counts.map((row) => {
                  const photo = speciesPhoto(row.species_common_name);
                  return (
                  <article className="species-tile" key={row.species_common_name}>
                    <div className="species-swatch" style={photo ? undefined : { background: colorOfName(row.species_common_name) }}>
                      {photo ? (
                        <Image src={photo} alt="" fill sizes="220px" className="species-photo" />
                      ) : (
                        <svg width="72" height="72" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                          <path d="M18 30V16" stroke="white" strokeWidth="2" />
                          <path d="M18 20c-6 0-9-4-9-8 4 0 8 2 9 6 1-4 5-6 9-6 0 4-3 8-9 8Z" fill="white" />
                        </svg>
                      )}
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
            <div className="page-head">
              <h2>Field activity</h2>
              {speciesNames.length > 0 ? (
                <ul className="activity-legend" aria-label="Species colors">
                  {speciesNames.map((name) => (
                    <li key={name}><span style={{ background: colorOfName(name) }} />{name}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            {report && report.activity.length === 0 ? <p>No visits have been recorded yet.</p> : (
              <div className="activity-chart" aria-label="Visits by date and species">
                {report?.activity.map((day) => (
                  <div className="activity-col" key={day.day}>
                    <span className="activity-count">{day.checks}</span>
                    <div className="activity-stack" style={{ height: `${Math.max(12, (day.checks / peak) * 180)}px` }}>
                      {day.by_species.map((slice) => (
                        <div
                          key={slice.species_common_name}
                          className="activity-segment"
                          style={{ flexGrow: slice.checks, background: colorOfName(slice.species_common_name) }}
                          title={`${slice.species_common_name}: ${slice.checks}`}
                        />
                      ))}
                    </div>
                    <small>{dayLabel(day.day)}</small>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="kpi-grid" aria-label="Nursery, harvest, and sales">
            <div className="kpi"><strong>{report ? formatCount(report.seedlings_distributed) : "—"}</strong><span>Seedlings distributed</span></div>
            <div className="kpi"><strong>{report ? formatCount(report.harvested_kg) : "—"}</strong><span>Kilograms harvested</span></div>
            <div className="kpi"><strong>{report ? formatCount(report.sales_rwf) : "—"}</strong><span>Sales in RWF</span></div>
          </section>
          <section className="card report-map-card" aria-label="Map of recorded locations">
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
                colorOf={(feature) => colorOfName(feature.properties.species_common_name ?? feature.properties.kind)}
                popupFor={(feature) => <LocationCard feature={feature} />}
              />
            </div>
            <p className="help">Zoom in, then select a point. A short card opens beside it.</p>
          </section>
          <details className="card">
            <summary>How these figures are counted</summary>
            <ul>
              <li>Trees recorded counts each individual tree plus the quantity on each planting batch.</li>
              <li>Trees checked counts an individual tree after a field visit or a status other than planted, and a batch after a survival count is entered.</li>
              <li>Survival rate is the share of those checked trees still marked alive. It stays blank until a check exists.</li>
              <li>Sites visited counts a planting site once a visit is recorded on the site, or on a tree or batch at that site.</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
