"use client";

import { useI18n } from "@/lib/i18n";

export type AccountSource = "treelife" | "amis";

function SourceIcon({ source }: { source: AccountSource }) {
  if (source === "amis") {
    return <span className="auth-source-icon amis-source-icon" aria-hidden="true">A</span>;
  }
  return <span className="auth-source-icon treelife-source-icon" aria-hidden="true">TL</span>;
}

export function AccountSourceChoice({
  source,
  onChange,
}: {
  source: AccountSource;
  onChange: (source: AccountSource) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="auth-source-choice">
      <legend>{t("auth.source")}</legend>
      <label className={source === "treelife" ? "auth-source-option selected" : "auth-source-option"}>
        <input
          type="radio"
          name="account_source"
          value="treelife"
          checked={source === "treelife"}
          onChange={() => onChange("treelife")}
        />
        <SourceIcon source="treelife" />
        <span className="auth-source-copy">
          <strong>{t("auth.treelife")}</strong>
          <span className="help">{t("auth.treelifeHelp")}</span>
        </span>
        <span className="auth-source-indicator" aria-hidden="true">{source === "treelife" ? "✓" : ""}</span>
      </label>
      <label className={source === "amis" ? "auth-source-option selected" : "auth-source-option"}>
        <input
          type="radio"
          name="account_source"
          value="amis"
          checked={source === "amis"}
          onChange={() => onChange("amis")}
        />
        <SourceIcon source="amis" />
        <span className="auth-source-copy">
          <strong>{t("auth.amis")}</strong>
          <span className="help">{t("auth.amisHelp")}</span>
        </span>
        <span className="auth-source-status">{t("auth.planned")}</span>
      </label>
    </fieldset>
  );
}

export function AmisPreview({
  returnLabel,
  onReturn,
}: {
  returnLabel: string;
  onReturn: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="amis-preview" aria-labelledby="amis-preview-heading">
      <div className="amis-preview-heading">
        <div>
          <p className="lede">{t("auth.amisLede")}</p>
          <h2 id="amis-preview-heading">{t("auth.amisTitle")}</h2>
        </div>
        <span className="amis-preview-badge">{t("auth.coming")}</span>
      </div>
      <p>{t("auth.amisBody")}</p>
      <ol className="amis-steps">
        <li className="amis-step"><span>1</span><strong>{t("auth.connect")}</strong><small>{t("auth.connectHelp")}</small></li>
        <li className="amis-step"><span>2</span><strong>{t("auth.find")}</strong><small>{t("auth.findHelp")}</small></li>
        <li className="amis-step"><span>3</span><strong>{t("auth.continue")}</strong><small>{t("auth.continueHelp")}</small></li>
      </ol>
      <div className="amis-preview-actions">
        <button className="secondary" type="button" onClick={onReturn}>{returnLabel}</button>
        <p className="help">{t("auth.amisNote")}</p>
      </div>
    </section>
  );
}
