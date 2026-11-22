"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!rows) return <p className="loading" role="status">{t("discover.loadingRequests")}</p>;
  if (!rows.length) return <p className="help">{t("discover.noRequests")}</p>;

  return (
    <div className="discover-requests">
      {rows.map((row) => (
        <article className="discover-request" key={row.id}>
          <div className="page-head">
            <strong>{row.species_common_name}</strong>
            <span className={`discover-status is-${row.status}`}>{row.status}</span>
          </div>
          <p>{row.farmer_name}{row.farm_label ? ` · ${row.farm_label}` : ""}{row.district ? ` · ${row.district}` : ""}</p>
          <p>{number(row.quantity)} {row.unit === "kg" ? "kg" : fruit} · {localizePhrase(language, row.period)}</p>
          <p className="help">{viewer ? row.public_code : `${row.public_code} · ${row.requester_name}`}</p>
          {row.notes ? <p>{row.notes}</p> : null}
          {row.response_note ? <p>{t("discover.reply", { note: row.response_note })}</p> : null}
          {row.status === "pending" || row.status === "accepted" ? (
            <div className="discover-actions">
              {canAnswer ? <input aria-label={t("discover.replyLabel", { code: row.public_code })} value={replies[row.id] ?? ""} onChange={(event) => setReplies((current) => ({ ...current, [row.id]: event.target.value }))} placeholder={t("discover.replyHint")} /> : null}
              {canAnswer && row.status === "pending" ? <button className="primary" type="button" onClick={() => void update(row, "accepted")}>{t("discover.accept")}</button> : null}
              {canAnswer && row.status === "pending" ? <button className="secondary" type="button" onClick={() => void update(row, "rejected")}>{t("discover.reject")}</button> : null}
              {canAnswer && row.status === "accepted" ? <button className="primary" type="button" onClick={() => void update(row, "completed")}>{t("discover.complete")}</button> : null}
              {viewer ? <button className="secondary" type="button" onClick={() => void update(row, "cancelled")}>{t("discover.cancel")}</button> : null}
            </div>
          ) : null}
        </article>
      ))}
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="help">{viewer ? t("discover.viewerMark") : t("discover.adminMark")}</p>
          <h1>{t("discover.title")}</h1>
          <p className="lede">{t("discover.lede")}</p>
        </div>
        {viewer ? <span className="discover-pill">{t("discover.badge")}</span> : null}
      </div>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="discover-kpis" aria-label="Discovery figures">
        <div><span>{t("discover.available")}</span><strong>{offers ? number(offers.length) : "…"}</strong><small>{t("discover.fromTrees")}</small></div>
        <div><span>{viewer ? t("discover.mine") : t("discover.open")}</span><strong>{requests ? number(mine) : "…"}</strong><small>{t("discover.pending")}</small></div>
      </div>
      <section className="card" aria-label="Explore harvests">
        <h2>{t("discover.explore")}</h2>
        <p className="help">{t("discover.estimate")}</p>
        {!offers ? <p className="loading" role="status">{t("discover.loading")}</p> : offers.length ? (
          <div className="discover-list">
            {offers.map((offer) => {
              const key = offerKey(offer);
              const photo = speciesPhoto(offer.species_common_name);
              return (
                <article className="discover-offer" key={key}>
                  <div className="discover-photo" style={photo ? { backgroundImage: `url(${photo})` } : undefined} role="img" aria-label={offer.species_common_name} />
                  <div>
                    <h3>{offer.species_common_name}</h3>
                    <p className="discover-meta">{place([offer.farm_label, offer.farmer_name, offer.province, offer.district, offer.sector])}</p>
                    <p><strong>{t("discover.estimated", { amount: amount(offer.low, offer.high, offer.unit, fruit) })}</strong></p>
                    <p className="discover-meta">{t(offer.trees === 1 ? "discover.treeOne" : "discover.treeMany", { count: number(offer.trees) })} · {t("discover.period", { period: localizePhrase(language, offer.period) })}</p>
                    <span className="discover-pill">{t("discover.pill")}</span>
                    {viewer ? <div className="discover-actions"><button className="secondary" type="button" onClick={() => setSelected(selected === key ? null : key)}>{selected === key ? t("discover.close") : t("discover.express")}</button></div> : null}
                  </div>
                  {viewer && selected === key ? (
                    <form className="form discover-form" onSubmit={(event) => { event.preventDefault(); void submit(offer); }}>
                      <div className="row">
                        <label>{t("discover.quantity")}<input aria-label={t("discover.quantityLabel")} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
                        <label>{t("discover.collection")}<input aria-label={t("discover.collection")} value={period} onChange={(event) => setPeriod(event.target.value)} placeholder={t("discover.collectionHint")} /></label>
                      </div>
                      <label>{t("discover.notes")}<textarea aria-label={t("discover.notesLabel")} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("discover.notesHint")} /></label>
                      <button className="primary" type="submit" disabled={saving}>{saving ? t("discover.sending") : t("discover.send")}</button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : <p className="help">{t("discover.emptyOffers")}</p>}
      </section>
      <section className="card" aria-label={t("discover.booking")}>
        <h2>{viewer ? t("discover.mine") : t("discover.booking")}</h2>
        <BuyerRequests refreshKey={version} />
      </section>
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
