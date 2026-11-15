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
  return (
    <fieldset className="auth-source-choice">
      <legend>Account source</legend>
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
          <strong>TreeLife account</strong>
          <span className="help">Use TreeLife directly.</span>
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
          <strong>AMIS account</strong>
          <span className="help">Link an existing farmer record.</span>
        </span>
        <span className="auth-source-status">Planned</span>
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
  return (
    <section className="amis-preview" aria-labelledby="amis-preview-heading">
      <div className="amis-preview-heading">
        <div>
          <p className="lede">AMIS connection</p>
          <h2 id="amis-preview-heading">Bring your farmer records with you</h2>
        </div>
        <span className="amis-preview-badge">Coming soon</span>
      </div>
      <p>AMIS will let authorised forestry teams find existing farmer records and create a TreeLife account without entering the same information twice.</p>
      <ol className="amis-steps">
        <li className="amis-step"><span>1</span><strong>Connect</strong><small>Verify your AMIS account.</small></li>
        <li className="amis-step"><span>2</span><strong>Find</strong><small>Look up a farmer record.</small></li>
        <li className="amis-step"><span>3</span><strong>Continue</strong><small>Finish your TreeLife access.</small></li>
      </ol>
      <div className="amis-preview-actions">
        <button className="secondary" type="button" onClick={onReturn}>{returnLabel}</button>
        <p className="help">The AMIS connection is reserved for the next integration phase. No external data is requested yet.</p>
      </div>
    </section>
  );
}
