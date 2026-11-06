export default function AboutPage() {
  return (
    <div className="page">
      <div>
        <h1>About TreeLife Rwanda</h1>
        <p className="lede">TreeLife Rwanda is an Ejo Labs record of urban and fruit trees, from the nursery through planting, care, harvest, and sale. It is meant to complement the Forestry Management and Evaluation System.</p>
      </div>
      <section className="card">
        <h2>What you can record</h2>
        <p>A field officer or a farmer can register a planting site, an individual tree, or a planting batch, then record nursery stock, distribution, growth, maintenance, harvest, a sale, and a short advice note. An officer names the farmer they are helping. A farmer’s record uses the name on their account. The trees they record are acknowledged on their account. An administrator reviews the overview, reports, and the audit log, and does not register trees. A viewer sees recorded trees by species and district, and the map, and cannot change records or see farmer and officer names.</p>
      </section>
      <section className="card">
        <h2>Current limits</h2>
        <ul>
          <li>TreeLife is not connected to FMES or any other government system.</li>
          <li>A failed create is kept on this device and sent again when the connection returns, while the same browser session is still signed in. Edits are not queued, and two officers editing one record are not reconciled.</li>
          <li>The interface is English only.</li>
        </ul>
      </section>
      <section className="card">
        <h2>Sensitive data</h2>
        <p>Exact coordinates can reveal a farm. The application requires a signed-in user before it shows them. A farmer record can store a display name and an optional phone number. It does not collect a national ID.</p>
      </section>
    </div>
  );
}
