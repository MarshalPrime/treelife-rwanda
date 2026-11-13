"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Banner, Field } from "@/components/AppShell";
import { ApiError, api, apiFile, apiUpload } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type DocumentRow = { id: string; original_name: string; uploaded_at: string };
type HistoryRow = { id: string; action: string; reason: string | null; actor_name: string | null; created_at: string };
type RequestRow = {
  id: string;
  status: string;
  experience: string;
  training: string;
  qualifications: string;
  decision_reason: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  documents: DocumentRow[];
};
type Authorization = { status: string; request: RequestRow | null; history: HistoryRow[] };

const STATUS_LABEL: Record<string, string> = {
  not_requested: "Not requested",
  submitted: "Submitted",
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
};

function when(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function CarbonAuthorizationPanel() {
  const { setCarbonMonitoring } = useAuth();
  const [record, setRecord] = useState<Authorization | null>(null);
  const [experience, setExperience] = useState("");
  const [training, setTraining] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api<Authorization>("/carbon/authorization")
      .then((next) => {
        setRecord(next);
        setCarbonMonitoring(next.status as "not_requested" | "pending" | "approved" | "rejected" | "revoked");
      })
      .catch((caught: Error) => setError(caught.message));
  }

  useEffect(load, [setCarbonMonitoring]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api<RequestRow>("/carbon/authorization", {
        method: "POST",
        body: JSON.stringify({ experience, training, qualifications }),
      });
      setNotice("Your request is submitted and waiting for review.");
      setExperience("");
      setTraining("");
      setQualifications("");
      setCarbonMonitoring("pending");
      setRecord((current) => ({ status: "pending", request: saved, history: current?.history ?? [] }));
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The request could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File | null) {
    if (!file || !record?.request) return;
    setError(null);
    const body = new FormData();
    body.set("file", file);
    try {
      await apiUpload(`/carbon/authorization/${record.request.id}/documents`, body);
      setNotice("The file is saved with your request.");
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The file could not be saved.");
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

  if (!record) return <p className="loading">Loading authorization…</p>;
  const canApply = record.status === "not_requested" || record.status === "rejected" || record.status === "revoked";

  return (
    <section className="card" aria-labelledby="carbon-auth-heading">
      <div className="page-head">
        <h2 id="carbon-auth-heading">Carbon Monitoring Authorization</h2>
        <strong>{STATUS_LABEL[record.status] ?? record.status}</strong>
      </div>
      {record.status === "approved" ? <Banner tone="success">Authorized Carbon Monitoring Agent</Banner> : null}
      <p>
        Carbon monitoring means recording specialist field measurements: which tree, a species check, the GPS location, diameter at breast height, height when you have it, health, and the date. An estimate can be calculated from those measurements. The estimate is not a certified carbon credit and not a verified emission reduction.
      </p>
      <p className="help">Not every field officer can record these measurements. Submit this request and an administrator reviews it. You can apply again after a rejection or a revocation.</p>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {record.request ? (
        <dl className="definition">
          <dt>Experience</dt><dd>{record.request.experience}</dd>
          <dt>Training</dt><dd>{record.request.training}</dd>
          <dt>Qualifications</dt><dd>{record.request.qualifications}</dd>
          {record.request.decision_reason ? <><dt>Decision</dt><dd>{record.request.decision_reason}{record.request.decided_by_name ? ` · ${record.request.decided_by_name}` : ""}{record.request.decided_at ? ` · ${when(record.request.decided_at)}` : ""}</dd></> : null}
        </dl>
      ) : null}
      {record.request?.documents.length ? (
        <ul>
          {record.request.documents.map((item) => (
            <li key={item.id}>
              <button className="inline-link" type="button" onClick={() => void openFile(item.id, item.original_name)}>{item.original_name}</button>
            </li>
          ))}
        </ul>
      ) : null}
      {record.status === "pending" && record.request ? (
        <Field label="Supporting file" name="carbon_evidence" help="Optional. JPEG, PNG, WebP, or PDF, up to 5 MB. Add it while the request is pending review.">
          <input id="carbon_evidence" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void upload(file); }} />
        </Field>
      ) : null}
      {canApply ? (
        <form className="form" onSubmit={submit}>
          <Field label="Experience" name="experience" help="Field work, carbon inventories, or related forestry experience.">
            <textarea id="experience" value={experience} onChange={(event) => setExperience(event.target.value)} required rows={3} />
          </Field>
          <Field label="Training" name="training">
            <textarea id="training" value={training} onChange={(event) => setTraining(event.target.value)} required rows={3} />
          </Field>
          <Field label="Qualifications" name="qualifications">
            <textarea id="qualifications" value={qualifications} onChange={(event) => setQualifications(event.target.value)} required rows={3} />
          </Field>
          <button className="primary" type="submit" disabled={saving}>{saving ? "Submitting…" : "Request authorization"}</button>
        </form>
      ) : null}
      {record.history.length ? (
        <>
          <h3>Authorization history</h3>
          <ul>
            {record.history.map((item) => (
              <li key={item.id}>{STATUS_LABEL[item.action] ?? item.action}{item.actor_name ? ` · ${item.actor_name}` : ""} · {when(item.created_at)}{item.reason ? ` · ${item.reason}` : ""}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
