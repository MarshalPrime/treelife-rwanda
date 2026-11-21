"use client";

import { useEffect, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { newRequestId } from "@/lib/validation";

type Overview = {
  harvested_kg: number;
  harvested_count: number;
  sold_kg: number;
  sold_count: number;
  sales_rwf: number;
  personal_kg: number;
  personal_count: number;
  stored_kg: number;
  stored_count: number;
  given_kg: number;
  given_count: number;
  other_kg: number;
  other_count: number;
  unassigned_kg: number;
  unassigned_count: number;
  shares: {
    public_code: string;
    target_code: string | null;
    harvested_on: string;
    quantity: number;
    unit: string;
    sold: number;
    personal_consumption: number;
    stored: number;
    given_away: number;
    other: number;
    unassigned: number;
    balanced: boolean;
    recorded_by: string;
  }[];
  history: {
    public_code: string;
    kind: "harvest" | "destination";
    occurred_on: string;
    target_code: string | null;
    quantity: number;
    unit: string;
    purpose: string | null;
    amount_rwf: number | null;
    buyer_name: string | null;
    recorded_by: string;
    harvest_code: string | null;
  }[];
};

type Notice = { id: string; kind: string; summary: string; harvest_code: string | null; created_at: string };
type Feedback = {
  id: string;
  public_code: string;
  harvest_code: string | null;
  kind: string;
  body: string;
  loss_quantity: number | null;
  loss_unit: string | null;
  verified_quantity: number | null;
  recorded_by: string;
  created_at: string;
};

const USE_LABELS: Record<string, string> = {
  sold: "Sold",
  personal_consumption: "Personal consumption",
  stored: "Stored",
  given_away: "Given away",
  other: "Other",
};

const KIND_LABELS: Record<string, string> = {
  experience: "Harvest experience",
  challenge: "Production challenge",
  loss: "Crop loss",
  suggestion: "Suggestion",
  observation: "Visit observation",
  verification: "Verify quantity",
  recommendation: "Recommendation",
};
const FARMER_KINDS = [
  ["experience", "Harvest experience"],
  ["challenge", "Production challenge"],
  ["loss", "Crop loss"],
  ["suggestion", "Suggestion"],
];
const OFFICER_KINDS = [
  ["observation", "Visit observation"],
  ["verification", "Verify quantity"],
  ["challenge", "Challenge seen"],
  ["recommendation", "Recommendation"],
];

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const when = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function measure(kg: number, count: number) {
  const parts = [`${number(kg)} kg`];
  if (count) parts.push(`${number(count)} fruit`);
  return parts.join(" · ");
}

const BARS = [
  { key: "sold_kg", countKey: "sold_count", label: "Sold", color: "#187e73" },
  { key: "personal_kg", countKey: "personal_count", label: "Personal consumption", color: "#3c8f68" },
  { key: "stored_kg", countKey: "stored_count", label: "Stored", color: "#ac741d" },
  { key: "given_kg", countKey: "given_count", label: "Given away", color: "#826293" },
  { key: "other_kg", countKey: "other_count", label: "Other", color: "#5c6b73" },
  { key: "unassigned_kg", countKey: "unassigned_count", label: "Not yet assigned", color: "#d5ddd6" },
] as const;

export function HarvestNotices({ refreshKey = 0 }: { refreshKey?: string | number }) {
  const [rows, setRows] = useState<Notice[] | null>(null);
  useEffect(() => {
    api<Notice[]>("/harvest-notices").then(setRows).catch(() => setRows([]));
  }, [refreshKey]);
  if (!rows?.length) return null;
  return (
    <section className="card compact-notices-card" aria-label="Harvest notices">
      <div className="compact-panel-head">
        <h2>Needs attention</h2>
        <span className="compact-badge warn">{rows.length}</span>
      </div>
      <ul className="record-list compact-record-list">
        {rows.map((row) => <li key={row.id}><strong>{row.harvest_code ?? "Harvest"}</strong> · {row.summary}</li>)}
      </ul>
    </section>
  );
}

export function HarvestSummary({ refreshKey = 0 }: { refreshKey?: string | number }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "distribution" | "history">("overview");
  const [activeBar, setActiveBar] = useState<(typeof BARS)[number]["key"] | null>(null);

  useEffect(() => {
    api<Overview>("/harvests/overview").then(setOverview).catch((caught: Error) => setError(caught.message));
  }, [refreshKey]);
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!overview) return <p className="loading" role="status">Loading harvest summary…</p>;

  const total = BARS.reduce((sum, bar) => sum + overview[bar.key], 0);
  const unbalanced = overview.shares.filter((row) => !row.balanced);
  const selectedBar = activeBar ? BARS.find((bar) => bar.key === activeBar) : null;

  return (
    <section className="card compact-harvest-card" aria-label="Harvest summary">
      <div className="compact-panel-head">
        <div className="compact-panel-title">
          <h2>Harvest summary</h2>
          {unbalanced.length ? <span className="compact-badge warn">{unbalanced.length} unbalanced</span> : null}
        </div>
        <div className="compact-tabs" role="tablist" aria-label="Harvest views">
          <button type="button" role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "is-active" : ""} onClick={() => setTab("overview")}>
            Overview
          </button>
          <button type="button" role="tab" aria-selected={tab === "distribution"} className={tab === "distribution" ? "is-active" : ""} onClick={() => setTab("distribution")}>
            Distribution <small>{overview.shares.length}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")}>
            History <small>{overview.history.length}</small>
          </button>
        </div>
      </div>

      {tab === "overview" ? (
        <div className="harvest-overview-body">
          <div className="harvest-kpi-strip" role="region" aria-label="Harvest totals">
            <article className="harvest-mini-kpi">
              <span>Harvested</span>
              <strong>{measure(overview.harvested_kg, overview.harvested_count)}</strong>
            </article>
            <article className="harvest-mini-kpi">
              <span>Sold</span>
              <strong>{measure(overview.sold_kg, overview.sold_count)}</strong>
            </article>
            <article className="harvest-mini-kpi">
              <span>Revenue</span>
              <strong>{number(overview.sales_rwf)} RWF</strong>
            </article>
            <article className="harvest-mini-kpi">
              <span>Not yet assigned</span>
              <strong>{measure(overview.unassigned_kg, overview.unassigned_count)}</strong>
            </article>
          </div>

          {total > 0 ? (
            <div className="harvest-distribution-interactive">
              <div className="distribution-bar" role="img" aria-label="How harvested kilograms are distributed">
                {BARS.map((bar) => {
                  const pct = (overview[bar.key] / total) * 100;
                  const dimmed = activeBar !== null && activeBar !== bar.key;
                  return (
                    <span
                      key={bar.key}
                      style={{ width: `${pct}%`, background: bar.color, opacity: dimmed ? 0.35 : 1 }}
                      onMouseEnter={() => setActiveBar(bar.key)}
                      onMouseLeave={() => setActiveBar(null)}
                      onClick={() => setActiveBar((current) => (current === bar.key ? null : bar.key))}
                      title={`${bar.label}: ${number(overview[bar.key])} kg (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>
              <div className="harvest-legend-row">
                {BARS.map((bar) => {
                  const pct = total > 0 ? Math.round((overview[bar.key] / total) * 100) : 0;
                  const active = activeBar === bar.key;
                  return (
                    <button
                      key={bar.key}
                      type="button"
                      className={`harvest-legend-chip ${active ? "is-active" : ""}`}
                      onMouseEnter={() => setActiveBar(bar.key)}
                      onMouseLeave={() => setActiveBar(null)}
                      onClick={() => setActiveBar((current) => (current === bar.key ? null : bar.key))}
                    >
                      <i style={{ background: bar.color }} aria-hidden="true" />
                      <span>{bar.label}</span>
                      <b>{measure(overview[bar.key], overview[bar.countKey])}</b>
                      <small>{pct}%</small>
                    </button>
                  );
                })}
              </div>
              {selectedBar ? (
                <p className="help">
                  {selectedBar.label}: {measure(overview[selectedBar.key], overview[selectedBar.countKey])} ({Math.round((overview[selectedBar.key] / total) * 100)}% of harvested kg)
                </p>
              ) : null}
            </div>
          ) : <p className="help">No harvest quantities yet.</p>}

          {unbalanced.length ? (
            <Banner tone="error">{unbalanced.map((row) => row.public_code).join(", ")} does not add up to the harvested quantity.</Banner>
          ) : (
            <p className="help">Sold, eaten, stored, given away, other, and unassigned quantities add up to each harvest.</p>
          )}
        </div>
      ) : null}

      {tab === "distribution" ? (
        <div className="table-wrap compact-table-scroll">
          <table>
            <caption>How each harvest is split</caption>
            <thead>
              <tr>
                <th scope="col">Harvest</th><th scope="col">Tree or batch</th><th scope="col">Date</th><th scope="col">Total</th>
                <th scope="col">Sold</th><th scope="col">Eaten</th><th scope="col">Stored</th><th scope="col">Given</th><th scope="col">Other</th><th scope="col">Left</th><th scope="col">Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {overview.shares.length ? overview.shares.map((row) => (
                <tr key={row.public_code}>
                  <th scope="row">{row.public_code}</th>
                  <td>{row.target_code ?? "—"}</td>
                  <td>{when(row.harvested_on)}</td>
                  <td>{number(row.quantity)} {row.unit}</td>
                  <td>{number(row.sold)}</td>
                  <td>{number(row.personal_consumption)}</td>
                  <td>{number(row.stored)}</td>
                  <td>{number(row.given_away)}</td>
                  <td>{number(row.other)}</td>
                  <td>{number(row.unassigned)}</td>
                  <td>{row.recorded_by}</td>
                </tr>
              )) : <tr><td colSpan={11}>No harvest records yet.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "history" ? (
        overview.history.length ? (
          <ul className="record-list compact-record-list">
            {overview.history.map((item) => (
              <li key={`${item.kind}-${item.public_code}`}>
                {when(item.occurred_on)} · <strong>{item.public_code}</strong> · {item.kind === "harvest" ? `Harvest ${number(item.quantity)} ${item.unit}` : `${USE_LABELS[item.purpose ?? ""] ?? "Use"} ${number(item.quantity)} ${item.unit}`}
                {item.amount_rwf ? ` · ${number(item.amount_rwf)} RWF` : ""}
                {item.buyer_name ? ` · ${item.buyer_name}` : ""}
                {item.harvest_code && item.kind === "destination" ? ` · ${item.harvest_code}` : ""}
                {item.target_code ? ` · ${item.target_code}` : ""}
                {` · ${item.recorded_by}`}
              </li>
            ))}
          </ul>
        ) : <p className="help">No harvest history yet.</p>
      ) : null}
    </section>
  );
}

export function HarvestFeedback({ refreshKey = 0, harvests }: { refreshKey?: string | number; harvests: { id: string; label: string }[] }) {
  const { user, canWrite } = useAuth();
  const kinds = user?.role === "farmer" ? FARMER_KINDS : user?.role === "field_officer" ? OFFICER_KINDS : [];
  const [rows, setRows] = useState<Feedback[]>([]);
  const [kind, setKind] = useState(kinds[0]?.[0] ?? "experience");
  const [harvestId, setHarvestId] = useState("");
  const [body, setBody] = useState("");
  const [lossQuantity, setLossQuantity] = useState("");
  const [verified, setVerified] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    api<Feedback[]>("/harvest-feedback").then(setRows).catch((caught: Error) => setError(caught.message));
  }
  useEffect(load, [refreshKey]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/harvest-feedback", {
        method: "POST",
        body: JSON.stringify({
          harvest_id: harvestId || null,
          kind,
          body,
          loss_quantity: kind === "loss" && lossQuantity ? Number(lossQuantity) : null,
          loss_unit: kind === "loss" && lossQuantity ? "kg" : null,
          verified_quantity: kind === "verification" ? Number(verified) : null,
          client_request_id: newRequestId(),
        }),
      });
      setNotice("Feedback saved.");
      setBody("");
      setLossQuantity("");
      setVerified("");
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The feedback could not be saved.");
    }
  }

  if (!kinds.length && !rows.length) return null;
  return (
    <section className="card">
      <h2>{user?.role === "farmer" ? "Your harvest feedback" : "Field visit notes"}</h2>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite && kinds.length ? (
        <form className="form" onSubmit={save}>
          <Field label="Harvest" name="feedback_harvest" help="Optional, except when you are checking a quantity.">
            <select id="feedback_harvest" value={harvestId} onChange={(event) => setHarvestId(event.target.value)}>
              <option value="">No specific harvest</option>
              {harvests.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Type" name="feedback_kind">
            <select id="feedback_kind" value={kind} onChange={(event) => setKind(event.target.value)}>
              {kinds.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          {kind === "loss" ? <Field label="Loss in kilograms" name="loss_quantity" help="Optional. A crop loss is sent to field officers and administrators."><input id="loss_quantity" value={lossQuantity} onChange={(event) => setLossQuantity(event.target.value)} /></Field> : null}
          {kind === "verification" ? <Field label="Quantity you checked" name="verified_quantity"><input id="verified_quantity" value={verified} onChange={(event) => setVerified(event.target.value)} required /></Field> : null}
          <Field label="Note" name="feedback_body" help="Do not enter a national ID or phone number.">
            <textarea id="feedback_body" value={body} onChange={(event) => setBody(event.target.value)} required />
          </Field>
          <button className="primary" type="submit">Save feedback</button>
        </form>
      ) : null}
      {rows.length ? (
        <ul className="record-list">
          {rows.map((row) => (
            <li key={row.id}>
              {row.public_code} · {KIND_LABELS[row.kind] ?? row.kind}
              {row.harvest_code ? ` · ${row.harvest_code}` : ""} · {row.body}
              {row.loss_quantity != null ? ` · loss ${number(row.loss_quantity)} ${row.loss_unit ?? ""}` : ""}
              {row.verified_quantity != null ? ` · checked ${number(row.verified_quantity)}` : ""}
              {` · ${row.recorded_by}`}
            </li>
          ))}
        </ul>
      ) : <p>No feedback yet.</p>}
    </section>
  );
}
