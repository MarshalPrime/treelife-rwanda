"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { speciesPhoto } from "@/components/map-cards";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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

function amount(low: number, high: number, unit: "kg" | "count") {
  const label = unit === "kg" ? "kg" : "fruit";
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
  const canAnswer = user?.role === "admin" || user?.role === "field_officer" || user?.role === "farmer";
  const viewer = user?.role === "viewer";

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
      setError(caught instanceof Error ? caught.message : "The request could not be updated.");
    }
  }

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!rows) return <p className="loading" role="status">Loading requests…</p>;
  if (!rows.length) return <p className="help">No requests yet.</p>;

  return (
    <div className="discover-requests">
      {rows.map((row) => (
        <article className="discover-request" key={row.id}>
          <div className="page-head">
            <strong>{row.species_common_name}</strong>
            <span className={`discover-status is-${row.status}`}>{row.status}</span>
          </div>
          <p>{row.farmer_name}{row.farm_label ? ` · ${row.farm_label}` : ""}{row.district ? ` · ${row.district}` : ""}</p>
          <p>{number(row.quantity)} {row.unit === "kg" ? "kg" : "fruit"} · {row.period}</p>
          <p className="help">{viewer ? row.public_code : `${row.public_code} · ${row.requester_name}`}</p>
          {row.notes ? <p>{row.notes}</p> : null}
          {row.response_note ? <p>Reply: {row.response_note}</p> : null}
          {row.status === "pending" || row.status === "accepted" ? (
            <div className="discover-actions">
              {canAnswer ? <input aria-label={`Reply to ${row.public_code}`} value={replies[row.id] ?? ""} onChange={(event) => setReplies((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Optional reply" /> : null}
              {canAnswer && row.status === "pending" ? <button className="primary" type="button" onClick={() => void update(row, "accepted")}>Accept</button> : null}
              {canAnswer && row.status === "pending" ? <button className="secondary" type="button" onClick={() => void update(row, "rejected")}>Reject</button> : null}
              {canAnswer && row.status === "accepted" ? <button className="primary" type="button" onClick={() => void update(row, "completed")}>Complete</button> : null}
              {viewer ? <button className="secondary" type="button" onClick={() => void update(row, "cancelled")}>Cancel</button> : null}
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
  const viewer = user?.role === "viewer";

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
      setError("Enter a quantity greater than zero.");
      return;
    }
    if (!period.trim()) {
      setError("Enter the period you want to collect.");
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
      setNotice("Request sent. The farmer can accept or decline it. The forecast is unchanged.");
      setVersion((value) => value + 1);
      setSelected(null);
      setQuantity("");
      setPeriod("");
      setNotes("");
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be sent.");
    } finally {
      setSaving(false);
    }
  }

  const mine = requests?.filter((row) => row.status === "pending" || row.status === "accepted").length ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="help">{viewer ? "TreeLife – Viewer" : "Harvest discovery"}</p>
          <h1>Discover upcoming harvests</h1>
          <p className="lede">Explore expected production and send a request to a farmer before the fruit is picked.</p>
        </div>
        {viewer ? <span className="discover-pill">Third-party account</span> : null}
      </div>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="discover-kpis" aria-label="Discovery figures">
        <div><span>Available forecasts</span><strong>{offers ? number(offers.length) : "…"}</strong><small>From standing trees</small></div>
        <div><span>{viewer ? "My requests" : "Open requests"}</span><strong>{requests ? number(mine) : "…"}</strong><small>Pending or accepted</small></div>
      </div>
      <section className="card" aria-label="Explore harvests">
        <h2>Explore harvests</h2>
        <p className="help">These quantities are estimates. A request does not reserve fruit, and it is not a recorded harvest or a sale.</p>
        {!offers ? <p className="loading" role="status">Loading forecasts…</p> : offers.length ? (
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
                    <p><strong>{amount(offer.low, offer.high, offer.unit)} estimated</strong></p>
                    <p className="discover-meta">{number(offer.trees)} {offer.trees === 1 ? "tree" : "trees"} · Expected: {offer.period}</p>
                    <span className="discover-pill">Forecast</span>
                    {viewer ? <div className="discover-actions"><button className="secondary" type="button" onClick={() => setSelected(selected === key ? null : key)}>{selected === key ? "Close" : "Express interest"}</button></div> : null}
                  </div>
                  {viewer && selected === key ? (
                    <form className="form discover-form" onSubmit={(event) => { event.preventDefault(); void submit(offer); }}>
                      <div className="row">
                        <label>Quantity<input aria-label="Quantity to source" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
                        <label>Collection period<input aria-label="Collection period" value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="For example, June to August" /></label>
                      </div>
                      <label>Notes<textarea aria-label="Request notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Quantity needs, collection point, or other requirements" /></label>
                      <button className="primary" type="submit" disabled={saving}>{saving ? "Sending…" : "Send request"}</button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : <p className="help">No expected harvest is ready to share yet.</p>}
      </section>
      <section className="card" aria-label="Booking requests">
        <h2>{viewer ? "My requests" : "Booking requests"}</h2>
        <BuyerRequests refreshKey={version} />
      </section>
    </div>
  );
}

export function BuyerInterestLink() {
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
          <h2>Buyer interest</h2>
          <p className="help">{count == null ? "Loading requests…" : `${number(count)} pending ${count === 1 ? "request" : "requests"}. Requests stay separate from recorded harvests and sales.`}</p>
        </div>
        <Link className="secondary" href="/discover">Open harvest discovery</Link>
      </div>
    </section>
  );
}
