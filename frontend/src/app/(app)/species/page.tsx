"use client";

import { useEffect, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { categories } from "@/lib/labels";
import { classLabels, growthForms, reviewStatuses, speciesClasses, choiceLabel } from "@/lib/species-profile";
import type { Species } from "@/lib/types";

const emptyReview = {
  scientific_name: "",
  common_name: "",
  local_name: "",
  other_local_names: "",
  growth_form: "",
  classifications: [] as string[],
  primary_uses: "",
  harvest_potential: "",
  harvest_type: "",
  rwanda_suitability: "",
  data_source: "",
  review_status: "needs_review",
  category: "other",
  variety_name: "",
};

export default function SpeciesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [species, setSpecies] = useState<Species[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [review, setReview] = useState(emptyReview);
  const [scientificName, setScientificName] = useState("");
  const [commonName, setCommonName] = useState("");
  const [category, setCategory] = useState("fruit");

  function load() {
    api<Species[]>("/species").then(setSpecies).catch((caught: Error) => setError(caught.message));
  }

  useEffect(load, []);

  function choose(id: string) {
    setSelectedId(id);
    const item = species.find((row) => row.id === id);
    if (!item) return;
    setReview({
      scientific_name: item.scientific_name,
      common_name: item.common_name,
      local_name: item.local_name ?? "",
      other_local_names: (item.other_local_names ?? []).join(", "),
      growth_form: item.growth_form ?? "",
      classifications: item.classifications ?? [],
      primary_uses: item.primary_uses ?? "",
      harvest_potential: item.harvest_potential == null ? "" : item.harvest_potential ? "yes" : "no",
      harvest_type: item.harvest_type ?? "",
      rwanda_suitability: item.rwanda_suitability ?? "",
      data_source: item.data_source ?? "",
      review_status: item.review_status ?? "needs_review",
      category: item.category,
      variety_name: "",
    });
  }

  async function saveReview(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api(`/species/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({
          scientific_name: review.scientific_name,
          common_name: review.common_name,
          local_name: review.local_name || null,
          other_local_names: review.other_local_names.split(",").map((item) => item.trim()).filter(Boolean),
          growth_form: review.growth_form || null,
          classifications: review.classifications,
          primary_uses: review.primary_uses || null,
          harvest_potential: review.harvest_potential === "" ? null : review.harvest_potential === "yes",
          harvest_type: review.harvest_type || null,
          rwanda_suitability: review.rwanda_suitability || null,
          data_source: review.data_source || null,
          review_status: review.review_status,
          category: review.category,
          variety_name: review.variety_name || null,
        }),
      });
      setMessage("Species review saved.");
      setReview((current) => ({ ...current, variety_name: "" }));
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The species could not be saved.");
    }
  }

  async function addSpecies(event: React.FormEvent) {
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
      setMessage("Species saved as a draft. Verify it before field agents can select it.");
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The species could not be saved.");
    }
  }

  const selected = species.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="page">
      <div>
        <h1>Species reference</h1>
        <p className="lede">Names used when registering a tree. This starter list is not an official list of every species in Rwanda. Field agents can select species marked Verified. They cannot edit this list.</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}
      <div className="card">
        {species.length === 0 ? <p>No species have been added.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Common name</th>
                  <th>Scientific name</th>
                  <th>Local name</th>
                  <th>Growth form</th>
                  <th>Classification</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {species.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Common name">{item.common_name}</td>
                    <td data-label="Scientific name">{item.scientific_name}{item.taxon_rank === "genus" ? " (genus)" : ""}</td>
                    <td data-label="Local name">{item.local_name || "Not recorded"}</td>
                    <td data-label="Growth form">{choiceLabel(growthForms, item.growth_form)}</td>
                    <td data-label="Classification">{classLabels(item.classifications)}</td>
                    <td data-label="Review">{choiceLabel(reviewStatuses, item.review_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {isAdmin ? (
        <>
          <form className="card form" onSubmit={saveReview}>
            <h2>Review a species</h2>
            <Field label="Species" name="review_species">
              <select id="review_species" value={selectedId} onChange={(event) => choose(event.target.value)} required>
                <option value="">Choose a species</option>
                {species.map((item) => <option key={item.id} value={item.id}>{item.common_name}</option>)}
              </select>
            </Field>
            {selected ? (
              <>
                <div className="row">
                  <Field label="Common name" name="review_common">
                    <input id="review_common" value={review.common_name} onChange={(event) => setReview({ ...review, common_name: event.target.value })} required />
                  </Field>
                  <Field label="Scientific name" name="review_scientific">
                    <input id="review_scientific" value={review.scientific_name} onChange={(event) => setReview({ ...review, scientific_name: event.target.value })} required />
                  </Field>
                </div>
                <div className="row">
                  <Field label="Kinyarwanda / local name" name="review_local">
                    <input id="review_local" value={review.local_name} onChange={(event) => setReview({ ...review, local_name: event.target.value })} />
                  </Field>
                  <Field label="Other local names" name="review_other" help="Separate names with a comma. Leave blank when none are verified.">
                    <input id="review_other" value={review.other_local_names} onChange={(event) => setReview({ ...review, other_local_names: event.target.value })} />
                  </Field>
                </div>
                <div className="row">
                  <Field label="Growth form" name="review_growth">
                    <select id="review_growth" value={review.growth_form} onChange={(event) => setReview({ ...review, growth_form: event.target.value })}>
                      <option value="">Not recorded</option>
                      {growthForms.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                    </select>
                  </Field>
                  <Field label="Review status" name="review_status" help="Only Verified species appear when an agent registers a tree.">
                    <select id="review_status" value={review.review_status} onChange={(event) => setReview({ ...review, review_status: event.target.value })}>
                      {reviewStatuses.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                    </select>
                  </Field>
                </div>
                <fieldset>
                  <legend>Tree classification</legend>
                  {speciesClasses.map(([value, text]) => (
                    <label key={value} className="check-line">
                      <input
                        type="checkbox"
                        checked={review.classifications.includes(value)}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...review.classifications, value]
                            : review.classifications.filter((item) => item !== value);
                          setReview({ ...review, classifications: next });
                        }}
                      /> {text}
                    </label>
                  ))}
                </fieldset>
                <div className="row">
                  <Field label="Category used on the tree record" name="review_category">
                    <select id="review_category" value={review.category} onChange={(event) => setReview({ ...review, category: event.target.value })}>
                      {categories.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                    </select>
                  </Field>
                  <Field label="Harvest potential" name="review_harvest_potential">
                    <select id="review_harvest_potential" value={review.harvest_potential} onChange={(event) => setReview({ ...review, harvest_potential: event.target.value })}>
                      <option value="">Not recorded</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </Field>
                </div>
                <Field label="Harvest type" name="review_harvest_type">
                  <input id="review_harvest_type" value={review.harvest_type} onChange={(event) => setReview({ ...review, harvest_type: event.target.value })} />
                </Field>
                <Field label="Primary uses" name="review_uses">
                  <input id="review_uses" value={review.primary_uses} onChange={(event) => setReview({ ...review, primary_uses: event.target.value })} />
                </Field>
                <Field label="Rwanda suitability" name="review_suitability">
                  <input id="review_suitability" value={review.rwanda_suitability} onChange={(event) => setReview({ ...review, rwanda_suitability: event.target.value })} />
                </Field>
                <Field label="Data source" name="review_source">
                  <input id="review_source" value={review.data_source} onChange={(event) => setReview({ ...review, data_source: event.target.value })} />
                </Field>
                <Field label="Add a variety" name="review_variety" help="Saved as its own record for this species. Leave blank if none is verified.">
                  <input id="review_variety" value={review.variety_name} onChange={(event) => setReview({ ...review, variety_name: event.target.value })} />
                </Field>
                {selected.varieties && selected.varieties.length > 0 ? (
                  <p className="help">Varieties already recorded: {selected.varieties.map((item) => item.name).join(", ")}.</p>
                ) : <p className="help">No varieties are recorded.</p>}
                <button className="primary" type="submit">Save review</button>
              </>
            ) : null}
          </form>
          <form className="card" onSubmit={addSpecies}>
            <h2>Add a species</h2>
            <p className="help">A new species starts as a draft. It is hidden from field registration until you mark it Verified.</p>
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
        </>
      ) : null}
    </div>
  );
}
