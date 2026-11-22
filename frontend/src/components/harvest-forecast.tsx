"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { speciesPhoto } from "@/components/map-cards";
import { api } from "@/lib/api";
import { localizePhrase, useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

type Forecast = {
  role: string;
  totals: { unit: "kg" | "count"; low: number; high: number; trees: number }[];
  by_species: { species_common_name: string; unit: "kg" | "count"; low: number; high: number; trees: number; source: string | null }[];
  by_district: { label: string; unit: "kg" | "count"; low: number; high: number; trees: number }[];
  by_province: { label: string; unit: "kg" | "count"; low: number; high: number; trees: number }[];
  by_sector?: { label: string; unit: "kg" | "count"; low: number; high: number; trees: number }[];
  by_farmer: { label: string; unit: "kg" | "count"; low: number; high: number; trees: number }[];
  plantings: ForecastPlanting[];
  young_trees: number;
  bearing_trees: number;
  unestimated_trees: number;
  registered_trees?: number;
  farmers?: ForecastFarmer[];
  agents?: ForecastAgent[];
};

type ForecastPlanting = {
  public_code: string;
  species_common_name: string;
  trees: number;
  unit: "kg" | "count" | null;
  low: number | null;
  high: number | null;
  basis: string;
  note: string;
  months?: number[];
  kind?: "tree" | "batch";
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  farmer_id?: string | null;
};

type ForecastAgent = {
  agent_id: string;
  display_name: string;
  farmer_count: number;
};

type ForecastFarmer = {
  farmer_id: string;
  display_name: string;
  province: string | null;
  district: string | null;
  registered_trees: number;
  totals: Forecast["totals"];
  by_species: Forecast["by_species"];
  plantings: ForecastPlanting[];
  young_trees: number;
  bearing_trees: number;
  unestimated_trees: number;
  agent_id?: string | null;
  agent_name?: string | null;
};

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

function amount(low: number, high: number, unit: "kg" | "count", fruit = "fruit") {
  const label = unit === "kg" ? "kg" : fruit;
  const start = number(low);
  const end = number(high);
  return start === end ? `${start} ${label}` : `${start}–${end} ${label}`;
}

const basisKey: Record<string, MessageKey> = {
  recorded: "forecast.basisRecorded",
  household: "forecast.basisHousehold",
  reference: "forecast.basisReference",
  bearing: "forecast.basisBearing",
  young: "forecast.basisYoung",
  none: "forecast.basisNone",
};

type SpeciesLine = {
  name: string;
  unit: "kg" | "count" | null;
  low: number;
  high: number;
  trees: number;
  plain: Forecast["plantings"];
};

function periodText(months: number[], t: (key: MessageKey) => string) {
  const unique = [...new Set(months.filter((month) => month >= 1 && month <= 12))].sort((left, right) => left - right);
  if (!unique.length) return null;
  const names = unique.map((month) => t(`month.${month}` as MessageKey));
  const consecutive = unique.every((month, index) => index === 0 || month === unique[index - 1] + 1);
  return consecutive && names.length > 1 ? `${names[0]} – ${names[names.length - 1]}` : names.join(", ");
}

function asForecast(farmer: ForecastFarmer): Forecast {
  return {
    role: "farmer",
    totals: farmer.totals,
    by_species: farmer.by_species,
    by_district: [],
    by_province: [],
    by_farmer: [],
    plantings: farmer.plantings,
    young_trees: farmer.young_trees,
    bearing_trees: farmer.bearing_trees,
    unestimated_trees: farmer.unestimated_trees,
  };
}

function FarmerForecastCard({ forecast, part }: { forecast: Forecast; part: "summary" | "detail" }) {
  const { t } = useI18n();
  return (
    <section className="card farmer-forecast" aria-label={t("forecast.title")}>
      <h2>{t("forecast.title")}</h2>
      <p className="help">{t("forecast.farmerHelp")}</p>
      <ForecastBody forecast={forecast} part={part} />
    </section>
  );
}

function ForecastBody({ forecast, part = "full" }: { forecast: Forecast; part?: "summary" | "detail" | "full" }) {
  const { language, t } = useI18n();
  const fruit = t("forecast.fruitUnit");
  const [open, setOpen] = useState(false);
  const productive = forecast.totals.reduce((sum, row) => sum + row.trees, 0);
  const period = periodText(
    forecast.plantings.filter((row) => row.low != null).flatMap((row) => row.months ?? []),
    t,
  );
  const species = new Map<string, { name: string; parts: { unit: "kg" | "count"; low: number; high: number; trees: number }[]; plain: Forecast["plantings"] }>();
  for (const row of forecast.plantings) {
    const current = species.get(row.species_common_name) ?? { name: row.species_common_name, parts: [], plain: [] };
    if (row.unit && row.low != null && row.high != null) {
      const part = current.parts.find((item) => item.unit === row.unit);
      if (part) {
        part.low += row.low;
        part.high += row.high;
        part.trees += row.trees;
      } else {
        current.parts.push({ unit: row.unit, low: row.low, high: row.high, trees: row.trees });
      }
    } else {
      current.plain.push(row);
    }
    species.set(row.species_common_name, current);
  }
  const speciesRows: SpeciesLine[] = [];
  for (const row of species.values()) {
    if (row.parts.length) {
      for (const part of row.parts) speciesRows.push({ name: row.name, ...part, plain: [] });
    } else {
      speciesRows.push({ name: row.name, unit: null, low: 0, high: 0, trees: 0, plain: row.plain });
    }
  }
  const shown = open ? forecast.plantings : forecast.plantings.slice(0, 4);
  const showSummary = part !== "detail";
  const showDetail = part !== "summary";
  return (
    <>
      {showSummary ? <div className="farmer-forecast-kpis">
        <div>
          <span>{t("forecast.expectedProduction")}</span>
          {forecast.totals.length ? forecast.totals.map((row) => (
            <strong key={row.unit}>{amount(row.low, row.high, row.unit, fruit)}</strong>
          )) : <strong className="is-empty">{t("forecast.notEstimated")}</strong>}
          <small>{t("forecast.estimateNote")}</small>
        </div>
        <div>
          <span>{t("forecast.productiveLabel")}</span>
          <strong className="is-count">{number(productive)}</strong>
          {forecast.young_trees ? <small>{t(forecast.young_trees === 1 ? "forecast.youngOne" : "forecast.youngMany", { count: number(forecast.young_trees) })}</small> : null}
          {forecast.bearing_trees ? <small>{t(forecast.bearing_trees === 1 ? "forecast.bearingOne" : "forecast.bearingMany", { count: number(forecast.bearing_trees) })}</small> : null}
          {forecast.unestimated_trees ? <small>{t(forecast.unestimated_trees === 1 ? "forecast.missingOne" : "forecast.missingMany", { count: number(forecast.unestimated_trees) })}</small> : null}
        </div>
      </div> : null}
      {showDetail && period ? (
        <div className="farmer-forecast-period">
          <span>{t("forecast.next")}</span>
          <strong>{period}</strong>
          <small>{t("forecast.periodNote")}</small>
        </div>
      ) : null}
      {showDetail && speciesRows.length ? (
        <div className="farmer-forecast-species">
          <h3>{t("forecast.bySpecies")}</h3>
          <ul>
            {speciesRows.map((row) => {
              const photo = speciesPhoto(row.name);
              const estimated = row.unit !== null && row.trees > 0;
              return (
                <li key={`${row.name}-${row.unit ?? "none"}`}>
                  <span className="farmer-forecast-photo" style={photo ? { backgroundImage: `url(${photo})` } : undefined} role="img" aria-label={row.name} />
                  <span>
                    <strong>{row.name}</strong>
                    <small>
                      {estimated
                        ? t(row.trees === 1 ? "forecast.productiveOne" : "forecast.productiveMany", { count: number(row.trees) })
                        : row.plain.every((item) => item.basis === "young")
                          ? t("forecast.basisYoung")
                          : t("forecast.noReferenceShort")}
                    </small>
                  </span>
                  {estimated && row.unit ? <b>{amount(row.low, row.high, row.unit, fruit)}</b> : <em>{t("forecast.notEstimated")}</em>}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {showDetail && forecast.plantings.length ? (
        <div className="farmer-forecast-details">
          <h3>{t("forecast.details")}</h3>
          <table>
            <thead>
              <tr><th scope="col">{t("forecast.tree")}</th><th scope="col">{t("forecast.expected")}</th><th scope="col">{t("forecast.basis")}</th></tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.public_code}>
                  <th scope="row">
                    {row.species_common_name} {t(row.kind === "batch" ? "forecast.batchKind" : "forecast.treeKind")}
                    <small><code>{row.public_code}</code></small>
                  </th>
                  <td>{row.unit && row.low != null && row.high != null ? amount(row.low, row.high, row.unit, fruit) : "—"}</td>
                  <td title={localizePhrase(language, row.note)}>{t(basisKey[row.basis] ?? "forecast.basisNone")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {forecast.plantings.length > 4 ? (
            <button type="button" className="farmer-forecast-more" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d={open ? "M4 10 L8 6 L12 10" : "M4 6 L8 10 L12 6"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <span>{open ? t("forecast.hideDetails") : t("forecast.showDetails")}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {showDetail ? <p className="help">{t("forecast.help")}</p> : null}
    </>
  );
}

function placeLabel(farmer: ForecastFarmer) {
  return [farmer.province, farmer.district].filter(Boolean).join(" · ");
}

function OfficerForecast({ forecast, onBack, heading, part = "full" }: { forecast: Forecast; onBack?: () => void; heading?: string; part?: "summary" | "detail" | "full" }) {
  const { t } = useI18n();
  const fruit = t("forecast.fruitUnit");
  const farmers = forecast.farmers ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selected = farmers.find((farmer) => farmer.farmer_id === selectedId) ?? null;
  const totals = new Map<string, { unit: "kg" | "count"; low: number; high: number; trees: number }>();
  const species = new Map<string, { name: string; unit: "kg" | "count"; low: number; high: number }>();
  let productive = 0;
  let registered = 0;
  let young = 0;
  let bearing = 0;
  let missing = 0;
  for (const farmer of farmers) {
    registered += farmer.registered_trees;
    young += farmer.young_trees;
    bearing += farmer.bearing_trees;
    missing += farmer.unestimated_trees;
    for (const row of farmer.totals) {
      productive += row.trees;
      const current = totals.get(row.unit) ?? { unit: row.unit, low: 0, high: 0, trees: 0 };
      current.low += row.low;
      current.high += row.high;
      current.trees += row.trees;
      totals.set(row.unit, current);
    }
    for (const row of farmer.by_species) {
      const key = `${row.species_common_name}:${row.unit}`;
      const current = species.get(key) ?? { name: row.species_common_name, unit: row.unit, low: 0, high: 0 };
      current.low += row.low;
      current.high += row.high;
      species.set(key, current);
    }
  }
  const speciesRows = [...species.values()].sort((left, right) => right.high - left.high || left.name.localeCompare(right.name));
  const peak = new Map<string, number>();
  for (const row of speciesRows) peak.set(row.unit, Math.max(peak.get(row.unit) ?? 0, row.high));
  const shown = open ? farmers : farmers.slice(0, 4);
  if (selected) {
    const place = placeLabel(selected);
    return (
      <section className="card farmer-forecast" aria-label={selected.display_name}>
        <button type="button" className="farmer-forecast-back" onClick={() => setSelectedId(null)}>{t("forecast.back")}</button>
        <h2>{selected.display_name}</h2>
        <p className="help">{place ? `${t("forecast.registeredFarmer")} · ${place}` : t("forecast.registeredFarmer")}</p>
        <ForecastBody forecast={asForecast(selected)} />
      </section>
    );
  }
  return (
    <section className="card farmer-forecast" aria-label={heading ?? t("forecast.title")}>
      {onBack ? <button type="button" className="farmer-forecast-back" onClick={onBack}>{t("forecast.backAgents")}</button> : null}
      <div className="farmer-forecast-head">
        <div>
          <h2>{heading ?? t("forecast.title")}</h2>
          <p className="help">{t("forecast.officerHelp")}</p>
        </div>
        <span className="farmer-forecast-pill">{t("shell.role.officer")}</span>
      </div>
      {part !== "detail" ? <div className="farmer-forecast-kpis officer-forecast-kpis">
        <div>
          <span>{t("forecast.expectedProduction")}</span>
          {totals.size ? [...totals.values()].map((row) => (
            <strong key={row.unit}>{amount(row.low, row.high, row.unit, fruit)}</strong>
          )) : <strong className="is-empty">{t("forecast.notEstimated")}</strong>}
          <small>{t("forecast.combined")}</small>
        </div>
        <div>
          <span>{t("forecast.assigned")}</span>
          <strong className="is-count">{number(farmers.length)}</strong>
          <small>{t("forecast.assignedHelp")}</small>
        </div>
        <div>
          <span>{t("forecast.productiveLabel")}</span>
          <strong className="is-count">{number(productive)}</strong>
          <small>{t("forecast.productiveNow")}</small>
        </div>
        <div>
          <span>{t("forecast.registeredLabel")}</span>
          <strong className="is-count">{number(registered)}</strong>
          {young ? <small>{t(young === 1 ? "forecast.youngOne" : "forecast.youngMany", { count: number(young) })}</small> : null}
          {bearing ? <small>{t(bearing === 1 ? "forecast.bearingOne" : "forecast.bearingMany", { count: number(bearing) })}</small> : null}
          {missing ? <small>{t(missing === 1 ? "forecast.missingOne" : "forecast.missingMany", { count: number(missing) })}</small> : null}
        </div>
      </div> : null}
      {part !== "summary" && speciesRows.length ? (
        <div className="officer-forecast-species">
          <h3>{t("forecast.bySpecies")}</h3>
          <ul>
            {speciesRows.map((row) => {
              const width = peak.get(row.unit) ? Math.max(8, Math.round((row.high / (peak.get(row.unit) ?? 1)) * 100)) : 0;
              return (
                <li key={`${row.name}-${row.unit}`}>
                  <div><strong>{row.name}</strong><b>{amount(row.low, row.high, row.unit, fruit)}</b></div>
                  <span className="officer-forecast-track"><span style={{ width: `${width}%` }} /></span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {part !== "summary" ? <div className="officer-forecast-farmers">
        <h3>{t("forecast.farmersTitle")}</h3>
        <p className="help">{farmers.length ? t("forecast.farmersHelp") : t("forecast.noFarmers")}</p>
        <ul>
          {shown.map((farmer) => (
            <li key={farmer.farmer_id}>
              <div>
                <strong>{farmer.display_name}</strong>
                {placeLabel(farmer) ? <small>{placeLabel(farmer)}</small> : null}
                <button type="button" onClick={() => setSelectedId(farmer.farmer_id)}>{t("forecast.viewFarmer")}</button>
              </div>
              <div>
                {farmer.totals.length ? farmer.totals.map((row) => (
                  <b key={row.unit}>{amount(row.low, row.high, row.unit, fruit)}</b>
                )) : <b>{t("forecast.notEstimated")}</b>}
                <small>{t(farmer.registered_trees === 1 ? "forecast.treeCountOne" : "forecast.treeCountMany", { count: number(farmer.registered_trees) })}</small>
              </div>
            </li>
          ))}
        </ul>
        {farmers.length > 4 ? (
          <button type="button" className="farmer-forecast-more" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d={open ? "M4 10 L8 6 L12 10" : "M4 6 L8 10 L12 6"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <span>{open ? t("forecast.hideFarmers") : t("forecast.showFarmers")}</span>
          </button>
        ) : null}
      </div> : null}
    </section>
  );
}

function FarmerDetail({ farmer, onBack }: { farmer: ForecastFarmer; onBack: () => void }) {
  const { t } = useI18n();
  const place = placeLabel(farmer);
  const line = [farmer.agent_name, place].filter(Boolean).join(" · ");
  return (
    <section className="card farmer-forecast" aria-label={farmer.display_name}>
      <button type="button" className="farmer-forecast-back" onClick={onBack}>{t("forecast.backAgents")}</button>
      <h2>{farmer.display_name}</h2>
      <p className="help">{line ? `${t("forecast.registeredFarmer")} · ${line}` : t("forecast.registeredFarmer")}</p>
      <ForecastBody forecast={asForecast(farmer)} />
    </section>
  );
}

function AdminForecast({ forecast, part }: { forecast: Forecast; part: "summary" | "detail" }) {
  const { t } = useI18n();
  const fruit = t("forecast.fruitUnit");
  const farmers = forecast.farmers ?? [];
  const agents = forecast.agents ?? [];
  const [level, setLevel] = useState<"province" | "district" | "sector">("province");
  const [selected, setSelected] = useState<{ kind: "agent" | "farmer"; id: string } | null>(null);
  const [openAgents, setOpenAgents] = useState(false);
  const [openFarmers, setOpenFarmers] = useState(false);
  const [openPlaces, setOpenPlaces] = useState(false);
  const rows = forecast.plantings;
  const totals = new Map<string, { unit: "kg" | "count"; low: number; high: number; trees: number }>();
  const species = new Map<string, { name: string; unit: "kg" | "count"; low: number; high: number }>();
  const places = new Map<string, { label: string; unit: "kg" | "count"; low: number; high: number }>();
  let registered = 0;
  let productive = 0;
  let young = 0;
  let bearing = 0;
  let missing = 0;
  for (const row of rows) {
    registered += row.trees;
    if (row.basis === "young") young += row.trees;
    else if (row.basis === "bearing") bearing += row.trees;
    else if (row.basis === "none") missing += row.trees;
    if (!row.unit || row.low == null || row.high == null) continue;
    productive += row.trees;
    const total = totals.get(row.unit) ?? { unit: row.unit, low: 0, high: 0, trees: 0 };
    total.low += row.low;
    total.high += row.high;
    total.trees += row.trees;
    totals.set(row.unit, total);
    const speciesKey = `${row.species_common_name}:${row.unit}`;
    const speciesRow = species.get(speciesKey) ?? { name: row.species_common_name, unit: row.unit, low: 0, high: 0 };
    speciesRow.low += row.low;
    speciesRow.high += row.high;
    species.set(speciesKey, speciesRow);
    const place = level === "province" ? row.province : level === "district" ? row.district : row.sector;
    if (place) {
      const placeKey = `${place}:${row.unit}`;
      const placeRow = places.get(placeKey) ?? { label: place, unit: row.unit, low: 0, high: 0 };
      placeRow.low += row.low;
      placeRow.high += row.high;
      places.set(placeKey, placeRow);
    }
  }
  const speciesRows = [...species.values()].sort((left, right) => right.high - left.high || left.name.localeCompare(right.name));
  const peak = new Map<string, number>();
  for (const row of speciesRows) peak.set(row.unit, Math.max(peak.get(row.unit) ?? 0, row.high));
  const placeRows = [...places.values()].sort((left, right) => right.high - left.high || left.label.localeCompare(right.label));
  const shownAgents = openAgents ? agents : agents.slice(0, 4);
  const shownFarmers = openFarmers ? farmers : farmers.slice(0, 4);
  const shownPlaces = openPlaces ? placeRows : placeRows.slice(0, 4);
  if (part === "detail" && selected?.kind === "agent") {
    const agent = agents.find((item) => item.agent_id === selected.id);
    const scoped: Forecast = { ...forecast, role: "field_officer", farmers: farmers.filter((farmer) => farmer.agent_id === selected.id) };
    return <OfficerForecast forecast={scoped} heading={agent?.display_name} onBack={() => setSelected(null)} />;
  }
  if (part === "detail" && selected?.kind === "farmer") {
    const farmer = farmers.find((item) => item.farmer_id === selected.id);
    if (farmer) return <FarmerDetail farmer={farmer} onBack={() => setSelected(null)} />;
  }
  return (
    <section className="card farmer-forecast" aria-label={t("forecast.title")}>
      <div className="farmer-forecast-head">
        <div>
          <h2>{t("forecast.title")}</h2>
          <p className="help">{t("forecast.adminHelp")}</p>
        </div>
        <span className="farmer-forecast-pill">{t("shell.role.admin")}</span>
      </div>
      {part === "summary" ? (
      <div className="farmer-forecast-kpis officer-forecast-kpis">
        <div>
          <span>{t("forecast.expectedProduction")}</span>
          {totals.size ? [...totals.values()].map((row) => <strong key={row.unit}>{amount(row.low, row.high, row.unit, fruit)}</strong>) : <strong className="is-empty">{t("forecast.notEstimated")}</strong>}
          <small>{t("forecast.combined")}</small>
        </div>
        <div>
          <span>{t("forecast.registeredFarmers")}</span>
          <strong className="is-count">{number(farmers.length)}</strong>
          <small>{t("forecast.acrossPlatform")}</small>
        </div>
        <div>
          <span>{t("forecast.productiveLabel")}</span>
          <strong className="is-count">{number(productive)}</strong>
          <small>{t("forecast.productiveNow")}</small>
        </div>
        <div>
          <span>{t("forecast.registeredLabel")}</span>
          <strong className="is-count">{number(registered)}</strong>
          {young ? <small>{t(young === 1 ? "forecast.youngOne" : "forecast.youngMany", { count: number(young) })}</small> : null}
          {bearing ? <small>{t(bearing === 1 ? "forecast.bearingOne" : "forecast.bearingMany", { count: number(bearing) })}</small> : null}
          {missing ? <small>{t(missing === 1 ? "forecast.missingOne" : "forecast.missingMany", { count: number(missing) })}</small> : null}
        </div>
      </div>
      ) : null}
      {part === "detail" && speciesRows.length ? (
        <div className="officer-forecast-species">
          <h3>{t("forecast.bySpecies")}</h3>
          <ul>
            {speciesRows.map((row) => {
              const width = peak.get(row.unit) ? Math.max(8, Math.round((row.high / (peak.get(row.unit) ?? 1)) * 100)) : 0;
              return (
                <li key={`${row.name}-${row.unit}`}>
                  <div><strong>{row.name}</strong><b>{amount(row.low, row.high, row.unit, fruit)}</b></div>
                  <span className="officer-forecast-track"><span style={{ width: `${width}%` }} /></span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {part === "detail" ? <>
      <div className="officer-forecast-farmers">
        <h3>{t("forecast.byLocation")}</h3>
        <div className="forecast-level" role="group" aria-label={t("forecast.byLocation")}>
          {(["province", "district", "sector"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={level === item} onClick={() => { setLevel(item); setOpenPlaces(false); }}>{t(`forecast.${item}`)}</button>
          ))}
        </div>
        {shownPlaces.length ? (
          <table className="forecast-plain-table">
            <thead><tr><th scope="col">{t("forecast.location")}</th><th scope="col">{t("forecast.expected")}</th></tr></thead>
            <tbody>
              {shownPlaces.map((row) => (
                <tr key={`${row.label}-${row.unit}`}><th scope="row">{row.label}</th><td>{amount(row.low, row.high, row.unit, fruit)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="help">{t("forecast.noLocation")}</p>}
        {placeRows.length > 4 ? (
          <button type="button" className="farmer-forecast-more" aria-expanded={openPlaces} onClick={() => setOpenPlaces((current) => !current)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d={openPlaces ? "M4 10 L8 6 L12 10" : "M4 6 L8 10 L12 6"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <span>{openPlaces ? t("forecast.hideLocations") : t("forecast.showLocations")}</span>
          </button>
        ) : null}
      </div>
      <div className="officer-forecast-farmers">
        <h3>{t("forecast.byAgent")}</h3>
        <p className="help">{t("forecast.agentHelp")}</p>
        <ul>
          {shownAgents.map((agent) => {
            const group = farmers.filter((farmer) => farmer.agent_id === agent.agent_id);
            const agentRows = group.flatMap((farmer) => farmer.plantings);
            const agentTotals = new Map<string, { unit: "kg" | "count"; low: number; high: number }>();
            let trees = 0;
            for (const row of agentRows) {
              trees += row.trees;
              if (!row.unit || row.low == null || row.high == null) continue;
              const current = agentTotals.get(row.unit) ?? { unit: row.unit, low: 0, high: 0 };
              current.low += row.low;
              current.high += row.high;
              agentTotals.set(row.unit, current);
            }
            return (
              <li key={agent.agent_id}>
                <div>
                  <strong>{agent.display_name}</strong>
                  <small>{t("forecast.assignedCount", { count: number(group.length) })} · {t(trees === 1 ? "forecast.treeCountOne" : "forecast.treeCountMany", { count: number(trees) })}</small>
                  <button type="button" onClick={() => setSelected({ kind: "agent", id: agent.agent_id })}>{t("forecast.viewAgent")}</button>
                </div>
                <div>
                  {agentTotals.size ? [...agentTotals.values()].map((row) => <b key={row.unit}>{amount(row.low, row.high, row.unit, fruit)}</b>) : <b>{t("forecast.notEstimated")}</b>}
                </div>
              </li>
            );
          })}
        </ul>
        {agents.length > 4 ? (
          <button type="button" className="farmer-forecast-more" aria-expanded={openAgents} onClick={() => setOpenAgents((current) => !current)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d={openAgents ? "M4 10 L8 6 L12 10" : "M4 6 L8 10 L12 6"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <span>{openAgents ? t("forecast.hideFarmers") : t("forecast.showAgents")}</span>
          </button>
        ) : null}
      </div>
      <div className="officer-forecast-farmers">
        <h3>{t("forecast.farmersPlatform")}</h3>
        <p className="help">{t("forecast.farmersPlatformHelp")}</p>
        <table className="forecast-plain-table">
          <thead>
            <tr><th scope="col">{t("forecast.farmersPlatform")}</th><th scope="col">{t("forecast.agentColumn")}</th><th scope="col">{t("forecast.expected")}</th></tr>
          </thead>
          <tbody>
            {shownFarmers.map((farmer) => {
              const matched = farmer.plantings;
              const farmerTotals = new Map<string, { unit: "kg" | "count"; low: number; high: number }>();
              for (const row of matched) {
                if (!row.unit || row.low == null || row.high == null) continue;
                const current = farmerTotals.get(row.unit) ?? { unit: row.unit, low: 0, high: 0 };
                current.low += row.low;
                current.high += row.high;
                farmerTotals.set(row.unit, current);
              }
              return (
                <tr key={farmer.farmer_id}>
                  <th scope="row">
                    {farmer.display_name}
                    <button type="button" onClick={() => setSelected({ kind: "farmer", id: farmer.farmer_id })}>{t("forecast.viewFarmer")}</button>
                  </th>
                  <td>{farmer.agent_name ?? "—"}</td>
                  <td>{farmerTotals.size ? [...farmerTotals.values()].map((row) => amount(row.low, row.high, row.unit, fruit)).join(", ") : t("forecast.notEstimated")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {farmers.length > 4 ? (
          <button type="button" className="farmer-forecast-more" aria-expanded={openFarmers} onClick={() => setOpenFarmers((current) => !current)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d={openFarmers ? "M4 10 L8 6 L12 10" : "M4 6 L8 10 L12 6"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <span>{openFarmers ? t("forecast.hideFarmers") : t("forecast.showFarmers")}</span>
          </button>
        ) : null}
      </div>
      </> : null}
    </section>
  );
}

function GroupTable({ caption, rows, fruit }: { caption: string; rows: Forecast["by_district"]; fruit: string }) {
  const { t } = useI18n();
  if (!rows.length) return null;
  return (
    <div className="table-wrap compact-table-scroll">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">{t("forecast.name")}</th><th scope="col">{t("forecast.trees")}</th><th scope="col">{t("forecast.expected")}</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${caption}-${row.label}-${row.unit}`}>
              <th scope="row">{row.label}</th>
              <td>{number(row.trees)}</td>
              <td>{amount(row.low, row.high, row.unit, fruit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HarvestForecast({
  district = "",
  speciesId = "",
  refreshKey = 0,
  part = "full",
}: {
  district?: string;
  speciesId?: string;
  refreshKey?: string | number;
  part?: "summary" | "detail" | "full";
}) {
  const { t } = useI18n();
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fruit = t("forecast.fruitUnit");
  useEffect(() => {
    const params = new URLSearchParams();
    if (district) params.set("district", district);
    if (speciesId) params.set("species_id", speciesId);
    const query = params.toString();
    api<Forecast>(`/harvests/forecast${query ? `?${query}` : ""}`)
      .then(setForecast)
      .catch((caught: Error) => setError(caught.message));
  }, [district, speciesId, refreshKey]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!forecast) return <p className="loading" role="status">{t("forecast.loading")}</p>;

  if (forecast.role === "farmer") return <FarmerForecastCard forecast={forecast} part={part === "detail" ? "detail" : "summary"} />;
  if (forecast.role === "field_officer") return <OfficerForecast forecast={forecast} part={part === "detail" ? "detail" : part === "summary" ? "summary" : "full"} />;
  if (forecast.role === "admin") return <AdminForecast forecast={forecast} part={part === "detail" ? "detail" : "summary"} />;
  const programme = forecast.role === "admin" || forecast.role === "field_officer";
  const sources = forecast.by_species.filter((row) => row.source);

  return (
    <section className="card" aria-label={t("forecast.title")}>
      <div className="page-head">
        <div>
          <h2>{t("forecast.title")}</h2>
          <p className="help">{t("forecast.help")}</p>
        </div>
      </div>
      {forecast.totals.length ? (
        <div className="harvest-kpi-strip" role="region" aria-label="Expected totals">
          {forecast.totals.map((row) => (
            <article className="harvest-mini-kpi" key={row.unit}>
              <span>{row.unit === "kg" ? t("forecast.kg") : t("forecast.fruit")}</span>
              <strong>{amount(row.low, row.high, row.unit, fruit)}</strong>
              <span>{t(row.trees === 1 ? "forecast.productiveOne" : "forecast.productiveMany", { count: number(row.trees) })}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="help">{t("forecast.none")}</p>
      )}
      {forecast.young_trees ? <p className="help">{t(forecast.young_trees === 1 ? "forecast.youngOne" : "forecast.youngMany", { count: number(forecast.young_trees) })}</p> : null}
      {forecast.bearing_trees ? <p className="help">{t(forecast.bearing_trees === 1 ? "forecast.bearingOne" : "forecast.bearingMany", { count: number(forecast.bearing_trees) })}</p> : null}
      {forecast.unestimated_trees ? <p className="help">{t(forecast.unestimated_trees === 1 ? "forecast.missingOne" : "forecast.missingMany", { count: number(forecast.unestimated_trees) })}</p> : null}

      {forecast.by_species.length ? (
        <div className="table-wrap compact-table-scroll">
          <table>
            <caption>{t("forecast.bySpecies")}</caption>
            <thead>
              <tr><th scope="col">{t("forecast.species")}</th><th scope="col">{t("forecast.trees")}</th><th scope="col">{t("forecast.expected")}</th></tr>
            </thead>
            <tbody>
              {forecast.by_species.map((row) => (
                <tr key={`${row.species_common_name}-${row.unit}`}>
                  <th scope="row">{row.species_common_name}</th>
                  <td>{number(row.trees)}</td>
                  <td>{amount(row.low, row.high, row.unit, fruit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {sources.map((row) => <p className="help" key={`${row.species_common_name}-${row.unit}-source`}>{row.species_common_name}: {row.source}</p>)}

      {programme ? <GroupTable caption={t("forecast.byDistrict")} rows={forecast.by_district} fruit={fruit} /> : null}
      {programme ? <GroupTable caption={t("forecast.byProvince")} rows={forecast.by_province} fruit={fruit} /> : null}
      {programme ? <GroupTable caption={t("forecast.byFarmer")} rows={forecast.by_farmer} fruit={fruit} /> : null}
    </section>
  );
}
