"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { api } from "@/lib/api";
import { localizePhrase, useI18n } from "@/lib/i18n";

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

function amount(low: number, high: number, unit: "kg" | "count", fruit = "fruit") {
  const label = unit === "kg" ? "kg" : fruit;
  const start = number(low);
  const end = number(high);
  return start === end ? `${start} ${label}` : `${start}–${end} ${label}`;
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
}: {
  district?: string;
  speciesId?: string;
  refreshKey?: string | number;
}) {
  const { language, t } = useI18n();
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

      {forecast.role === "farmer" && forecast.plantings.length ? (
        <div className="table-wrap compact-table-scroll">
          <table>
            <caption>{t("forecast.byTree")}</caption>
            <thead>
              <tr><th scope="col">{t("forecast.tree")}</th><th scope="col">{t("forecast.species")}</th><th scope="col">{t("forecast.trees")}</th><th scope="col">{t("forecast.expected")}</th><th scope="col">{t("forecast.basis")}</th></tr>
            </thead>
            <tbody>
              {forecast.plantings.map((row) => (
                <tr key={row.public_code}>
                  <th scope="row"><code>{row.public_code}</code></th>
                  <td>{row.species_common_name}</td>
                  <td>{number(row.trees)}</td>
                  <td>{row.unit && row.low != null && row.high != null ? amount(row.low, row.high, row.unit, fruit) : t("forecast.notEstimated")}</td>
                  <td>{localizePhrase(language, row.note)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
