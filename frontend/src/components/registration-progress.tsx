const STEPS = [
  "Farmer Information",
  "Tree Information",
  "Tree Location",
  "Planting Information",
  "Review and submit",
] as const;

export function RegistrationProgress({
  step,
  forFarmer = false,
}: {
  step: 1 | 2 | 3 | 4 | 5;
  forFarmer?: boolean;
}) {
  const steps = forFarmer ? STEPS.slice(1) : [...STEPS];
  const shown = forFarmer ? step - 1 : step;
  const percent = Math.round((shown / steps.length) * 100);
  return (
    <header className="reg-progress">
      <div className="reg-head">
        <h1>Step {shown} of {steps.length} – {steps[shown - 1]}</h1>
        <span className="reg-percent">{percent}%</span>
      </div>
      <div className="reg-track" aria-hidden="true">
        <div className="reg-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="reg-path">
        {steps.map((title, index) => (
          <span key={title}>
            {index > 0 ? " → " : null}
            {index + 1 === shown ? <strong>{title}</strong> : title}
          </span>
        ))}
      </p>
    </header>
  );
}
