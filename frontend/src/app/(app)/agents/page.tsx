"use client";

import { useEffect, useState } from "react";
import { AgentExplorer } from "@/components/agents";
import { Banner } from "@/components/AppShell";
import { api } from "@/lib/api";
import type { AgentBoardResponse } from "@/lib/types";
import "@/components/dashboard-view.css";

export default function AgentsPage() {
  const [district, setDistrict] = useState("");
  const [speciesId, setSpeciesId] = useState("");
  const [board, setBoard] = useState<AgentBoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const query = new URLSearchParams();
    if (district) query.set("district", district);
    if (speciesId) query.set("species_id", speciesId);
    const path = `/agents/board${query.size ? `?${query}` : ""}`;
    let active = true;
    setLoading(true);
    api<AgentBoardResponse>(path)
      .then((data) => { if (active) { setBoard(data); setError(null); } })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [district, speciesId]);

  const filtered = Boolean(district || speciesId);
  const speciesName = board?.species.find((species) => species.id === speciesId)?.common_name;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Agents</h1>
          <p className="lede">Field officers who register trees. Rows named SYNTHETIC Agent are numbered examples for the showcase, not field staff. Choose an agent to see that person&apos;s registrations, places, follow-up, and submissions.</p>
        </div>
      </div>
      <section className="dashboard-toolbar" aria-label="Agent filters">
        <label htmlFor="agent-district">District
          <select id="agent-district" value={district} disabled={!board} onChange={(event) => setDistrict(event.target.value)}>
            <option value="">All districts</option>
            {board?.districts.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label htmlFor="agent-species">Species
          <select id="agent-species" value={speciesId} disabled={!board} onChange={(event) => setSpeciesId(event.target.value)}>
            <option value="">All species</option>
            {board?.species.map((species) => <option key={species.id} value={species.id}>{species.common_name}</option>)}
          </select>
        </label>
        <button className="ghost" type="button" onClick={() => { setDistrict(""); setSpeciesId(""); }} disabled={!filtered}>Reset filters</button>
        <p className="help">District and species apply to the leaderboard, the chart, places, follow-up, quality, and submissions.</p>
      </section>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {board ? (
        <div aria-busy={loading}>
          <AgentExplorer key={`${district}|${speciesId}`} agents={board.agents} empty={filtered ? `No agent has registered ${speciesName ?? "a tree"}${district ? ` in ${district}` : ""}.` : undefined} />
        </div>
      ) : error ? null : <p className="loading" role="status">Loading agents…</p>}
    </div>
  );
}
