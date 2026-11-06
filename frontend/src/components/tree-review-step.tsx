"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Banner } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { choiceLabel, plantingMethods, soilTypes, terrains, waterSources, yesNoUnknown } from "@/lib/planting-choices";
import { clearDraft, readDraft, type TreeDraft } from "@/lib/tree-draft";
import type { Farmer, Species } from "@/lib/types";
import { newRequestId, optionalNumber } from "@/lib/validation";

const origins: Record<string, string> = {
  nursery: "Registered nursery",
  farmer: "Farmer-produced",
  natural: "Natural regeneration",
  other: "Other",
};

const propagation: Record<string, string> = {
  seed: "Seed",
  cutting: "Cutting",
  grafting: "Grafting",
  air_layering: "Air layering",
  other: "Other",
  unknown: "Unknown",
};

function shown(value: string) {
  return value.trim() || "Not recorded";
}

export function TreeReviewStep({
  onBack,
  photoUrl,
}: {
  onBack: () => void;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const requestId = useRef(newRequestId());
  const [draft, setDraft] = useState<TreeDraft | null>(null);
  const [farmerName, setFarmerName] = useState("No named farmer");
  const [species, setSpecies] = useState<Species | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = readDraft();
    setDraft(current);
    if (user?.role === "farmer") {
      setFarmerName(user.full_name);
    } else if (current.farmer_id) {
      api<Farmer[]>(`/farmers`).then((rows) => {
        const farmer = rows.find((item) => item.id === current.farmer_id);
        setFarmerName(farmer?.display_name ?? "Farmer on the list");
      }).catch(() => undefined);
    }
    if (current.species_id) {
      api<Species[]>("/species").then((rows) => {
        setSpecies(rows.find((item) => item.id === current.species_id) ?? null);
      }).catch(() => undefined);
    }
  }, [user]);

  async function submit() {
    if (!draft?.species_id || !species) {
      setError("Choose a species before submitting.");
      return;
    }
    if (!draft.planting_date || !draft.planting_method) {
      setError("Add the planting date and method before submitting.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api<{ id: string }>("/trees", {
        method: "POST",
        body: JSON.stringify({
          species_id: draft.species_id,
          category: species.category,
          farmer_id: draft.farmer_id,
          planting_date: draft.planting_date,
          planting_date_approximate: draft.planting_date_approximate,
          planting_method: draft.planting_method,
          planting_method_note: draft.planting_method === "other" ? draft.planting_method_note : null,
          soil_type: draft.soil_type || null,
          terrain: draft.terrain || null,
          water_availability: draft.water_availability || null,
          spacing: draft.spacing.trim() || null,
          fertilizer_applied: draft.fertilizer_applied || null,
          mulching_applied: draft.mulching_applied || null,
          watering_provided: draft.watering_provided || null,
          notes: draft.planting_notes.trim() || null,
          latitude: optionalNumber(draft.latitude),
          longitude: optionalNumber(draft.longitude),
          client_request_id: requestId.current,
        }),
      });
      clearDraft();
      router.push(`/trees/${saved.id}?created=1`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The tree could not be saved.");
      setSaving(false);
    }
  }

  if (!draft) return null;

  const rows: [string, string][] = [
    ["Farmer", farmerName],
    ["Species", species ? `${species.common_name} (${species.scientific_name})` : "Not recorded"],
    ["Local name", species?.local_name || "Not recorded"],
    ["Seedling origin", origins[draft.seedling_origin] ?? "Not recorded"],
    ["Propagation method", propagation[draft.propagation_method] ?? "Not recorded"],
    ["Seedling condition", shown(draft.seedling_condition)],
    ["Latitude", shown(draft.latitude)],
    ["Longitude", shown(draft.longitude)],
    ["Planting date", draft.planting_date_approximate ? `${draft.planting_date} (approximate)` : draft.planting_date],
    ["Planting method", draft.planting_method === "other" ? draft.planting_method_note : choiceLabel(plantingMethods, draft.planting_method)],
    ["Soil type", draft.soil_type ? choiceLabel(soilTypes, draft.soil_type) : "Not recorded"],
    ["Terrain / slope", draft.terrain ? choiceLabel(terrains, draft.terrain) : "Not recorded"],
    ["Water availability", draft.water_availability ? choiceLabel(waterSources, draft.water_availability) : "Not recorded"],
    ["Spacing", shown(draft.spacing)],
    ["Fertilizer or manure", draft.fertilizer_applied ? choiceLabel(yesNoUnknown, draft.fertilizer_applied) : "Not recorded"],
    ["Mulching", draft.mulching_applied ? choiceLabel(yesNoUnknown, draft.mulching_applied) : "Not recorded"],
    ["Watering", draft.watering_provided ? choiceLabel(yesNoUnknown, draft.watering_provided) : "Not recorded"],
    ["Notes", shown(draft.planting_notes)],
  ];

  return (
    <>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <section className="card">
        <h2>Review</h2>
        <dl className="review-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {photoUrl ? <Image className="review-photo" src={photoUrl} alt="Planting photo" width={360} height={240} unoptimized /> : <p className="help">No planting photo.</p>}
        <p className="help">Monitoring is recorded later, after this tree is registered.</p>
        <div className="actions">
          <button className="secondary" type="button" onClick={onBack}>Back</button>
          <button className="primary" type="button" onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : "Submit"}</button>
        </div>
      </section>
    </>
  );
}
