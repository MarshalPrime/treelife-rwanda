"use client";

import { useEffect, useState } from "react";
import { Banner, Pager } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatWhen } from "@/lib/labels";
import type { AuditEntry, Page } from "@/lib/types";

export default function AuditPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "admin") return;
    api<Page<AuditEntry>>(`/audit?page=${page}&page_size=20`)
      .then(setData)
      .catch((caught: Error) => setError(caught.message));
  }, [page, user?.role]);

  if (user?.role !== "admin") {
    return <Banner tone="error">The audit log is limited to administrators.</Banner>;
  }
  return (
    <div className="page">
      <div>
        <h1>Audit log</h1>
        <p className="lede">Creates and updates are recorded by field name. Notes and coordinates are not copied into the log.</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="card">
        {data && data.items.length === 0 ? <p>No audit entries yet.</p> : null}
        {data && data.items.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record</th><th>Fields</th></tr></thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="When">{formatWhen(entry.created_at)}</td>
                    <td data-label="Actor">{entry.actor_name ?? "—"}</td>
                    <td data-label="Action">{entry.action}</td>
                    <td data-label="Record">{entry.entity_type}</td>
                    <td data-label="Fields">{entry.changed_fields.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {data ? <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} /> : <p className="loading">Loading audit log…</p>}
      </div>
    </div>
  );
}
