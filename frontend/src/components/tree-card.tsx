import Link from "next/link";
import { featureCenter, formatCoordinates } from "@/lib/coordinates";
import { healthLevels, healthOf, siteColor, type HealthId } from "@/lib/health";
import type { MapFeature } from "@/lib/types";

export function HealthBadge({ status }: { status: string | null | undefined }) {
  const health = healthOf(status);
  return <span className={`health-badge ${health.id}`}><i style={{ background: health.color }} />{health.label}</span>;
}

export type FollowUpReason = "stressed" | "missing_coordinates";

export function RecordKindIcon({ kind }: { kind: "site" | "tree" | "batch" }) {
  if (kind === "site") {
    return (
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path
          d="M3 14V3.2A1.2 1.2 0 0 1 4.2 2h4.6A1.2 1.2 0 0 1 10 3.2V14M10 6.5h2.3A1.2 1.2 0 0 1 13.5 7.7V14M2 14h12M5.5 5h2M5.5 7.5h2M5.5 10h2M11.5 9.5h.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M8 14v-3.2M8 2.2 4.5 7h2.1L3.5 10.8h9L9.4 7h2.1L8 2.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IssuePill({ reason }: { reason: FollowUpReason }) {
  if (reason === "missing_coordinates") {
    return (
      <span className="issue-pill coords">
        <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
          <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3.2-4.5 8.5-4.5 8.5S3.5 9.2 3.5 6A4.5 4.5 0 0 1 8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="6" r="1.5" fill="currentColor" />
        </svg>
        No coords
      </span>
    );
  }
  return (
    <span className="issue-pill visit">
      <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
        <rect x="2" y="3" width="10" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 1.8v2.2M9 1.8v2.2M2 6h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="11.5" cy="11.5" r="3" fill="#fdf0ed" stroke="currentColor" strokeWidth="1.3" />
        <path d="M11.5 10.2v1.4l.9.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      Visit due
    </span>
  );
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
  reasons,
  kind,
  action = "Open",
  showActionText = true,
}: {
  href?: string;
  code?: string | null;
  species: string;
  status?: string | null;
  place?: string | null;
  when?: string | null;
  age?: string | null;
  detail?: string | null;
  reasons?: FollowUpReason[];
  kind?: "site" | "tree" | "batch";
  action?: string;
  showActionText?: boolean;
}) {
  const health = healthOf(status);
  const meta = [place, when, age].filter(Boolean).join(" · ") || "Location not recorded";
  const showFoot = Boolean(reasons?.length || detail || href);
  const body = (
    <>
      <span className="tree-card-top">
        {kind ? (
          <span className="tree-card-kind" aria-hidden="true"><RecordKindIcon kind={kind} /></span>
        ) : (
          <i className="health-dot" style={{ background: health.color }} aria-hidden="true" />
        )}
        <strong title={species}>{species}</strong>
        <HealthBadge status={status} />
      </span>
      <span className="tree-card-sub">
        {code ? <code className="tree-card-code">{code}</code> : null}
        {code ? <span className="tree-card-sep" aria-hidden="true">·</span> : null}
        <span className="tree-card-meta" title={meta}>{meta}</span>
      </span>
      {showFoot ? (
        <span className="tree-card-foot">
          <span className="tree-card-badges">
            {reasons?.length ? reasons.map((reason) => <IssuePill key={reason} reason={reason} />) : null}
            {detail ? <span className="tree-card-detail">{detail}</span> : null}
          </span>
          {href ? (
            <span className="tree-card-action">
              {showActionText ? action : null}
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : null}
        </span>
      ) : null}
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
