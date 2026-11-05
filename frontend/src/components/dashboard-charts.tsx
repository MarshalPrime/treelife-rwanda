"use client";

import Image from "next/image";
import { DashboardEmpty } from "@/components/dashboard-ui";
import { speciesPhoto } from "@/components/map-cards";
import type { DashboardResponse } from "@/lib/types";

type Point = DashboardResponse["series"][number];
type Metric = "planted" | "activity" | "harvested_kg" | "sales_rwf";
type Line = { key: Metric; label: string; color: string; dashed?: boolean };
const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

export function SeriesChart({ title, series, lines, unit, monthly = false }: {
  title: string;
  series: Point[];
  lines: Line[];
  unit: string;
  monthly?: boolean;
}) {
  if (!series.length) return <DashboardEmpty title="No records in this period">Try a different period or clear the district and species filters.</DashboardEmpty>;
  const width = 680;
  const height = 220;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...series.flatMap((point) => lines.map((line) => point[line.key] ?? 0)));
  const x = (index: number) => left + (series.length === 1 ? plotWidth / 2 : index * plotWidth / (series.length - 1));
  const y = (value: number) => top + plotHeight * (1 - value / maximum);
  const ticks = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const totals = lines.map((line) => `${full.format(series.reduce((sum, point) => sum + (point[line.key] ?? 0), 0))} ${line.label.toLowerCase()}`).join(" · ");
  const dateLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", monthly ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });

  return <div className="dashboard-chart-wrap">
    <p className="chart-summary">{totals}{unit === "kg" || unit === "RWF" ? ` ${unit}` : ""}</p>
    <svg className="dashboard-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. ${totals}. Values in ${unit}.`}>
      {[0, .5, 1].map((fraction) => <g key={fraction}>
        <line x1={left} y1={y(maximum * fraction)} x2={width - right} y2={y(maximum * fraction)} stroke="currentColor" opacity=".12" />
        <text x={left - 10} y={y(maximum * fraction) + 4} textAnchor="end">{compact.format(maximum * fraction)}</text>
      </g>)}
      {lines.map((line) => <g key={line.key}>
        <polyline points={series.map((point, index) => `${x(index)},${y(point[line.key] ?? 0)}`).join(" ")} fill="none" stroke={line.color} strokeWidth="3" strokeDasharray={line.dashed ? "6 5" : undefined} strokeLinejoin="round" />
        {series.length === 1 ? <circle cx={x(0)} cy={y(series[0][line.key] ?? 0)} r="4" fill={line.color} /> : null}
      </g>)}
      {ticks.map((index) => <text key={index} x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}>{dateLabel(series[index].day)}</text>)}
    </svg>
    <div className="chart-legend" aria-label={`${title} legend`}>
      {lines.map((line) => <span key={line.key}><span aria-hidden="true" className="chart-key" style={{ background: line.color, borderRadius: line.dashed ? 0 : 8 }} />{line.label}</span>)}
    </div>
    <details className="chart-table">
      <summary>View {title.toLowerCase()} data table</summary>
      <div className="table-wrap"><table>
        <caption className="sr-only">{title} in {unit}, {monthly ? "by month" : "by day"}</caption>
        <thead><tr><th scope="col">{monthly ? "Month" : "Date"}</th>{lines.map((line) => <th scope="col" key={line.key}>{line.label}{unit === "kg" || unit === "RWF" ? ` (${unit})` : ""}</th>)}</tr></thead>
        <tbody>{series.map((point) => <tr key={point.day}><th scope="row">{point.day}</th>{lines.map((line) => <td key={line.key}>{full.format(point[line.key] ?? 0)}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  </div>;
}

export const plantingLines: Line[] = [
  { key: "planted", label: "Trees planted", color: "#287450" },
  { key: "activity", label: "Field activity records", color: "#ac741d", dashed: true },
];
export const harvestLines: Line[] = [{ key: "harvested_kg", label: "Harvest", color: "#187e73" }];
export const salesLines: Line[] = [{ key: "sales_rwf", label: "Sales", color: "#826293" }];

export function BreakdownChart({ title, rows, selected, onSelect, photos = false }: {
  title: string;
  rows: { id: string; label: string; value: number }[];
  selected: string;
  onSelect: (id: string) => void;
  photos?: boolean;
}) {
  if (!rows.length) return <DashboardEmpty title="No trees in this view">Clear filters or register a planting to start this comparison.</DashboardEmpty>;
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return <div className="dashboard-bars">
    <ul className="dashboard-breakdown-list" aria-label={title}>
      {rows.map((row) => {
        const photo = photos ? speciesPhoto(row.label) : undefined;
        return <li key={row.id}>
          <button type="button" className="dashboard-breakdown-button" aria-pressed={selected === row.id} aria-label={`Filter by ${row.label}, ${full.format(row.value)} trees`} onClick={() => onSelect(row.id)}>
            <span className="breakdown-name">{photo ? <Image src={photo} width={30} height={30} alt="" className="breakdown-photo" /> : null}<span>{row.label}</span></span>
            <svg viewBox="0 0 300 16" className="breakdown-bar" aria-hidden="true"><rect width="300" height="16" rx="8" fill="#e9ece3" /><rect width={row.value / maximum * 300} height="16" rx="8" fill="#397c55" /></svg>
            <strong>{full.format(row.value)}</strong>
          </button>
        </li>;
      })}
    </ul>
    <details className="chart-table">
      <summary>View {title.toLowerCase()} data table</summary>
      <table><caption className="sr-only">{title}</caption><thead><tr><th scope="col">Name</th><th scope="col">Trees</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.label}</th><td>{full.format(row.value)}</td></tr>)}</tbody></table>
    </details>
  </div>;
}
