"use client";

import { useEffect, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { api } from "@/lib/api";
import { readDraft, writeDraft, type SeedlingOrigin } from "@/lib/tree-draft";
import type { Farmer, Site, Species } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { choiceLabel, classLabels, growthForms } from "@/lib/species-profile";

type Lot = {
  id: string;
  public_code: string;
  nursery_site_id: string;
  species_id: string;
  species_common_name: string | null;
  quantity_remaining: number;
};

const origins: { id: SeedlingOrigin; label: string }[] = [
  { id: "nursery", label: "Registered nursery" },
  { id: "farmer", label: "Farmer-produced" },
  { id: "natural", label: "Natural regeneration" },
  { id: "other", label: "Other" },
];

function recorded(value: string | null | undefined) {
  return value && value.trim() ? value : "Not recorded";
}

export function TreeInfoStep({ onBack, onContinue }: { onBack?: () => void; onContinue: () => void }) {
  const { user } = useAuth();
  const [draft] = useState(readDraft);
  const [species, setSpecies] = useState<Species[]>([]);
  const [nurseries, setNurseries] = useState<Site[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [speciesId, setSpeciesId] = useState(draft.species_id ?? "");
  const [varietyId, setVarietyId] = useState(draft.variety_id ?? "");
  const [origin, setOrigin] = useState<SeedlingOrigin>(draft.seedling_origin);
  const [nurseryId, setNurseryId] = useState(draft.nursery_site_id ?? "");
  const [lotId, setLotId] = useState(draft.seedling_lot_id ?? "");
  const [producerId, setProducerId] = useState(draft.producer_farmer_id ?? "");
  const [originNote, setOriginNote] = useState(draft.origin_note);
  const [propagation, setPropagation] = useState(draft.propagation_method);
  const [condition, setCondition] = useState(draft.seedling_condition);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Species[]>("/species?approved=true").then((rows) => {
      const ordered = [...rows].sort((left, right) => left.common_name.localeCompare(right.common_name));
      setSpecies(ordered);
      const selected = ordered.find((item) => item.id === draft.species_id);
      if (selected) setQuery(selected.common_name);
    }).catch(() => setSpecies([]));
    api<{ items: Site[] }>("/sites?page_size=100")
      .then((page) => setNurseries(page.items.filter((site) => site.site_type === "nursery_holding")))
      .catch(() => setNurseries([]));
    api<Lot[]>("/seedling-lots").then(setLots).catch(() => setLots([]));
    api<Farmer[]>("/farmers").then(setFarmers).catch(() => setFarmers([]));
  }, [draft.species_id]);

  const selected = species.find((item) => item.id === speciesId) ?? null;
  const varieties = selected?.varieties ?? [];
  const needle = query.trim().toLowerCase();
  const matches = species.filter((item) => {
    if (browsing || !needle) return true;
    const otherNames = (item.other_local_names ?? []).join(" ");
    return [item.common_name, item.scientific_name, item.local_name ?? "", otherNames]
      .some((name) => name.toLowerCase().includes(needle));
  });
  const nurseryLots = lots.filter((lot) => lot.nursery_site_id === nurseryId);
  const nurseryStock = new Map<string, number>();
  for (const lot of nurseryLots) {
    const name = lot.species_common_name ?? "Species";
    nurseryStock.set(name, (nurseryStock.get(name) ?? 0) + lot.quantity_remaining);
  }
  const matchingLots = nurseryLots.filter((lot) => lot.species_id === speciesId);
  const knownFarmers = farmers
    .filter((farmer) => farmer.registered_by === user?.id)
    .sort((left, right) => left.display_name.localeCompare(right.display_name));
  const incomplete = selected != null && (
    !selected.local_name
    || !selected.growth_form
    || !selected.classifications
    || selected.classifications.length === 0
    || selected.harvest_potential == null
    || !selected.harvest_type
    || !selected.primary_uses
    || !selected.rwanda_suitability
  );

  function chooseSpecies(item: Species) {
    setSpeciesId(item.id);
    setQuery(item.common_name);
    setVarietyId("");
    setLotId("");
    setListOpen(false);
    setError(null);
  }

  function chooseOrigin(next: SeedlingOrigin) {
    setOrigin(next);
    setError(null);
    if (next !== "nursery") {
      setNurseryId("");
      setLotId("");
    }
    if (next !== "farmer") setProducerId("");
    if (next !== "other") setOriginNote("");
  }

  function payload() {
    return {
      species_id: speciesId || null,
      variety_id: varietyId || null,
      seedling_origin: origin,
      nursery_site_id: origin === "nursery" ? nurseryId || null : null,
      seedling_lot_id: origin === "nursery" ? lotId || null : null,
      producer_farmer_id: origin === "farmer" ? producerId || null : null,
      origin_note: origin === "other" ? originNote.trim() : "",
      propagation_method: propagation,
      seedling_condition: condition,
    };
  }

  function back() {
    writeDraft(payload());
    onBack?.();
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!selected) {
      setError("Choose a species from the approved list.");
      return;
    }
    if (!origin) {
      setError("Choose where this tree came from.");
      return;
    }
    if (origin === "nursery" && !nurseryId) {
      setError("Choose a registered nursery.");
      return;
    }
    if (origin === "other" && !originNote.trim()) {
      setError("Add a short explanation.");
      return;
    }
    writeDraft({ ...payload(), step: 3 });
    onContinue();
  }

  return (
    <>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form className="card form" onSubmit={save}>
        <div className="farmer-picker">
          <Field label="Tree species" name="species_search" help="Approved species, A to Z. Search by common name, scientific name, or local name.">
            <input
              id="species_search"
              value={query}
              placeholder="Species name"
              autoComplete="off"
              onFocus={() => { setListOpen(true); setBrowsing(true); }}
              onBlur={() => window.setTimeout(() => setListOpen(false), 150)}
              onChange={(event) => {
                setQuery(event.target.value);
                setBrowsing(false);
                setListOpen(true);
                setSpeciesId("");
                setVarietyId("");
              }}
            />
          </Field>
          {listOpen ? (
            matches.length === 0 ? <p className="help">No approved species matches that name.</p> : (
              <ul className="farmer-menu">
                {matches.map((item) => (
                  <li key={item.id}>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSpecies(item)}>
                      <strong>{item.common_name}</strong>
                      <span className="help">{item.scientific_name}</span>
                      <span className="help">{item.local_name || "Local name not recorded"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>

        {selected ? (
          <section className="species-card">
            <h2>{selected.common_name}</h2>
            <dl>
              <div><dt>Common name</dt><dd>{selected.common_name}</dd></div>
              <div><dt>Scientific name</dt><dd>{selected.scientific_name}</dd></div>
              <div><dt>Kinyarwanda / local name</dt><dd>{recorded(selected.local_name)}</dd></div>
              <div><dt>Other local names</dt><dd>{selected.other_local_names && selected.other_local_names.length > 0 ? selected.other_local_names.join(", ") : "Not recorded"}</dd></div>
              <div><dt>Growth form</dt><dd>{choiceLabel(growthForms, selected.growth_form)}</dd></div>
              <div><dt>Tree classification</dt><dd>{classLabels(selected.classifications)}</dd></div>
              <div><dt>Primary uses</dt><dd>{recorded(selected.primary_uses)}</dd></div>
              <div><dt>Harvest potential</dt><dd>{selected.harvest_potential == null ? "Not recorded" : selected.harvest_potential ? "Yes" : "No"}</dd></div>
              <div><dt>Harvest type</dt><dd>{recorded(selected.harvest_type)}</dd></div>
              <div><dt>Rwanda suitability</dt><dd>{recorded(selected.rwanda_suitability)}</dd></div>
              <div><dt>Data source</dt><dd>{recorded(selected.data_source)}</dd></div>
            </dl>
            {varieties.length > 0 ? (
              <Field label="Variety" name="variety_id" help="Optional. Only varieties already recorded for this species.">
                <select id="variety_id" value={varietyId} onChange={(event) => setVarietyId(event.target.value)}>
                  <option value="">No variety selected</option>
                  {varieties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
            ) : <p className="help">No varieties are recorded for this species.</p>}
            {incomplete ? <p className="help">Some details are not recorded. An administrator needs to review them. Field agents cannot edit this species record.</p> : null}
          </section>
        ) : null}

        <fieldset className="role-choice">
          <legend>Where did this tree come from?</legend>
          {origins.map((item) => (
            <label key={item.id}>
              <span>
                <input type="radio" name="seedling-origin" checked={origin === item.id} onChange={() => chooseOrigin(item.id)} /> {item.label}
              </span>
            </label>
          ))}
        </fieldset>

        {origin === "nursery" ? (
          <>
            <Field label="Nursery" name="nursery_site_id">
              <select id="nursery_site_id" value={nurseryId} onChange={(event) => { setNurseryId(event.target.value); setLotId(""); }}>
                <option value="">Select a nursery</option>
                {nurseries.map((site) => {
                  const place = [site.district, site.sector, site.village].filter(Boolean).join(", ");
                  return <option key={site.id} value={site.id}>{place ? `${site.name} · ${place}` : site.name}</option>;
                })}
              </select>
            </Field>
            {nurseries.length === 0 ? <p className="help">No registered nursery is on the list.</p> : null}
            {nurseryId ? (
              nurseryStock.size === 0 ? <p className="help">No seedlings are recorded at this nursery yet.</p> : (
                <div>
                  <p className="help">Seedlings at this nursery</p>
                  <ul>
                    {[...nurseryStock.entries()].map(([name, count]) => (
                      <li key={name}>{name} · {count === 1 ? "1 seedling left" : `${count} seedlings left`}</li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}
            {nurseryId && selected ? (
              matchingLots.length === 0 ? <p className="help">No seedling batch is recorded for this nursery and species. You can continue without a batch.</p> : (
                <Field label="Seedling batch" name="seedling_lot_id" help="Optional. Existing batches for this nursery and species.">
                  <select id="seedling_lot_id" value={lotId} onChange={(event) => setLotId(event.target.value)}>
                    <option value="">No batch selected</option>
                    {matchingLots.map((lot) => (
                      <option key={lot.id} value={lot.id}>{lot.public_code} · {lot.species_common_name} · {lot.quantity_remaining} left</option>
                    ))}
                  </select>
                </Field>
              )
            ) : null}
          </>
        ) : null}

        {origin === "farmer" ? (
          <Field label="Farmer who produced the seedling" name="producer_farmer_id" help="Optional. Farmers you already registered.">
            <select id="producer_farmer_id" value={producerId} onChange={(event) => setProducerId(event.target.value)}>
              <option value="">Not known</option>
              {knownFarmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.display_name}</option>)}
            </select>
          </Field>
        ) : null}

        {origin === "natural" ? <p className="help">No nursery or seedling batch is needed.</p> : null}

        {origin === "other" ? (
          <Field label="Explanation" name="origin_note">
            <textarea id="origin_note" value={originNote} maxLength={300} onChange={(event) => setOriginNote(event.target.value)} />
          </Field>
        ) : null}

        <Field label="Propagation method" name="propagation_method" help="Optional.">
          <select id="propagation_method" value={propagation} onChange={(event) => setPropagation(event.target.value)}>
            <option value="">Not recorded</option>
            <option value="seed">Seed</option>
            <option value="cutting">Cutting</option>
            <option value="grafting">Grafting</option>
            <option value="air_layering">Air layering</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
        </Field>
        <Field label="Seedling condition" name="seedling_condition" help="Optional.">
          <select id="seedling_condition" value={condition} onChange={(event) => setCondition(event.target.value)}>
            <option value="">Not recorded</option>
            <option value="healthy">Healthy</option>
            <option value="damaged">Damaged</option>
            <option value="other">Other</option>
          </select>
        </Field>

        <div className="actions">
          {onBack ? <button className="secondary" type="button" onClick={back}>Back</button> : null}
          <button className="primary" type="submit">Save and continue</button>
        </div>
      </form>
    </>
  );
}
