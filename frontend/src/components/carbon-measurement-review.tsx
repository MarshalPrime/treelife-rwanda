"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";

type Measurement = {
  id: string;
  public_code: string;
  species_common_name: string | null;
  tree_code: string | null;
  dbh_cm: number;
  height_m: number | null;
  measured_on: string;
  collected_by_name: string | null;
  review_status: string;
  review_reason: string | null;
  estimate_note: string | null;
  estimate: { label: string; tonnes_co2e: number } | null;
};

const LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  correction: "Needs correction",
};

export function CarbonMeasurementReview() {
  const [rows, setRows] = useState<Measurement[] | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    api<Measurement[]>("/carbon/measurements").then(setRows).catch((caught: Error) => setError(caught.message));
  }

  useEffect(load, []);

  async function review(id: string, decision: "accept" | "correction") {
    setError(null);
    setNotice(null);
    try {
      await api(`/carbon/measurements/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: reason.trim() || null }),
      });
      setNotice(decision === "accept" ? "Measurement accepted." : "Sent back for correction.");
      setReason("");
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The review could not be saved.");
    }
  }

  const rank: Record<string, number> = { pending: 0, correction: 1, accepted: 2 };
  const ordered = rows ? [...rows].sort((left, right) => (rank[left.review_status] ?? 3) - (rank[right.review_status] ?? 3)) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Measurement review</h1>
          <p className="lede">Accept a field measurement or send it back. Only accepted measurements enter the project carbon stock.</p>
        </div>
        <Link className="secondary" href="/carbon">Carbon monitoring</Link>
      </div>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Field label="Correction reason" name="review_reason" help="Required when you send a measurement back. Leave it empty when you accept.">
        <textarea id="review_reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
      </Field>
      {!ordered ? <p className="loading">Loading measurements…</p> : ordered.length === 0 ? <p>No measurements yet.</p> : (
        <div className="table-wrap">
          <table>
            <caption>Carbon measurements for review</caption>
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Tree</th>
                <th scope="col">Species</th>
                <th scope="col">DBH</th>
                <th scope="col">Height</th>
                <th scope="col">Stock</th>
                <th scope="col">Status</th>
                <th scope="col">Agent</th>
                <th scope="col">Review</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.public_code}</th>
                  <td>{row.tree_code ?? "Not linked"}</td>
                  <td>{row.species_common_name ?? "Species not named"}</td>
                  <td>{row.dbh_cm} cm</td>
                  <td>{row.height_m == null ? "Not recorded" : `${row.height_m} m`}</td>
                  <td>{row.estimate ? `${row.estimate.label}: ${row.estimate.tonnes_co2e} tCO₂e` : row.estimate_note ?? "Not calculated"}</td>
                  <td>{LABEL[row.review_status] ?? row.review_status}{row.review_reason ? ` · ${row.review_reason}` : ""}</td>
                  <td>{row.collected_by_name ?? "Agent"}</td>
                  <td>
                    {row.review_status === "pending" ? (
                      <span className="actions">
                        <button className="primary" type="button" onClick={() => void review(row.id, "accept")}>Accept</button>
                        <button className="secondary" type="button" onClick={() => void review(row.id, "correction")}>Needs correction</button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
