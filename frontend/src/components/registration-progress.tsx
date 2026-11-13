const TREE_STEPS = [
  "Farmer Information",
  "Tree Information",
  "Tree Location",
  "Planting Information",
  "Review and submit",
] as const;

export function RegistrationProgress({
  step,
  forFarmer = false,
  steps,
  heading = "h1",
}: {
  step: number;
  forFarmer?: boolean;
  steps?: readonly string[];
  heading?: "h1" | "h2";
}) {
  const list = steps ?? (forFarmer ? TREE_STEPS.slice(1) : [...TREE_STEPS]);
  const shown = steps ? step : forFarmer ? step - 1 : step;
  const percent = Math.round((shown / list.length) * 100);
  const Title = heading;
  return (
    <header className="reg-progress">
      <div className="reg-head">
        <Title>Step {shown} of {list.length} – {list[shown - 1]}</Title>
        <span className="reg-percent">{percent}%</span>
      </div>
      <div className="reg-track" aria-hidden="true">
        <div className="reg-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="reg-path">
        {list.map((title, index) => (
          <span key={title}>
            {index > 0 ? " → " : null}
            {index + 1 === shown ? <strong>{title}</strong> : title}
          </span>
        ))}
      </p>
    </header>
  );
}
