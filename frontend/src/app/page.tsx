"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { dashboardTrees } from "@/lib/example-tree";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const ExampleMap = dynamic(() => import("@/components/ExampleMap"), {
  ssr: false,
  loading: () => <p className="home-map-loading">Loading…</p>,
});

export default function HomePage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
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
          <a href="#scenes">{t("home.record")}</a>
          <a href="#how">{t("home.how")}</a>
          <a href="#platform">{t("home.features")}</a>
          <a href="#acknowledgement">{t("home.acknowledgement")}</a>
          <LanguageSwitch tone="dark" align="end" />
          <Link className="secondary" href="/login">{t("home.signIn")}</Link>
          <Link className="primary" href="/register">{t("home.create")}</Link>
        </nav>
      </header>

      <section className="home-hero" style={{ backgroundImage: "linear-gradient(100deg, rgba(8, 22, 16, 0.88) 0%, rgba(8, 22, 16, 0.62) 46%, rgba(8, 22, 16, 0.28) 100%), url(/home/hero.jpg)" }}>
        <div className="home-hero-copy">
          <p className="home-kicker">{t("home.kicker")}</p>
          <h1>{t("home.heroTitle")}</h1>
          <p>{t("home.heroBody")}</p>
          <div className="actions">
            <Link className="primary" href="/register">{t("home.create")}</Link>
            <Link className="secondary" href="/login">{t("home.signIn")}</Link>
          </div>
        </div>
        <div className="home-stage">
          <p className="home-chip one"><strong>{t("home.pointTitle")}</strong>{t("home.pointBody")}</p>
          <div className="home-window">
            <div className="home-window-top"><span>TL</span> {t("home.window")}</div>
            <div className="home-minimap" aria-label={t("home.mapLabel")}>
              <ExampleMap />
            </div>
            <ul>
              <li><span>{t("home.species")}</span><span>{dashboardTrees.map((tree) => tree.species).join(", ")}</span></li>
              <li><span>{t("home.places")}</span><span>{dashboardTrees.map((tree) => tree.place).join(", ")}</span></li>
              <li><span>{t("home.trees")}</span><span>{dashboardTrees.length}</span></li>
              <li><span>{t("home.status")}</span><span>{t("home.planted")}</span></li>
            </ul>
          </div>
          <p className="home-chip two"><strong>{t("home.lifeTitle")}</strong>{t("home.lifeBody")}</p>
        </div>
      </section>

      <section className="home-scenes" id="scenes" aria-labelledby="scenes-heading">
        <div className="home-section-head">
          <p className="home-kicker dark">{t("home.record")}</p>
          <h2 id="scenes-heading">{t("home.scenesTitle")}</h2>
        </div>
        <div className="home-scene-grid">
          {scenes.map((scene) => (
            <article key={scene.title}>
              <Image src={scene.image} alt={t(scene.alt)} width={900} height={675} />
              <div>
                <p>{t(scene.step)}</p>
                <h3>{t(scene.title)}</h3>
                <p>{t(scene.body)}</p>
              </div>
            </article>
          ))}
          <article className="home-scene-feature">
            <Image
              src="/Forestry /Forestry Worker Measuring Tree Diameter.png"
              alt={t("home.scene4.alt")}
              width={1200}
              height={800}
            />
            <div>
              <p>{t("home.scene4.step")}</p>
              <h3>{t("home.scene4.title")}</h3>
              <p>{t("home.scene4.body")}</p>
            </div>
          </article>
        </div>
        <p className="home-note">{t("home.photoNote")}</p>
      </section>

      <section className="home-how" id="how" aria-labelledby="how-heading">
        <div className="home-section-head">
          <p className="home-kicker dark">{t("home.how")}</p>
          <h2 id="how-heading">{t("home.howTitle")}</h2>
        </div>
        <ol>
          {steps.map((step, index) => (
            <li key={step.title}>
              <span>0{index + 1}</span>
              <h3>{t(step.title)}</h3>
              <p>{t(step.body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-features" id="platform" aria-labelledby="platform-heading">
        <div className="home-section-head">
          <p className="home-kicker dark">{t("home.features")}</p>
          <h2 id="platform-heading">{t("home.featuresTitle")}</h2>
        </div>
        <div className="home-grid">
          {features.map((feature) => (
            <article key={feature.title}>
              <h3>{t(feature.title)}</h3>
              <p>{t(feature.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-badges" id="acknowledgement" aria-labelledby="acknowledgement-heading">
        <div className="home-section-head">
          <p className="home-kicker dark">{t("home.acknowledgement")}</p>
          <h2 id="acknowledgement-heading">{t("home.ackTitle")}</h2>
          <p>{t("home.ackBody")}</p>
          <p>{t("home.ackClose")}</p>
        </div>
        <div className="home-badge-row">
          {badges.map((badge) => (
            <article key={badge.metal}>
              <Image src={badge.src} alt="" width={112} height={112} />
              <h3>{t(badge.metal)}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="home-close" style={{ backgroundImage: "linear-gradient(100deg, rgba(8, 22, 16, 0.82), rgba(8, 22, 16, 0.55)), url(/home/harvest.jpg)" }}>
        <h2>{t("home.closeTitle")}</h2>
        <p>{t("home.closeBody")}</p>
        <div className="actions">
          <Link className="primary" href="/register">{t("home.create")}</Link>
          <Link className="secondary" href="/login">{t("home.signIn")}</Link>
        </div>
      </section>
    </main>
  );
}

const scenes: { step: MessageKey; title: MessageKey; body: MessageKey; image: string; alt: MessageKey }[] = [
  { step: "home.scene1.step", title: "home.scene1.title", body: "home.scene1.body", image: "/home/nursery.jpg", alt: "home.scene1.alt" },
  { step: "home.scene2.step", title: "home.scene2.title", body: "home.scene2.body", image: "/home/hero.jpg", alt: "home.scene2.alt" },
  { step: "home.scene3.step", title: "home.scene3.title", body: "home.scene3.body", image: "/home/harvest.jpg", alt: "home.scene3.alt" },
];

const steps: { title: MessageKey; body: MessageKey }[] = [
  { title: "home.step1.title", body: "home.step1.body" },
  { title: "home.step2.title", body: "home.step2.body" },
  { title: "home.step3.title", body: "home.step3.body" },
];

const badges: { metal: MessageKey; src: string }[] = [
  { metal: "home.bronze", src: "/badges/bronze.jpg" },
  { metal: "home.silver", src: "/badges/silver.jpg" },
  { metal: "home.gold", src: "/badges/gold.jpg" },
];

const features: { title: MessageKey; body: MessageKey }[] = [
  { title: "home.feature.inventory.title", body: "home.feature.inventory.body" },
  { title: "home.feature.register.title", body: "home.feature.register.body" },
  { title: "home.feature.map.title", body: "home.feature.map.body" },
  { title: "home.feature.sites.title", body: "home.feature.sites.body" },
  { title: "home.feature.batches.title", body: "home.feature.batches.body" },
  { title: "home.feature.farmers.title", body: "home.feature.farmers.body" },
  { title: "home.feature.nursery.title", body: "home.feature.nursery.body" },
  { title: "home.feature.care.title", body: "home.feature.care.body" },
  { title: "home.feature.carbon.title", body: "home.feature.carbon.body" },
  { title: "home.feature.harvest.title", body: "home.feature.harvest.body" },
  { title: "home.feature.assistant.title", body: "home.feature.assistant.body" },
  { title: "home.feature.reports.title", body: "home.feature.reports.body" },
  { title: "home.feature.accounts.title", body: "home.feature.accounts.body" },
];
