export default function AboutPage() {
  return (
    <div className="page">
      <div>
        <h1>About this prototype</h1>
        <p className="lede">TreeLife Rwanda is an Ejo Labs prototype for registering urban and fruit trees. It is meant to complement the Forestry Management and Evaluation System, not replace it.</p>
      </div>
      <section className="card">
        <h2>What works in this version</h2>
        <p>Authenticated users can register a planting site, an individual tree, or a planting batch, then record a farmer, nursery stock, distribution, growth, maintenance, harvest, a sale, and a short advice note. Located records appear on the map.</p>
      </section>
      <section className="card">
        <h2>What this version does not do</h2>
        <ul>
          <li>It is not connected to FMES or any government system.</li>
          <li>A failed create is kept on this device and sent again when the connection returns, while the same browser session is still signed in. Edits are not queued, and two officers editing one record are not reconciled.</li>
          <li>The interface is English only.</li>
          <li>Sample records are synthetic. They are not field observations.</li>
        </ul>
      </section>
      <section className="card">
        <h2>Sensitive data</h2>
        <p>Exact coordinates can reveal a farm. The application requires a signed-in user before it shows them. A farmer record can store a display name and an optional phone number. It does not collect a national ID. Do not load real farmer data into this demonstration database.</p>
      </section>
    </div>
  );
}
