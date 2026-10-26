"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { categories, label } from "@/lib/labels";
import type { Species } from "@/lib/types";

export default function SpeciesPage() {
  const { canWrite } = useAuth();
  const [species, setSpecies] = useState<Species[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scientificName, setScientificName] = useState("");
  const [commonName, setCommonName] = useState("");
  const [category, setCategory] = useState("fruit");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api<Species[]>("/species").then(setSpecies).catch((caught: Error) => setError(caught.message));
  }, []);

  function load() {
    api<Species[]>("/species").then(setSpecies).catch((caught: Error) => setError(caught.message));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api("/species", {
        method: "POST",
        body: JSON.stringify({
          scientific_name: scientificName,
          common_name: commonName,
          category,
        }),
      });
      setScientificName("");
      setCommonName("");
      setMessage("Species saved.");
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The species could not be saved.");
    }
  }

  return (
    <div className="page">
      <div>
        <h1>Species reference</h1>
        <p className="lede">This is a list of names used when registering trees. It is not an inventory of planted trees. Local names should be confirmed before a field pilot.</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}
      <div className="card">
        {species.length === 0 ? <p>No species have been added.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Common name</th><th>Scientific name</th><th>Category</th></tr></thead>
              <tbody>
                {species.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Common name">{item.common_name}</td>
                    <td data-label="Scientific name">{item.scientific_name}</td>
                    <td data-label="Category">{label(item.category)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {canWrite ? (
        <form className="card" onSubmit={handleSubmit}>
          <h2>Add a species</h2>
          <label>Scientific name
            <input value={scientificName} onChange={(event) => setScientificName(event.target.value)} required />
          </label>
          <label>Common name
            <input value={commonName} onChange={(event) => setCommonName(event.target.value)} required />
          </label>
          <label>Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <button className="primary" type="submit">Save species</button>
        </form>
      ) : null}
    </div>
  );
}
