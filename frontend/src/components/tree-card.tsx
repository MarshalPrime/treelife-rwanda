import Link from "next/link";
import { featureCenter, formatCoordinates } from "@/lib/coordinates";
import { healthLevels, healthOf, siteColor, type HealthId } from "@/lib/health";
import type { MapFeature } from "@/lib/types";

export function HealthBadge({ status }: { status: string | null | undefined }) {
  const health = healthOf(status);
  return <span className={`health-badge ${health.id}`}><i style={{ background: health.color }} />{health.label}</span>;
}

export function TreeCard({
  href,
  code,
  species,
  status,
  place,
  when,
  age,
  detail,
  action = "View tree",
}: {
  href?: string;
  code?: string | null;
  species: string;
  status?: string | null;
  place?: string | null;
  when?: string | null;
  age?: string | null;
  detail?: string | null;
  action?: string;
}) {
  const health = healthOf(status);
  const body = (
    <>
      <span className="tree-card-top">
        <i className="health-dot" style={{ background: health.color }} aria-hidden="true" />
        <strong>{species}</strong>
        <HealthBadge status={status} />
      </span>
      {code ? <span className="tree-card-code">{code}</span> : null}
      <span className="tree-card-meta">{[place, when, age].filter(Boolean).join(" · ") || "Location not recorded"}</span>
      {detail ? <span className="tree-card-detail">{detail}</span> : null}
      {href ? <span className="tree-card-action">{action}</span> : null}
    </>
  );
  if (!href) return <article className={`tree-card ${health.id}`}>{body}</article>;
  return <Link className={`tree-card ${health.id}`} href={href}>{body}</Link>;
}

export function HealthLegend({
  selected,
  onSelect,
  site = false,
}: {
  selected: HealthId | "";
  onSelect: (id: HealthId | "") => void;
  site?: boolean;
}) {
  return (
    <div className="map-legend" role="group" aria-label="Tree health">
      <button type="button" aria-pressed={selected === ""} onClick={() => onSelect("")}>All trees</button>
      {healthLevels.map((health) => (
        <button key={health.id} type="button" aria-pressed={selected === health.id} onClick={() => onSelect(selected === health.id ? "" : health.id)}>
          <i style={{ background: health.color }} />{health.label}
        </button>
      ))}
      {site ? <span><i style={{ background: siteColor }} />Site</span> : null}
    </div>
  );
}

const kindPath = { site: "sites", tree: "trees", batch: "batches", forest: "forests" } as const;

const distributionLabel: Record<string, string> = {
  natural: "Natural or random",
  rows: "Organized rows",
  clusters: "Clusters",
  mixed: "Mixed",
};

export function MapPopup({ feature, viewer = false }: { feature: MapFeature; viewer?: boolean }) {
  const path = kindPath[feature.properties.kind];
  const forest = feature.properties.kind === "forest";
  const species = forest
    ? feature.properties.title
    : feature.properties.species_common_name ?? feature.properties.title;
  const area = feature.properties.area_hectares;
  const trees = feature.properties.estimated_trees;
  const center = forest ? featureCenter(feature) : null;
  const distribution = feature.properties.distribution
    ? distributionLabel[feature.properties.distribution] ?? feature.properties.distribution
    : null;
  return (
    <article className="map-popup-card">
      {feature.properties.kind === "site"
        ? <span className="health-badge unknown"><i style={{ background: siteColor }} />Site</span>
        : <HealthBadge status={feature.properties.status} />}
      <strong>{species}</strong>
      <span>{viewer ? "Programme coverage" : feature.properties.public_code}</span>
      {forest ? (
        <span>
          {area != null ? `${area.toLocaleString("en-GB")} ha` : "Area recorded"}
          {trees != null ? ` · about ${trees.toLocaleString("en-GB")} trees` : ""}
        </span>
      ) : null}
      {forest && feature.properties.species_common_name ? (
        <span>{[feature.properties.species_common_name, distribution].filter(Boolean).join(" · ")}</span>
      ) : null}
      {center ? <span>{formatCoordinates(center[0], center[1])}</span> : null}
      <span>{feature.properties.subtitle || "Location recorded"}</span>
      {!viewer || forest ? <Link href={`/${path}/${feature.properties.id}`}>{forest ? "View forest" : "View record"}</Link> : <span>View-only coverage</span>}
    </article>
  );
}
