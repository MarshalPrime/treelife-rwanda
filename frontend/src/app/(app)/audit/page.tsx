"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner, Pager } from "@/components/AppShell";
import "@/components/records-ui.css";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatWhen } from "@/lib/labels";
import type { AuditEntry, Page } from "@/lib/types";

function actionBadgeClass(action: string) {
  const normalized = action.toLowerCase();
  if (normalized === "create") return "rec-badge";
  if (normalized === "update") return "rec-badge is-amber";
  if (normalized === "delete") return "rec-badge is-danger";
  return "rec-badge is-muted";
}

export default function AuditPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [expandedId, setExpandedId] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") return;
    api<Page<AuditEntry>>(`/audit?page=${page}&page_size=20`)
      .then(setData)
      .catch((caught: Error) => setError(caught.message));
  }, [page, user?.role]);

  const actions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.items.map((entry) => entry.action)));
  }, [data]);

  const entityTypes = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.items.map((entry) => entry.entity_type)));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter((entry) => {
      if (actionFilter !== "all" && entry.action !== actionFilter) return false;
      if (entityFilter !== "all" && entry.entity_type !== entityFilter) return false;
      if (!q) return true;
      return (
        entry.entity_type.toLowerCase().includes(q) ||
        entry.entity_id.toLowerCase().includes(q) ||
        (entry.actor_name ?? "").toLowerCase().includes(q) ||
        entry.changed_fields.some((field) => field.toLowerCase().includes(q))
      );
    });
  }, [data, query, actionFilter, entityFilter]);

  const hasFilters = Boolean(query || actionFilter !== "all" || entityFilter !== "all");

  function clearFilters() {
    setQuery("");
    setActionFilter("all");
    setEntityFilter("all");
  }

  if (user?.role !== "admin") {
    return <Banner tone="error">The audit log is limited to administrators.</Banner>;
  }

  return (
    <div className="rec-page">
      <div className="rec-hero">
        <div className="rec-hero-copy">
          <span className="rec-eyebrow">System activity</span>
          <h1>Audit log</h1>
        </div>
        <div className="rec-hero-actions">
          <div className="rec-kpis">
            <div className="rec-kpi">
              <span>On page</span>
              <strong>{data ? data.items.length : "—"}</strong>
            </div>
            <div className="rec-kpi">
              <span>Total entries</span>
              <strong>{data ? data.total : "—"}</strong>
            </div>
          </div>
        </div>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className="rec-panel">
        <div className="rec-toolbar">
          <div className="rec-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              aria-label="Search audit log"
              placeholder="Search actor, record type, ID, or field..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="rec-select"
            aria-label="Filter by action"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
          >
            <option value="all">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
          <select
            className="rec-select"
            aria-label="Filter by entity type"
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.target.value)}
          >
            <option value="all">All record types</option>
            {entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>{entityType}</option>
            ))}
          </select>
          {hasFilters ? (
            <button type="button" className="secondary rec-btn-sm" onClick={clearFilters}>
              {t("records.clear")}
            </button>
          ) : null}
        </div>

        {!data ? (
          <p className="loading">Loading audit log…</p>
        ) : filtered.length === 0 ? (
          <div className="rec-empty">
            {data.items.length === 0 ? "No audit entries yet." : "No audit entries match the current filters."}
          </div>
        ) : (
          <div className="rec-scroll">
            <div className="rec-list">
              {filtered.map((entry) => {
                const isOpen = expandedId === entry.id;
                return (
                  <div key={entry.id} className={`rec-row${isOpen ? " is-open" : ""}`}>
                    <div className="rec-row-main">
                      <div className="rec-row-info">
                        <div className="rec-row-title">
                          <strong>{entry.entity_type}</strong>
                          <span className="rec-code">{entry.entity_id}</span>
                        </div>
                        <div className="rec-row-meta">
                          <span>Actor: {entry.actor_name ?? "—"}</span>
                          <span>
                            {entry.changed_fields.length}{" "}
                            {entry.changed_fields.length === 1 ? "field" : "fields"}
                          </span>
                          <span>{formatWhen(entry.created_at)}</span>
                        </div>
                      </div>
                      <div className="rec-row-side">
                        <span className={actionBadgeClass(entry.action)}>{entry.action}</span>
                        <button
                          type="button"
                          className="secondary rec-btn-sm"
                          aria-expanded={isOpen}
                          onClick={() => setExpandedId(isOpen ? "" : entry.id)}
                        >
                          {isOpen ? t("discover.hideDetails") : t("discover.details")}
                        </button>
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="rec-drawer">
                        <div className="rec-drawer-item">
                          <span>Actor</span>
                          <strong>{entry.actor_name ?? "—"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Action</span>
                          <strong>{entry.action}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Entity type</span>
                          <strong>{entry.entity_type}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Entity ID</span>
                          <strong>{entry.entity_id}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Timestamp</span>
                          <strong>{formatWhen(entry.created_at)}</strong>
                        </div>
                        <div className="rec-drawer-item" style={{ gridColumn: "1 / -1" }}>
                          <span>Changed fields</span>
                          <strong>
                            {entry.changed_fields.length > 0 ? entry.changed_fields.join(", ") : "None recorded"}
                          </strong>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data ? <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} /> : null}
      </div>
    </div>
  );
}
