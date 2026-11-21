"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Banner } from "@/components/AppShell";
import { CarbonOverview } from "@/components/carbon-dashboard";
import { BreakdownChart, SeriesChart, harvestLines, plantingLines, salesLines } from "@/components/dashboard-charts";
import { DashboardEmpty, DashboardKpi, DashboardKpiGrid, DashboardSkeleton } from "@/components/dashboard-ui";
import { HarvestNotices, HarvestSummary } from "@/components/harvest-insights";
import { HealthBadge, HealthLegend, IssuePill, MapPopup, RecordKindIcon, TreeCard, type FollowUpReason } from "@/components/tree-card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { connectDashboardStream, type LiveStreamState, type LiveTreeSnapshot } from "@/lib/dashboard-stream";
import { healthOf, markerColor, matchesHealth, plantedAge, type HealthId } from "@/lib/health";
import type { DashboardFilters, DashboardRange, DashboardResponse, MapResponse } from "@/lib/types";
import "./dashboard-view.css";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <p className="loading">Loading map…</p>,
});
const ranges: { value: DashboardRange; label: string }[] = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
];
const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const dateLabel = (value?: string | null) => {
  if (!value) return "Date unavailable";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const shortDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "—";
  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  return parsed.toLocaleDateString(
    "en-GB",
    sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "2-digit" },
  );
};
const recordPath = (kind: "tree" | "batch" | "site", id: string) => `/${kind === "tree" ? "trees" : kind === "batch" ? "batches" : "sites"}/${id}`;

function healthShares(counts: number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((count) => (count * 100) / total);
  const shares = exact.map((value) => Math.floor(value));
  let remainder = 100 - shares.reduce((sum, value) => sum + value, 0);
  exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
    .forEach((item) => {
      if (remainder <= 0) return;
      shares[item.index] += 1;
      remainder -= 1;
    });
  return shares;
}

function TreeHealth({ summary }: { summary: DashboardResponse["summary"] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const counts = [summary.healthy_trees ?? 0, summary.moderate_trees ?? 0, summary.critical_trees ?? 0];
  const shares = healthShares(counts);
  const rows = [
    { label: "Healthy", color: "#1f8a4c", count: counts[0], share: shares[0] },
    { label: "Moderate", color: "#c49212", count: counts[1], share: shares[1] },
    { label: "Critical", color: "#c44536", count: counts[2], share: shares[2] },
  ];
  const total = counts.reduce((sum, count) => sum + count, 0);
  return (
    <section className="card tree-health" aria-label="Tree health">
      <div className="compact-panel-head">
        <h2>Tree health</h2>
        <span className="help">{total ? `${number(total)} assessed` : "Unassessed"}</span>
      </div>
      {total > 0 ? (
        <div className="tree-health-segmented" aria-hidden="true">
          {rows.map((row) => (
            <span
              key={row.label}
              style={{
                width: `${row.share}%`,
                background: row.color,
                opacity: hovered && hovered !== row.label ? 0.35 : 1,
              }}
            />
          ))}
        </div>
      ) : null}
      <ul className="tree-health-list">
        {rows.map((row) => (
          <li
            key={row.label}
            className={`tree-health-row ${hovered === row.label ? "is-highlighted" : ""}`}
            onMouseEnter={() => setHovered(row.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="tree-health-name"><i style={{ background: row.color }} aria-hidden="true" />{row.label}</span>
            <div className="tree-health-track" role="meter" aria-valuenow={row.share} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.label}, ${number(row.count)} trees`}>
              <span style={{ width: `${row.share}%`, background: row.color }} />
            </div>
            <span className="tree-health-figures">
              <small>{number(row.count)}</small>
              <strong>{row.share}%</strong>
            </span>
          </li>
        ))}
      </ul>
      {!total ? <p className="help">No tree has a recorded condition yet.</p> : null}
    </section>
  );
}

// The live clock uses this zone. Change both values together when another zone is needed.
const PROGRAMME_TIME_ZONE = "Africa/Kigali";
const PROGRAMME_TIME_ZONE_LABEL = "CAT";

function programmeClock(date: Date) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: PROGRAMME_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${time} ${PROGRAMME_TIME_ZONE_LABEL}`;
}

function CenterExpandingNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [pulseKey, setPulseKey] = useState(0);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    const end = value;
    from.current = end;
    if (start === end) {
      setShown(end);
      return;
    }
    setPulseKey((count) => count + 1);
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setShown(end);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / 700);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(start + (end - start) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const formatted = shown.toLocaleString("en-GB");
  return (
    <span key={pulseKey} className={`center-expanding-number ${pulseKey > 0 ? "is-growing" : ""}`}>
      {formatted}
    </span>
  );
}

const STREAM_STATE_LABELS: Record<LiveStreamState, string> = {
  connecting: "Connecting stream",
  live: "Live stream",
  polling: "Auto-sync",
  offline: "Offline",
};

function LiveTreeTotal({
  value,
  streamState,
  summary,
}: {
  value: number;
  streamState: LiveStreamState;
  summary: DashboardResponse["summary"];
}) {
  const previous = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [projecting, setProjecting] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (previous.current == null) {
      previous.current = value;
      return;
    }
    const change = value - previous.current;
    previous.current = value;
    if (change === 0) return;
    setDelta(change);
    const timer = window.setTimeout(() => setDelta(null), 5000);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if (!projecting) return;
    const node = stageRef.current;
    if (node && typeof node.requestFullscreen === "function" && document.fullscreenElement !== node) {
      void node.requestFullscreen().catch(() => undefined);
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProjecting(false);
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setProjecting(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement === node && typeof document.exitFullscreen === "function") {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [projecting]);

  const liveMarkText = `Live · updated ${programmeClock(now)}`;
  const checked = summary.checked_trees;
  const notSurviving = Math.max(0, checked - summary.surviving_trees);
  const deathRate = checked === 0 ? "Not assessed" : `${Math.round((100 * notSurviving) / checked)}%`;

  const hero = (action: ReactNode) => (
    <div className="dashboard-live-total">
      <div className="live-total-topbar">
        <p className={`live-mark is-${streamState}`}>
          <span>{liveMarkText}</span>
          <em className="live-stream-pill">{STREAM_STATE_LABELS[streamState]}</em>
        </p>
        {action}
      </div>
      <div className="live-total-center">
        <strong aria-live="polite"><CenterExpandingNumber value={value} /></strong>
        <span>Trees standing</span>
        {delta != null ? (
          <p className={`dashboard-live-delta ${delta > 0 ? "up" : "down"}`}>
            {delta > 0 ? `+${delta.toLocaleString("en-GB")}` : delta.toLocaleString("en-GB")} {Math.abs(delta) === 1 ? "tree" : "trees"}
          </p>
        ) : (
          <p className="help">Living trees across the programme.</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {hero(
        <button
          type="button"
          className="live-fullscreen-btn"
          aria-label="Open full-screen projection"
          onClick={() => setProjecting(true)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Full screen</span>
        </button>,
      )}

      {projecting ? (
        <div
          ref={stageRef}
          className="live-projection-stage"
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen programme summary"
        >
          {hero(
            <button type="button" className="live-fullscreen-btn" onClick={() => setProjecting(false)}>
              Exit full screen <kbd>Esc</kbd>
            </button>,
          )}
          <section aria-label="Key figures" className="dashboard-figures">
            <div className="section-caption">
              <h2>At a glance</h2>
              <span className="help">Live stream · production matches selected period</span>
            </div>
            <div className="dashboard-glance-row">
              <TreeHealth summary={summary} />
              <DashboardKpiGrid>
                <DashboardKpi label="Survival rate" value={summary.survival_percent == null ? "Not assessed" : `${summary.survival_percent}%`} hint={`${number(checked)} checked`} />
                <DashboardKpi label="Death rate" value={deathRate} hint={`${number(notSurviving)} not surviving`} />
                <DashboardKpi label="Farmers" value={number(summary.farmers)} hint="Current scope" />
                <DashboardKpi label="Planting sites" value={number(summary.sites)} hint="Current sites" />
                <DashboardKpi label="Harvest" value={`${number(summary.harvested_kg ?? 0)} kg`} hint="Selected period" />
                <DashboardKpi label="Sales" value={`${number(summary.sales_rwf ?? 0)} RWF`} hint="Selected period" />
              </DashboardKpiGrid>
            </div>
          </section>
          <CarbonOverview />
        </div>
      ) : null}
    </>
  );
}

function FollowUpPanel({
  items,
  missingCoordinatesCount,
}: {
  items: DashboardResponse["attention"];
  missingCoordinatesCount: number;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | HealthId>("all");
  const [issueFilter, setIssueFilter] = useState<"all" | FollowUpReason>("all");
  const [groupingMode, setGroupingMode] = useState<"unified" | "items">("unified");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const unified = useMemo(() => {
    const map = new Map<string, {
      key: string;
      id: string;
      kind: "tree" | "batch" | "site";
      title: string;
      public_code?: string | null;
      status: string | null | undefined;
      healthId: HealthId;
      place?: string | null;
      reasons: FollowUpReason[];
    }>();
    for (const row of items) {
      const key = `${row.kind}-${row.id}`;
      const effectiveStatus = row.reason === "stressed" ? "stressed" : row.status;
      const reason: FollowUpReason = row.reason === "stressed" ? "stressed" : "missing_coordinates";
      const existing = map.get(key);
      if (existing) {
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        if (row.reason === "stressed") {
          existing.status = "stressed";
          existing.healthId = "attention";
        }
      } else {
        map.set(key, {
          key,
          id: row.id,
          kind: row.kind,
          title: row.title,
          public_code: row.public_code,
          status: effectiveStatus,
          healthId: healthOf(effectiveStatus).id,
          place: row.place,
          reasons: [reason],
        });
      }
    }
    for (const entry of map.values()) {
      entry.reasons.sort((left, right) => (left === right ? 0 : left === "stressed" ? -1 : 1));
    }
    return Array.from(map.values());
  }, [items]);

  const actionRows = useMemo(
    () =>
      items.map((row, index) => {
        const effectiveStatus = row.reason === "stressed" ? "stressed" : row.status;
        const reason: FollowUpReason = row.reason === "stressed" ? "stressed" : "missing_coordinates";
        return {
          key: `${row.kind}-${row.id}-${reason}-${index}`,
          id: row.id,
          kind: row.kind,
          title: row.title,
          public_code: row.public_code,
          status: effectiveStatus,
          healthId: healthOf(effectiveStatus).id,
          place: row.place,
          reasons: [reason] as FollowUpReason[],
        };
      }),
    [items],
  );

  const displayRows = groupingMode === "items" ? actionRows : unified;

  const counts = useMemo(() => {
    let attention = 0;
    let unknown = 0;
    let healthy = 0;
    let dead = 0;
    let missing = 0;
    let stressed = 0;
    for (const row of displayRows) {
      if (row.healthId === "attention") attention += 1;
      else if (row.healthId === "unknown") unknown += 1;
      else if (row.healthId === "healthy") healthy += 1;
      else if (row.healthId === "dead") dead += 1;
      if (row.reasons.includes("missing_coordinates")) missing += 1;
      if (row.reasons.includes("stressed")) stressed += 1;
    }
    return { all: displayRows.length, attention, unknown, healthy, dead, missing, stressed };
  }, [displayRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return displayRows.filter((row) => {
      if (statusFilter !== "all" && row.healthId !== statusFilter) return false;
      if (issueFilter !== "all" && !row.reasons.includes(issueFilter)) return false;
      if (q) {
        const hay = `${row.title} ${row.public_code ?? ""} ${row.place ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [displayRows, statusFilter, issueFilter, query]);

  const hasActiveFilters = statusFilter !== "all" || issueFilter !== "all" || query.trim() !== "";
  const clearFilters = () => {
    setStatusFilter("all");
    setIssueFilter("all");
    setQuery("");
  };

  const statusPills = [
    { id: "all" as const, label: "All", count: counts.all },
    { id: "attention" as const, label: "Needs attention", count: counts.attention },
    { id: "unknown" as const, label: "Not assessed", count: counts.unknown },
    { id: "healthy" as const, label: "Healthy", count: counts.healthy },
    ...(counts.dead > 0 ? [{ id: "dead" as const, label: "Dead", count: counts.dead }] : []),
  ];

  return (
    <section className="card followup-card" aria-label="Follow-up">
      <div className="followup-header">
        <div className="followup-title-row">
          <div className="compact-panel-title">
            <h2>Follow-up</h2>
            <span className="followup-count-pill">{number(missingCoordinatesCount)} records without coordinates</span>
          </div>
          <span className="help">Stressed trees and location gaps · up to 20 items</span>
        </div>

        {items.length ? (
          <div className="followup-toolbar">
            <div className="followup-pills" role="group" aria-label="Filter follow-up by health">
              {statusPills.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  className={statusFilter === pill.id ? "is-active" : ""}
                  aria-pressed={statusFilter === pill.id}
                  onClick={() => setStatusFilter(pill.id)}
                >
                  {pill.label} <small>{pill.count}</small>
                </button>
              ))}
            </div>

            <div className="followup-controls">
              <div className="followup-segment" role="group" aria-label="Filter follow-up by issue">
                <button
                  type="button"
                  className={issueFilter === "all" ? "is-active" : ""}
                  aria-pressed={issueFilter === "all"}
                  onClick={() => setIssueFilter("all")}
                >
                  All issues
                </button>
                <button
                  type="button"
                  className={issueFilter === "missing_coordinates" ? "is-active" : ""}
                  aria-pressed={issueFilter === "missing_coordinates"}
                  onClick={() => setIssueFilter("missing_coordinates")}
                >
                  No coords ({counts.missing})
                </button>
                <button
                  type="button"
                  className={issueFilter === "stressed" ? "is-active" : ""}
                  aria-pressed={issueFilter === "stressed"}
                  onClick={() => setIssueFilter("stressed")}
                >
                  Visit due ({counts.stressed})
                </button>
              </div>

              <div className="followup-segment" role="group" aria-label="Follow-up grouping">
                <button
                  type="button"
                  className={groupingMode === "unified" ? "is-active" : ""}
                  aria-pressed={groupingMode === "unified"}
                  onClick={() => setGroupingMode("unified")}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M8 2 2 5l6 3 6-3-6-3ZM2 8l6 3 6-3M2 11l6 3 6-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Unified</span>
                </button>
                <button
                  type="button"
                  className={groupingMode === "items" ? "is-active" : ""}
                  aria-pressed={groupingMode === "items"}
                  onClick={() => setGroupingMode("items")}
                >
                  Action Items
                </button>
              </div>

              <div className="followup-search">
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="m10.7 10.7 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search species, ID, site..."
                  aria-label="Search follow-up records"
                />
                {query ? (
                  <button
                    type="button"
                    className="followup-search-clear"
                    aria-label="Clear follow-up search"
                    onClick={() => setQuery("")}
                  >
                    ×
                  </button>
                ) : null}
              </div>

              <div className="followup-segment" role="group" aria-label="Follow-up layout">
                <button type="button" className={viewMode === "grid" ? "is-active" : ""} aria-label="Grid view" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")}>
                  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                    <rect x="2" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <rect x="9" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <rect x="2" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <rect x="9" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
                <button type="button" className={viewMode === "list" ? "is-active" : ""} aria-label="List view" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}>
                  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                    <path d="M3 4h10M3 8h10M3 12h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="followup-body">
        {!items.length ? (
          <div className="followup-empty-wrap">
            <DashboardEmpty title="No follow-up flagged">No records need follow-up in the current view.</DashboardEmpty>
          </div>
        ) : !filtered.length ? (
          <div className="followup-empty-wrap">
            <DashboardEmpty title="No matching follow-up records">
              Try clearing the search or status filter.{" "}
              <button type="button" className="inline-link" onClick={clearFilters}>
                Reset filters
              </button>
            </DashboardEmpty>
          </div>
        ) : viewMode === "grid" ? (
          <div className="followup-scroll">
            <div className="followup-grid-3col">
              {filtered.map((row) => (
                <TreeCard
                  key={row.key}
                  href={recordPath(row.kind, row.id)}
                  kind={row.kind}
                  code={row.public_code}
                  species={row.title}
                  status={row.status}
                  place={row.place}
                  reasons={row.reasons}
                  showActionText={false}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="followup-list-scroll">
            <table className="followup-table">
              <caption className="sr-only">Follow-up records</caption>
              <thead>
                <tr>
                  <th scope="col">Record</th>
                  <th scope="col">Code</th>
                  <th scope="col">Status</th>
                  <th scope="col">Place</th>
                  <th scope="col">Gaps</th>
                  <th scope="col" className="sr-only">Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">
                      <span className="followup-table-entity">
                        <span className="tree-card-kind" aria-hidden="true"><RecordKindIcon kind={row.kind} /></span>
                        <span>{row.title}</span>
                      </span>
                    </th>
                    <td><code>{row.public_code ?? "—"}</code></td>
                    <td><HealthBadge status={row.status} /></td>
                    <td className="followup-table-place" title={row.place ?? undefined}>{row.place ?? "—"}</td>
                    <td><span className="followup-table-pills">{row.reasons.map((reason) => <IssuePill key={reason} reason={reason} />)}</span></td>
                    <td className="followup-table-open"><Link href={recordPath(row.kind, row.id)}>Open record</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {items.length ? (
        <div className="followup-footer">
          <span>
            Showing <strong>{filtered.length}</strong>{" "}
            {groupingMode === "unified" ? "unique records" : "action items"} · Click any {viewMode === "list" ? "row" : "card"} to open full record details
          </span>
          {hasActiveFilters ? (
            <button type="button" className="followup-reset-link" onClick={clearFilters}>
              Reset filters
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
function filterQuery(filters: DashboardFilters, explicitRange = false) {
  const query = new URLSearchParams();
  if (explicitRange || filters.range !== "90") query.set("range", filters.range);
  if (filters.district) query.set("district", filters.district);
  if (filters.species_id) query.set("species_id", filters.species_id);
  return query.toString();
}

export function DashboardView({ mode = "dashboard" }: { mode?: "dashboard" | "report" }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // The URL is the sole filter state, including browser back/forward navigation.
  const filters = useMemo<DashboardFilters>(() => {
    const query = new URLSearchParams(search);
    const candidate = query.get("range") ?? "90";
    return {
      range: ranges.some((range) => range.value === candidate) ? candidate as DashboardRange : "90",
      district: query.get("district") ?? "",
      species_id: query.get("species_id") ?? "",
    };
  }, [search]);
  const dataPath = `/dashboard?${filterQuery(filters, true)}`;
  const streamQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (filters.district) query.set("district", filters.district);
    if (filters.species_id) query.set("species_id", filters.species_id);
    return query.toString();
  }, [filters.district, filters.species_id]);

  const [result, setResult] = useState<{ path: string; data: DashboardResponse } | null>(null);
  const [requestError, setRequestError] = useState<{ path: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const quietNext = useRef(false);
  const mapQuiet = useRef(false);
  const [mapRefresh, setMapRefresh] = useState(0);
  const [mapResult, setMapResult] = useState<{ path: string; data: MapResponse } | null>(null);
  const [mapError, setMapError] = useState<{ path: string; message: string } | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthId | "">("");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [liveState, setLiveState] = useState<{ query: string; snapshot: LiveTreeSnapshot } | null>(null);
  const [streamStatus, setStreamStatus] = useState<LiveStreamState>("connecting");

  const response = result?.path === dataPath ? result.data : null;
  const error = requestError?.path === dataPath ? requestError.message : null;
  const role = response?.role ?? user?.role;
  const viewer = role === "viewer";
  const writer = role === "farmer" || role === "field_officer";
  const latestSummaryRef = useRef<{ standing: number; recorded: number } | null>(null);
  latestSummaryRef.current = response
    ? { standing: response.summary.standing_trees ?? response.summary.recorded_trees, recorded: response.summary.recorded_trees }
    : null;

  useEffect(() => {
    const controller = new AbortController();
    const quiet = quietNext.current;
    quietNext.current = false;
    if (!quiet) setLoading(true);
    if (!quiet) setRequestError(null);
    api<DashboardResponse>(dataPath, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult({ path: dataPath, data }); })
      .catch((caught: Error) => { if (!controller.signal.aborted && !quiet) setRequestError({ path: dataPath, message: caught.message }); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [dataPath, refresh]);

  useEffect(() => {
    if (user?.role !== "admin" || mode !== "dashboard") return;
    return connectDashboardStream(streamQuery, {
      onStateChange: setStreamStatus,
      onSnapshot: (snapshot) => {
        setLiveState({ query: streamQuery, snapshot });
        const latest = latestSummaryRef.current;
        if (latest && (latest.standing !== snapshot.standing_trees || latest.recorded !== snapshot.recorded_trees)) {
          quietNext.current = true;
          mapQuiet.current = true;
          setRefresh((value) => value + 1);
          setMapRefresh((value) => value + 1);
        }
      },
    });
  }, [user?.role, mode, streamQuery]);

  useEffect(() => {
    if (user?.role !== "admin" || mode !== "dashboard" || streamStatus !== "polling") return;
    const pull = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      quietNext.current = true;
      mapQuiet.current = true;
      setRefresh((value) => value + 1);
      setMapRefresh((value) => value + 1);
    };
    const timer = window.setInterval(pull, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", pull);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", pull);
    };
  }, [user?.role, mode, streamStatus]);

  const mapPath = response && /^\/dashboard\/map(?:\?|$)/.test(response.map_query) ? response.map_query : "";
  const invalidMapPath = Boolean(response && !mapPath);
  useEffect(() => {
    if (!mapPath) return;
    const controller = new AbortController();
    const quiet = mapQuiet.current;
    mapQuiet.current = false;
    if (!quiet) {
      setMapLoading(true);
      setMapError(null);
      setSelectedId(null);
    }
    api<MapResponse>(mapPath, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setMapResult({ path: mapPath, data }); })
      .catch((caught: Error) => { if (!controller.signal.aborted && !quiet) setMapError({ path: mapPath, message: caught.message }); })
      .finally(() => { if (!controller.signal.aborted) setMapLoading(false); });
    return () => controller.abort();
  }, [mapPath, mapRefresh]);

  function changeFilters(next: Partial<DashboardFilters>) {
    const query = filterQuery({ ...filters, ...next });
    const url = `${pathname}${query ? `?${query}` : ""}`;
    if (url !== `${pathname}${search ? `?${search}` : ""}`) router.push(url, { scroll: false });
  }
  function reset() { changeFilters({ range: "90", district: "", species_id: "" }); }
  const options = result?.data.options;
  const speciesLabel = options?.species.find((species) => species.id === filters.species_id)?.common_name ?? "Selected species";
  const map = mapResult?.path === mapPath ? mapResult.data : null;
  const located = map ? map.features.filter((feature) => matchesHealth(feature, health)) : [];
  const activeMapError = invalidMapPath ? "Locations are unavailable for this view." : mapError?.path === mapPath ? mapError.message : null;
  const title = mode === "report" ? "Progress reports" : response?.scope_label ?? "Planting overview";
  const activeLive = liveState?.query === streamQuery ? liveState.snapshot : null;
  const displaySummary = response
    ? activeLive
      ? {
          ...response.summary,
          standing_trees: activeLive.standing_trees,
          recorded_trees: activeLive.recorded_trees,
          healthy_trees: activeLive.healthy_trees,
          moderate_trees: activeLive.moderate_trees,
          critical_trees: activeLive.critical_trees,
        }
      : response.summary
    : null;

  return <div className="page report-page dashboard-view">
    <div className="page-head dashboard-heading">
      <div>
        <p className="dashboard-eyebrow">A growing future</p>
        <h1>{title}</h1>
        {mode === "report" ? <p className="lede">Explore planting, fieldwork, and production over time.</p> : viewer ? <p className="lede">Explore the trees and species recorded across Rwanda.</p> : null}
      </div>
      <div className="dashboard-quick-actions">
        {writer ? <><Link className="primary" href="/trees/new">+ Register a tree</Link><Link className="secondary" href="/batches/new">Register a batch</Link><Link className="secondary" href="/sites/new">Add a site</Link></> : viewer ? <Link className="primary" href="/trees">Browse trees</Link> : role === "admin" ? <><Link className="secondary" href="/analytics">Reports</Link><Link className="secondary" href="/audit">Audit log</Link></> : null}
      </div>
    </div>

    <aside className="dashboard-controls-bar" aria-label="Dashboard filters">
      <section className="dashboard-toolbar">
        <label htmlFor="dashboard-range"><span>Period</span><select id="dashboard-range" value={filters.range} onChange={(event) => changeFilters({ range: event.target.value as DashboardRange })}>{ranges.map((range) => <option value={range.value} key={range.value}>{range.label}</option>)}</select></label>
        <label htmlFor="dashboard-district"><span>District</span><select id="dashboard-district" value={filters.district} disabled={!options} onChange={(event) => changeFilters({ district: event.target.value })}><option value="">All districts</option>{options?.districts.map((district) => <option key={district} value={district}>{district}</option>)}</select></label>
        <label htmlFor="dashboard-species"><span>Species</span><select id="dashboard-species" value={filters.species_id} disabled={!options} onChange={(event) => changeFilters({ species_id: event.target.value })}><option value="">All species</option>{options?.species.map((species) => <option key={species.id} value={species.id}>{species.common_name}</option>)}</select></label>
        <div className="dashboard-filter-actions">
          <button className="ghost" type="button" onClick={reset}>Reset filters</button>
          <button className="primary" type="button" onClick={() => { setRefresh((value) => value + 1); setMapRefresh((value) => value + 1); }} disabled={loading}>Refresh</button>
        </div>
      </section>
      {filters.district || filters.species_id ? (
        <div className="filter-chips" aria-label="Active filters">
          {filters.district ? <button type="button" aria-label="Clear district filter" onClick={() => changeFilters({ district: "" })}>{filters.district} <span aria-hidden="true">×</span></button> : null}
          {filters.species_id ? <button type="button" aria-label="Clear species filter" onClick={() => changeFilters({ species_id: "" })}>{speciesLabel} <span aria-hidden="true">×</span></button> : null}
        </div>
      ) : null}
    </aside>

    <div className="dashboard-main">
      {error ? <Banner tone="error">{error} <button className="inline-link" type="button" onClick={() => setRefresh((value) => value + 1)}>Retry dashboard</button></Banner> : null}
      {(!response && !error) || (loading && !response) ? <DashboardSkeleton /> : null}
      {response && displaySummary && !error ? <div className="dashboard-body" aria-busy={loading}>
        {role === "farmer" && !response.linked ? <Banner tone="warning">Your login is not linked to a farmer record yet. Ask your field officer to link your household.</Banner> : null}

        {role === "admin" && mode === "dashboard" ? (
          <LiveTreeTotal
            value={displaySummary.standing_trees ?? displaySummary.recorded_trees}
            streamState={streamStatus}
            summary={displaySummary}
          />
        ) : null}

        <section aria-label="Key figures" className="dashboard-figures">
          <div className="section-caption">
            <h2>At a glance</h2>
            <span className="help">{role === "admin" && mode === "dashboard" ? "Live stream · production matches selected period" : "Inventory is current · production matches selected period"}</span>
          </div>
          <div className="dashboard-glance-row">
            <TreeHealth summary={displaySummary} />
            <DashboardKpiGrid>
              {role === "admin" && mode === "dashboard" ? null : <DashboardKpi label="Trees recorded" value={number(displaySummary.recorded_trees)} hint="Individual trees + batches" />}
              {viewer ? <><DashboardKpi label="Species" value={number(displaySummary.species)} hint="In this view" /><DashboardKpi label="Districts" value={number(displaySummary.districts)} hint="With plantings" /></> : <>
                <DashboardKpi label="Survival rate" value={displaySummary.survival_percent == null ? "Not assessed" : `${displaySummary.survival_percent}%`} hint={`${number(displaySummary.checked_trees)} checked`} />
                <DashboardKpi label="Death rate" value={displaySummary.checked_trees === 0 ? "Not assessed" : `${Math.round(100 * (displaySummary.checked_trees - displaySummary.surviving_trees) / displaySummary.checked_trees)}%`} hint={`${number(Math.max(0, displaySummary.checked_trees - displaySummary.surviving_trees))} not surviving`} />
                {role !== "farmer" ? <DashboardKpi label={role === "field_officer" ? "Farmers helped" : "Farmers"} value={number(displaySummary.farmers)} hint="Current scope" /> : null}
                <DashboardKpi label="Planting sites" value={number(displaySummary.sites)} hint="Current sites" />
                <DashboardKpi label="Harvest" value={`${number(displaySummary.harvested_kg ?? 0)} kg`} hint="Selected period" />
                <DashboardKpi label="Sales" value={`${number(displaySummary.sales_rwf ?? 0)} RWF`} hint="Selected period" />
              </>}
            </DashboardKpiGrid>
          </div>
        </section>

        {(role === "admin" || viewer) && mode === "dashboard" ? <CarbonOverview /> : null}

        <div className="dashboard-two-col">
          <section className="card"><div className="page-head"><h2>Planting & field activity</h2><span className="help">{dateLabel(response.filters.start_date)} – {dateLabel(response.filters.end_date)}</span></div><SeriesChart title="Planting and field activity" series={response.series} lines={plantingLines} unit="records" monthly={filters.range === "all"} /></section>
          <section className="card"><div className="page-head"><h2>Species coverage</h2><span className="help">Select a species to filter</span></div><BreakdownChart title="Species coverage" photos rows={response.species_counts.map((row) => ({ id: row.species_id, label: row.species_common_name, value: row.trees }))} selected={filters.species_id} onSelect={(id) => changeFilters({ species_id: id === filters.species_id ? "" : id })} /></section>
        </div>

        {!viewer ? <div className="dashboard-two-col dashboard-equal-columns">
          <section className="card"><div className="page-head"><h2>Harvest over time</h2><span className="help">Kilograms harvested</span></div><SeriesChart title="Harvest" series={response.series} lines={harvestLines} unit="kg" monthly={filters.range === "all"} /></section>
          <section className="card"><div className="page-head"><h2>Sales over time</h2><span className="help">Recorded sales in RWF</span></div><SeriesChart title="Sales" series={response.series} lines={salesLines} unit="RWF" monthly={filters.range === "all"} /></section>
        </div> : null}

        {!viewer ? <HarvestSummary refreshKey={response.generated_at} /> : null}
        {role === "admin" || role === "field_officer" ? <HarvestNotices refreshKey={response.generated_at} /> : null}

        {mode === "report" && !viewer && response.value_chain ? <section className="card">
          <div className="page-head"><h2>Nursery & production detail</h2><span className="help">Balances are current; distributions and advice use the selected period</span></div>
          <DashboardKpiGrid>
            <DashboardKpi label="Seedlings in nursery" value={number(response.value_chain.seedlings_remaining)} hint="Current balance" />
            <DashboardKpi label="Seedlings distributed" value={number(response.value_chain.seedlings_distributed)} hint="Selected period" />
            <DashboardKpi label="Harvest not yet sold" value={`${number(response.value_chain.unsold_kg)} kg`} hint="Current balance" />
            <DashboardKpi label="Advice notes" value={number(response.value_chain.advisories)} hint="Selected period" />
          </DashboardKpiGrid>
          <div className="table-wrap compact-table-scroll"><table><caption>Harvest by species · selected period</caption><thead><tr><th scope="col">Species</th><th scope="col">Kilograms</th><th scope="col">Fruit count</th></tr></thead><tbody>{response.value_chain.harvest_by_species.length ? response.value_chain.harvest_by_species.map((row) => <tr key={row.species_common_name}><th scope="row">{row.species_common_name}</th><td>{number(row.harvested_kg)}</td><td>{number(row.harvested_count)}</td></tr>) : <tr><td colSpan={3}>No harvest records in this period.</td></tr>}</tbody></table></div>
        </section> : null}

        <div className="dashboard-two-col dashboard-equal-columns">
          <section className="card"><div className="page-head"><h2>District coverage</h2><span className="help">Select a district to filter</span></div><BreakdownChart title="District coverage" rows={response.districts.map((row) => ({ id: row.district, label: row.district, value: row.trees }))} selected={filters.district} onSelect={(id) => changeFilters({ district: id === filters.district ? "" : id })} /></section>
          <section className="card recent-card" aria-label="Recent plantings">
            <div className="recent-card-head">
              <h2>Recent plantings</h2>
              <span className="compact-badge">Latest {response.recent.length}</span>
            </div>
            {!response.recent.length ? (
              <div className="recent-empty-wrap">
                <DashboardEmpty title="No plantings in this view">Try clearing filters to see more records.</DashboardEmpty>
              </div>
            ) : (
              <div className="recent-audit-scroll">
                <div className="recent-audit-head" aria-hidden="true">
                  <span>Planting</span>
                  <span>{viewer ? "Status" : "Site"}</span>
                  <span className="is-right">Planted</span>
                </div>
                <ul className="recent-audit-list">
                  {response.recent.map((row) => {
                    const health = healthOf(row.status);
                    const qty = row.quantity > 1 ? `${number(row.quantity)} trees` : null;
                    const fullDate = dateLabel(row.planting_date);
                    const age = plantedAge(row.planting_date);
                    const tooltip = (
                      viewer
                        ? [row.title, qty, health.label, fullDate, age]
                        : [row.title, row.public_code, qty, row.site_name, health.label, fullDate, age]
                    ).filter(Boolean).join(" · ");
                    const content = (
                      <>
                        <span className="recent-audit-record">
                          <i className="recent-audit-dot" style={{ background: health.color }} aria-hidden="true" />
                          {!viewer ? <span className="sr-only">{health.label}</span> : null}
                          <strong className="recent-audit-title">{row.title}</strong>
                          {row.quantity > 1 ? <span className="recent-audit-qty">×{number(row.quantity)}</span> : null}
                        </span>
                        <span className="recent-audit-context">
                          {viewer ? health.label : (row.site_name ?? "—")}
                        </span>
                        <span className="recent-audit-date">
                          <time dateTime={row.planting_date || undefined}>{shortDate(row.planting_date)}</time>
                          {!viewer ? (
                            <svg className="recent-audit-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : null}
                        </span>
                      </>
                    );
                    return (
                      <li key={`${row.kind}-${row.id}`}>
                        {viewer ? (
                          <div className="recent-audit-row is-static" title={tooltip}>
                            {content}
                          </div>
                        ) : (
                          <Link className="recent-audit-row" href={recordPath(row.kind, row.id)} title={tooltip}>
                            {content}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>

        {!viewer ? <FollowUpPanel items={response.attention} missingCoordinatesCount={displaySummary.records_missing_coordinates} /> : null}

        <section className="card report-map-card">
          <div className="compact-panel-head">
            <div>
              <h2>Recorded locations</h2>
              <span className="help">{map ? `${number(located.length)} locations shown` : "Locations in this view"}</span>
            </div>
            <button type="button" className="compact-toggle" aria-expanded={mapExpanded} onClick={() => setMapExpanded((open) => !open)}>
              {mapExpanded ? "Compact map" : "Expand map"}
            </button>
          </div>
          <HealthLegend selected={health} onSelect={setHealth} site />
          {activeMapError ? <Banner tone="error">{activeMapError} <button className="inline-link" type="button" onClick={() => invalidMapPath ? setRefresh((value) => value + 1) : setMapRefresh((value) => value + 1)}>{invalidMapPath ? "Retry dashboard" : "Retry map"}</button></Banner> : mapLoading || !map ? <p className="loading" role="status">Loading locations…</p> : !located.length ? <DashboardEmpty title="No markers for this health">Choose another health colour, or clear the filter.</DashboardEmpty> : <div className={`map-frame report-map ${mapExpanded ? "is-expanded" : ""}`}><MapView features={located} selectedId={selectedId} onSelect={setSelectedId} focusOnSelect={false} colorOf={markerColor} popupFor={(feature) => <MapPopup feature={feature} viewer={viewer} />} /></div>}
          {map?.truncated ? <p className="help">Map results are limited. Dashboard totals include all matching records.</p> : null}
        </section>

        <details className="card metric-explanation"><summary>How these figures are counted</summary><p>Recorded trees includes individual trees and planting batch quantities. Survival uses checked individual trees and the latest survival count for each assessed batch; stressed trees count as alive. Unassessed trees are excluded from the survival percentage. Tree health counts surviving trees as healthy, stressed trees as moderate, and dead trees as critical. Planted trees and trees without a condition stay outside that split, and a batch quantity counts as that many trees. Forest stands keep their own estimated tree counts and those estimates are not added to these totals. Field activity records includes lifecycle events, growth measurements, and maintenance. Harvest is measured in kilograms; sales are recorded amounts in RWF.</p></details>
        <p className="help dashboard-updated">Updated {new Date(response.generated_at).toLocaleString("en-GB")} · Recorded data in TreeLife</p>
      </div> : null}
    </div>
  </div>;
}
