"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  DeviceAndKpiShowcase,
  InteractiveBadges,
  InteractiveFeaturesHub,
  InteractiveLifecycle,
  LandingHeader,
} from "@/components/landing-interactive";
import { dashboardTrees } from "@/lib/example-tree";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import "./home.css";

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

  return (
    <main className="home">
      <LandingHeader />

      <section
        className="home-hero"
        style={{
          backgroundImage:
            "linear-gradient(100deg, rgba(8, 22, 16, 0.9) 0%, rgba(8, 22, 16, 0.68) 48%, rgba(8, 22, 16, 0.34) 100%), url(/home/hero.jpg)",
        }}
      >
        <svg
          className="home-hero-art"
          viewBox="0 0 1440 720"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          {/* Topographic contour lines */}
          <path
            className="hero-contour hero-contour-1"
            d="M -60 560 C 180 480, 340 620, 620 520 C 860 435, 1080 510, 1500 410"
          />
          <path
            className="hero-contour hero-contour-2"
            d="M -40 440 C 210 350, 420 490, 690 390 C 920 305, 1140 370, 1500 280"
          />
          <path
            className="hero-contour hero-contour-3"
            d="M -40 310 C 240 230, 460 360, 740 270 C 980 190, 1200 240, 1500 160"
          />
          <path
            className="hero-contour hero-contour-4"
            d="M -60 660 C 240 590, 480 690, 780 610 C 1020 545, 1220 600, 1500 520"
          />
          <path
            className="hero-contour hero-contour-5"
            d="M 120 -30 C 360 110, 640 80, 880 150 C 1100 215, 1280 120, 1480 60"
          />

          {/* Field-to-registry telemetry flow tracks */}
          <path
            className="hero-flow"
            d="M 140 630 C 360 540, 640 470, 990 295"
          />
          <path
            className="hero-flow"
            d="M 290 670 C 520 570, 740 420, 1030 330"
          />
          <path
            className="hero-flow"
            d="M 80 500 C 340 420, 660 360, 975 265"
          />

          {/* Animated telemetry light pulses */}
          <path
            className="hero-flow-pulse hero-flow-pulse-1"
            d="M 140 630 C 360 540, 640 470, 990 295"
          />
          <path
            className="hero-flow-pulse hero-flow-pulse-2"
            d="M 290 670 C 520 570, 740 420, 1030 330"
          />
          <path
            className="hero-flow-pulse hero-flow-pulse-3"
            d="M 80 500 C 340 420, 660 360, 975 265"
          />

          {/* Pulsing GPS coordinate nodes */}
          <g transform="translate(140 630)">
            <circle className="hero-node-ring hero-node-ring-1" r="14" />
            <circle className="hero-node" r="3.5" />
          </g>
          <g transform="translate(290 670)">
            <circle className="hero-node-ring hero-node-ring-2" r="14" />
            <circle className="hero-node" r="3.5" />
          </g>
          <g transform="translate(520 505)">
            <circle className="hero-node-ring hero-node-ring-3" r="14" />
            <circle className="hero-node" r="3.5" />
          </g>
          <g transform="translate(690 390)">
            <circle className="hero-node-ring hero-node-ring-4" r="14" />
            <circle className="hero-node" r="3.5" />
          </g>
          <g transform="translate(990 295)">
            <circle className="hero-node-ring hero-node-ring-5" r="16" />
            <circle className="hero-node" r="4" />
          </g>
        </svg>

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
          <div className="home-window">
            <div className="home-window-top">
              <span>TL</span> {t("home.window")}
            </div>
            <div className="home-minimap" aria-label={t("home.mapLabel")}>
              <ExampleMap />
            </div>
            <ul>
              <li>
                <span>{t("home.species")}</span>
                <span>{dashboardTrees.map((tree) => tree.species).join(", ")}</span>
              </li>
              <li>
                <span>{t("home.places")}</span>
                <span>{dashboardTrees.map((tree) => tree.place).join(", ")}</span>
              </li>
              <li>
                <span>{t("home.trees")}</span>
                <span>{dashboardTrees.length}</span>
              </li>
              <li>
                <span>{t("home.status")}</span>
                <span>{t("home.planted")}</span>
              </li>
            </ul>
            <p className="home-window-foot">
              <strong>{t("home.lifeTitle")}</strong>
              {t("home.lifeBody")}
            </p>
          </div>
        </div>
      </section>

      <InteractiveLifecycle />

      <DeviceAndKpiShowcase />

      <InteractiveFeaturesHub />

      <InteractiveBadges />

      <section
        className="home-close"
        style={{
          backgroundImage:
            "linear-gradient(100deg, rgba(8, 22, 16, 0.88), rgba(8, 22, 16, 0.64)), url(/home/harvest.jpg)",
        }}
      >
        <svg
          className="home-close-art"
          viewBox="0 0 1440 320"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <path d="M -40 260 C 240 190, 520 290, 860 210 C 1120 150, 1290 205, 1480 140" />
          <path d="M -40 180 C 280 120, 560 220, 900 135 C 1160 70, 1320 130, 1480 75" />
          <path d="M -40 100 C 310 50, 610 145, 960 65 C 1180 15, 1340 60, 1480 20" />
        </svg>
        <div className="home-close-copy">
          <h2>{t("home.closeTitle")}</h2>
          <p>{t("home.closeBody")}</p>
        </div>
        <div className="actions">
          <Link className="primary" href="/register">{t("home.close.farmerBtn")}</Link>
          <Link className="secondary" href="/login">{t("home.close.districtBtn")}</Link>
        </div>
      </section>

      <footer className="home-foot">
        <p>{t("home.footer.line")}</p>
      </footer>
    </main>
  );
}
