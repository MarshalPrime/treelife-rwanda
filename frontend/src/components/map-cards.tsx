"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { label } from "@/lib/labels";
import type { MapFeature, PlantingRecord, Site } from "@/lib/types";

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
