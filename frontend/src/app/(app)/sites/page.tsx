"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner, Pager } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { label } from "@/lib/labels";
import type { Page, Site } from "@/lib/types";

export default function SitesPage() {
  const { canWrite } = useAuth();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Site> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "10" });
    if (submitted) params.set("q", submitted);
    if (status) params.set("status", status);
    let active = true;
    setLoading(true);
    api<Page<Site>>(`/sites?${params}`)
      .then((next) => { if (active) setData(next); })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, status, submitted]);

  const empty = !loading && data?.total === 0;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Planting sites</h1>
          <p className="lede">A site is the farm, plot, roadside, or institution where trees are registered.</p>
        </div>
        {canWrite ? <Link className="primary" href="/sites/new">Register a site</Link> : null}
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form className="filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmitted(query); }}>
        <input aria-label="Search sites" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, or place" />
        <select aria-label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="secondary" type="submit">Search</button>
      </form>
      {loading ? <p className="loading">Loading sites…</p> : null}
      {empty ? <div className="card"><h2>{submitted || status ? "No sites match these filters." : "No planting sites yet."}</h2><p>Register a site before adding trees or batches.</p></div> : null}
      {data && data.items.length > 0 ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Place</th><th>Status</th><th>Map</th></tr></thead>
              <tbody>
                {data.items.map((site) => (
                  <tr key={site.id}>
                    <td data-label="Code"><Link href={`/sites/${site.id}`}>{site.public_code}</Link></td>
                    <td data-label="Name">{site.name}</td>
                    <td data-label="Place">{site.district || site.province || "—"}</td>
                    <td data-label="Status">{label(site.status)}</td>
                    <td data-label="Map">{site.has_coordinates ? "Located" : "No coordinates"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </div>
      ) : null}
    </div>
  );
}
