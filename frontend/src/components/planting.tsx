"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, Pager } from "@/components/AppShell";
import { PlantingForm } from "@/components/forms";
import "@/components/records-ui.css";
import { HealthBadge } from "@/components/tree-card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCoordinates } from "@/lib/coordinates";
import { useI18n } from "@/lib/i18n";
import type { Farmer, Page, PlantingRecord, Site, Species } from "@/lib/types";

const plantingCategories = [
  ["urban", "Urban"],
  ["fruit", "Fruit"],
  ["agroforestry", "Agroforestry"],
  ["other", "Other"],
] as const;

const plantingStatuses = [
  ["surviving", "Healthy"],
  ["stressed", "Needs attention"],
  ["planted", "Not assessed"],
  ["dead", "Dead"],
  ["removed", "Removed"],
  ["unknown", "Unknown"],
] as const;

export function PlantingList({ mode }: { mode: "tree" | "batch" }) {
  const base = mode === "tree" ? "trees" : "batches";
  const { canWrite } = useAuth();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [coordsFilter, setCoordsFilter] = useState<"" | "located" | "missing">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<PlantingRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "10" });
    if (submitted) params.set("q", submitted);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    let active = true;
    setLoading(true);
    api<Page<PlantingRecord>>(`/${base}?${params}`)
      .then((next) => {
        if (active) {
          setData(next);
          setExpandedId(null);
        }
      })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [base, category, page, status, submitted]);

  const visibleItems = data
    ? data.items.filter((record) => {
        if (coordsFilter === "located") return record.has_coordinates;
        if (coordsFilter === "missing") return !record.has_coordinates;
        return true;
      })
    : [];
  const hasActiveFilters = Boolean(query || submitted || category || status || coordsFilter);
  const locatedCount = data ? data.items.filter((record) => record.has_coordinates).length : 0;
  const batchTreeCount = data ? data.items.reduce((sum, record) => sum + record.quantity, 0) : 0;

  return (
    <div className="page rec-page">
      <div className="rec-hero">
        <div className="rec-hero-copy">
          <span className="rec-eyebrow">{mode === "tree" ? "Tree registry" : "Batch registry"}</span>
          <h1>{mode === "tree" ? t("reg.trees") : t("reg.batches")}</h1>
          <p className="lede">
            {mode === "tree"
              ? "Individual trees tracked by code, species, and site."
              : "Grouped plantings tracked together by species and site."}
          </p>
        </div>
        <div className="rec-hero-actions">
          <div className="rec-kpis">
            <div className="rec-kpi">
              <span>{mode === "tree" ? "Total trees" : "Total batches"}</span>
              <strong>{data ? data.total.toLocaleString("en-GB") : "—"}</strong>
            </div>
            <div className="rec-kpi">
              <span>{mode === "tree" ? "Located (page)" : "Trees (page)"}</span>
              <strong>
                {data
                  ? (mode === "tree" ? locatedCount : batchTreeCount).toLocaleString("en-GB")
                  : "—"}
              </strong>
            </div>
          </div>
          {canWrite ? (
            <Link className="primary" href={`/${base}/new`}>
              {mode === "tree" ? "+ New tree" : "+ New batch"}
            </Link>
          ) : null}
        </div>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}

      <section className="rec-panel">
        <form
          className="rec-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSubmitted(query.trim());
          }}
        >
          <div className="rec-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              aria-label="Search records"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, species, or site"
            />
          </div>
          <select
            className="rec-select"
            aria-label="Category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("records.allTypes")}</option>
            {plantingCategories.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            className="rec-select"
            aria-label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("records.allStatuses")}</option>
            {plantingStatuses.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            className="rec-select"
            aria-label="Coordinates"
            value={coordsFilter}
            onChange={(event) => setCoordsFilter(event.target.value as "" | "located" | "missing")}
          >
            <option value="">{t("records.allLocations")}</option>
            <option value="located">{t("records.located")}</option>
            <option value="missing">{t("records.noCoordinates")}</option>
          </select>
          <button className="secondary rec-btn-sm" type="submit">Search</button>
          {hasActiveFilters ? (
            <button
              className="secondary rec-btn-sm"
              type="button"
              onClick={() => {
                setQuery("");
                setSubmitted("");
                setCategory("");
                setStatus("");
                setCoordsFilter("");
                setPage(1);
              }}
            >
              {t("records.clear")}
            </button>
          ) : null}
        </form>

        {loading ? <p className="loading">Loading records…</p> : null}

        {!loading && data && visibleItems.length === 0 ? (
          <div className="rec-empty">
            {hasActiveFilters
              ? "No records match these filters."
              : "No records yet. Register a planting site first, then add a tree or batch."}
          </div>
        ) : null}

        {data && visibleItems.length > 0 ? (
          <div className="rec-scroll">
            <div className="rec-list">
              {visibleItems.map((record) => {
                const isOpen = expandedId === record.id;
                const coords = record.has_coordinates && record.latitude != null && record.longitude != null
                  ? formatCoordinates(record.latitude, record.longitude)
                  : record.has_coordinates
                    ? t("records.located")
                    : t("records.noCoordinates");

                return (
                  <article key={record.id} className={`rec-row${isOpen ? " is-open" : ""}`}>
                    <div className="rec-row-main">
                      <div className="rec-row-info">
                        <div className="rec-row-title">
                          <Link href={`/${base}/${record.id}`}>
                            {record.species_common_name ?? record.public_code}
                          </Link>
                          <span className="rec-code">{record.public_code}</span>
                        </div>
                        <div className="rec-row-meta">
                          <span>{record.site_name ?? "No site"}</span>
                          <span>Planted {record.planting_date}</span>
                          {mode === "batch" ? <span>{record.quantity.toLocaleString("en-GB")} trees</span> : null}
                          <span>{record.has_coordinates ? t("records.located") : t("records.noCoordinates")}</span>
                          {record.farmer_name ? <span>Farmer: {record.farmer_name}</span> : null}
                        </div>
                      </div>
                      <div className="rec-row-side">
                        <span className="rec-badge is-muted">{record.category}</span>
                        <HealthBadge status={record.status} />
                        <button
                          type="button"
                          className="secondary rec-btn-sm"
                          aria-expanded={isOpen}
                          onClick={() => setExpandedId(isOpen ? null : record.id)}
                        >
                          {isOpen ? t("discover.hideDetails") : t("discover.details")}
                        </button>
                        <Link className="secondary rec-btn-sm" href={`/${base}/${record.id}`}>
                          {t("records.open")}
                        </Link>
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="rec-drawer">
                        <div className="rec-drawer-item">
                          <span>Species</span>
                          <strong>{record.species_common_name ?? "—"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Site</span>
                          <strong>{record.site_name ?? "—"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Status</span>
                          <strong><HealthBadge status={record.status} /></strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Quantity</span>
                          <strong>{record.quantity.toLocaleString("en-GB")}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Planted</span>
                          <strong>{record.planting_date}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Coordinates</span>
                          <strong>{coords}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Record</span>
                          <strong><Link href={`/${base}/${record.id}`}>View full record →</Link></strong>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        {data && data.total > 0 ? (
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        ) : null}
      </section>
    </div>
  );
}

export function NewPlanting({ mode }: { mode: "tree" | "batch" }) {
  const router = useRouter();
  const search = useSearchParams();
  const { canWrite, user } = useAuth();
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const base = mode === "tree" ? "trees" : "batches";
  const showFarmerHelp = user?.role === "field_officer";

  useEffect(() => {
    const loads: Promise<unknown>[] = [
      api<Page<Site>>("/sites?page_size=100"),
      api<Species[]>("/species"),
    ];
    if (showFarmerHelp) loads.push(api<Farmer[]>("/farmers"));
    Promise.all(loads).then((results) => {
      const sitePage = results[0] as Page<Site>;
      const speciesList = results[1] as Species[];
      setSites(sitePage.items);
      setSpecies(speciesList);
      if (showFarmerHelp) setFarmers(results[2] as Farmer[]);
    }).catch((caught: Error) => setError(caught.message));
  }, [showFarmerHelp]);

  if (!canWrite) return <Banner tone="error">You do not have permission to register records.</Banner>;
  if (error) return <Banner tone="error">{error}</Banner>;
  return (
    <div className="page">
      <h1>{mode === "tree" ? t("reg.registerTree") : t("reg.registerBatch")}</h1>
      {user?.role === "farmer" ? (
        <p className="help">This record is saved under {user.full_name}. Your name is already on the account, so it is not asked again.</p>
      ) : null}
      <div className="card">
        <PlantingForm
          mode={mode}
          sites={sites}
          species={species}
          farmers={farmers}
          showFarmerHelp={showFarmerHelp}
          initial={{ site_id: search.get("site") ?? "" }}
          onSubmit={async (payload) => {
            const body = { ...payload };
            const named = body.new_farmer as { display_name: string; district: string | null; phone: string | null } | null;
            delete body.new_farmer;
            if (named) {
              const createdFarmer = await api<Farmer>("/farmers", {
                method: "POST",
                body: JSON.stringify({
                  ...named,
                  client_request_id: `${body.client_request_id}-farmer`,
                }),
              });
              body.farmer_id = createdFarmer.id;
            }
            const created = await api<PlantingRecord>(`/${base}`, { method: "POST", body: JSON.stringify(body) });
            router.push(`/${base}/${created.id}?created=1`);
          }}
        />
      </div>
    </div>
  );
}

export function EditPlanting({ mode }: { mode: "tree" | "batch" }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { canWrite } = useAuth();
  const base = mode === "tree" ? "trees" : "batches";
  const [record, setRecord] = useState<PlantingRecord | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<PlantingRecord>(`/${base}/${params.id}`),
      api<Page<Site>>("/sites?page_size=100"),
      api<Species[]>("/species"),
    ]).then(([nextRecord, sitePage, speciesList]) => {
      setRecord(nextRecord);
      setSites(sitePage.items);
      setSpecies(speciesList);
    }).catch((caught: Error) => setError(caught.message));
  }, [base, params.id]);

  if (!canWrite) return <Banner tone="error">You do not have permission to edit records.</Banner>;
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!record) return <p className="loading">Loading record…</p>;
  return (
    <div className="page">
      <h1>Edit {record.public_code}</h1>
      <div className="card">
        <PlantingForm
          editing
          mode={mode}
          sites={sites}
          species={species}
          initial={record}
          onSubmit={async (payload) => {
            await api(`/${base}/${record.id}`, { method: "PATCH", body: JSON.stringify(payload) });
            router.push(`/${base}/${record.id}?updated=1`);
          }}
        />
      </div>
    </div>
  );
}
