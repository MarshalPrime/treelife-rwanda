"use client";

import { useMemo, useState } from "react";
import { DashboardEmpty } from "@/components/dashboard-ui";
import type { AgentBoardRow, AgentIssueKind } from "@/lib/types";
import "./dashboard-view.css";

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const dateLabel = (value?: string | null) => {
  if (!value) return "Date unavailable";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const monthLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

const issueLabel: Record<AgentIssueKind, string> = {
  condition: "Condition not recorded",
  visit: "Needs a visit",
  coordinates: "Missing coordinates",
  incomplete: "Incomplete place",
  duplicate: "Possible duplicate",
};

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "A";
}

function places(districts: string[]) {
  if (!districts.length) return "No district on the records";
  const shown = districts.slice(0, 3).join(", ");
  return districts.length > 3 ? `${shown} +${districts.length - 3}` : shown;
}

function isoDate(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function bucketKey(day: string, grain: "day" | "week" | "month") {
  if (grain === "day") return day;
  if (grain === "month") return `${day.slice(0, 7)}-01`;
  const parsed = new Date(`${day}T00:00:00`);
  parsed.setDate(parsed.getDate() - ((parsed.getDay() + 6) % 7));
  return isoDate(parsed);
}

function bucketLabel(key: string, grain: "day" | "week" | "month") {
  if (grain === "month") return monthLabel(key);
  return shortDate(key);
}

function activityBars(agents: AgentBoardRow[], grain: "day" | "week" | "month") {
  const totals = new Map<string, number>();
  for (const agent of agents) {
    for (const point of agent.registrations) {
      const key = bucketKey(point.day, grain);
      totals.set(key, (totals.get(key) ?? 0) + point.trees);
    }
  }
  const limit = grain === "day" ? 21 : grain === "week" ? 16 : 12;
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-limit)
    .map(([key, trees]) => ({ key, label: bucketLabel(key, grain), trees }));
}

function combinedPlaces(agents: AgentBoardRow[]) {
  const totals = new Map<string, AgentBoardRow["places"][number]>();
  for (const agent of agents) {
    for (const place of agent.places) {
      const key = `${place.district}|${place.sector ?? ""}|${place.village ?? ""}`;
      const current = totals.get(key) ?? { ...place, trees: 0 };
      current.trees += place.trees;
      totals.set(key, current);
    }
  }
  return [...totals.values()].sort((left, right) => right.trees - left.trees || left.district.localeCompare(right.district));
}

function placeLine(place: AgentBoardRow["places"][number]) {
  return [place.district, place.sector ?? "Sector not recorded", place.village ?? "Village not recorded"].join(" · ");
}

export function AgentExplorer({ agents, empty = "No field officer has registered a tree yet." }: { agents: AgentBoardRow[]; empty?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [grain, setGrain] = useState<"day" | "week" | "month">("week");
  const [followUp, setFollowUp] = useState<"all" | "condition" | "visit" | "coordinates">("all");
  const [quality, setQuality] = useState<AgentIssueKind>("incomplete");
  const [followLimit, setFollowLimit] = useState(8);
  const [qualityLimit, setQualityLimit] = useState(8);
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const scope = selected ? [selected] : agents;
  const needle = query.trim().toLowerCase();
  const visible = needle ? agents.filter((agent) => agent.name.toLowerCase().includes(needle)) : agents;
  const bars = useMemo(() => activityBars(scope, grain), [scope, grain]);
  const areaRows = useMemo(() => combinedPlaces(scope), [scope]);
  const registered = scope.reduce((sum, agent) => sum + agent.trees_registered, 0);
  const checked = scope.reduce((sum, agent) => sum + agent.checked, 0);
  const pending = scope.reduce((sum, agent) => sum + agent.pending, 0);
  const submissions = scope.reduce((sum, agent) => sum + agent.submissions, 0);
  const latestSubmission = scope.map((agent) => agent.last_submission_on).sort().at(-1);
  const followIssues = scope.flatMap((agent) => agent.issues
    .filter((issue) => issue.issue === "condition" || issue.issue === "visit" || issue.issue === "coordinates")
    .filter((issue) => followUp === "all" || issue.issue === followUp)
    .map((issue) => ({ ...issue, agent: agent.name })));
  const qualityIssues = scope.flatMap((agent) => agent.issues
    .filter((issue) => issue.issue === quality)
    .map((issue) => ({ ...issue, agent: agent.name })));
  const qualityTotals = {
    incomplete: scope.reduce((sum, agent) => sum + agent.incomplete, 0),
    duplicate: scope.reduce((sum, agent) => sum + agent.duplicates, 0),
    coordinates: scope.reduce((sum, agent) => sum + agent.missing_coordinates, 0),
  };
  const peak = Math.max(...bars.map((bar) => bar.trees), 1);

  if (!agents.length) {
    return <DashboardEmpty title="No agents in this view">{empty}</DashboardEmpty>;
  }

  return (
    <>
      <section className="card agent-board" aria-label="Agent results">
        <div className="agent-strip">
          <div><span>Agents</span><strong>{number(scope.length)}</strong></div>
          <div><span>Trees registered</span><strong>{number(registered)}</strong></div>
          <div><span>Checked</span><strong>{number(checked)}</strong></div>
          <div><span>Pending</span><strong>{number(pending)}</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h2>Registration activity</h2>
            <p className="help">{selected ? `Trees registered by ${selected.name}.` : "Trees registered by every agent."} Daily, weekly, and monthly counts use the registration date. A batch quantity counts as that many trees.</p>
          </div>
          <div className="filter-chips" role="group" aria-label="Registration period">
            {(["day", "week", "month"] as const).map((choice) => (
              <button key={choice} type="button" aria-pressed={grain === choice} onClick={() => setGrain(choice)}>{choice === "day" ? "Daily" : choice === "week" ? "Weekly" : "Monthly"}</button>
            ))}
          </div>
        </div>
        {bars.length ? (
          <ul className="agent-chart" aria-label={`${grain} registrations`}>
            {bars.map((bar) => (
              <li className="agent-bar" key={bar.key}>
                <span className="agent-bar-value">{number(bar.trees)}</span>
                <span className="agent-bar-fill" style={{ height: `${Math.max(8, Math.round((bar.trees / peak) * 120))}px` }} />
                <span className="agent-bar-label">{bar.label}</span>
              </li>
            ))}
          </ul>
        ) : <p className="help">No registration dates in this view.</p>}
      </section>

      <section className="card agent-board" aria-label="Agent leaderboard">
        <div className="page-head">
          <div>
            <h2>Agent leaderboard</h2>
            <p className="help">Number of trees registered by each agent. Choose a row to explore that agent. Checked means a condition was recorded. Pending means the record is still planted or not assessed.</p>
          </div>
        </div>
        <div className="agent-tools">
          <button type="button" aria-pressed={selectedId === null} onClick={() => setSelectedId(null)}>All agents</button>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an agent" aria-label="Find an agent" />
        </div>
        {!visible.length ? <DashboardEmpty title="No matching agent">Try another name.</DashboardEmpty> : (
          <div className="table-wrap">
            <table className="agent-table">
              <caption>Trees registered by each agent</caption>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Registered</th>
                  <th scope="col">Checked</th>
                  <th scope="col">Pending</th>
                  <th scope="col">Coordinates</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((agent) => (
                  <tr key={agent.id} className={agent.id === selectedId ? "is-selected" : undefined}>
                    <th scope="row">
                      <button type="button" className="agent-pick" aria-pressed={agent.id === selectedId} onClick={() => setSelectedId(agent.id)}>
                        <span className="agent-mark" aria-hidden="true">{initials(agent.name)}</span>
                        <span>
                          {agent.name}
                          <small>{places(agent.districts)} · Last record {dateLabel(agent.last_registered_on)}</small>
                        </span>
                      </button>
                    </th>
                    <td>{number(agent.trees_registered)}</td>
                    <td>{number(agent.checked)}</td>
                    <td>{number(agent.pending)}</td>
                    <td><span className={agent.coordinate_percent >= 90 ? "agent-quality high" : agent.coordinate_percent >= 70 ? "agent-quality mid" : "agent-quality low"}>{agent.coordinate_percent}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="agent-explore">
        <section className="card" aria-label="Assigned areas">
          <h2>Assigned areas</h2>
          <p className="help">Districts, sectors, and villages written on the trees {selected ? selected.name : "these agents"} registered. TreeLife does not keep a separate assignment list.</p>
          {!areaRows.length ? <p className="help">No district is written on these records.</p> : (
            <ul>
              {areaRows.map((place) => (
                <li className="agent-place" key={`${place.district}-${place.sector ?? ""}-${place.village ?? ""}`}>
                  <span>{placeLine(place)}</span>
                  <strong>{number(place.trees)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card" aria-label="Field activity">
          <h2>Field activity</h2>
          <p className="help">A submission is a tree or batch registration, a field visit, a growth measurement, or a maintenance record.</p>
          <div className="agent-strip">
            <div><span>Records submitted</span><strong>{number(submissions)}</strong></div>
            <div><span>Last submission</span><strong>{dateLabel(latestSubmission)}</strong></div>
          </div>
          <ul>
            {[...scope].sort((left, right) => right.last_submission_on.localeCompare(left.last_submission_on)).slice(0, 8).map((agent) => (
              <li className="agent-issue" key={agent.id}>
                <span>{agent.name}<small>Last submission {dateLabel(agent.last_submission_on)}</small></span>
                <strong>{number(agent.submissions)}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card agent-stack" aria-label="Pending tasks">
        <div className="page-head">
          <div>
            <h2>Pending tasks</h2>
            <p className="help">Trees awaiting a recorded condition, a visit because the tree is stressed, or a map point. There is no separate verification step.</p>
          </div>
          <div className="filter-chips" role="group" aria-label="Follow-up filter">
            {([["all", "All follow-up"], ["condition", "Condition not recorded"], ["visit", "Needs a visit"], ["coordinates", "Missing coordinates"]] as const).map(([choice, label]) => (
              <button key={choice} type="button" aria-pressed={followUp === choice} onClick={() => { setFollowUp(choice); setFollowLimit(8); }}>{label}</button>
            ))}
          </div>
        </div>
        {!followIssues.length ? <p className="help">Nothing is waiting in this view.</p> : (
          <>
            <ul>
              {followIssues.slice(0, followLimit).map((issue) => (
                <li className="agent-issue" key={`${issue.id}-${issue.issue}`}>
                  <span>{issue.title}{issue.code ? ` · ${issue.code}` : ""}<small>{issue.agent} · {issue.place ?? "Place not recorded"}</small></span>
                  <strong>{issueLabel[issue.issue]}</strong>
                </li>
              ))}
            </ul>
            {followIssues.length > followLimit ? <button type="button" className="inline-link" onClick={() => setFollowLimit((value) => value + 12)}>Show more</button> : null}
          </>
        )}
      </section>

      <section className="card agent-stack" aria-label="Data quality">
        <h2>Data quality</h2>
        <p className="help">Incomplete means a district, sector, or village is missing. A possible duplicate shares a species and a map point, or the same site, species, and planting date when the map point is missing.</p>
        <div className="agent-quality-grid">
          <button type="button" aria-pressed={quality === "incomplete"} onClick={() => { setQuality("incomplete"); setQualityLimit(8); }}><span>Incomplete records</span><strong>{number(qualityTotals.incomplete)}</strong></button>
          <button type="button" aria-pressed={quality === "duplicate"} onClick={() => { setQuality("duplicate"); setQualityLimit(8); }}><span>Possible duplicates</span><strong>{number(qualityTotals.duplicate)}</strong></button>
          <button type="button" aria-pressed={quality === "coordinates"} onClick={() => { setQuality("coordinates"); setQualityLimit(8); }}><span>Missing GPS coordinates</span><strong>{number(qualityTotals.coordinates)}</strong></button>
        </div>
        {!qualityIssues.length ? <p className="help">No records in this quality check.</p> : (
          <ul>
            {qualityIssues.slice(0, qualityLimit).map((issue) => (
              <li className="agent-issue" key={`${issue.id}-${issue.issue}`}>
                <span>{issue.title}{issue.code ? ` · ${issue.code}` : ""}<small>{issue.agent} · {issue.place ?? "Place not recorded"}</small></span>
                <strong>{issueLabel[issue.issue]}</strong>
              </li>
            ))}
          </ul>
        )}
        {qualityIssues.length > qualityLimit ? <button type="button" className="inline-link" onClick={() => setQualityLimit((value) => value + 12)}>Show more</button> : null}
      </section>
    </>
  );
}
