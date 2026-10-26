"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, Pager } from "@/components/AppShell";
import { PlantingForm } from "@/components/forms";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { label } from "@/lib/labels";
import type { Farmer, Page, PlantingRecord, Site, Species } from "@/lib/types";

export function PlantingList({ mode }: { mode: "tree" | "batch" }) {
  const base = mode === "tree" ? "trees" : "batches";
  const { canWrite } = useAuth();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<PlantingRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "10" });
    if (submitted) params.set("q", submitted);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    let active = true;
    setLoading(true);
    api<Page<PlantingRecord>>(`/${base}?${params}`)
      .then((next) => { if (active) setData(next); })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [base, category, page, status, submitted]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{mode === "tree" ? "Individual trees" : "Planting batches"}</h1>
          <p className="lede">{mode === "tree" ? "One record for one tree." : "One record for a group of trees planted together."}</p>
        </div>
        {canWrite ? <Link className="primary" href={`/${base}/new`}>{mode === "tree" ? "Register a tree" : "Register a batch"}</Link> : null}
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form className="filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmitted(query); }}>
        <input aria-label="Search records" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, species, or site" />
        <select aria-label="Category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
          <option value="">All categories</option>
          <option value="urban">Urban</option>
          <option value="fruit">Fruit</option>
          <option value="agroforestry">Agroforestry</option>
          <option value="other">Other</option>
        </select>
        <select aria-label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="planted">Planted</option>
          <option value="surviving">Surviving</option>
          <option value="stressed">Stressed</option>
          <option value="dead">Dead</option>
          <option value="removed">Removed</option>
          <option value="unknown">Unknown</option>
        </select>
        <button className="secondary" type="submit">Search</button>
      </form>
      {loading ? <p className="loading">Loading records…</p> : null}
      {!loading && data?.total === 0 ? (
        <div className="card">
          <h2>{submitted || category || status ? "No records match these filters." : "No records yet."}</h2>
          <p>Register a planting site first, then add a tree or a batch.</p>
        </div>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Species</th><th>Site</th><th>Quantity</th><th>Status</th><th>Map</th></tr></thead>
              <tbody>
                {data.items.map((record) => (
                  <tr key={record.id}>
                    <td data-label="Code"><Link href={`/${base}/${record.id}`}>{record.public_code}</Link></td>
                    <td data-label="Species">{record.species_common_name}</td>
                    <td data-label="Site">{record.site_name}</td>
                    <td data-label="Quantity">{record.quantity}</td>
                    <td data-label="Status">{label(record.status)}</td>
                    <td data-label="Map">{record.has_coordinates ? "Located" : "No coordinates"}</td>
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

export function NewPlanting({ mode }: { mode: "tree" | "batch" }) {
  const router = useRouter();
  const search = useSearchParams();
  const { canWrite, user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const base = mode === "tree" ? "trees" : "batches";
  const showFarmerHelp = user?.role === "field_officer";

  useEffect(() => {
    const loads: Promise<unknown>[] = [
      api<Page<Site>>("/sites?page_size=100"),
      api<Species[]>("/species"),
    ];
    if (showFarmerHelp) loads.push(api<Farmer[]>("/farmers"));
    Promise.all(loads).then((results) => {
      const sitePage = results[0] as Page<Site>;
      const speciesList = results[1] as Species[];
      setSites(sitePage.items);
      setSpecies(speciesList);
      if (showFarmerHelp) setFarmers(results[2] as Farmer[]);
    }).catch((caught: Error) => setError(caught.message));
  }, [showFarmerHelp]);

  if (!canWrite) return <Banner tone="error">You do not have permission to register records.</Banner>;
  if (error) return <Banner tone="error">{error}</Banner>;
  return (
    <div className="page">
      <h1>{mode === "tree" ? "Register an individual tree" : "Register a planting batch"}</h1>
      {user?.role === "farmer" ? (
        <p className="help">This record is saved under {user.full_name}. Your name is already on the account, so it is not asked again.</p>
      ) : null}
      <div className="card">
        <PlantingForm
          mode={mode}
          sites={sites}
          species={species}
          farmers={farmers}
          showFarmerHelp={showFarmerHelp}
          initial={{ site_id: search.get("site") ?? "" }}
          onSubmit={async (payload) => {
            const body = { ...payload };
            const named = body.new_farmer as { display_name: string; district: string | null; phone: string | null } | null;
            delete body.new_farmer;
            if (named) {
              const createdFarmer = await api<Farmer>("/farmers", {
                method: "POST",
                body: JSON.stringify({
                  ...named,
                  client_request_id: `${body.client_request_id}-farmer`,
                }),
              });
              body.farmer_id = createdFarmer.id;
            }
            const created = await api<PlantingRecord>(`/${base}`, { method: "POST", body: JSON.stringify(body) });
            router.push(`/${base}/${created.id}?created=1`);
          }}
        />
      </div>
    </div>
  );
}

export function EditPlanting({ mode }: { mode: "tree" | "batch" }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { canWrite } = useAuth();
  const base = mode === "tree" ? "trees" : "batches";
  const [record, setRecord] = useState<PlantingRecord | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<PlantingRecord>(`/${base}/${params.id}`),
      api<Page<Site>>("/sites?page_size=100"),
      api<Species[]>("/species"),
    ]).then(([nextRecord, sitePage, speciesList]) => {
      setRecord(nextRecord);
      setSites(sitePage.items);
      setSpecies(speciesList);
    }).catch((caught: Error) => setError(caught.message));
  }, [base, params.id]);

  if (!canWrite) return <Banner tone="error">You do not have permission to edit records.</Banner>;
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!record) return <p className="loading">Loading record…</p>;
  return (
    <div className="page">
      <h1>Edit {record.public_code}</h1>
      <div className="card">
        <PlantingForm
          editing
          mode={mode}
          sites={sites}
          species={species}
          initial={record}
          onSubmit={async (payload) => {
            await api(`/${base}/${record.id}`, { method: "PATCH", body: JSON.stringify(payload) });
            router.push(`/${base}/${record.id}?updated=1`);
          }}
        />
      </div>
    </div>
  );
}
