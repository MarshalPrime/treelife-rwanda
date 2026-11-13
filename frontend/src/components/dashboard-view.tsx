"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Banner } from "@/components/AppShell";
import { CarbonOverview } from "@/components/carbon-dashboard";
import { BreakdownChart, SeriesChart, harvestLines, plantingLines, salesLines } from "@/components/dashboard-charts";
import { DashboardEmpty, DashboardKpi, DashboardKpiGrid, DashboardSkeleton } from "@/components/dashboard-ui";
import { HarvestNotices, HarvestSummary } from "@/components/harvest-insights";
import { HealthLegend, MapPopup, TreeCard } from "@/components/tree-card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { markerColor, matchesHealth, plantedAge, type HealthId } from "@/lib/health";
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
  const counts = [summary.healthy_trees ?? 0, summary.moderate_trees ?? 0, summary.critical_trees ?? 0];
  const shares = healthShares(counts);
  const rows = [
    { label: "Healthy", color: "#1f8a4c", count: counts[0], share: shares[0] },
    { label: "Moderate", color: "#c49212", count: counts[1], share: shares[1] },
    { label: "Critical", color: "#c44536", count: counts[2], share: shares[2] },
  ];
  const total = counts.reduce((sum, count) => sum + count, 0);
  return <section className="card tree-health" aria-label="Tree health">
    <h2>Tree health</h2>
    <ul className="tree-health-list">
      {rows.map((row) => (
        <li key={row.label} className="tree-health-row">
          <span className="tree-health-name"><i style={{ background: row.color }} aria-hidden="true" />{row.label}</span>
          <strong>{row.share}%</strong>
          <div className="tree-health-track" role="meter" aria-valuenow={row.share} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.label}, ${number(row.count)} trees`}>
            <span style={{ width: `${row.share}%`, background: row.color }} />
          </div>
        </li>
      ))}
    </ul>
    <p className="help">{total ? `${number(counts[0])} surviving, ${number(counts[1])} stressed, and ${number(counts[2])} dead. The percentages are their share of trees with a recorded condition.` : "No tree has a recorded condition yet. Planted trees stay out of these percentages."}</p>
  </section>;
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

function CountingNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    const end = value;
    from.current = end;
    if (start === end) {
      setShown(end);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
  return <>{shown.toLocaleString("en-GB")}</>;
}

function LiveTreeTotal({ value }: { value: number }) {
  const previous = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
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
    const timer = window.setTimeout(() => setDelta(null), 4000);
    return () => window.clearTimeout(timer);
  }, [value]);
  return (
    <div className="dashboard-live-total">
      <p className="live-mark">Live · updated {programmeClock(now)}</p>
      <strong><CountingNumber value={value} /></strong>
      <span>Trees standing</span>
      {delta != null ? (
        <p className={`dashboard-live-delta ${delta > 0 ? "up" : "down"}`}>
          {delta > 0 ? `+${delta.toLocaleString("en-GB")}` : delta.toLocaleString("en-GB")} {Math.abs(delta) === 1 ? "tree" : "trees"}
        </p>
      ) : (
        <p className="help">Living trees across the programme. A dead or removed tree leaves this total.</p>
      )}
    </div>
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
  const response = result?.path === dataPath ? result.data : null;
  const error = requestError?.path === dataPath ? requestError.message : null;
  const role = response?.role ?? user?.role;
  const viewer = role === "viewer";
  const writer = role === "farmer" || role === "field_officer";

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
    const pull = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      quietNext.current = true;
      mapQuiet.current = true;
      setRefresh((value) => value + 1);
      setMapRefresh((value) => value + 1);
    };
    const timer = window.setInterval(pull, 10000);
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
  }, [user?.role, mode]);

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

  return <div className="page report-page dashboard-view">
    <div className="page-head dashboard-heading">
      <div><p className="dashboard-eyebrow">A growing future</p><h1>{title}</h1><p className="lede">{mode === "report" ? "Explore planting, fieldwork, and production over time." : viewer ? "Explore the trees and species recorded across Rwanda." : "Follow your trees from planting to care, harvest, and sale."}</p></div>
      <div className="dashboard-quick-actions">
        {writer ? <><Link className="primary" href="/trees/new">+ Register a tree</Link><Link className="secondary" href="/batches/new">Register a batch</Link><Link className="secondary" href="/sites/new">Add a site</Link></> : viewer ? <Link className="primary" href="/trees">Browse trees</Link> : role === "admin" ? <><Link className="secondary" href="/analytics">Reports</Link><Link className="secondary" href="/audit">Audit log</Link></> : null}
      </div>
    </div>

    <section className="dashboard-toolbar" aria-label="Dashboard filters">
      <label htmlFor="dashboard-range">Period<select id="dashboard-range" value={filters.range} onChange={(event) => changeFilters({ range: event.target.value as DashboardRange })}>{ranges.map((range) => <option value={range.value} key={range.value}>{range.label}</option>)}</select></label>
      <label htmlFor="dashboard-district">District<select id="dashboard-district" value={filters.district} disabled={!options} onChange={(event) => changeFilters({ district: event.target.value })}><option value="">All districts</option>{options?.districts.map((district) => <option key={district} value={district}>{district}</option>)}</select></label>
      <label htmlFor="dashboard-species">Species<select id="dashboard-species" value={filters.species_id} disabled={!options} onChange={(event) => changeFilters({ species_id: event.target.value })}><option value="">All species</option>{options?.species.map((species) => <option key={species.id} value={species.id}>{species.common_name}</option>)}</select></label>
      <button className="ghost" type="button" onClick={reset}>Reset filters</button>
      <button className="ghost" type="button" onClick={() => { setRefresh((value) => value + 1); setMapRefresh((value) => value + 1); }} disabled={loading}>Refresh dashboard</button>
      <p className="help">District and species apply to all panels. The period applies to trends, harvest, and sales.{user?.role === "admin" && mode === "dashboard" ? " The figures, charts, and map update on their own while the connection is up." : ""}</p>
    </section>
    <div className="filter-chips" aria-label="Active filters">
      {filters.district ? <button type="button" aria-label="Clear district filter" onClick={() => changeFilters({ district: "" })}>{filters.district} <span aria-hidden="true">×</span></button> : null}
      {filters.species_id ? <button type="button" aria-label="Clear species filter" onClick={() => changeFilters({ species_id: "" })}>{speciesLabel} <span aria-hidden="true">×</span></button> : null}
    </div>

    {error ? <Banner tone="error">{error} <button className="inline-link" type="button" onClick={() => setRefresh((value) => value + 1)}>Retry dashboard</button></Banner> : null}
    {(!response && !error) || (loading && !response) ? <DashboardSkeleton /> : null}
    {response && !error ? <div className="dashboard-body" aria-busy={loading}>
      {response.includes_demonstration ? <Banner tone="warning">Demonstration data is included in this view.</Banner> : null}
      {role === "farmer" && !response.linked ? <Banner tone="warning">Your login is not linked to a farmer record yet. Ask your field officer to link your household.</Banner> : null}
      <section aria-label="Key figures" className="dashboard-figures">
        {role === "admin" && mode === "dashboard" ? <LiveTreeTotal value={response.summary.standing_trees ?? response.summary.recorded_trees} /> : null}
        <div className="section-caption"><h2>At a glance</h2><span className="help">{role === "admin" && mode === "dashboard" ? "Live while the connection is up · production is for the selected period" : "Inventory is current · production is for the selected period"}</span></div>
        <DashboardKpiGrid>
          {role === "admin" && mode === "dashboard" ? null : <DashboardKpi label="Trees recorded" value={number(response.summary.recorded_trees)} hint="Current individual trees + batch quantities" />}
          {viewer ? <><DashboardKpi label="Species" value={number(response.summary.species)} hint="In this view" /><DashboardKpi label="Districts" value={number(response.summary.districts)} hint="With recorded plantings" /></> : <>
            <DashboardKpi label="Survival rate" value={response.summary.survival_percent == null ? "Not assessed" : `${response.summary.survival_percent}%`} hint={`${number(response.summary.checked_trees)} trees checked · latest assessments`} />
            <DashboardKpi label="Death rate" value={response.summary.checked_trees === 0 ? "Not assessed" : `${Math.round(100 * (response.summary.checked_trees - response.summary.surviving_trees) / response.summary.checked_trees)}%`} hint={`${number(Math.max(0, response.summary.checked_trees - response.summary.surviving_trees))} not surviving · same checks`} />
            {role !== "farmer" ? <DashboardKpi label={role === "field_officer" ? "Farmers helped" : "Farmers"} value={number(response.summary.farmers)} hint="In your current scope" /> : null}
            <DashboardKpi label="Planting sites" value={number(response.summary.sites)} hint="Current sites" />
            <DashboardKpi label="Harvest" value={`${number(response.summary.harvested_kg ?? 0)} kg`} hint="Selected period" />
            <DashboardKpi label="Sales" value={`${number(response.summary.sales_rwf ?? 0)} RWF`} hint="Selected period" />
          </>}
        </DashboardKpiGrid>
      </section>

      <TreeHealth summary={response.summary} />
      {(role === "admin" || viewer) && mode === "dashboard" ? <CarbonOverview /> : null}

      <div className="dashboard-two-col">
        <section className="card"><div className="page-head"><h2>Planting & field activity</h2><span className="help">{dateLabel(response.filters.start_date)} – {dateLabel(response.filters.end_date)}</span></div><SeriesChart title="Planting and field activity" series={response.series} lines={plantingLines} unit="records" monthly={filters.range === "all"} /></section>
        <section className="card"><div className="page-head"><h2>Species coverage</h2><span className="help">Select a species to explore</span></div><BreakdownChart title="Species coverage" photos rows={response.species_counts.map((row) => ({ id: row.species_id, label: row.species_common_name, value: row.trees }))} selected={filters.species_id} onSelect={(id) => changeFilters({ species_id: id === filters.species_id ? "" : id })} /></section>
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
        <div className="table-wrap"><table><caption>Harvest by species · selected period</caption><thead><tr><th scope="col">Species</th><th scope="col">Kilograms</th><th scope="col">Fruit count</th></tr></thead><tbody>{response.value_chain.harvest_by_species.length ? response.value_chain.harvest_by_species.map((row) => <tr key={row.species_common_name}><th scope="row">{row.species_common_name}</th><td>{number(row.harvested_kg)}</td><td>{number(row.harvested_count)}</td></tr>) : <tr><td colSpan={3}>No harvest records in this period.</td></tr>}</tbody></table></div>
      </section> : null}
      <div className="dashboard-two-col dashboard-equal-columns">
        <section className="card"><div className="page-head"><h2>District coverage</h2><span className="help">Current trees by district</span></div><BreakdownChart title="District coverage" rows={response.districts.map((row) => ({ id: row.district, label: row.district, value: row.trees }))} selected={filters.district} onSelect={(id) => changeFilters({ district: id === filters.district ? "" : id })} /></section>
        <section className="card">
          <div className="page-head"><h2>Recent plantings</h2><span className="help">Latest {response.recent.length} records</span></div>
          {!response.recent.length ? <DashboardEmpty title="No plantings in this view">Try clearing filters to see more records.</DashboardEmpty> : (
            <div className="tree-card-grid">
              {response.recent.map((row) => (
                <TreeCard
                  key={`${row.kind}-${row.id}`}
                  href={viewer ? undefined : recordPath(row.kind, row.id)}
                  code={row.public_code}
                  species={row.title}
                  status={row.status}
                  place={row.site_name}
                  when={dateLabel(row.planting_date)}
                  age={plantedAge(row.planting_date)}
                  detail={row.quantity > 1 ? `${number(row.quantity)} trees` : null}
                  action={row.kind === "batch" ? "View batch" : "View tree"}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      {!viewer ? <section className="card">
        <div className="page-head"><div><h2>Follow-up</h2><p className="help">{number(response.summary.records_missing_coordinates)} records without coordinates</p></div><span className="help">Stressed trees and location gaps · up to 20 items</span></div>
        {!response.attention.length ? <DashboardEmpty title="No follow-up flagged">No records need follow-up in the current view.</DashboardEmpty> : (
          <div className="tree-card-grid">
            {response.attention.map((row) => (
              <TreeCard
                key={`${row.kind}-${row.id}-${row.reason}`}
                href={recordPath(row.kind, row.id)}
                code={row.public_code}
                species={row.title}
                status={row.reason === "stressed" ? "stressed" : row.status}
                place={row.place}
                detail={row.reason === "stressed" ? "Needs a visit" : "Missing coordinates"}
                action="Open record"
              />
            ))}
          </div>
        )}
      </section> : null}
      <section className="card report-map-card">
        <div className="page-head"><h2>Recorded locations</h2><span className="help">{map ? `${number(located.length)} locations shown` : "Locations in this view"}</span></div>
        <p className="help">Shaded areas are forest stands. A pin marks each center. Open the pin to see the coordinates. Dots are trees, batches, and sites.</p>
        <HealthLegend selected={health} onSelect={setHealth} site />
        {activeMapError ? <Banner tone="error">{activeMapError} <button className="inline-link" type="button" onClick={() => invalidMapPath ? setRefresh((value) => value + 1) : setMapRefresh((value) => value + 1)}>{invalidMapPath ? "Retry dashboard" : "Retry map"}</button></Banner> : mapLoading || !map ? <p className="loading" role="status">Loading locations…</p> : !located.length ? <DashboardEmpty title="No markers for this health">Choose another health colour, or clear the filter.</DashboardEmpty> : <div className="map-frame report-map"><MapView features={located} selectedId={selectedId} onSelect={setSelectedId} focusOnSelect={false} colorOf={markerColor} popupFor={(feature) => <MapPopup feature={feature} />} /></div>}
        {map?.truncated ? <p className="help">Map results are limited. Dashboard totals include all matching records.</p> : null}
      </section>
      <details className="card metric-explanation"><summary>How these figures are counted</summary><p>Recorded trees includes individual trees and planting batch quantities. Survival uses checked individual trees and the latest survival count for each assessed batch; stressed trees count as alive. Unassessed trees are excluded from the survival percentage. Tree health counts surviving trees as healthy, stressed trees as moderate, and dead trees as critical. Planted trees and trees without a condition stay outside that split, and a batch quantity counts as that many trees. Forest stands keep their own estimated tree counts and those estimates are not added to these totals. Field activity records includes lifecycle events, growth measurements, and maintenance. Harvest is measured in kilograms; sales are recorded amounts in RWF.</p></details>
      <p className="help dashboard-updated">Updated {new Date(response.generated_at).toLocaleString("en-GB")} · Recorded data in TreeLife</p>
    </div> : null}
  </div>;
}
