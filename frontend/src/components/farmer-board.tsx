"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DashboardEmpty } from "@/components/dashboard-ui";
import { HealthBadge } from "@/components/tree-card";
import type { Farmer } from "@/lib/types";
import "./dashboard-view.css";

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 0 });
const dateLabel = (value?: string | null) => {
  if (!value) return "Date unavailable";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const shortDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

type FarmerTree = Farmer["trees"][number] & { farmer: string; place: string };

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "F";
}

function placeOf(farmer: Farmer) {
  const parts = [farmer.district, farmer.sector, farmer.village].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Place not recorded";
}

function addressOf(farmer: Farmer) {
  return [farmer.province, farmer.district, farmer.sector, farmer.cell, farmer.village, farmer.isibo, farmer.household].filter(Boolean);
}

function matchingTrees(farmer: Farmer, species: string) {
  return species ? farmer.trees.filter((tree) => tree.species_common_name === species) : farmer.trees;
}

function healthShares(counts: number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((count) => (count * 100) / total);
  const shares = exact.map((value) => Math.floor(value));
  let remainder = 100 - shares.reduce((sum, value) => sum + value, 0);
  exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
    .forEach((item) => {
      if (remainder <= 0) return;
      shares[item.index] += 1;
      remainder -= 1;
    });
  return shares;
}

function isoDate(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function bucketKey(day: string, grain: "day" | "week" | "month") {
  const date = day.slice(0, 10);
  if (grain === "day") return date;
  if (grain === "month") return `${date.slice(0, 7)}-01`;
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() - ((parsed.getDay() + 6) % 7));
  return isoDate(parsed);
}

export function FarmerBoard({
  farmers,
  selectedId,
  onSelect,
}: {
  farmers: Farmer[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [district, setDistrict] = useState("");
  const [species, setSpecies] = useState("");
  const [query, setQuery] = useState("");
  const [grain, setGrain] = useState<"day" | "week" | "month">("week");
  const [followUp, setFollowUp] = useState<"all" | "condition" | "visit" | "coordinates">("all");
  const [followLimit, setFollowLimit] = useState(8);

  const districts = useMemo(
    () => [...new Set(farmers.map((farmer) => farmer.district).filter((value): value is string => Boolean(value)))].sort(),
    [farmers],
  );
  const speciesNames = useMemo(
    () => [...new Set(farmers.flatMap((farmer) => farmer.trees.map((tree) => tree.species_common_name).filter((value): value is string => Boolean(value))))].sort(),
    [farmers],
  );
  const narrowed = useMemo(
    () => farmers.filter((farmer) => !district || farmer.district === district).filter((farmer) => !species || matchingTrees(farmer, species).length > 0),
    [farmers, district, species],
  );
  const selected = useMemo(
    () => narrowed.find((farmer) => farmer.id === selectedId) ?? null,
    [narrowed, selectedId],
  );
  const scope = useMemo(() => (selected ? [selected] : narrowed), [selected, narrowed]);
  const needle = query.trim().toLowerCase();
  const visible = needle ? narrowed.filter((farmer) => farmer.display_name.toLowerCase().includes(needle)) : narrowed;
  const rows = useMemo(
    () => scope.flatMap((farmer) => matchingTrees(farmer, species).map((tree): FarmerTree => ({ ...tree, farmer: farmer.display_name, place: placeOf(farmer) }))),
    [scope, species],
  );
  const healthy = rows.filter((tree) => tree.status === "surviving").length;
  const moderate = rows.filter((tree) => tree.status === "stressed").length;
  const critical = rows.filter((tree) => tree.status === "dead").length;
  const shares = healthShares([healthy, moderate, critical]);
  const bars = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tree of rows) {
      const key = bucketKey(tree.planting_date, grain);
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    const limit = grain === "day" ? 21 : grain === "week" ? 16 : 12;
    return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-limit);
  }, [rows, grain]);
  const peak = Math.max(...bars.map((bar) => bar[1]), 1);
  const follow = rows.flatMap((tree) => {
    const issues: { key: string; label: string; tree: FarmerTree }[] = [];
    if (tree.status === "planted" || tree.status === "unknown") issues.push({ key: "condition", label: "Condition not recorded", tree });
    if (tree.status === "stressed") issues.push({ key: "visit", label: "Needs a visit", tree });
    if (!tree.has_coordinates) issues.push({ key: "coordinates", label: "Missing coordinates", tree });
    return issues.filter((issue) => followUp === "all" || issue.key === followUp);
  });
  const healthRows = [
    { label: "Healthy", color: "#1f8a4c", share: shares[0], count: healthy },
    { label: "Moderate", color: "#c49212", share: shares[1], count: moderate },
    { label: "Critical", color: "#c44536", share: shares[2], count: critical },
  ];

  if (!farmers.length) {
    return <DashboardEmpty title="No farmers yet">Save a farmer to see their trees, health, and follow-up here.</DashboardEmpty>;
  }

  return (
    <div className="dashboard-view">
      <section className="dashboard-toolbar" aria-label="Farmer filters">
        <label htmlFor="farmer-district">District
          <select id="farmer-district" value={district} onChange={(event) => { setDistrict(event.target.value); onSelect(""); }}>
            <option value="">All districts</option>
            {districts.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label htmlFor="farmer-species">Species
          <select id="farmer-species" value={species} onChange={(event) => { setSpecies(event.target.value); onSelect(""); }}>
            <option value="">All species</option>
            {speciesNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <button className="ghost" type="button" disabled={!district && !species} onClick={() => { setDistrict(""); setSpecies(""); onSelect(""); }}>Reset filters</button>
        <p className="help">District and species apply to the list, the chart, health, and follow-up. The list shows farmers you registered.</p>
      </section>

      <section className="card agent-board" aria-label="Farmer results">
        <div className="agent-strip">
          <div><span>Farmers</span><strong>{number(scope.length)}</strong></div>
          <div><span>Trees recorded</span><strong>{number(rows.length)}</strong></div>
          <div><span>Healthy</span><strong>{number(healthy)}</strong></div>
          <div><span>Needs a visit</span><strong>{number(moderate)}</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h2>Planting activity</h2>
            <p className="help">{selected ? `Trees recorded with ${selected.display_name}.` : "Trees recorded with these farmers."} Daily, weekly, and monthly counts use the planting date.</p>
          </div>
          <div className="filter-chips" role="group" aria-label="Planting period">
            {(["day", "week", "month"] as const).map((choice) => (
              <button key={choice} type="button" aria-pressed={grain === choice} onClick={() => setGrain(choice)}>{choice === "day" ? "Daily" : choice === "week" ? "Weekly" : "Monthly"}</button>
            ))}
          </div>
        </div>
        {bars.length ? (
          <ul className="agent-chart" aria-label={`${grain} plantings`}>
            {bars.map(([key, trees]) => (
              <li className="agent-bar" key={key}>
                <span className="agent-bar-value">{number(trees)}</span>
                <span className="agent-bar-fill" style={{ height: `${Math.max(8, Math.round((trees / peak) * 120))}px` }} />
                <span className="agent-bar-label">{grain === "month" ? new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : shortDate(key)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="help">No planting dates in this view.</p>}
      </section>

      <section className="card agent-board" aria-label="Farmer list">
        <div className="page-head">
          <div>
            <h2>Farmers</h2>
            <p className="help">Choose a farmer to see that household&apos;s trees, health, and follow-up. Healthy means surviving. Needs a visit means the tree is stressed.</p>
          </div>
        </div>
        <div className="agent-tools">
          <button type="button" aria-pressed={!selected} onClick={() => onSelect("")}>All farmers</button>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a farmer" aria-label="Find a farmer" />
        </div>
        {!visible.length ? <DashboardEmpty title="No matching farmer">Try another name or clear the filters.</DashboardEmpty> : (
          <div className="table-wrap">
            <table className="agent-table">
              <caption>Farmers you registered</caption>
              <thead>
                <tr>
                  <th scope="col">Farmer</th>
                  <th scope="col">Trees</th>
                  <th scope="col">Healthy</th>
                  <th scope="col">Needs a visit</th>
                  <th scope="col">Last planting</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((farmer) => {
                  const trees = matchingTrees(farmer, species);
                  const latest = trees.map((tree) => tree.planting_date).sort().at(-1);
                  return (
                    <tr key={farmer.id}>
                      <th scope="row">
                        <button type="button" className="agent-pick" aria-pressed={farmer.id === selected?.id} onClick={() => onSelect(farmer.id)}>
                          <span className="agent-mark" aria-hidden="true">{initials(farmer.display_name)}</span>
                          <span>
                            {farmer.display_name}
                            <small>{placeOf(farmer)}{farmer.public_code ? ` · ${farmer.public_code}` : ""}</small>
                          </span>
                        </button>
                      </th>
                      <td>{number(trees.length)}</td>
                      <td>{number(trees.filter((tree) => tree.status === "surviving").length)}</td>
                      <td>{number(trees.filter((tree) => tree.status === "stressed").length)}</td>
                      <td>{latest ? dateLabel(latest) : "No date"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card tree-health" aria-label="Tree health">
        <h2>Tree health</h2>
        <ul className="tree-health-list">
          {healthRows.map((row) => (
            <li key={row.label} className="tree-health-row">
              <span className="tree-health-name"><i style={{ background: row.color }} aria-hidden="true" />{row.label}</span>
              <strong>{row.share}%</strong>
              <div className="tree-health-track" role="meter" aria-valuenow={row.share} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.label}, ${number(row.count)} trees`}>
                <span style={{ width: `${row.share}%`, background: row.color }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="help">{healthy + moderate + critical ? `${number(healthy)} surviving, ${number(moderate)} stressed, and ${number(critical)} dead. The percentages are their share of trees with a recorded condition.` : "No tree has a recorded condition yet. Planted trees stay out of these percentages."}</p>
      </section>

      <section className="card" aria-label="Farmer details">
        <h2>{selected ? selected.display_name : "Places"}</h2>
        {selected ? (
          <>
            <p>{addressOf(selected).length ? addressOf(selected).join(", ") : "No address recorded."}</p>
            {selected.phone ? <p className="help">Phone: {selected.phone}. Treat this as sensitive contact information.</p> : <p className="help">No phone recorded.</p>}
            {selected.notes ? <p>{selected.notes}</p> : null}
            <p className="help">{selected.has_login ? "This farmer can sign in." : "No sign-in is linked to this farmer."}</p>
          </>
        ) : (
          <ul>
            {districts.map((name) => (
              <li className="agent-place" key={name}>
                <span>{name}</span>
                <strong>{number(narrowed.filter((farmer) => farmer.district === name).length)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-label="Recorded trees">
        <h2>Recorded trees</h2>
        {!rows.length ? <p className="help">No trees are recorded with {selected ? "this farmer" : "these farmers"} in this view.</p> : (
          <ul>
            {rows.slice(0, 12).map((tree) => (
              <li className="agent-issue" key={tree.id}>
                <span>
                  <Link href={`/trees/${tree.id}`}>{tree.species_common_name ?? "Species"} · {tree.public_code}</Link>
                  <small>{tree.farmer} · {dateLabel(tree.planting_date)}</small>
                </span>
                <HealthBadge status={tree.status} />
              </li>
            ))}
          </ul>
        )}
        {rows.length > 12 ? <p className="help">{number(rows.length - 12)} more trees are in this view. Choose one farmer to focus the list.</p> : null}
      </section>

      <section className="card" aria-label="Follow-up">
        <div className="page-head">
          <div>
            <h2>Follow-up</h2>
            <p className="help">Trees awaiting a recorded condition, a visit because the tree is stressed, or a map point.</p>
          </div>
          <div className="filter-chips" role="group" aria-label="Follow-up filter">
            {([["all", "All follow-up"], ["condition", "Condition not recorded"], ["visit", "Needs a visit"], ["coordinates", "Missing coordinates"]] as const).map(([choice, label]) => (
              <button key={choice} type="button" aria-pressed={followUp === choice} onClick={() => { setFollowUp(choice); setFollowLimit(8); }}>{label}</button>
            ))}
          </div>
        </div>
        {!follow.length ? <p className="help">Nothing is waiting in this view.</p> : (
          <>
            <ul>
              {follow.slice(0, followLimit).map((issue) => (
                <li className="agent-issue" key={`${issue.tree.id}-${issue.key}`}>
                  <span>{issue.tree.species_common_name ?? "Species"} · {issue.tree.public_code}<small>{issue.tree.farmer} · {issue.tree.place}</small></span>
                  <strong>{issue.label}</strong>
                </li>
              ))}
            </ul>
            {follow.length > followLimit ? <button type="button" className="inline-link" onClick={() => setFollowLimit((value) => value + 12)}>Show more</button> : null}
          </>
        )}
      </section>
    </div>
  );
}
