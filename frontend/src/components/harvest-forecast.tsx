"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { api } from "@/lib/api";

type Forecast = {
  role: string;
  totals: { unit: "kg" | "count"; low: number; high: number; trees: number }[];
  by_species: { species_common_name: string; unit: "kg" | "count"; low: number; high: number; trees: number; source: string | null }[];
  by_district: { label: string; unit: "kg" | "count"; low: number; high: number; trees: number }[];
  by_province: { label: string; unit: "kg" | "count"; low: number; high: number; trees: number }[];
  by_farmer: { label: string; unit: "kg" | "count"; low: number; high: number; trees: number }[];
  plantings: {
    public_code: string;
    species_common_name: string;
    trees: number;
    unit: "kg" | "count" | null;
    low: number | null;
    high: number | null;
    basis: string;
    note: string;
  }[];
  young_trees: number;
  bearing_trees: number;
  unestimated_trees: number;
};

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

function amount(low: number, high: number, unit: "kg" | "count") {
  const label = unit === "kg" ? "kg" : "fruit";
  const start = number(low);
  const end = number(high);
  return start === end ? `${start} ${label}` : `${start}–${end} ${label}`;
}

function GroupTable({ caption, rows }: { caption: string; rows: Forecast["by_district"] }) {
  if (!rows.length) return null;
  return (
    <div className="table-wrap compact-table-scroll">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">Name</th><th scope="col">Trees</th><th scope="col">Expected</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${caption}-${row.label}-${row.unit}`}>
              <th scope="row">{row.label}</th>
              <td>{number(row.trees)}</td>
              <td>{amount(row.low, row.high, row.unit)}</td>
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
}: {
  district?: string;
  speciesId?: string;
  refreshKey?: string | number;
}) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  if (!forecast) return <p className="loading" role="status">Loading harvest forecast…</p>;

  const programme = forecast.role === "admin" || forecast.role === "field_officer";
  const sources = forecast.by_species.filter((row) => row.source);

  return (
    <section className="card" aria-label="Harvest forecast">
      <div className="page-head">
        <div>
          <h2>Harvest forecast</h2>
          <p className="help">Expected next harvest from standing trees. Recorded harvests and sales stay in their own summary.</p>
        </div>
      </div>
      {forecast.totals.length ? (
        <div className="harvest-kpi-strip" role="region" aria-label="Expected totals">
          {forecast.totals.map((row) => (
            <article className="harvest-mini-kpi" key={row.unit}>
              <span>{row.unit === "kg" ? "Expected kilograms" : "Expected fruit"}</span>
              <strong>{amount(row.low, row.high, row.unit)}</strong>
              <span>{number(row.trees)} productive {row.trees === 1 ? "tree" : "trees"}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="help">No expected quantity yet.</p>
      )}
      {forecast.young_trees ? <p className="help">{number(forecast.young_trees)} {forecast.young_trees === 1 ? "tree is" : "trees are"} not yet productive.</p> : null}
      {forecast.bearing_trees ? <p className="help">{number(forecast.bearing_trees)} {forecast.bearing_trees === 1 ? "tree is" : "trees are"} old enough to bear, and the published quantity applies to older trees.</p> : null}
      {forecast.unestimated_trees ? <p className="help">{number(forecast.unestimated_trees)} {forecast.unestimated_trees === 1 ? "tree has" : "trees have"} no yield reference and no recorded harvest.</p> : null}

      {forecast.by_species.length ? (
        <div className="table-wrap compact-table-scroll">
          <table>
            <caption>Expected production by species</caption>
            <thead>
              <tr><th scope="col">Species</th><th scope="col">Trees</th><th scope="col">Expected</th></tr>
            </thead>
            <tbody>
              {forecast.by_species.map((row) => (
                <tr key={`${row.species_common_name}-${row.unit}`}>
                  <th scope="row">{row.species_common_name}</th>
                  <td>{number(row.trees)}</td>
                  <td>{amount(row.low, row.high, row.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {sources.map((row) => <p className="help" key={`${row.species_common_name}-${row.unit}-source`}>{row.species_common_name}: {row.source}</p>)}

      {programme ? <GroupTable caption="Expected production by district" rows={forecast.by_district} /> : null}
      {programme ? <GroupTable caption="Expected production by province" rows={forecast.by_province} /> : null}
      {programme ? <GroupTable caption="Expected production by farmer" rows={forecast.by_farmer} /> : null}

      {forecast.role === "farmer" && forecast.plantings.length ? (
        <div className="table-wrap compact-table-scroll">
          <table>
            <caption>Expected production by tree</caption>
            <thead>
              <tr><th scope="col">Tree</th><th scope="col">Species</th><th scope="col">Trees</th><th scope="col">Expected</th><th scope="col">Basis</th></tr>
            </thead>
            <tbody>
              {forecast.plantings.map((row) => (
                <tr key={row.public_code}>
                  <th scope="row"><code>{row.public_code}</code></th>
                  <td>{row.species_common_name}</td>
                  <td>{number(row.trees)}</td>
                  <td>{row.unit && row.low != null && row.high != null ? amount(row.low, row.high, row.unit) : "Not estimated"}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
