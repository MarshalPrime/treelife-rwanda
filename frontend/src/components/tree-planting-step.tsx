"use client";

import { useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { plantingMethods, soilTypes, terrains, waterSources, yesNoUnknown } from "@/lib/planting-choices";
import { readDraft, writeDraft } from "@/lib/tree-draft";
import { todayInput, validateDate } from "@/lib/validation";

function Choices({
  name,
  label,
  value,
  options,
  help,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  help?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} name={name} help={help}>
      <select id={name} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not recorded</option>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </Field>
  );
}

export function TreePlantingStep({
  onBack,
  onContinue,
  onPhoto,
}: {
  onBack: () => void;
  onContinue: () => void;
  onPhoto: (file: File | null) => void;
}) {
  const draft = readDraft();
  const [date, setDate] = useState(draft.planting_date || todayInput());
  const [approximate, setApproximate] = useState(draft.planting_date_approximate);
  const [method, setMethod] = useState(draft.planting_method);
  const [methodNote, setMethodNote] = useState(draft.planting_method_note);
  const [soil, setSoil] = useState(draft.soil_type);
  const [terrain, setTerrain] = useState(draft.terrain);
  const [water, setWater] = useState(draft.water_availability);
  const [spacing, setSpacing] = useState(draft.spacing);
  const [fertilizer, setFertilizer] = useState(draft.fertilizer_applied);
  const [mulching, setMulching] = useState(draft.mulching_applied);
  const [watering, setWatering] = useState(draft.watering_provided);
  const [notes, setNotes] = useState(draft.planting_notes);
  const [error, setError] = useState<string | null>(null);

  function payload() {
    return {
      planting_date: date,
      planting_date_approximate: approximate,
      planting_method: method,
      planting_method_note: method === "other" ? methodNote : "",
      soil_type: soil,
      terrain,
      water_availability: water,
      spacing,
      fertilizer_applied: fertilizer,
      mulching_applied: mulching,
      watering_provided: watering,
      planting_notes: notes,
    };
  }

  function back() {
    writeDraft(payload());
    onBack();
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const dateError = validateDate(date, "Planting date");
    if (dateError) {
      setError(dateError);
      return;
    }
    if (!method) {
      setError("Choose how the tree was planted.");
      return;
    }
    if (method === "other" && !methodNote.trim()) {
      setError("Describe the other planting method.");
      return;
    }
    writeDraft({ ...payload(), step: 5 });
    onContinue();
  }

  return (
    <>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form className="card form" onSubmit={save}>
        <Field label="Planting date" name="planting_date">
          <input id="planting_date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <label className="check-line">
          <input type="checkbox" checked={approximate} onChange={(event) => setApproximate(event.target.checked)} />
          The exact day is unknown. This date is approximate.
        </label>
        <Field label="Planting method" name="planting_method">
          <select id="planting_method" value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="">Choose a method</option>
            {plantingMethods.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </Field>
        {method === "other" ? (
          <Field label="Describe the method" name="planting_method_note">
            <input id="planting_method_note" value={methodNote} maxLength={200} onChange={(event) => setMethodNote(event.target.value)} />
          </Field>
        ) : null}
        <fieldset className="role-choice">
          <legend>Site and soil conditions</legend>
          <p className="help">Optional.</p>
          <Choices name="soil_type" label="Soil type" value={soil} options={soilTypes} onChange={setSoil} />
          <Choices name="terrain" label="Terrain / slope" value={terrain} options={terrains} onChange={setTerrain} />
          <Choices name="water_availability" label="Water availability" value={water} options={waterSources} onChange={setWater} />
        </fieldset>
        <fieldset className="role-choice">
          <legend>Planting activities</legend>
          <p className="help">Optional.</p>
          <Field label="Spacing between trees" name="spacing" help="For example, 3 m.">
            <input id="spacing" value={spacing} maxLength={40} onChange={(event) => setSpacing(event.target.value)} />
          </Field>
          <Choices name="fertilizer_applied" label="Fertilizer or manure applied" value={fertilizer} options={yesNoUnknown} onChange={setFertilizer} />
          <Choices name="mulching_applied" label="Mulching applied" value={mulching} options={yesNoUnknown} onChange={setMulching} />
          <Choices name="watering_provided" label="Watering provided" value={watering} options={yesNoUnknown} onChange={setWatering} />
          <Field label="Additional planting notes" name="planting_notes">
            <textarea id="planting_notes" value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </fieldset>
        <Field label="Planting photo" name="planting_photo" help="Optional. Shown on the review screen. It is not stored on the tree record yet.">
          <input
            id="planting_photo"
            type="file"
            accept="image/*"
            onChange={(event) => onPhoto(event.target.files?.[0] ?? null)}
          />
        </Field>
        <div className="actions">
          <button className="secondary" type="button" onClick={back}>Back</button>
          <button className="primary" type="submit">Save and continue</button>
        </div>
      </form>
    </>
  );
}
