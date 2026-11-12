"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { dashboardTrees } from "@/lib/example-tree";
import { useAuth } from "@/lib/auth";

const ExampleMap = dynamic(() => import("@/components/ExampleMap"), {
  ssr: false,
  loading: () => <p className="home-map-loading">Loading the map of Huye…</p>,
});

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    router.replace("/dashboard");
  }, [loading, router, user]);

  if (loading || user) return <p className="loading">Loading…</p>;

  return (
    <main className="home">
      <header className="home-bar">
        <span className="auth-mark" aria-hidden="true">TL</span>
        <strong>TreeLife Rwanda</strong>
        <nav aria-label="Page">
          <a href="#scenes">The record</a>
          <a href="#how">How it works</a>
          <a href="#acknowledgement">Acknowledgement</a>
          <a href="#platform">Features</a>
          <Link className="secondary" href="/login">Sign in</Link>
          <Link className="primary" href="/register">Create an account</Link>
        </nav>
      </header>

      <section className="home-hero" style={{ backgroundImage: "linear-gradient(100deg, rgba(8, 22, 16, 0.88) 0%, rgba(8, 22, 16, 0.62) 46%, rgba(8, 22, 16, 0.28) 100%), url(/home/hero.jpg)" }}>
        <div className="home-hero-copy">
          <p className="home-kicker">Urban and fruit trees</p>
          <h1>Follow a tree from the nursery to the <em>harvest.</em></h1>
          <p>TreeLife keeps one record for each tree in Rwanda: where it is planted, who it belongs to, and how it is cared for, harvested, and sold.</p>
          <div className="actions">
            <Link className="primary" href="/register">Create an account</Link>
            <Link className="secondary" href="/login">Sign in</Link>
          </div>
        </div>
        <div className="home-stage">
          <p className="home-chip one"><strong>A point for every tree</strong>GPS, a search, or a click on the map.</p>
          <div className="home-window">
            <div className="home-window-top"><span>TL</span> Dashboard</div>
            <div className="home-minimap" aria-label="Map of mango, avocado, and banana across Rwanda">
              <ExampleMap />
            </div>
            <ul>
              <li><span>Species</span><span>{dashboardTrees.map((tree) => tree.species).join(", ")}</span></li>
              <li><span>Places</span><span>{dashboardTrees.map((tree) => tree.place).join(", ")}</span></li>
              <li><span>Trees</span><span>{dashboardTrees.length}</span></li>
              <li><span>Status</span><span>Planted</span></li>
            </ul>
          </div>
          <p className="home-chip two"><strong>One record, the whole life</strong>Nursery, care, harvest, and sale.</p>
        </div>
      </section>

      <section className="home-scenes" id="scenes" aria-labelledby="scenes-heading">
        <div className="home-section-head">
          <p className="home-kicker dark">The record</p>
          <h2 id="scenes-heading">Everything that happens to the tree stays on one record.</h2>
        </div>
        <div className="home-scene-grid">
          {scenes.map((scene) => (
            <article key={scene.title}>
              <Image src={scene.image} alt={scene.alt} width={900} height={675} />
              <div>
                <p>{scene.step}</p>
                <h3>{scene.title}</h3>
                <p>{scene.body}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="home-note">The photographs show the kind of planting TreeLife is built to record.</p>
      </section>

      <section className="home-how" id="how" aria-labelledby="how-heading">
        <div className="home-section-head">
          <p className="home-kicker dark">How it works</p>
          <h2 id="how-heading">Three steps from a new account to a tree on the map.</h2>
        </div>
        <ol>
          {steps.map((step, index) => (
            <li key={step.title}>
              <span>0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-badges" id="acknowledgement" aria-labelledby="acknowledgement-heading">
        <div className="home-section-head">
          <p className="home-kicker dark">Acknowledgement</p>
          <h2 id="acknowledgement-heading">Recognizing your contribution to Rwanda&apos;s trees.</h2>
          <p>Every tree recorded through TreeLife represents a valuable contribution to the environment and the communities that depend on it. This acknowledgement recognizes the efforts of farmers and field officers who help document, monitor, and protect Rwanda&apos;s trees.</p>
          <p>Your contribution matters, and we appreciate the role you play in growing a greener future.</p>
        </div>
        <div className="home-badge-row">
          {badges.map((badge) => (
            <article key={badge.metal}>
              <Image src={badge.src} alt="" width={112} height={112} />
              <h3>{badge.metal}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="home-features" id="platform" aria-labelledby="platform-heading">
        <div className="home-section-head">
          <p className="home-kicker dark">Features</p>
          <h2 id="platform-heading">What is in the platform</h2>
        </div>
        <div className="home-grid">
          {features.map((feature) => (
            <article key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-close" style={{ backgroundImage: "linear-gradient(100deg, rgba(8, 22, 16, 0.82), rgba(8, 22, 16, 0.55)), url(/home/harvest.jpg)" }}>
        <h2>Open the record when you are ready.</h2>
        <p>Create an account to register trees, or sign in to continue.</p>
        <div className="actions">
          <Link className="primary" href="/register">Create an account</Link>
          <Link className="secondary" href="/login">Sign in</Link>
        </div>
      </section>
    </main>
  );
}

const scenes = [
  {
    step: "01 · Nursery",
    title: "Seedlings before they leave the nursery",
    body: "Record a lot, then move a quantity to a planting site and a farmer.",
    image: "/home/nursery.jpg",
    alt: "Rows of young tree seedlings in nursery bags",
  },
  {
    step: "02 · The tree",
    title: "A place, a species, and a point on the map",
    body: "Register one tree or a batch. GPS, search, or a click fills the coordinates.",
    image: "/home/hero.jpg",
    alt: "Rows of young fruit trees in an orchard",
  },
  {
    step: "03 · Harvest",
    title: "Fruit taken, then sold",
    body: "Record the harvest and the sale, including the amount in Rwandan francs.",
    image: "/home/harvest.jpg",
    alt: "Ripe mangoes hanging on a tree",
  },
];

const steps = [
  {
    title: "Choose the account",
    body: "An administrator reviews reports. A field officer or a farmer registers trees. A viewer sees recorded trees by species and district, then the map and the tree list, and cannot change records.",
  },
  {
    title: "Register the site, then the tree",
    body: "The form checks the required fields. Coordinates come from the device, a place search, or a point chosen on the map.",
  },
  {
    title: "Follow it after planting",
    body: "Add care, a harvest, and a sale. Ask the assistant about the records on that account. Open the same tree from the inventory or from its marker.",
  },
];

const badges = [
  { metal: "Bronze", src: "/badges/bronze.jpg" },
  { metal: "Silver", src: "/badges/silver.jpg" },
  { metal: "Gold", src: "/badges/gold.jpg" },
];

const features = [
  {
    title: "Tree inventory",
    body: "Search by tree ID, species, or site, and filter by category and status. Each row shows the species, the site, the quantity, and the status, and opens the planting date and coordinates.",
  },
  {
    title: "Register a tree",
    body: "A form that checks the required fields, accepts GPS or a point chosen on the map, and saves the record.",
  },
  {
    title: "Tree map",
    body: "Select a marker to view a tree, a planting batch, or a site and its registration details. Filter by species, district, farmer, and status.",
  },
  {
    title: "Planting sites",
    body: "Register the farm, plot, roadside, or institution first, with a place, a status, and optional coordinates.",
  },
  {
    title: "Planting batches",
    body: "Register a group of trees planted together: one species, one site, one date, and a quantity.",
  },
  {
    title: "Farmers",
    body: "An officer names the household they are helping. A farmer’s own account name is used. No national ID is collected.",
  },
  {
    title: "Nursery",
    body: "Record seedlings produced at a nursery, then move a quantity to a planting site and a farmer.",
  },
  {
    title: "Care in the field",
    body: "Measure height, and record pruning, watering, mulching, pest control, or staking.",
  },
  {
    title: "Harvest and sales",
    body: "Record fruit taken from a tree or batch, then where it went: sold, eaten at home, stored, given away, or another use.",
  },
  {
    title: "Assistant",
    body: "Ask about the trees this account can see, from planting and watering through harvest and selling.",
  },
  {
    title: "Reports",
    body: "See farmers, seedlings, survival, harvest by species, sites by district, and sales from the records that have been entered.",
  },
  {
    title: "Accounts and audit",
    body: "Administrators review the overview, the reports, and an audit of each change. Viewers see trees by species and district, and cannot change records or see farmer and officer names.",
  },
];
