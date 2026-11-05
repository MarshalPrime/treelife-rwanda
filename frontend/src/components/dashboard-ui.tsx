import type { ReactNode } from "react";

export function DashboardKpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "positive" | "attention";
}) {
  return (
    <article className={`dashboard-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export function DashboardKpiGrid({ children, label = "Key performance indicators" }: { children: ReactNode; label?: string }) {
  return <section className="dashboard-kpi-grid" aria-label={label}>{children}</section>;
}

export function DashboardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="dashboard-skeleton" role="status" aria-label="Loading dashboard">
      <span className="sr-only">Loading dashboard…</span>
      <div className="dashboard-skeleton-kpis">
        {Array.from({ length: rows }, (_, index) => <div key={index} className="skeleton-block" />)}
      </div>
      <div className="skeleton-block skeleton-chart" />
    </div>
  );
}

export function DashboardEmpty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="dashboard-empty"><strong>{title}</strong><p>{children}</p></div>;
}

export function DashboardFilters({
  value,
  onChange,
  options,
  onReset,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  onReset?: () => void;
}) {
  return (
    <div className="dashboard-filters" aria-label="Dashboard filters">
      <label htmlFor="dashboard-range">Time range</label>
      <select id="dashboard-range" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {onReset ? <button className="ghost" type="button" onClick={onReset}>Reset</button> : null}
    </div>
  );
}

export function MiniBarChart({
  values,
  labels,
  colour = "var(--green-2)",
}: {
  values: number[];
  labels: string[];
  colour?: string;
}) {
  const peak = Math.max(1, ...values);
  if (values.length === 0) return <DashboardEmpty title="No activity yet">Records will appear here after the first field visit.</DashboardEmpty>;
  return (
    <div className="mini-bar-chart" role="img" aria-label="Activity trend">
      {values.map((value, index) => (
        <div className="mini-bar-column" key={`${labels[index] ?? index}`}>
          <span className="mini-bar-value">{value}</span>
          <span className="mini-bar" style={{ height: `${(value / peak) * 100}%`, background: colour }} />
          <small>{labels[index]}</small>
        </div>
      ))}
    </div>
  );
}
