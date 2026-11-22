"use client";

import { useState, type FormEvent } from "react";
import { Banner } from "@/components/AppShell";
import { api } from "@/lib/api";
import { newRequestId, todayInput, validateDate } from "@/lib/validation";

export type BiographyEntry = {
  id: string;
  occurred_on: string;
  chapter: string;
  title: string;
  detail: string | null;
  public_code: string | null;
  recorded_by_name: string | null;
};

const ACTIVITIES: [string, string][] = [
  ["inspection", "Inspection"],
  ["survival_check", "Survival check"],
  ["watering", "Watering"],
  ["fertilizer", "Fertilizer"],
  ["pest_control", "Pesticide or herbicide"],
  ["pruning", "Pruning"],
  ["weeding", "Weeding"],
  ["mulching", "Mulching"],
  ["environmental", "Environmental damage"],
  ["harvest", "Harvest"],
  ["other", "Other observation"],
];

const EVENT_TYPES = new Set(["inspection", "survival_check", "other"]);
const AMOUNT_TYPES = new Set(["watering", "fertilizer", "pest_control"]);

function BiographyForm({ treeId, onSaved }: { treeId: string; onSaved: () => void }) {
  const [activity, setActivity] = useState("inspection");
  const [eventDate, setEventDate] = useState(todayInput());
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId] = useState(newRequestId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const dateError = validateDate(eventDate, "Date");
    if (dateError) {
      setError(dateError);
      return;
    }
    const written = [amount.trim() ? `Amount: ${amount.trim()}` : "", notes.trim()].filter(Boolean).join(". ");
    setSaving(true);
    setError(null);
    try {
      if (activity === "harvest") {
        const parsed = Number(quantity);
        if (!quantity.trim() || !Number.isFinite(parsed) || parsed <= 0) {
          setError("Enter a harvest quantity greater than zero.");
          setSaving(false);
          return;
        }
        await api("/harvests", {
          method: "POST",
          body: JSON.stringify({
            tree_id: treeId,
            harvested_on: eventDate,
            quantity: parsed,
            unit,
            notes: notes.trim() || null,
            client_request_id: requestId,
          }),
        });
      } else if (EVENT_TYPES.has(activity)) {
        await api("/events", {
          method: "POST",
          body: JSON.stringify({
            tree_id: treeId,
            event_type: activity,
            event_date: eventDate,
            notes: written || null,
            client_request_id: requestId,
          }),
        });
      } else {
        await api("/maintenance", {
          method: "POST",
          body: JSON.stringify({
            tree_id: treeId,
            activity_type: activity,
            performed_on: eventDate,
            notes: written || null,
            client_request_id: requestId,
          }),
        });
      }
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The record could not be saved.");
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="row">
        <label>Activity
          <select value={activity} onChange={(event) => setActivity(event.target.value)} aria-label="Activity">
            {ACTIVITIES.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select>
        </label>
        <label>Date
          <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} aria-label="Activity date" />
        </label>
      </div>
      {activity === "harvest" ? (
        <div className="row">
          <label>Quantity
            <input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label="Harvest quantity" />
          </label>
          <label>Unit
            <select value={unit} onChange={(event) => setUnit(event.target.value)} aria-label="Harvest unit">
              <option value="kg">Kilograms</option>
              <option value="count">Count</option>
            </select>
          </label>
        </div>
      ) : null}
      {AMOUNT_TYPES.has(activity) ? (
        <label>Amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Amount" placeholder="For example, 20 litres or 2 kg" />
        </label>
      ) : null}
      <label>Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="Biography notes" placeholder="What was done, what was observed, or where the harvest went" />
      </label>
      <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save to biography"}</button>
    </form>
  );
}

export function TreeBiography({
  treeId,
  entries,
  canWrite,
  show,
  onToggle,
  onSaved,
}: {
  treeId: string;
  entries: BiographyEntry[];
  canWrite: boolean;
  show: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const later = entries.filter((entry) => entry.chapter !== "planting");
  return (
    <section className="card" aria-label="Tree biography">
      <div className="detail-card-head">
        <div>
          <h2>Tree biography</h2>
          <p className="help">Planting, care, inspections, and harvest, in date order.</p>
        </div>
        {canWrite ? (
          <button className="secondary compact-action-link" type="button" onClick={onToggle}>
            {show ? "Close" : "Add an activity"}
          </button>
        ) : null}
      </div>
      {show ? <BiographyForm treeId={treeId} onSaved={onSaved} /> : null}
      <ol className="detail-timeline">
        {entries.map((entry) => (
          <li key={`${entry.chapter}-${entry.id}`} className="detail-timeline-item">
            <div className="detail-timeline-top">
              <div className="detail-timeline-left">
                <strong>{entry.occurred_on}</strong>
                <span>{entry.title}</span>
                {entry.public_code ? <code>{entry.public_code}</code> : null}
              </div>
              {entry.recorded_by_name ? <span className="help">{entry.recorded_by_name}</span> : null}
            </div>
            {entry.detail ? <p className="detail-timeline-note">{entry.detail}</p> : null}
          </li>
        ))}
      </ol>
      {later.length === 0 ? <p className="help">Later care, inspections, and harvests appear here.</p> : null}
    </section>
  );
}
