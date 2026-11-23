"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner, Pager } from "@/components/AppShell";
import "@/components/records-ui.css";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { label } from "@/lib/labels";
import type { Page, Site } from "@/lib/types";

export default function SitesPage() {
  const { canWrite } = useAuth();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState("");
  const [coordsFilter, setCoordsFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [data, setData] = useState<Page<Site> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "10" });
    if (submitted) params.set("q", submitted);
    if (status) params.set("status", status);
    let active = true;
    setLoading(true);
    setError(null);
    api<Page<Site>>(`/sites?${params}`)
      .then((next) => { if (active) setData(next); })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, status, submitted]);

  const visibleItems = (data?.items ?? []).filter((site) => {
    if (coordsFilter === "located") return site.has_coordinates;
    if (coordsFilter === "missing") return !site.has_coordinates;
    return true;
  });

  const hasFilters = Boolean(query || submitted || status || coordsFilter);
  const empty = !loading && (data?.total === 0 || (Boolean(data) && visibleItems.length === 0));

  function clearFilters() {
    setQuery("");
    setSubmitted("");
    setStatus("");
    setCoordsFilter("");
    setPage(1);
  }

  return (
    <div className="rec-page">
      <header className="rec-hero">
        <div className="rec-hero-copy">
          <span className="rec-eyebrow">Registry</span>
          <h1>Planting sites</h1>
          <p className="lede">Registered farms, plots, and institutional planting locations.</p>
        </div>
        <div className="rec-hero-actions">
          <div className="rec-kpis" aria-label="Site summary">
            <div className="rec-kpi">
              <span>Total sites</span>
              <strong>{data ? data.total.toLocaleString() : "—"}</strong>
            </div>
          </div>
          {canWrite ? <Link className="primary" href="/sites/new">+ New site</Link> : null}
        </div>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}

      <section className="rec-panel" aria-label="Sites list">
        <form
          className="rec-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSubmitted(query);
          }}
        >
          <div className="rec-search">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
            </svg>
            <input
              aria-label="Search sites"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, code, or place"
            />
          </div>
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
            <option value="active">{label("active")}</option>
            <option value="inactive">{label("inactive")}</option>
          </select>
          <select
            className="rec-select"
            aria-label="Coordinates"
            value={coordsFilter}
            onChange={(event) => setCoordsFilter(event.target.value)}
          >
            <option value="">{t("records.allLocations")}</option>
            <option value="located">{t("records.located")}</option>
            <option value="missing">{t("records.noCoordinates")}</option>
          </select>
          {hasFilters ? (
            <button className="secondary rec-btn-sm" type="button" onClick={clearFilters}>
              {t("records.clear")}
            </button>
          ) : null}
        </form>

        {loading ? <p className="loading">Loading sites…</p> : null}

        {empty ? (
          <div className="rec-empty">
            {submitted || status || coordsFilter ? "No sites match these filters." : "No planting sites yet."}
          </div>
        ) : null}

        {data && visibleItems.length > 0 ? (
          <>
            <div className="rec-scroll">
              <div className="rec-list">
                {visibleItems.map((site) => {
                  const isOpen = expandedId === site.id;
                  const locationParts = [site.province, site.district, site.sector].filter(Boolean);
                  const locationText = locationParts.length > 0 ? locationParts.join(" · ") : "—";
                  const coordsText =
                    site.has_coordinates && site.latitude != null && site.longitude != null
                      ? `${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`
                      : site.has_coordinates
                        ? t("records.located")
                        : t("records.noCoordinates");

                  return (
                    <article className={`rec-row${isOpen ? " is-open" : ""}`} key={site.id}>
                      <div className="rec-row-main">
                        <div className="rec-row-info">
                          <div className="rec-row-title">
                            <Link href={`/sites/${site.id}`}>{site.name}</Link>
                            <span className="rec-code">{site.public_code}</span>
                          </div>
                          <div className="rec-row-meta">
                            <span>{site.district || site.province || "—"}</span>
                            <span>{label(site.site_type)}</span>
                          </div>
                        </div>
                        <div className="rec-row-side">
                          <span className={site.status === "active" ? "rec-badge" : "rec-badge is-muted"}>
                            {label(site.status)}
                          </span>
                          <span className={site.has_coordinates ? "rec-badge" : "rec-badge is-amber"}>
                            {site.has_coordinates ? t("records.located") : t("records.noCoordinates")}
                          </span>
                          <button
                            className="secondary rec-btn-sm"
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setExpandedId(isOpen ? null : site.id)}
                          >
                            {isOpen ? t("discover.hideDetails") : t("discover.details")}
                          </button>
                          <Link className="ghost rec-btn-sm" href={`/sites/${site.id}`}>
                            {t("records.open")}
                          </Link>
                        </div>
                      </div>
                      {isOpen ? (
                        <div className="rec-drawer">
                          <div className="rec-drawer-item">
                            <span>Location</span>
                            <strong>{locationText}</strong>
                          </div>
                          <div className="rec-drawer-item">
                            <span>Coordinates</span>
                            <strong>{coordsText}</strong>
                          </div>
                          <div className="rec-drawer-item">
                            <span>Data origin</span>
                            <strong>{label(site.data_origin)}</strong>
                          </div>
                          <div className="rec-drawer-item">
                            <span>Record</span>
                            <strong>
                              <Link href={`/sites/${site.id}`}>Open site →</Link>
                            </strong>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
            <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        ) : null}
      </section>
    </div>
  );
}
