export default function AboutPage() {
  return (
    <div className="page">
      <div>
        <h1>About this prototype</h1>
        <p className="lede">TreeLife Rwanda is an Ejo Labs prototype for registering urban and fruit trees. It is meant to complement the Forestry Management and Evaluation System, not replace it.</p>
      </div>
      <section className="card">
        <h2>What works in this version</h2>
        <p>Authenticated users can register a planting site, an individual tree, or a planting batch, edit those records, record an inspection, and see geolocated records on a map.</p>
      </section>
      <section className="card">
        <h2>What this version does not do</h2>
        <ul>
          <li>It is not connected to FMES or any government system.</li>
          <li>It does not sync offline submissions. A failed save can be retried with the same request id.</li>
          <li>It does not manage nurseries, distribution, harvesting, or sales.</li>
          <li>The interface is English only.</li>
          <li>Sample records are synthetic. They are not field observations.</li>
        </ul>
      </section>
      <section className="card">
        <h2>Sensitive data</h2>
        <p>Exact coordinates can reveal a farm. The application requires a signed-in user before it shows them, and it does not collect phone numbers or national IDs. Do not load real farmer data into this demonstration database.</p>
      </section>
    </div>
  );
}
