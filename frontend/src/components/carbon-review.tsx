"use client";

import { useEffect, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { ApiError, api, apiFile } from "@/lib/api";

type DocumentRow = { id: string; original_name: string };
type HistoryRow = { id: string; action: string; reason: string | null; actor_name: string | null; created_at: string };
type RequestRow = {
  id: string;
  officer_name: string;
  officer_email: string;
  officer_district: string | null;
  status: string;
  experience: string;
  training: string;
  qualifications: string;
  decision_reason: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
  documents: DocumentRow[];
  history?: HistoryRow[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
  submitted: "Submitted",
};

function when(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function CarbonReview() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function loadList() {
    api<RequestRow[]>("/carbon/authorizations")
      .then(setRows)
      .catch((caught: Error) => setError(caught.message));
  }

  useEffect(loadList, []);

  async function open(id: string) {
    setError(null);
    setNotice(null);
    setReason("");
    const detail = await api<RequestRow>(`/carbon/authorizations/${id}`);
    setSelected(detail);
  }

  async function decide(decision: "approve" | "reject" | "revoke") {
    if (!selected) return;
    setError(null);
    setNotice(null);
    try {
      const saved = await api<RequestRow>(`/carbon/authorizations/${selected.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: reason.trim() || null }),
      });
      setSelected(saved);
      setNotice(decision === "approve" ? "Authorization approved." : decision === "reject" ? "Request rejected." : "Authorization revoked.");
      setReason("");
      loadList();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The decision could not be saved.");
    }
  }

  async function openFile(documentId: string, name: string) {
    const blob = await apiFile(`/carbon/documents/${documentId}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <h1>Carbon Monitoring Authorization Requests</h1>
      <p className="lede">Review a field officer request. Approving it lets that officer record carbon measurements. Rejecting or revoking needs a reason. This does not create another user role.</p>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {!rows ? <p className="loading">Loading requests…</p> : rows.length === 0 ? <p>No requests yet.</p> : (
        <div className="card">
          <ul className="record-list">
            {rows.map((row) => (
              <li key={row.id}>
                <button className="record-button" type="button" aria-current={selected?.id === row.id} onClick={() => void open(row.id)}>
                  {row.officer_name} · {STATUS_LABEL[row.status] ?? row.status} · {when(row.created_at)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {selected ? (
        <section className="card">
          <h2>{selected.officer_name}</h2>
          <p>{STATUS_LABEL[selected.status] ?? selected.status}{selected.status === "approved" ? " · Authorized Carbon Monitoring Agent" : ""}</p>
          <dl className="definition">
            <dt>Email</dt><dd>{selected.officer_email}</dd>
            <dt>District</dt><dd>{selected.officer_district || "Not recorded"}</dd>
            <dt>Submitted</dt><dd>{when(selected.created_at)}</dd>
            <dt>Experience</dt><dd>{selected.experience}</dd>
            <dt>Training</dt><dd>{selected.training}</dd>
            <dt>Qualifications</dt><dd>{selected.qualifications}</dd>
            <dt>Decided by</dt><dd>{selected.decided_by_name ? `${selected.decided_by_name} · ${when(selected.decided_at)}` : "Not decided"}</dd>
            {selected.decision_reason ? <><dt>Reason</dt><dd>{selected.decision_reason}</dd></> : null}
          </dl>
          {selected.documents.length ? (
            <ul>
              {selected.documents.map((item) => (
                <li key={item.id}><button className="inline-link" type="button" onClick={() => void openFile(item.id, item.original_name)}>{item.original_name}</button></li>
              ))}
            </ul>
          ) : <p className="help">No file was uploaded.</p>}
          {selected.history?.length ? (
            <>
              <h3>Authorization history</h3>
              <ul>
                {selected.history.map((item) => (
                  <li key={item.id}>{STATUS_LABEL[item.action] ?? item.action}{item.actor_name ? ` · ${item.actor_name}` : ""} · {when(item.created_at)}{item.reason ? ` · ${item.reason}` : ""}</li>
                ))}
              </ul>
            </>
          ) : null}
          <Field label="Reason" name="decision_reason" help="Required when you reject or revoke. Optional when you approve.">
            <textarea id="decision_reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
          </Field>
          <div className="actions">
            {selected.status === "pending" ? <button className="primary" type="button" onClick={() => void decide("approve")}>Approve</button> : null}
            {selected.status === "pending" ? <button className="secondary" type="button" onClick={() => void decide("reject")}>Reject</button> : null}
            {selected.status === "approved" ? <button className="secondary" type="button" onClick={() => void decide("revoke")}>Revoke</button> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
