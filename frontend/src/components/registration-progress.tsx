"use client";

import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const TREE_STEPS: MessageKey[] = [
  "reg.farmer",
  "reg.tree",
  "reg.location",
  "reg.planting",
  "reg.review",
];

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
  const { t } = useI18n();
  const list = steps ?? (forFarmer ? TREE_STEPS.slice(1) : [...TREE_STEPS]).map((item) => t(item as MessageKey));
  const shown = steps ? step : forFarmer ? step - 1 : step;
  const percent = Math.round((shown / list.length) * 100);
  const Title = heading;
  return (
    <header className="reg-progress">
      <div className="reg-head">
        <Title>{t("reg.step", { current: shown, total: list.length, name: list[shown - 1] ?? "" })}</Title>
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
