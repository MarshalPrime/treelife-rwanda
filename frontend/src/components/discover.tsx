"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Banner } from "@/components/AppShell";
import { speciesPhoto } from "@/components/map-cards";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { localizePhrase, useI18n } from "@/lib/i18n";
import "./discover.css";

type Offer = {
  farmer_id: string;
  farmer_name: string;
  species_id: string;
  species_common_name: string;
  farm_label: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
  trees: number;
  unit: "kg" | "count";
  low: number;
  high: number;
  period: string;
};

type Interest = {
  id: string;
  public_code: string;
  farmer_name: string;
  species_common_name: string;
  farm_label: string | null;
  province: string | null;
  district: string | null;
  quantity: number;
  unit: "kg" | "count";
  period: string;
  notes: string | null;
  status: "pending" | "accepted" | "rejected" | "completed" | "cancelled";
  response_note: string | null;
  requester_name: string;
};

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

function amount(low: number, high: number, unit: "kg" | "count", fruit = "fruit") {
  const label = unit === "kg" ? "kg" : fruit;
  const start = number(low);
  const end = number(high);
  return start === end ? `${start} ${label}` : `${start}–${end} ${label}`;
}

function place(parts: Array<string | null>) {
  return parts.filter(Boolean).join(" · ");
}

function offerKey(offer: Offer) {
  return `${offer.farmer_id}:${offer.species_id}:${offer.district ?? ""}:${offer.unit}`;
}

export function BuyerRequests({ refreshKey = 0 }: { refreshKey?: string | number }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Interest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "accepted">("all");
  const { language, t } = useI18n();
  const canAnswer = user?.role === "admin" || user?.role === "field_officer" || user?.role === "farmer";
  const viewer = user?.role === "viewer";
  const fruit = t("forecast.fruitUnit");

  function load() {
    api<Interest[]>("/harvest-interests").then(setRows).catch((caught: Error) => setError(caught.message));
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function update(row: Interest, status: Interest["status"]) {
    setError(null);
    try {
      await api(`/harvest-interests/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, response_note: replies[row.id]?.trim() || null }),
      });
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("discover.updateError"));
    }
  }

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    if (statusFilter === "all") return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [rows, statusFilter]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!rows) return <p className="loading" role="status">{t("discover.loadingRequests")}</p>;
  if (!rows.length) {
    return (
      <div className="discover-empty">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" strokeLinecap="round" />
        </svg>
        <p className="help">{t("discover.noRequests")}</p>
      </div>
    );
  }

  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const acceptedCount = rows.filter((row) => row.status === "accepted").length;

  return (
    <div className="discover-requests-wrap">
      <div className="discover-chips" role="tablist" aria-label="Filter booking requests">
        <button
          type="button"
          role="tab"
          aria-selected={statusFilter === "all"}
          className={`discover-chip${statusFilter === "all" ? " is-active" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          {t("discover.filterAll")} ({number(rows.length)})
        </button>
        {pendingCount > 0 ? (
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "pending"}
            className={`discover-chip${statusFilter === "pending" ? " is-active" : ""}`}
            onClick={() => setStatusFilter("pending")}
          >
            Pending ({number(pendingCount)})
          </button>
        ) : null}
        {acceptedCount > 0 ? (
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "accepted"}
            className={`discover-chip${statusFilter === "accepted" ? " is-active" : ""}`}
            onClick={() => setStatusFilter("accepted")}
          >
            Accepted ({number(acceptedCount)})
          </button>
        ) : null}
      </div>

      <div className="discover-requests">
        {filteredRows.map((row) => (
          <article className="discover-request" key={row.id}>
            <div className="discover-request-top">
              <strong>{row.species_common_name}</strong>
              <span className={`discover-status is-${row.status}`}>{row.status}</span>
            </div>
            <p className="discover-meta">
              {row.farmer_name}
              {row.farm_label ? ` · ${row.farm_label}` : ""}
              {row.district ? ` · ${row.district}` : ""}
            </p>
            <div className="discover-request-stats">
              <span className="discover-stat-pill">
                {number(row.quantity)} {row.unit === "kg" ? "kg" : fruit}
              </span>
              <span className="discover-stat-pill">{localizePhrase(language, row.period)}</span>
              <span className="discover-code">{viewer ? row.public_code : `${row.public_code} · ${row.requester_name}`}</span>
            </div>
            {row.notes ? <p className="discover-note">{row.notes}</p> : null}
            {row.response_note ? <p className="discover-note is-reply">{t("discover.reply", { note: row.response_note })}</p> : null}
            {row.status === "pending" || row.status === "accepted" ? (
              <div className="discover-actions">
                {canAnswer ? (
                  <input
                    aria-label={t("discover.replyLabel", { code: row.public_code })}
                    value={replies[row.id] ?? ""}
                    onChange={(event) => setReplies((current) => ({ ...current, [row.id]: event.target.value }))}
                    placeholder={t("discover.replyHint")}
                  />
                ) : null}
                {canAnswer && row.status === "pending" ? (
                  <button className="primary" type="button" onClick={() => void update(row, "accepted")}>
                    {t("discover.accept")}
                  </button>
                ) : null}
                {canAnswer && row.status === "pending" ? (
                  <button className="secondary" type="button" onClick={() => void update(row, "rejected")}>
                    {t("discover.reject")}
                  </button>
                ) : null}
                {canAnswer && row.status === "accepted" ? (
                  <button className="primary" type="button" onClick={() => void update(row, "completed")}>
                    {t("discover.complete")}
                  </button>
                ) : null}
                {viewer ? (
                  <button className="secondary" type="button" onClick={() => void update(row, "cancelled")}>
                    {t("discover.cancel")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export function DiscoverPage() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [requests, setRequests] = useState<Interest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState<string>("all");
  const [quantity, setQuantity] = useState("");
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const { language, t } = useI18n();
  const viewer = user?.role === "viewer";
  const fruit = t("forecast.fruitUnit");

  function load() {
    api<Offer[]>("/harvest-offers").then(setOffers).catch((caught: Error) => setError(caught.message));
    api<Interest[]>("/harvest-interests").then(setRequests).catch((caught: Error) => setError(caught.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(offer: Offer) {
    const parsed = Number(quantity);
    if (!quantity.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setError(t("discover.quantityError"));
      return;
    }
    if (!period.trim()) {
      setError(t("discover.periodError"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/harvest-interests", {
        method: "POST",
        body: JSON.stringify({
          farmer_id: offer.farmer_id,
          species_id: offer.species_id,
          district: offer.district,
          quantity: parsed,
          unit: offer.unit,
          period: period.trim(),
          notes: notes.trim() || null,
        }),
      });
      setNotice(t("discover.sent"));
      setVersion((value) => value + 1);
      setSelected(null);
      setQuantity("");
      setPeriod("");
      setNotes("");
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("discover.sendError"));
    } finally {
      setSaving(false);
    }
  }

  const mine = requests?.filter((row) => row.status === "pending" || row.status === "accepted").length ?? 0;

  const speciesOptions = useMemo(() => {
    if (!offers) return [];
    const seen = new Map<string, number>();
    for (const offer of offers) {
      seen.set(offer.species_common_name, (seen.get(offer.species_common_name) ?? 0) + 1);
    }
    return Array.from(seen.entries());
  }, [offers]);

  const filteredOffers = useMemo(() => {
    if (!offers) return [];
    const query = search.trim().toLowerCase();
    return offers.filter((offer) => {
      if (speciesFilter !== "all" && offer.species_common_name !== speciesFilter) return false;
      if (!query) return true;
      const haystack = [
        offer.species_common_name,
        offer.farm_label,
        offer.farmer_name,
        offer.province,
        offer.district,
        offer.sector,
        offer.period,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [offers, search, speciesFilter]);

  return (
    <div className="page discover-page">
      <header className="discover-hero">
        <div className="discover-hero-copy">
          <div className="discover-eyebrow-row">
            <span className="discover-eyebrow">{viewer ? t("discover.viewerMark") : t("discover.adminMark")}</span>
            {viewer ? <span className="discover-pill">{t("discover.badge")}</span> : null}
          </div>
          <h1>{t("discover.title")}</h1>
          <p className="lede">{t("discover.lede")}</p>
        </div>

        <div className="discover-kpis" aria-label="Discovery figures">
          <div className="discover-kpi">
            <span>{t("discover.available")}</span>
            <strong>{offers ? number(offers.length) : "…"}</strong>
            <small>{t("discover.fromTrees")}</small>
          </div>
          <div className="discover-kpi">
            <span>{viewer ? t("discover.mine") : t("discover.open")}</span>
            <strong>{requests ? number(mine) : "…"}</strong>
            <small>{t("discover.pending")}</small>
          </div>
        </div>
      </header>

      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className="discover-grid">
        <section className="card discover-panel" aria-label="Explore harvests">
          <div className="discover-panel-head">
            <div>
              <h2>{t("discover.explore")}</h2>
              <p className="help">{t("discover.estimate")}</p>
            </div>
          </div>

          {offers && offers.length > 0 ? (
            <div className="discover-toolbar">
              <div className="discover-search">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("discover.searchPlaceholder")}
                  aria-label={t("discover.searchPlaceholder")}
                />
              </div>

              {speciesOptions.length > 1 ? (
                <div className="discover-chips" role="tablist" aria-label="Filter by species">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={speciesFilter === "all"}
                    className={`discover-chip${speciesFilter === "all" ? " is-active" : ""}`}
                    onClick={() => setSpeciesFilter("all")}
                  >
                    {t("discover.filterAll")} ({number(offers.length)})
                  </button>
                  {speciesOptions.map(([name, count]) => (
                    <button
                      key={name}
                      type="button"
                      role="tab"
                      aria-selected={speciesFilter === name}
                      className={`discover-chip${speciesFilter === name ? " is-active" : ""}`}
                      onClick={() => setSpeciesFilter(name)}
                    >
                      {name} ({number(count)})
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {!offers ? (
            <p className="loading" role="status">{t("discover.loading")}</p>
          ) : offers.length === 0 ? (
            <div className="discover-empty">
              <p className="help">{t("discover.emptyOffers")}</p>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="discover-empty">
              <p className="help">{t("discover.noMatches")}</p>
            </div>
          ) : (
            <div className="discover-list">
              {filteredOffers.map((offer) => {
                const key = offerKey(offer);
                const photo = speciesPhoto(offer.species_common_name);
                const isBookingOpen = viewer && selected === key;
                const isDetailsOpen = !viewer && expanded === key;

                return (
                  <article className={`discover-offer${isBookingOpen || isDetailsOpen ? " is-open" : ""}`} key={key}>
                    <div
                      className="discover-photo"
                      style={photo ? { backgroundImage: `url(${photo})` } : undefined}
                      role="img"
                      aria-label={offer.species_common_name}
                    />
                    <div className="discover-offer-body">
                      <div className="discover-offer-top">
                        <div className="discover-offer-title">
                          <h3>{offer.species_common_name}</h3>
                          <span className="discover-pill">{t("discover.pill")}</span>
                        </div>
                        <strong className="discover-yield">
                          {t("discover.estimated", { amount: amount(offer.low, offer.high, offer.unit, fruit) })}
                        </strong>
                      </div>

                      <p className="discover-meta">
                        {place([offer.farm_label, offer.farmer_name, offer.province, offer.district, offer.sector])}
                      </p>

                      <div className="discover-offer-foot">
                        <div className="discover-stats-inline">
                          <span>{t(offer.trees === 1 ? "discover.treeOne" : "discover.treeMany", { count: number(offer.trees) })}</span>
                          <span aria-hidden="true">·</span>
                          <span>{t("discover.period", { period: localizePhrase(language, offer.period) })}</span>
                        </div>

                        {viewer ? (
                          <button
                            className={isBookingOpen ? "secondary discover-btn-sm" : "primary discover-btn-sm"}
                            type="button"
                            onClick={() => setSelected(isBookingOpen ? null : key)}
                          >
                            {isBookingOpen ? t("discover.close") : t("discover.express")}
                          </button>
                        ) : (
                          <button
                            className="secondary discover-btn-sm"
                            type="button"
                            aria-expanded={isDetailsOpen}
                            onClick={() => setExpanded(isDetailsOpen ? null : key)}
                          >
                            {isDetailsOpen ? t("discover.hideDetails") : t("discover.details")}
                          </button>
                        )}
                      </div>
                    </div>

                    {isDetailsOpen ? (
                      <div className="discover-details-drawer">
                        <div>
                          <span>{t("discover.fromTrees")}</span>
                          <strong>{t(offer.trees === 1 ? "discover.treeOne" : "discover.treeMany", { count: number(offer.trees) })}</strong>
                        </div>
                        <div>
                          <span>{t("discover.period", { period: "" }).replace(/[:\s]+$/, "")}</span>
                          <strong>{localizePhrase(language, offer.period)}</strong>
                        </div>
                        <div>
                          <span>{offer.district || offer.province || "—"}</span>
                          <strong>{offer.farm_label || offer.farmer_name}</strong>
                        </div>
                      </div>
                    ) : null}

                    {isBookingOpen ? (
                      <form
                        className="form discover-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submit(offer);
                        }}
                      >
                        <div className="row">
                          <label>
                            {t("discover.quantity")}
                            <input
                              aria-label={t("discover.quantityLabel")}
                              value={quantity}
                              onChange={(event) => setQuantity(event.target.value)}
                            />
                          </label>
                          <label>
                            {t("discover.collection")}
                            <input
                              aria-label={t("discover.collection")}
                              value={period}
                              onChange={(event) => setPeriod(event.target.value)}
                              placeholder={t("discover.collectionHint")}
                            />
                          </label>
                        </div>
                        <label>
                          {t("discover.notes")}
                          <textarea
                            aria-label={t("discover.notesLabel")}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder={t("discover.notesHint")}
                          />
                        </label>
                        <div className="discover-form-actions">
                          <button className="primary" type="submit" disabled={saving}>
                            {saving ? t("discover.sending") : t("discover.send")}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card discover-panel discover-panel-side" aria-label={t("discover.booking")}>
          <div className="discover-panel-head">
            <h2>{viewer ? t("discover.mine") : t("discover.booking")}</h2>
          </div>
          <BuyerRequests refreshKey={version} />
        </section>
      </div>
    </div>
  );
}

export function BuyerInterestLink() {
  const { t } = useI18n();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    api<Interest[]>("/harvest-interests")
      .then((rows) => setCount(rows.filter((row) => row.status === "pending").length))
      .catch(() => setCount(0));
  }, []);
  return (
    <section className="card" aria-label="Buyer interest">
      <div className="page-head">
        <div>
          <h2>{t("discover.buyerTitle")}</h2>
          <p className="help">{count == null ? t("discover.loadingBuyer") : t(count === 1 ? "discover.pendingOne" : "discover.pendingMany", { count: number(count) })}</p>
        </div>
        <Link className="secondary" href="/discover">{t("discover.openLink")}</Link>
      </div>
    </section>
  );
}
