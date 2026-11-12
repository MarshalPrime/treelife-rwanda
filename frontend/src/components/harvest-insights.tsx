"use client";

import { useEffect, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { DashboardKpi, DashboardKpiGrid } from "@/components/dashboard-ui";
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
  { key: "sold_kg", label: "Sold", color: "#187e73" },
  { key: "personal_kg", label: "Personal consumption", color: "#3c8f68" },
  { key: "stored_kg", label: "Stored", color: "#ac741d" },
  { key: "given_kg", label: "Given away", color: "#826293" },
  { key: "other_kg", label: "Other", color: "#5c6b73" },
  { key: "unassigned_kg", label: "Not yet assigned", color: "#d5ddd6" },
] as const;

export function HarvestNotices({ refreshKey = 0 }: { refreshKey?: string | number }) {
  const [rows, setRows] = useState<Notice[] | null>(null);
  useEffect(() => {
    api<Notice[]>("/harvest-notices").then(setRows).catch(() => setRows([]));
  }, [refreshKey]);
  if (!rows?.length) return null;
  return (
    <section className="card" aria-label="Harvest notices">
      <h2>Needs attention</h2>
      <ul className="record-list">
        {rows.map((row) => <li key={row.id}><strong>{row.harvest_code ?? "Harvest"}</strong> · {row.summary}</li>)}
      </ul>
    </section>
  );
}

export function HarvestSummary({ refreshKey = 0 }: { refreshKey?: string | number }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Overview>("/harvests/overview").then(setOverview).catch((caught: Error) => setError(caught.message));
  }, [refreshKey]);
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!overview) return <p className="loading" role="status">Loading harvest summary…</p>;
  const total = BARS.reduce((sum, bar) => sum + overview[bar.key], 0);
  const unbalanced = overview.shares.filter((row) => !row.balanced);
  return (
    <>
      <section className="card" aria-label="Harvest summary">
        <h2>Harvest summary</h2>
        <DashboardKpiGrid label="Harvest totals">
          <DashboardKpi label="Harvested" value={measure(overview.harvested_kg, overview.harvested_count)} hint="All recorded harvests" />
          <DashboardKpi label="Sold" value={measure(overview.sold_kg, overview.sold_count)} hint="Quantity sold" />
          <DashboardKpi label="Revenue" value={`${number(overview.sales_rwf)} RWF`} hint="Sales only" />
          <DashboardKpi label="Personal consumption" value={measure(overview.personal_kg, overview.personal_count)} />
          <DashboardKpi label="Stored" value={measure(overview.stored_kg, overview.stored_count)} />
          <DashboardKpi label="Given away" value={measure(overview.given_kg, overview.given_count)} />
          <DashboardKpi label="Other" value={measure(overview.other_kg, overview.other_count)} />
          <DashboardKpi label="Not yet assigned" value={measure(overview.unassigned_kg, overview.unassigned_count)} hint="Still on the harvest" />
        </DashboardKpiGrid>
        {total > 0 ? (
          <>
            <div className="distribution-bar" role="img" aria-label="How harvested kilograms are distributed">
              {BARS.map((bar) => <span key={bar.key} style={{ width: `${(overview[bar.key] / total) * 100}%`, background: bar.color }} />)}
            </div>
            <p className="distribution-legend">{BARS.map((bar) => <span key={bar.key}><i style={{ background: bar.color }} />{bar.label} {number(overview[bar.key])} kg</span>)}</p>
          </>
        ) : <p>No harvest quantities yet.</p>}
        {unbalanced.length ? <Banner tone="error">{unbalanced.map((row) => row.public_code).join(", ")} does not add up to the harvested quantity.</Banner> : <p className="help">Sold, eaten, stored, given away, other, and what is not yet assigned add up to each harvest.</p>}
      </section>
      <section className="card">
        <h2>Distribution</h2>
        <div className="table-wrap">
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
      </section>
      <section className="card">
        <h2>Harvest history</h2>
        {overview.history.length ? (
          <ul className="record-list">
            {overview.history.map((item) => (
              <li key={`${item.kind}-${item.public_code}`}>
                {when(item.occurred_on)} · {item.public_code} · {item.kind === "harvest" ? `Harvest ${number(item.quantity)} ${item.unit}` : `${USE_LABELS[item.purpose ?? ""] ?? "Use"} ${number(item.quantity)} ${item.unit}`}
                {item.amount_rwf ? ` · ${number(item.amount_rwf)} RWF` : ""}
                {item.buyer_name ? ` · ${item.buyer_name}` : ""}
                {item.harvest_code && item.kind === "destination" ? ` · ${item.harvest_code}` : ""}
                {item.target_code ? ` · ${item.target_code}` : ""}
                {` · ${item.recorded_by}`}
              </li>
            ))}
          </ul>
        ) : <p>No harvest history yet.</p>}
      </section>
    </>
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
