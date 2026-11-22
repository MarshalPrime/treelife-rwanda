"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { DashboardEmpty } from "@/components/dashboard-ui";
import { useI18n } from "@/lib/i18n";
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<Set<Metric>>(() => new Set());
  const gradientId = useId();

  if (!series.length) return <DashboardEmpty title="No records in this period">Try a different period or clear the district and species filters.</DashboardEmpty>;

  const visibleLines = lines.filter((line) => !hiddenKeys.has(line.key));
  const activeLines = visibleLines.length ? visibleLines : lines;
  const width = 680;
  const height = 190;
  const left = 46;
  const right = 16;
  const top = 16;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...series.flatMap((point) => activeLines.map((line) => point[line.key] ?? 0)));
  const x = (index: number) => left + (series.length === 1 ? plotWidth / 2 : (index * plotWidth) / (series.length - 1));
  const y = (value: number) => top + plotHeight * (1 - value / maximum);
  const ticks = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const totals = lines.map((line) => `${full.format(series.reduce((sum, point) => sum + (point[line.key] ?? 0), 0))} ${line.label.toLowerCase()}`).join(" · ");
  const dateLabel = (day: string) => {
    const parsed = new Date(`${day}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return day;
    return parsed.toLocaleDateString("en-GB", monthly ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
  };

  const primaryLine = activeLines[0];
  const primaryPoints = series.map((point, index) => `${x(index)},${y(point[primaryLine.key] ?? 0)}`).join(" ");
  const areaPoints = `${x(0)},${top + plotHeight} ${primaryPoints} ${x(series.length - 1)},${top + plotHeight}`;

  const updateHover = (clientX: number, rect: DOMRect) => {
    if (!rect.width) return;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (svgX - left) / Math.max(1, plotWidth)));
    const nextIndex = series.length === 1 ? 0 : Math.round(ratio * (series.length - 1));
    setActiveIndex(nextIndex);
  };

  const toggleLine = (key: Metric) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < lines.length - 1) next.add(key);
      return next;
    });
  };

  const hovered = activeIndex !== null && activeIndex >= 0 && activeIndex < series.length ? series[activeIndex] : null;
  const hoverPct = activeIndex !== null && series.length > 1 ? ((x(activeIndex) - left) / plotWidth) * 100 : 50;

  return <div className="dashboard-chart-wrap">
    <p className="chart-summary">{totals}{unit === "kg" || unit === "RWF" ? ` ${unit}` : ""}</p>
    <div className="chart-stage" onPointerLeave={() => setActiveIndex(null)}>
      <svg
        className="dashboard-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title}. ${totals}. Values in ${unit}.`}
        onPointerMove={(event) => updateHover(event.clientX, event.currentTarget.getBoundingClientRect())}
        onPointerDown={(event) => updateHover(event.clientX, event.currentTarget.getBoundingClientRect())}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryLine.color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={primaryLine.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((fraction) => <g key={fraction}>
          <line x1={left} y1={y(maximum * fraction)} x2={width - right} y2={y(maximum * fraction)} stroke="currentColor" opacity=".1" />
          <text x={left - 8} y={y(maximum * fraction) + 4} textAnchor="end">{compact.format(maximum * fraction)}</text>
        </g>)}
        {series.length > 1 ? <polygon points={areaPoints} fill={`url(#${gradientId})`} /> : null}
        {activeLines.map((line) => <g key={line.key}>
          <polyline
            points={series.map((point, index) => `${x(index)},${y(point[line.key] ?? 0)}`).join(" ")}
            fill="none"
            stroke={line.color}
            strokeWidth="2.75"
            strokeDasharray={line.dashed ? "6 5" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {series.length === 1 ? <circle cx={x(0)} cy={y(series[0][line.key] ?? 0)} r="4" fill={line.color} /> : null}
        </g>)}
        {hovered && activeIndex !== null ? <g className="chart-crosshair" aria-hidden="true">
          <line x1={x(activeIndex)} y1={top} x2={x(activeIndex)} y2={top + plotHeight} stroke="#1c4636" strokeWidth="1" strokeDasharray="3 3" opacity=".45" />
          {activeLines.map((line) => (
            <circle
              key={line.key}
              cx={x(activeIndex)}
              cy={y(hovered[line.key] ?? 0)}
              r="4.5"
              fill="#fff"
              stroke={line.color}
              strokeWidth="2.5"
            />
          ))}
        </g> : null}
        {ticks.map((index) => <text key={index} x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}>{dateLabel(series[index].day)}</text>)}
      </svg>
      {hovered ? (
        <div
          className={`chart-tooltip ${hoverPct > 65 ? "align-right" : ""}`}
          style={{ left: `${Math.max(10, Math.min(90, hoverPct))}%` }}
          role="status"
          aria-live="polite"
        >
          <strong>{dateLabel(hovered.day)}</strong>
          <ul>
            {activeLines.map((line) => (
              <li key={line.key}>
                <i style={{ background: line.color }} aria-hidden="true" />
                <span>{line.label}</span>
                <b>{full.format(hovered[line.key] ?? 0)}{unit === "kg" || unit === "RWF" ? ` ${unit}` : ""}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
    <div className="chart-legend" aria-label={`${title} legend`}>
      {lines.map((line) => {
        const hidden = hiddenKeys.has(line.key);
        return lines.length > 1 ? (
          <button
            key={line.key}
            type="button"
            className={`chart-legend-toggle ${hidden ? "is-muted" : ""}`}
            aria-pressed={!hidden}
            onClick={() => toggleLine(line.key)}
          >
            <span aria-hidden="true" className="chart-key" style={{ background: line.color, borderRadius: line.dashed ? 0 : 8 }} />
            {line.label}
          </button>
        ) : (
          <span key={line.key}><span aria-hidden="true" className="chart-key" style={{ background: line.color, borderRadius: line.dashed ? 0 : 8 }} />{line.label}</span>
        );
      })}
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
  const { t } = useI18n();
  if (!rows.length) return <DashboardEmpty title="No trees in this view">Clear filters or register a planting to start this comparison.</DashboardEmpty>;
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return <div className="dashboard-bars">
    <ul className="dashboard-breakdown-list" aria-label={title}>
      {rows.map((row) => {
        const photo = photos ? speciesPhoto(row.label) : undefined;
        const share = total > 0 ? Math.round((row.value / total) * 100) : 0;
        return <li key={row.id}>
          <button type="button" className="dashboard-breakdown-button" aria-pressed={selected === row.id} aria-label={t("dash.filter", { label: row.label, count: full.format(row.value) })} onClick={() => onSelect(row.id)}>
            <span className="breakdown-name">{photo ? <Image src={photo} width={24} height={24} alt="" className="breakdown-photo" /> : null}<span>{row.label}</span></span>
            <svg viewBox="0 0 300 12" className="breakdown-bar" aria-hidden="true"><rect width="300" height="12" rx="6" fill="#e9ece3" /><rect width={(row.value / maximum) * 300} height="12" rx="6" fill="#397c55" /></svg>
            <strong>{full.format(row.value)} <small>{share}%</small></strong>
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
