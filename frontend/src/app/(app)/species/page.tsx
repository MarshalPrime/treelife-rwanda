"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import "@/components/records-ui.css";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { categories } from "@/lib/labels";
import { choiceLabel, classLabels, growthForms, reviewStatuses, speciesClasses } from "@/lib/species-profile";
import type { Species } from "@/lib/types";

const emptyReview = {
  scientific_name: "",
  common_name: "",
  local_name: "",
  other_local_names: "",
  growth_form: "",
  classifications: [] as string[],
  primary_uses: "",
  harvest_potential: "",
  harvest_type: "",
  rwanda_suitability: "",
  data_source: "",
  review_status: "needs_review",
  category: "other",
  variety_name: "",
};

function reviewBadgeClass(status?: string) {
  if (status === "verified") return "rec-badge";
  if (status === "needs_review") return "rec-badge is-amber";
  if (status === "rejected") return "rec-badge is-danger";
  return "rec-badge is-muted";
}

export default function SpeciesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isAdmin = user?.role === "admin";
  const [species, setSpecies] = useState<Species[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [review, setReview] = useState(emptyReview);
  const [scientificName, setScientificName] = useState("");
  const [commonName, setCommonName] = useState("");
  const [category, setCategory] = useState("fruit");
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  function load() {
    api<Species[]>("/species").then(setSpecies).catch((caught: Error) => setError(caught.message));
  }

  useEffect(load, []);

  function populateReview(item: Species) {
    setReview({
      scientific_name: item.scientific_name,
      common_name: item.common_name,
      local_name: item.local_name ?? "",
      other_local_names: (item.other_local_names ?? []).join(", "),
      growth_form: item.growth_form ?? "",
      classifications: item.classifications ?? [],
      primary_uses: item.primary_uses ?? "",
      harvest_potential: item.harvest_potential == null ? "" : item.harvest_potential ? "yes" : "no",
      harvest_type: item.harvest_type ?? "",
      rwanda_suitability: item.rwanda_suitability ?? "",
      data_source: item.data_source ?? "",
      review_status: item.review_status ?? "needs_review",
      category: item.category,
      variety_name: "",
    });
  }

  function toggleRow(item: Species) {
    if (selectedId === item.id) {
      setSelectedId("");
      return;
    }
    setSelectedId(item.id);
    populateReview(item);
  }

  async function saveReview(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setError(null);
    setMessage(null);
    try {
      await api(`/species/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({
          scientific_name: review.scientific_name,
          common_name: review.common_name,
          local_name: review.local_name || null,
          other_local_names: review.other_local_names.split(",").map((item) => item.trim()).filter(Boolean),
          growth_form: review.growth_form || null,
          classifications: review.classifications,
          primary_uses: review.primary_uses || null,
          harvest_potential: review.harvest_potential === "" ? null : review.harvest_potential === "yes",
          harvest_type: review.harvest_type || null,
          rwanda_suitability: review.rwanda_suitability || null,
          data_source: review.data_source || null,
          review_status: review.review_status,
          category: review.category,
          variety_name: review.variety_name || null,
        }),
      });
      setMessage("Species review saved.");
      setReview((current) => ({ ...current, variety_name: "" }));
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The species could not be saved.");
    }
  }

  async function addSpecies(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api("/species", {
        method: "POST",
        body: JSON.stringify({
          scientific_name: scientificName,
          common_name: commonName,
          category,
        }),
      });
      setScientificName("");
      setCommonName("");
      setShowAdd(false);
      setMessage("Species saved as a draft. Verify it before field agents can select it.");
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The species could not be saved.");
    }
  }

  const verifiedCount = useMemo(
    () => species.filter((item) => item.review_status === "verified").length,
    [species],
  );
  const pendingCount = useMemo(
    () => species.filter((item) => item.review_status !== "verified" && item.review_status !== "rejected").length,
    [species],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return species.filter((item) => {
      if (statusFilter !== "all" && (item.review_status ?? "needs_review") !== statusFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.common_name.toLowerCase().includes(q) ||
        item.scientific_name.toLowerCase().includes(q) ||
        (item.local_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [species, query, statusFilter, categoryFilter]);

  const hasFilters = Boolean(query || statusFilter !== "all" || categoryFilter !== "all");

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
  }

  return (
    <div className="rec-page">
      <div className="rec-hero">
        <div className="rec-hero-copy">
          <span className="rec-eyebrow">Botanical catalog</span>
          <h1>Species reference</h1>
        </div>
        <div className="rec-hero-actions">
          <div className="rec-kpis">
            <div className="rec-kpi">
              <span>Total species</span>
              <strong>{species.length}</strong>
            </div>
            <div className="rec-kpi">
              <span>Verified</span>
              <strong>{verifiedCount}</strong>
            </div>
            <div className="rec-kpi">
              <span>Pending</span>
              <strong>{pendingCount}</strong>
            </div>
          </div>
          {isAdmin ? (
            <button type="button" className={showAdd ? "secondary" : "primary"} onClick={() => setShowAdd((open) => !open)}>
              {showAdd ? "Close form" : "Add species"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}

      {isAdmin && showAdd ? (
        <form className="rec-panel form" onSubmit={addSpecies}>
          <div className="rec-panel-head">
            <h2>Add a species</h2>
            <span className="rec-badge is-muted">Starts as draft</span>
          </div>
          <div className="row">
            <Field label="Scientific name" name="add_scientific">
              <input id="add_scientific" value={scientificName} onChange={(event) => setScientificName(event.target.value)} required />
            </Field>
            <Field label="Common name" name="add_common">
              <input id="add_common" value={commonName} onChange={(event) => setCommonName(event.target.value)} required />
            </Field>
            <Field label="Category" name="add_category">
              <select id="add_category" value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <button className="primary" type="submit">Save species</button>
          </div>
        </form>
      ) : null}

      <div className="rec-panel">
        <div className="rec-toolbar">
          <div className="rec-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              aria-label="Search species"
              placeholder="Search common, scientific, or local name..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="rec-select"
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
          <select
            className="rec-select"
            aria-label="Filter by review status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">{t("records.allStatuses")}</option>
            {reviewStatuses.map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
          {hasFilters ? (
            <button type="button" className="secondary rec-btn-sm" onClick={clearFilters}>
              {t("records.clear")}
            </button>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <div className="rec-empty">
            {species.length === 0 ? "No species have been added." : "No species match the current filters."}
          </div>
        ) : (
          <div className="rec-scroll">
            <div className="rec-list">
              {filtered.map((item) => {
                const isOpen = selectedId === item.id;
                return (
                  <div key={item.id} className={`rec-row${isOpen ? " is-open" : ""}`}>
                    <div className="rec-row-main">
                      <div className="rec-row-info">
                        <div className="rec-row-title">
                          <strong>{item.common_name}</strong>
                          <span className="rec-code">
                            {item.scientific_name}{item.taxon_rank === "genus" ? " (genus)" : ""}
                          </span>
                        </div>
                        <div className="rec-row-meta">
                          <span>{item.local_name || "No local name"}</span>
                          <span>{choiceLabel(growthForms, item.growth_form)}</span>
                          <span>{classLabels(item.classifications)}</span>
                        </div>
                      </div>
                      <div className="rec-row-side">
                        <span className="rec-badge is-muted">{choiceLabel(categories, item.category)}</span>
                        <span className={reviewBadgeClass(item.review_status)}>
                          {choiceLabel(reviewStatuses, item.review_status)}
                        </span>
                        <button
                          type="button"
                          className="secondary rec-btn-sm"
                          aria-expanded={isOpen}
                          onClick={() => toggleRow(item)}
                        >
                          {isOpen ? t("discover.hideDetails") : isAdmin ? t("records.edit") : t("discover.details")}
                        </button>
                      </div>
                    </div>

                  {isOpen ? (
                    <>
                      <div className="rec-drawer">
                        <div className="rec-drawer-item">
                          <span>Local name</span>
                          <strong>{item.local_name || "Not recorded"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Other local names</span>
                          <strong>{item.other_local_names?.length ? item.other_local_names.join(", ") : "Not recorded"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Primary uses</span>
                          <strong>{item.primary_uses || "Not recorded"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Harvest potential</span>
                          <strong>{item.harvest_potential == null ? "Not recorded" : item.harvest_potential ? "Yes" : "No"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Harvest type</span>
                          <strong>{item.harvest_type || "Not recorded"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Rwanda suitability</span>
                          <strong>{item.rwanda_suitability || "Not recorded"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Data source</span>
                          <strong>{item.data_source || "Not recorded"}</strong>
                        </div>
                        <div className="rec-drawer-item">
                          <span>Varieties</span>
                          <strong>
                            {item.varieties && item.varieties.length > 0
                              ? item.varieties.map((v) => v.name).join(", ")
                              : "None recorded"}
                          </strong>
                        </div>
                      </div>

                      {isAdmin ? (
                        <form className="rec-drawer form" style={{ gridTemplateColumns: "1fr" }} onSubmit={saveReview}>
                          <div className="row">
                            <Field label="Common name" name="review_common">
                              <input id="review_common" value={review.common_name} onChange={(event) => setReview({ ...review, common_name: event.target.value })} required />
                            </Field>
                            <Field label="Scientific name" name="review_scientific">
                              <input id="review_scientific" value={review.scientific_name} onChange={(event) => setReview({ ...review, scientific_name: event.target.value })} required />
                            </Field>
                          </div>
                          <div className="row">
                            <Field label="Kinyarwanda / local name" name="review_local">
                              <input id="review_local" value={review.local_name} onChange={(event) => setReview({ ...review, local_name: event.target.value })} />
                            </Field>
                            <Field label="Other local names" name="review_other" help="Separate names with a comma.">
                              <input id="review_other" value={review.other_local_names} onChange={(event) => setReview({ ...review, other_local_names: event.target.value })} />
                            </Field>
                          </div>
                          <div className="row">
                            <Field label="Growth form" name="review_growth">
                              <select id="review_growth" value={review.growth_form} onChange={(event) => setReview({ ...review, growth_form: event.target.value })}>
                                <option value="">Not recorded</option>
                                {growthForms.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                              </select>
                            </Field>
                            <Field label="Review status" name="review_status" help="Only Verified species appear in field registration.">
                              <select id="review_status" value={review.review_status} onChange={(event) => setReview({ ...review, review_status: event.target.value })}>
                                {reviewStatuses.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                              </select>
                            </Field>
                          </div>
                          <fieldset>
                            <legend>Tree classification</legend>
                            {speciesClasses.map(([value, text]) => (
                              <label key={value} className="check-line">
                                <input
                                  type="checkbox"
                                  checked={review.classifications.includes(value)}
                                  onChange={(event) => {
                                    const next = event.target.checked
                                      ? [...review.classifications, value]
                                      : review.classifications.filter((entry) => entry !== value);
                                    setReview({ ...review, classifications: next });
                                  }}
                                /> {text}
                              </label>
                            ))}
                          </fieldset>
                          <div className="row">
                            <Field label="Category" name="review_category">
                              <select id="review_category" value={review.category} onChange={(event) => setReview({ ...review, category: event.target.value })}>
                                {categories.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                              </select>
                            </Field>
                            <Field label="Harvest potential" name="review_harvest_potential">
                              <select id="review_harvest_potential" value={review.harvest_potential} onChange={(event) => setReview({ ...review, harvest_potential: event.target.value })}>
                                <option value="">Not recorded</option>
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                              </select>
                            </Field>
                          </div>
                          <div className="row">
                            <Field label="Harvest type" name="review_harvest_type">
                              <input id="review_harvest_type" value={review.harvest_type} onChange={(event) => setReview({ ...review, harvest_type: event.target.value })} />
                            </Field>
                            <Field label="Primary uses" name="review_uses">
                              <input id="review_uses" value={review.primary_uses} onChange={(event) => setReview({ ...review, primary_uses: event.target.value })} />
                            </Field>
                          </div>
                          <div className="row">
                            <Field label="Rwanda suitability" name="review_suitability">
                              <input id="review_suitability" value={review.rwanda_suitability} onChange={(event) => setReview({ ...review, rwanda_suitability: event.target.value })} />
                            </Field>
                            <Field label="Data source" name="review_source">
                              <input id="review_source" value={review.data_source} onChange={(event) => setReview({ ...review, data_source: event.target.value })} />
                            </Field>
                          </div>
                          <Field label="Add a variety" name="review_variety" help="Saved as its own record for this species.">
                            <input id="review_variety" value={review.variety_name} onChange={(event) => setReview({ ...review, variety_name: event.target.value })} />
                          </Field>
                          <div>
                            <button className="primary rec-btn-sm" type="submit">Save review</button>
                          </div>
                        </form>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
