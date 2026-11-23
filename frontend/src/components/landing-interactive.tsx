"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

type ChannelId = "ussd" | "mobile" | "desktop";
type UssdMenuId = "root" | "1" | "2" | "3" | "4";
type SpeciesFilter = "All" | "Mango" | "Avocado" | "Banana";
type DistrictKey = "all" | "huye" | "bugesera" | "musanze";
type FeatureCategory = "capture" | "monitor" | "govern";
type FeatureId =
  | "nursery"
  | "sites"
  | "register"
  | "batches"
  | "farmers"
  | "inventory"
  | "map"
  | "care"
  | "harvest"
  | "carbon"
  | "reports"
  | "assistant"
  | "accounts";
type BadgeId = "bronze" | "silver" | "gold";

interface MonthPoint {
  month: string;
  planted: number;
  survival: number;
  harvestKg: number;
}

interface MobileTreeCard {
  id: string;
  species: Exclude<SpeciesFilter, "All">;
  district: "Huye" | "Bugesera" | "Musanze";
  sector: string;
  status: string;
  qty: string;
}

const NAV_LINKS: { href: string; label: MessageKey }[] = [
  { href: "#scenes", label: "home.record" },
  { href: "#access", label: "home.navAccess" },
  { href: "#dashboard", label: "home.navDashboard" },
  { href: "#platform", label: "home.features" },
  { href: "#acknowledgement", label: "home.acknowledgement" },
];

export function LandingHeader() {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="home-bar">
      <Link href="/" className="home-brand" aria-label="TreeLife Rwanda">
        <span className="auth-mark" aria-hidden="true">TL</span>
        <strong>TreeLife Rwanda</strong>
      </Link>

      <nav className="home-desktop-nav" aria-label="Page">
        {NAV_LINKS.map((item) => (
          <a key={item.href} href={item.href}>
            {t(item.label)}
          </a>
        ))}
        <LanguageSwitch tone="dark" align="end" />
        <Link className="secondary" href="/login">
          {t("home.signIn")}
        </Link>
        <Link className="primary" href="/register">
          {t("home.create")}
        </Link>
      </nav>

      <button
        type="button"
        className="home-menu-btn"
        aria-expanded={menuOpen}
        aria-controls="home-mobile-drawer"
        aria-label={t(menuOpen ? "home.menuClose" : "home.menuOpen")}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        {menuOpen ? "✕" : "☰"}
      </button>

      {menuOpen && (
        <div id="home-mobile-drawer" className="home-mobile-nav">
          {NAV_LINKS.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
              {t(item.label)}
            </a>
          ))}
          <div className="home-mobile-nav-actions">
            <LanguageSwitch tone="dark" align="end" />
            <Link className="secondary" href="/login" onClick={() => setMenuOpen(false)}>
              {t("home.signIn")}
            </Link>
            <Link className="primary" href="/register" onClick={() => setMenuOpen(false)}>
              {t("home.create")}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

interface LifecycleStage {
  id: string;
  step: MessageKey;
  title: MessageKey;
  body: MessageKey;
  meta: MessageKey;
  image: string;
  alt: MessageKey;
}

const LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    id: "nursery",
    step: "home.scene1.step",
    title: "home.scene1.title",
    body: "home.scene1.body",
    meta: "home.scene1.meta",
    image: "/home/nursery.jpg",
    alt: "home.scene1.alt",
  },
  {
    id: "planting",
    step: "home.scene2.step",
    title: "home.scene2.title",
    body: "home.scene2.body",
    meta: "home.scene2.meta",
    image: "/home/hero.jpg",
    alt: "home.scene2.alt",
  },
  {
    id: "harvest",
    step: "home.scene3.step",
    title: "home.scene3.title",
    body: "home.scene3.body",
    meta: "home.scene3.meta",
    image: "/home/harvest.jpg",
    alt: "home.scene3.alt",
  },
  {
    id: "carbon",
    step: "home.scene4.step",
    title: "home.scene4.title",
    body: "home.scene4.body",
    meta: "home.scene4.meta",
    image: "/Forestry /Forestry Worker Measuring Tree Diameter.png",
    alt: "home.scene4.alt",
  },
];

export function InteractiveLifecycle() {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStage = LIFECYCLE_STAGES[activeIndex] ?? LIFECYCLE_STAGES[0];

  return (
    <section className="home-scenes" id="scenes" aria-labelledby="scenes-heading">
      <div className="home-section-head">
        <p className="home-kicker dark">{t("home.record")}</p>
        <h2 id="scenes-heading">{t("home.scenesTitle")}</h2>
        <p className="home-subcopy">{t("home.lifecycle.hint")}</p>
      </div>

      <div className="home-lifecycle-track" aria-hidden="true">
        <span
          className="home-lifecycle-fill"
          style={{ width: `${((activeIndex + 1) / 4) * 100}%` }}
        />
      </div>

      <div className="home-scene-grid-4" role="tablist" aria-label={t("home.scenesTitle")}>
        {LIFECYCLE_STAGES.map((stage, idx) => {
          const isSelected = idx === activeIndex;
          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`home-scene-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => setActiveIndex(idx)}
            >
              <div className="home-scene-media">
                <Image src={stage.image} alt={t(stage.alt)} width={900} height={600} />
                <span className="home-scene-step">{t(stage.step)}</span>
              </div>
              <div className="home-scene-body">
                <h3>{t(stage.title)}</h3>
                <p>{t(stage.body)}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="home-lifecycle-callout" role="tabpanel" aria-live="polite">
        <p>
          <strong>{t(activeStage.step)}:</strong> {t(activeStage.meta)}
        </p>
        <a href="#access">{t("home.navAccess")} →</a>
      </div>
    </section>
  );
}

const USSD_SCREENS: Record<UssdMenuId, { title: string; lines: string[]; footer: string }> = {
  root: {
    title: "TreeLife *1234*5# · Demo",
    lines: [
      "1. Register planted tree",
      "2. Log care or watering",
      "3. Record harvest (kg)",
      "4. My tree count & badge",
    ],
    footer: "Reply 1-4 · No data needed",
  },
  "1": {
    title: "1. Register tree",
    lines: [
      "Site: Huye · Tumba Plot",
      "Species: 1. Avocado  2. Mango",
      "Qty: 12 seedlings",
      "Saved to record #TL-4082",
    ],
    footer: "SMS receipt sent · 0. Back",
  },
  "2": {
    title: "2. Log care",
    lines: [
      "Tree: Mango #TL-3190",
      "1. Watering  2. Mulching",
      "3. Pruning   4. Staking",
      "Status updated: Healthy",
    ],
    footer: "Synced to dashboard · 0. Back",
  },
  "3": {
    title: "3. Record harvest",
    lines: [
      "Tree: Avocado #TL-2041",
      "Harvest: 38 kg",
      "Sold: 25,000 RWF",
      "Added to farm ledger",
    ],
    footer: "Recorded · 0. Back",
  },
  "4": {
    title: "4. My summary",
    lines: [
      "Farmer: Jean Bosco",
      "Trees active: 46",
      "Survival rate: 93%",
      "Badge: Silver Steward",
    ],
    footer: "Updated today · 0. Back",
  },
};

const MOBILE_TREE_CARDS: MobileTreeCard[] = [
  {
    id: "#TL-4082",
    species: "Avocado",
    district: "Huye",
    sector: "Tumba",
    status: "Healthy · GPS locked",
    qty: "24 trees",
  },
  {
    id: "#TL-3190",
    species: "Mango",
    district: "Bugesera",
    sector: "Nyamata",
    status: "Watered · Queued",
    qty: "18 trees",
  },
  {
    id: "#TL-2944",
    species: "Banana",
    district: "Musanze",
    sector: "Muhoza",
    status: "Harvested · 42 kg",
    qty: "30 mats",
  },
];

const DISTRICT_DATA: Record<
  DistrictKey,
  {
    label: string;
    baseTrees: number;
    survival: string;
    carbon: string;
    farmers: string;
    series: MonthPoint[];
  }
> = {
  all: {
    label: "All Districts",
    baseTrees: 14820,
    survival: "91.4%",
    carbon: "42.8 t",
    farmers: "3,240",
    series: [
      { month: "May", planted: 1640, survival: 88, harvestKg: 940 },
      { month: "Jun", planted: 1920, survival: 89, harvestKg: 1120 },
      { month: "Jul", planted: 2180, survival: 90, harvestKg: 1310 },
      { month: "Aug", planted: 2050, survival: 91, harvestKg: 1480 },
      { month: "Sep", planted: 2340, survival: 92, harvestKg: 1650 },
      { month: "Oct", planted: 2450, survival: 93, harvestKg: 1820 },
    ],
  },
  huye: {
    label: "Huye",
    baseTrees: 5410,
    survival: "93.2%",
    carbon: "16.4 t",
    farmers: "1,180",
    series: [
      { month: "May", planted: 610, survival: 90, harvestKg: 380 },
      { month: "Jun", planted: 720, survival: 91, harvestKg: 430 },
      { month: "Jul", planted: 840, survival: 92, harvestKg: 510 },
      { month: "Aug", planted: 790, survival: 93, harvestKg: 590 },
      { month: "Sep", planted: 910, survival: 94, harvestKg: 660 },
      { month: "Oct", planted: 960, survival: 94, harvestKg: 740 },
    ],
  },
  bugesera: {
    label: "Bugesera",
    baseTrees: 4960,
    survival: "88.9%",
    carbon: "13.9 t",
    farmers: "1,090",
    series: [
      { month: "May", planted: 540, survival: 85, harvestKg: 290 },
      { month: "Jun", planted: 630, survival: 86, harvestKg: 340 },
      { month: "Jul", planted: 710, survival: 87, harvestKg: 410 },
      { month: "Aug", planted: 680, survival: 89, harvestKg: 450 },
      { month: "Sep", planted: 770, survival: 90, harvestKg: 520 },
      { month: "Oct", planted: 810, survival: 91, harvestKg: 580 },
    ],
  },
  musanze: {
    label: "Musanze",
    baseTrees: 4450,
    survival: "92.1%",
    carbon: "12.5 t",
    farmers: "970",
    series: [
      { month: "May", planted: 490, survival: 89, harvestKg: 270 },
      { month: "Jun", planted: 570, survival: 90, harvestKg: 350 },
      { month: "Jul", planted: 630, survival: 91, harvestKg: 390 },
      { month: "Aug", planted: 580, survival: 92, harvestKg: 440 },
      { month: "Sep", planted: 660, survival: 93, harvestKg: 470 },
      { month: "Oct", planted: 680, survival: 94, harvestKg: 500 },
    ],
  },
};

const SPECIES_FILTERS: SpeciesFilter[] = ["All", "Mango", "Avocado", "Banana"];

type AiRoleKey = "farmer" | "officer" | "admin";

interface AiChatTurn {
  id: string;
  sender: "user" | "ai";
  text: string;
  tag?: string;
}

const AI_ROLE_THREADS: Record<
  "en" | "rw" | "fr",
  Record<
    AiRoleKey,
    {
      labelKey: MessageKey;
      initial: AiChatTurn[];
      prompts: { label: string; userText: string; aiText: string; tag: string }[];
    }
  >
> = {
  en: {
    farmer: {
      labelKey: "home.ai.roleFarmer",
      initial: [
        { id: "f-1", sender: "user", text: "Which of my mango trees need care this week?" },
        { id: "f-2", sender: "ai", text: "3 young Mango trees on Bugesera Plot B (TREE-2026-Z7FF3L) are due for mulching and a 6-month survival check.", tag: "Bugesera · Plot B" },
      ],
      prompts: [
        { label: "Harvest forecast", userText: "What is my expected mango harvest for October?", aiText: "Estimated 12–18 kg from 40 bearing trees on your orchard. Buyer interest requests stay separate until you record a harvest.", tag: "Forecast · 40 trees" },
        { label: "Care checklist", userText: "What care should I log after watering?", aiText: "Log watering & mulching under Care so your 6-month survival rate stays above 80% toward your Silver badge.", tag: "Care · Silver track" },
      ],
    },
    officer: {
      labelKey: "home.ai.roleOfficer",
      initial: [
        { id: "o-1", sender: "user", text: "Summarize farms needing follow-up in Nyarugenge." },
        { id: "o-2", sender: "ai", text: "2 sites have unassessed trees planted 45+ days ago, and 1 roadside site is missing GPS coordinates.", tag: "Nyarugenge · 2 alerts" },
      ],
      prompts: [
        { label: "Batch allocation", userText: "How many seedlings remain in Nursery Lot #14?", aiText: "Lot #14 has 180 Avocado seedlings ready for allocation to smallholder sites before the rainy window closes.", tag: "Nursery · Lot #14" },
        { label: "Carbon readiness", userText: "Which mature trees are ready for DBH measurement?", aiText: "19 Grevillea trees in Musanze passed 24 months and are eligible for diameter & height carbon logging.", tag: "Carbon · Musanze" },
      ],
    },
    admin: {
      labelKey: "home.ai.roleAdmin",
      initial: [
        { id: "a-1", sender: "user", text: "Give me today's national survival & harvest overview." },
        { id: "a-2", sender: "ai", text: "90.8% survival across 14,820+ registered trees. Bugesera leads October fruit forecasts; 32.8 t CO2e verified.", tag: "National KPI · Live" },
      ],
      prompts: [
        { label: "Audit activity", userText: "Were any species reviews or carbon logs updated today?", aiText: "4 carbon authorizations approved in Musanze and 2 species profiles updated with local Kinyarwanda names.", tag: "Audit · 6 entries" },
        { label: "Buyer requests", userText: "How many open harvest interest requests are pending?", aiText: "3 pending viewer requests across Mango and Avocado lots; none alter recorded harvests until confirmed.", tag: "Discovery · 3 pending" },
      ],
    },
  },
  rw: {
    farmer: {
      labelKey: "home.ai.roleFarmer",
      initial: [
        { id: "f-1", sender: "user", text: "Ni ibihe biti byanjye by'imyembe bikeneye kwitabwaho muri iki cyumweru?" },
        { id: "f-2", sender: "ai", text: "Ibiti 3 by'imyembe i Bugesera (TREE-2026-Z7FF3L) bikeneye gushyirwaho ifumbire y'ibyatsi n'isuzuma ry'amezi 6.", tag: "Bugesera · Umurima B" },
      ],
      prompts: [
        { label: "Iteganyamusaruro", userText: "Niteze umusaruro ungana iki w'imyembe mu Ukwakira?", aiText: "Hateganyijwe kg 12–18 ku biti 40 byera. Ubusabe bw'abaguzi buguma butandukanye kugeza wanditse umusaruro.", tag: "Iteganya · Ibiti 40" },
        { label: "Urutonde rwo kwita", userText: "Ni iki nandika nyuma yo kuhira?", aiText: "Andika kuhira no gushyira ifumbire kugira ngo ubuzima bw'ibiti bugume hejuru ya 80% ku rwego rwa Feza.", tag: "Kwita · Urwego rwa Feza" },
      ],
    },
    officer: {
      labelKey: "home.ai.roleOfficer",
      initial: [
        { id: "o-1", sender: "user", text: "Vuga mu magambo make imirima ikeneye gukurikiranwa i Nyarugenge." },
        { id: "o-2", sender: "ai", text: "Ahantu 2 hafite ibiti bitarasuzumwa byatewe hashize iminsi 45+, n'ahantu 1 hatarabona GPS.", tag: "Nyarugenge · 2 bikenewe" },
      ],
      prompts: [
        { label: "Ugabura ry'ingemwe", userText: "Hasigaye ingemwe zingahe mu cyiciro #14?", aiText: "Icyiciro #14 gifite ingemwe 180 za avoka ziteguye guhabwa abahinzi mbere y'uko imvura irangira.", tag: "Pepiniyeri · #14" },
        { label: "Karuboni", userText: "Ni ibihe biti bikuze byageze igihe cyo gupimwa?", aiText: "Ibiti 19 bya Grevillea i Musanze byarengeje amezi 24 kandi byiteguye gupimwa umuzenguruko n'uburebure.", tag: "Karuboni · Musanze" },
      ],
    },
    admin: {
      labelKey: "home.ai.roleAdmin",
      initial: [
        { id: "a-1", sender: "user", text: "Mpa incamake y'ubuzima bw'ibiti n'umusaruro uyu munsi." },
        { id: "a-2", sender: "ai", text: "90.8% by'ibiti 14,820+ biriho neza. Bugesera iyoboye iteganyamusaruro; toni 32.8 za CO2e zemejwe.", tag: "Igihugu · Live" },
      ],
      prompts: [
        { label: "Ibyakozwe mu igenzura", userText: "Hari ubwoko bw'ibiti cyangwa karuboni byavuguruwe uyu munsi?", aiText: "Uruhushya 4 rwa karuboni rwemejwe i Musanze n'amoko 2 yongerwamo amazina y'Ikinyarwanda.", tag: "Igenzura · 6" },
        { label: "Ubusabe bw'abaguzi", userText: "Hari ubusabe bungahe bw'umusaruro butegereje?", aiText: "Hari ubusabe 3 butegereje ku myembe na avoka; nta na bumwe buhindura umusaruro wanditswe.", tag: "Gushaka · 3" },
      ],
    },
  },
  fr: {
    farmer: {
      labelKey: "home.ai.roleFarmer",
      initial: [
        { id: "f-1", sender: "user", text: "Quels manguiers ont besoin d'entretien cette semaine ?" },
        { id: "f-2", sender: "ai", text: "3 jeunes manguiers à Bugesera Parcelle B (TREE-2026-Z7FF3L) nécessitent un paillage et un contrôle à 6 mois.", tag: "Bugesera · Parcelle B" },
      ],
      prompts: [
        { label: "Prévision récolte", userText: "Quelle récolte de mangues est attendue en octobre ?", aiText: "Estimation de 12–18 kg sur 40 arbres productifs. Les demandes d'acheteurs restent séparées jusqu'à la récolte.", tag: "Prévision · 40 arbres" },
        { label: "Suivi d'entretien", userText: "Quel soin noter après l'arrosage ?", aiText: "Notez l'arrosage et le paillage sous Entretien pour garder un taux de survie supérieur à 80 % (niveau Argent).", tag: "Entretien · Argent" },
      ],
    },
    officer: {
      labelKey: "home.ai.roleOfficer",
      initial: [
        { id: "o-1", sender: "user", text: "Résume les fermes à suivre à Nyarugenge." },
        { id: "o-2", sender: "ai", text: "2 sites ont des arbres non évalués plantés il y a 45+ jours, et 1 site manque de coordonnées GPS.", tag: "Nyarugenge · 2 alertes" },
      ],
      prompts: [
        { label: "Affectation de lots", userText: "Combien de plants restent dans le lot #14 ?", aiText: "Le lot #14 dispose de 180 plants d'avocat prêts à être distribués aux agriculteurs avant la fin des pluies.", tag: "Pépinière · Lot #14" },
        { label: "Mesure carbone", userText: "Quels arbres matures sont prêts pour la mesure ?", aiText: "19 Grevillea à Musanze ont dépassé 24 mois et sont éligibles à la mesure de diamètre et hauteur.", tag: "Carbone · Musanze" },
      ],
    },
    admin: {
      labelKey: "home.ai.roleAdmin",
      initial: [
        { id: "a-1", sender: "user", text: "Donne-moi l'aperçu national de survie et récolte." },
        { id: "a-2", sender: "ai", text: "90,8 % de survie sur 14 820+ arbres. Bugesera mène les prévisions d'octobre ; 32,8 t CO2e vérifiées.", tag: "KPI National · Live" },
      ],
      prompts: [
        { label: "Journal d'audit", userText: "Des fiches espèces ou mesures carbone ont-elles été mises à jour ?", aiText: "4 autorisations carbone approuvées à Musanze et 2 fiches espèces complétées en kinyarwanda.", tag: "Audit · 6 entrées" },
        { label: "Demandes acheteurs", userText: "Combien de demandes de réservation sont en attente ?", aiText: "3 demandes en attente sur les lots mangue et avocat ; aucune ne modifie les récoltes enregistrées.", tag: "Découverte · 3" },
      ],
    },
  },
};

function buildCustomAiReply(question: string, role: AiRoleKey, lang: "en" | "rw" | "fr"): { text: string; tag: string } {
  const q = question.toLowerCase();
  if (q.includes("harvest") || q.includes("mango") || q.includes("yield") || q.includes("récolte") || q.includes("umusaruro")) {
    if (lang === "rw") return { text: "Iteganyamusaruro ry'Ukwakira ryerekana kg 580 i Bugesera na kg 500 i Musanze.", tag: "Iteganyamusaruro" };
    if (lang === "fr") return { text: "Les prévisions d'octobre indiquent 580 kg à Bugesera et 500 kg à Musanze.", tag: "Prévision récolte" };
    return { text: "October forecasts show 580 kg in Bugesera and 500 kg in Musanze across active fruit lots.", tag: "Harvest Forecast" };
  }
  if (q.includes("carbon") || q.includes("co2") || q.includes("measure") || q.includes("carbone") || q.includes("karuboni")) {
    if (lang === "rw") return { text: "Abakozi babifitiye uburenganzira bapima DBH n'uburebure; toni 32.8 za CO2e zemejwe.", tag: "Karuboni" };
    if (lang === "fr") return { text: "Les agents autorisés mesurent le DHP et la hauteur ; 32,8 t CO2e sont actuellement validées.", tag: "Stock Carbone" };
    return { text: "Authorized officers log DBH & height on verified trees; 32.8 t CO2e is currently accepted.", tag: "Carbon Stock" };
  }
  if (q.includes("care") || q.includes("water") || q.includes("pest") || q.includes("soin") || q.includes("kwita")) {
    if (lang === "rw") return { text: "Andika isuzuma cyangwa kuhira ku giti—amakuru abikwa nta murandasi akoherezwa nyuma.", tag: "Kwita ku biti" };
    if (lang === "fr") return { text: "Enregistrez les soins directement sur la fiche arbre—les saisies hors ligne se synchronisent ensuite.", tag: "Entretien" };
    return { text: "Log inspections or mulching directly on the tree record—offline entries sync automatically once online.", tag: "Field Care" };
  }
  if (lang === "rw") return { text: "Advisory AI isubiza ishingiye ku mirima, ibyiciro, imibereho y'ibiti n'umusaruro.", tag: "Ibarura rya TreeLife" };
  if (lang === "fr") return { text: "Advisory AI répond à partir de vos sites, lots, suivis de survie et récoltes en direct.", tag: "Ancré dans le registre" };
  return {
    text: `Advisory AI (${AI_ROLE_THREADS.en[role].labelKey === "home.ai.roleFarmer" ? "Farmer" : AI_ROLE_THREADS.en[role].labelKey === "home.ai.roleOfficer" ? "Officer" : "Admin"} view) answers from your live sites, batches, survival checks, and harvests.`,
    tag: "Registry Grounded",
  };
}

export function DeviceAndKpiShowcase() {
  const { t } = useI18n();
  const [channel, setChannel] = useState<ChannelId>("ussd");
  const [ussdScreen, setUssdScreen] = useState<UssdMenuId>("root");
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>("All");
  const [district, setDistrict] = useState<DistrictKey>("all");
  const [activeIndex, setActiveIndex] = useState<number>(5);
  const [syncedTrees, setSyncedTrees] = useState<number>(0);

  const handleSimulateSync = () => {
    setSyncedTrees((prev) => prev + 50);
    setActiveIndex(5);
  };

  const channels: {
    id: ChannelId;
    label: MessageKey;
    badge: MessageKey;
  }[] = [
    { id: "ussd", label: "home.access.ussd.label", badge: "home.access.ussd.badge" },
    { id: "mobile", label: "home.access.mobile.label", badge: "home.access.mobile.badge" },
    { id: "desktop", label: "home.access.desktop.label", badge: "home.access.desktop.badge" },
  ];

  const activeUssd = USSD_SCREENS[ussdScreen];
  const filteredMobileCards =
    speciesFilter === "All"
      ? MOBILE_TREE_CARDS
      : MOBILE_TREE_CARDS.filter((item) => item.species === speciesFilter);

  const current = DISTRICT_DATA[district];
  const liveSeries = current.series.map((point, idx) =>
    idx === current.series.length - 1
      ? { ...point, planted: point.planted + syncedTrees }
      : point
  );
  const maxPlanted = Math.max(...liveSeries.map((d) => d.planted));
  const activePoint = liveSeries[activeIndex] ?? liveSeries[liveSeries.length - 1];
  const totalTreesDisplay = (current.baseTrees + syncedTrees).toLocaleString();
  const globalTreesDisplay = (14820 + syncedTrees).toLocaleString();

  const benefits: { title: MessageKey; body: MessageKey }[] = [
    { title: "home.dashboard.b1.title", body: "home.dashboard.b1.body" },
    { title: "home.dashboard.b2.title", body: "home.dashboard.b2.body" },
    { title: "home.dashboard.b3.title", body: "home.dashboard.b3.body" },
    { title: "home.dashboard.b4.title", body: "home.dashboard.b4.body" },
  ];

  const width = 460;
  const height = 190;
  const padX = 28;
  const padTop = 20;
  const chartH = 132;
  const slotW = (width - padX * 2) / liveSeries.length;

  const linePoints = liveSeries
    .map((point, idx) => {
      const cx = padX + idx * slotW + slotW / 2;
      const cy = padTop + chartH - ((point.survival - 75) / 25) * chartH;
      return `${cx},${cy}`;
    })
    .join(" ");

  return (
    <>
      <section className="home-band home-band-access" id="access" aria-labelledby="access-heading">
        <div className="home-band-inner home-access-row">
          <div className="home-access-intro">
            <div className="home-section-head">
              <p className="home-kicker dark">{t("home.access.kicker")}</p>
              <h2 id="access-heading">{t("home.access.title")}</h2>
              <p className="home-subcopy">{t("home.access.body")}</p>
            </div>

            <div className="home-access-pills">
              <span>{t("home.heroPillUssd")}</span>
              <span>{t("home.heroPillMobile")}</span>
              <span>{t("home.heroPillDashboard")}</span>
            </div>

            <div className="home-device-tabs home-device-tabs-stack" role="tablist" aria-label={t("home.access.kicker")}>
              {channels.map((item) => {
                const selected = channel === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`home-device-tab ${selected ? "is-selected" : ""}`}
                    onClick={() => setChannel(item.id)}
                  >
                    <span>{t(item.label)}</span>
                    <small>{t(item.badge)}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="home-device-stage"
            role="tabpanel"
            aria-label={t(`home.access.${channel}.label` as MessageKey)}
          >
            {channel === "ussd" && (
              <div className="home-phone-frame">
                <div className="home-phone-speaker" aria-hidden="true" />
                <div className="home-ussd-screen">
                  <div className="home-ussd-head">
                    <strong>{activeUssd.title}</strong>
                    <span className="home-ussd-preview-badge">
                      {t("home.access.ussd.previewBadge")}
                    </span>
                  </div>
                  <ul className="home-ussd-menu">
                    {activeUssd.lines.map((line, idx) => (
                      <li key={line}>
                        {ussdScreen === "root" ? (
                          <button
                            type="button"
                            className="home-ussd-option"
                            onClick={() => setUssdScreen(String(idx + 1) as UssdMenuId)}
                          >
                            {line}
                          </button>
                        ) : (
                          <span>{line}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="home-ussd-foot">
                    <span>{activeUssd.footer}</span>
                    {ussdScreen !== "root" && (
                      <button
                        type="button"
                        className="home-ussd-back"
                        onClick={() => setUssdScreen("root")}
                      >
                        0. Back
                      </button>
                    )}
                  </div>
                </div>
                <div className="home-ussd-keypad" role="group" aria-label="USSD keypad">
                  {(["1", "2", "3", "0", "#"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="home-ussd-key"
                      onClick={() => {
                        if (key === "0") {
                          setUssdScreen("root");
                        } else if (key === "#") {
                          setUssdScreen((prev) => (prev === "root" ? "4" : "root"));
                        } else {
                          setUssdScreen(key);
                        }
                      }}
                    >
                      {key}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="home-sim-btn"
                  onClick={handleSimulateSync}
                >
                  {t("home.access.simulateBtn")}
                </button>
              </div>
            )}

            {channel === "mobile" && (
              <div className="home-mobile-frame">
                <div className="home-mobile-bar">
                  <span>TreeLife Field</span>
                  <span className="home-status-pill">Offline ready</span>
                </div>

                <div className="home-mobile-kpis">
                  <div>
                    <small>Trees</small>
                    <strong>{globalTreesDisplay}</strong>
                  </div>
                  <div>
                    <small>Survival</small>
                    <strong>91.4%</strong>
                  </div>
                  <div>
                    <small>CO2e</small>
                    <strong>42.8 t</strong>
                  </div>
                </div>

                <div className="home-mobile-filters" role="group" aria-label="Filter trees by species">
                  {SPECIES_FILTERS.map((species) => (
                    <button
                      key={species}
                      type="button"
                      aria-pressed={speciesFilter === species}
                      onClick={() => setSpeciesFilter(species)}
                    >
                      {species}
                    </button>
                  ))}
                </div>

                <div className="home-mobile-cards">
                  {filteredMobileCards.map((card) => (
                    <div key={card.id} className="home-mobile-card">
                      <div className="home-mobile-card-top">
                        <strong>
                          {card.species} · {card.id}
                        </strong>
                        <span>{card.qty}</span>
                      </div>
                      <small>
                        {card.district} · {card.sector} — {card.status}
                      </small>
                    </div>
                  ))}
                </div>

                <div className="home-mobile-sync">
                  <span>Outbox queue: 2 saved locally</span>
                  <b>Auto-syncs on signal</b>
                </div>

                <button
                  type="button"
                  className="home-sim-btn"
                  onClick={handleSimulateSync}
                >
                  {t("home.access.simulateBtn")}
                </button>
              </div>
            )}

            {channel === "desktop" && (
              <div className="home-desktop-frame">
                <div className="home-desktop-bar">
                  <div className="home-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span>TreeLife Command Center</span>
                  <span className="home-status-pill">Live sync</span>
                </div>

                <div className="home-desktop-body">
                  <aside className="home-desktop-nav" aria-label="Dashboard sections preview">
                    <span className="is-active">Overview</span>
                    <span>Sites &amp; Map</span>
                    <span>Nurseries</span>
                    <span>Carbon</span>
                    <span>Audit</span>
                  </aside>

                  <div className="home-desktop-main">
                    <div className="home-desktop-kpis">
                      <div className="home-desktop-stat">
                        <small>Trees</small>
                        <strong>{globalTreesDisplay}</strong>
                      </div>
                      <div className="home-desktop-stat">
                        <small>Survival</small>
                        <strong>91.4%</strong>
                      </div>
                      <div className="home-desktop-stat">
                        <small>CO2e</small>
                        <strong>42.8 t</strong>
                      </div>
                      <div className="home-desktop-stat">
                        <small>Farmers</small>
                        <strong>3,240</strong>
                      </div>
                    </div>

                    <div className="home-desktop-bars">
                      <div>
                        <div className="home-desktop-bar-label">
                          <span>Huye</span>
                          <strong>93.2%</strong>
                        </div>
                        <div className="home-progress">
                          <i style={{ width: "93.2%" }} />
                        </div>
                      </div>
                      <div>
                        <div className="home-desktop-bar-label">
                          <span>Musanze</span>
                          <strong>92.1%</strong>
                        </div>
                        <div className="home-progress">
                          <i style={{ width: "92.1%" }} />
                        </div>
                      </div>
                      <div>
                        <div className="home-desktop-bar-label">
                          <span>Bugesera</span>
                          <strong>88.9%</strong>
                        </div>
                        <div className="home-progress">
                          <i style={{ width: "88.9%" }} />
                        </div>
                      </div>
                    </div>

                    <ul className="home-desktop-rows">
                      <li>
                        <span>USSD · #TL-4082</span>
                        <span>Huye · Just now</span>
                      </li>
                      <li>
                        <span>Mobile · Batch #B-18</span>
                        <span>Bugesera · Synced</span>
                      </li>
                      <li>
                        <span>Carbon · DBH 14.2 cm</span>
                        <span>Approved</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {syncedTrees > 0 && (
              <p className="home-sim-toast" role="status" aria-live="polite">
                {t("home.access.syncedToast")} (+{syncedTrees})
              </p>
            )}

            <p className="home-sync-note">{t("home.access.syncNote")}</p>
          </div>
        </div>

        {syncedTrees > 0 && (
          <div className="home-sync-beam" aria-hidden="true">
            <span>↓</span>
          </div>
        )}
      </section>

      <section className="home-band home-band-dashboard" id="dashboard" aria-labelledby="dashboard-heading">
        <div className="home-band-inner home-dashboard-grid">
          <div className="home-dashboard-copy">
            <div className="home-section-head">
              <p className="home-kicker dark">{t("home.dashboard.kicker")}</p>
              <h2 id="dashboard-heading">{t("home.dashboard.title")}</h2>
              <p className="home-subcopy">{t("home.dashboard.body")}</p>
            </div>

            <ul className="home-benefit-grid">
              {benefits.map((b, idx) => (
                <li key={b.title}>
                  <span className="home-benefit-num">0{idx + 1}</span>
                  <div>
                    <strong>{t(b.title)}</strong>
                    <p>{t(b.body)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="home-kpi-card">
            <div className="home-kpi-card-head">
              <div>
                <div className="home-kpi-badges">
                  <span className="home-sample-pill">{t("home.dashboard.sampleBadge")}</span>
                  {syncedTrees > 0 && (
                    <span className="home-live-pulse">{t("home.dashboard.livePulse")}</span>
                  )}
                </div>
                <h3>{t("home.dashboard.chartTitle")}</h3>
              </div>
              <div className="home-district-pills" role="group" aria-label="District filter">
                {(Object.keys(DISTRICT_DATA) as DistrictKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={district === key}
                    onClick={() => setDistrict(key)}
                  >
                    {DISTRICT_DATA[key].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="home-kpi-strip">
              <div className="home-kpi-tile">
                <span>{t("home.dashboard.kpiTrees")}</span>
                <strong>{totalTreesDisplay}</strong>
              </div>
              <div className="home-kpi-tile">
                <span>{t("home.dashboard.kpiSurvival")}</span>
                <strong>{current.survival}</strong>
              </div>
              <div className="home-kpi-tile">
                <span>{t("home.dashboard.kpiCarbon")}</span>
                <strong>{current.carbon}</strong>
              </div>
              <div className="home-kpi-tile">
                <span>{t("home.dashboard.kpiFarmers")}</span>
                <strong>{current.farmers}</strong>
              </div>
            </div>

            <div className="home-chart-box">
              <div className="home-chart-readout" aria-live="polite">
                <span>
                  <strong>{activePoint.month}</strong> · {activePoint.planted.toLocaleString()}{" "}
                  planted · {activePoint.survival}% survival ·{" "}
                  {activePoint.harvestKg.toLocaleString()} kg harvest
                </span>
                <small>{t("home.dashboard.chartHint")}</small>
              </div>

              <div className="home-chart-tooltip" aria-hidden="true">
                <strong>{activePoint.month}</strong> · {activePoint.planted.toLocaleString()} ·{" "}
                {activePoint.survival}%
              </div>

              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="home-kpi-svg"
                role="img"
                aria-label={`${t("home.dashboard.chartTitle")} - ${current.label}`}
              >
                <line
                  className="home-chart-crosshair"
                  x1={padX + activeIndex * slotW + slotW / 2}
                  x2={padX + activeIndex * slotW + slotW / 2}
                  y1={padTop}
                  y2={padTop + chartH}
                />
                {[0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = padTop + chartH * (1 - ratio);
                  return (
                    <line
                      key={ratio}
                      x1={padX}
                      x2={width - padX}
                      y1={y}
                      y2={y}
                      stroke="#e3dacb"
                      strokeDasharray="3 4"
                    />
                  );
                })}

                {liveSeries.map((point, idx) => {
                  const barW = Math.min(34, slotW * 0.52);
                  const barH = (point.planted / maxPlanted) * (chartH - 12);
                  const x = padX + idx * slotW + (slotW - barW) / 2;
                  const y = padTop + chartH - barH;
                  const isSelected = idx === activeIndex;
                  const isLiveHighlight = syncedTrees > 0 && idx === liveSeries.length - 1;
                  return (
                    <g
                      key={point.month}
                      className="home-svg-bar-group"
                      onClick={() => setActiveIndex(idx)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onFocus={() => setActiveIndex(idx)}
                      tabIndex={0}
                      role="button"
                      aria-label={`${point.month}: ${point.planted} planted, ${point.survival}% survival`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveIndex(idx);
                        }
                      }}
                    >
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={barH}
                        rx={6}
                        fill={isLiveHighlight ? "#2f7a4d" : isSelected ? "#1c4636" : "#a9cbb7"}
                      />
                      <text
                        x={x + barW / 2}
                        y={padTop + chartH + 18}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight={isSelected || isLiveHighlight ? "700" : "500"}
                        fill={isSelected || isLiveHighlight ? "#1c4636" : "#5f584e"}
                      >
                        {point.month}
                      </text>
                    </g>
                  );
                })}

                <polyline
                  fill="none"
                  stroke="#8a5a12"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={linePoints}
                />

                {liveSeries.map((point, idx) => {
                  const cx = padX + idx * slotW + slotW / 2;
                  const cy = padTop + chartH - ((point.survival - 75) / 25) * chartH;
                  const isSelected = idx === activeIndex;
                  const isLiveHighlight = syncedTrees > 0 && idx === liveSeries.length - 1;
                  return (
                    <circle
                      key={`${point.month}-dot`}
                      cx={cx}
                      cy={cy}
                      r={isSelected || isLiveHighlight ? 5.5 : 3.5}
                      fill={isSelected || isLiveHighlight ? "#8a5a12" : "#fffcf8"}
                      stroke="#8a5a12"
                      strokeWidth="2"
                    />
                  );
                })}
              </svg>

              <div className="home-chart-legend">
                <span>
                  <i className="dot-planted" /> Trees planted
                </span>
                <span>
                  <i className="dot-survival" /> Survival rate (%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

interface FeatureItem {
  id: FeatureId;
  category: FeatureCategory;
  title: MessageKey;
  body: MessageKey;
}

const FEATURE_CATEGORIES: { id: FeatureCategory; label: MessageKey }[] = [
  { id: "capture", label: "home.platform.catCapture" },
  { id: "monitor", label: "home.platform.catMonitor" },
  { id: "govern", label: "home.platform.catGovern" },
];

const FEATURES_LIST: FeatureItem[] = [
  { id: "nursery", category: "capture", title: "home.feature.nursery.title", body: "home.feature.nursery.body" },
  { id: "sites", category: "capture", title: "home.feature.sites.title", body: "home.feature.sites.body" },
  { id: "register", category: "capture", title: "home.feature.register.title", body: "home.feature.register.body" },
  { id: "batches", category: "capture", title: "home.feature.batches.title", body: "home.feature.batches.body" },
  { id: "farmers", category: "capture", title: "home.feature.farmers.title", body: "home.feature.farmers.body" },
  { id: "inventory", category: "monitor", title: "home.feature.inventory.title", body: "home.feature.inventory.body" },
  { id: "map", category: "monitor", title: "home.feature.map.title", body: "home.feature.map.body" },
  { id: "care", category: "monitor", title: "home.feature.care.title", body: "home.feature.care.body" },
  { id: "harvest", category: "monitor", title: "home.feature.harvest.title", body: "home.feature.harvest.body" },
  { id: "carbon", category: "govern", title: "home.feature.carbon.title", body: "home.feature.carbon.body" },
  { id: "reports", category: "govern", title: "home.feature.reports.title", body: "home.feature.reports.body" },
  { id: "assistant", category: "govern", title: "home.feature.assistant.title", body: "home.feature.assistant.body" },
  { id: "accounts", category: "govern", title: "home.feature.accounts.title", body: "home.feature.accounts.body" },
];

function FeaturePillIcon({ category }: { category: FeatureCategory }) {
  if (category === "capture") {
    return (
      <svg viewBox="0 0 18 18" className="home-feature-icon" aria-hidden="true">
        <path d="M9 15V8M9 8C9 5 11.5 3 14.5 3.5C14.5 6.5 12 8.5 9 8ZM9 10C9 7.5 6.5 5.5 3.5 6C3.5 9 6 10.5 9 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (category === "monitor") {
    return (
      <svg viewBox="0 0 18 18" className="home-feature-icon" aria-hidden="true">
        <path d="M9 2.5C6.5 2.5 4.5 4.5 4.5 7C4.5 10.2 9 15 9 15C9 15 13.5 10.2 13.5 7C13.5 4.5 11.5 2.5 9 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="9" cy="7" r="1.6" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 18" className="home-feature-icon" aria-hidden="true">
      <path d="M3.5 14V9.5M9 14V5M14.5 14V7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function InteractiveFeaturesHub() {
  const { language, t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<FeatureCategory>("capture");
  const [selectedId, setSelectedId] = useState<FeatureId>("nursery");
  const [aiRole, setAiRole] = useState<AiRoleKey>("farmer");
  const [customTurns, setCustomTurns] = useState<{ lang: string; role: AiRoleKey; turns: AiChatTurn[] } | null>(null);
  const [chatInput, setChatInput] = useState("");

  const visibleFeatures = FEATURES_LIST.filter((item) => item.category === activeCategory);
  const activeFeature =
    visibleFeatures.find((item) => item.id === selectedId) ?? visibleFeatures[0];

  const handleCategoryChange = (category: FeatureCategory) => {
    setActiveCategory(category);
    const firstInCategory = FEATURES_LIST.find((item) => item.category === category);
    if (firstInCategory) {
      setSelectedId(firstInCategory.id);
    }
  };

  const roleConfig = AI_ROLE_THREADS[language][aiRole];
  const chatTurns =
    customTurns && customTurns.lang === language && customTurns.role === aiRole
      ? customTurns.turns
      : roleConfig.initial;

  const handleRoleChange = (role: AiRoleKey) => {
    setAiRole(role);
    setCustomTurns(null);
  };

  const handlePromptClick = (prompt: { userText: string; aiText: string; tag: string }) => {
    const ts = String(chatTurns.length + 1);
    setCustomTurns({
      lang: language,
      role: aiRole,
      turns: [
        ...chatTurns.slice(-2),
        { id: `u-${ts}`, sender: "user", text: prompt.userText },
        { id: `a-${ts}`, sender: "ai", text: prompt.aiText, tag: prompt.tag },
      ],
    });
  };

  const handleSendChat = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const reply = buildCustomAiReply(trimmed, aiRole, language);
    const ts = String(chatTurns.length + 1);
    setCustomTurns({
      lang: language,
      role: aiRole,
      turns: [
        ...chatTurns.slice(-2),
        { id: `u-${ts}`, sender: "user", text: trimmed },
        { id: `a-${ts}`, sender: "ai", text: reply.text, tag: reply.tag },
      ],
    });
    setChatInput("");
  };

  return (
    <section className="home-platform" id="platform" aria-labelledby="platform-heading">
      <div className="home-platform-split">
        <div className="home-platform-left">
          <div className="home-section-head">
            <p className="home-kicker dark">{t("home.features")}</p>
            <h2 id="platform-heading">{t("home.featuresTitle")}</h2>
          </div>

          <div className="home-feature-tabs" role="tablist" aria-label={t("home.featuresTitle")}>
            {FEATURE_CATEGORIES.map((cat) => {
              const selected = cat.id === activeCategory;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`home-feature-tab ${selected ? "is-selected" : ""}`}
                  onClick={() => handleCategoryChange(cat.id)}
                >
                  {t(cat.label)}
                </button>
              );
            })}
          </div>

          <div
            key={activeCategory}
            className="home-feature-rail"
            role="tablist"
            aria-label={t("home.features")}
          >
            {visibleFeatures.map((feature, idx) => {
              const selected = feature.id === activeFeature.id;
              return (
                <div
                  key={feature.id}
                  className={`home-feature-step ${selected ? "is-selected" : ""}`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`home-feature-node ${selected ? "is-selected" : ""}`}
                    onClick={() => setSelectedId(feature.id)}
                  >
                    <span className="home-feature-marker" aria-hidden="true">
                      {idx < visibleFeatures.length - 1 ? "↓" : "✓"}
                    </span>
                    <FeaturePillIcon category={feature.category} />
                    <span className="home-feature-node-title">{t(feature.title)}</span>
                  </button>
                  {selected ? (
                    <p
                      className="home-feature-readout"
                      role="tabpanel"
                      aria-label={t(feature.title)}
                    >
                      {t(feature.body)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="home-platform-right">
          <div className="home-ai-chat" aria-label="Advisory AI interactive chat preview">
            <div className="home-ai-chat-head">
              <div className="home-ai-brand">
                <span className="home-ai-pill">
                  <svg viewBox="0 0 32 32" width="14" height="14" aria-hidden="true">
                    <path d="M16 6c-4.2 4.4-7 7.4-7 11.2a7 7 0 0 0 14 0C23 13.4 20.2 10.4 16 6z" fill="currentColor" />
                    <rect x="15" y="21" width="2" height="6" rx="1" fill="currentColor" />
                  </svg>
                  Advisory AI
                </span>
                <span className="home-ai-status">
                  <i aria-hidden="true" /> {t("home.ai.status")}
                </span>
              </div>

              <div className="home-ai-roles" role="group" aria-label="Preview role">
                {(["farmer", "officer", "admin"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={aiRole === role}
                    className={`home-ai-role-btn${aiRole === role ? " is-active" : ""}`}
                    onClick={() => handleRoleChange(role)}
                  >
                    {t(AI_ROLE_THREADS[language][role].labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="home-ai-thread" aria-live="polite">
              {chatTurns.map((turn) => (
                <div
                  key={turn.id}
                  className={`home-ai-msg ${turn.sender === "user" ? "is-user" : "is-bot"}`}
                >
                  <p>{turn.text}</p>
                  {turn.tag ? <span className="home-ai-tag">{turn.tag}</span> : null}
                </div>
              ))}
            </div>

            <div className="home-ai-prompts" role="group" aria-label="Sample Advisory AI prompts">
              {roleConfig.prompts.map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  className="home-ai-prompt"
                  onClick={() => handlePromptClick(prompt)}
                >
                  {prompt.label}
                </button>
              ))}
            </div>

            <form className="home-ai-composer" onSubmit={handleSendChat}>
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={t("home.ai.placeholder")}
                aria-label="Ask Advisory AI"
              />
              <button type="submit" className="home-ai-send">
                {t("home.ai.send")}
              </button>
            </form>

            <div className="home-ai-foot">
              <span>{t("home.ai.foot")}</span>
              <Link href="/login">{t("home.ai.openLink")}</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface BadgeItem {
  id: BadgeId;
  metal: MessageKey;
  criteria: MessageKey;
  src: string;
  meterWidth: string;
}

const BADGES: BadgeItem[] = [
  { id: "bronze", metal: "home.bronze", criteria: "home.bronze.criteria", src: "/badges/bronze.jpg", meterWidth: "25%" },
  { id: "silver", metal: "home.silver", criteria: "home.silver.criteria", src: "/badges/silver.jpg", meterWidth: "60%" },
  { id: "gold", metal: "home.gold", criteria: "home.gold.criteria", src: "/badges/gold.jpg", meterWidth: "100%" },
];

export function InteractiveBadges() {
  const { t } = useI18n();
  const [activeBadgeId, setActiveBadgeId] = useState<BadgeId>("bronze");
  const activeBadge = BADGES.find((b) => b.id === activeBadgeId) ?? BADGES[0];

  return (
    <section className="home-badges" id="acknowledgement" aria-labelledby="acknowledgement-heading">
      <div className="home-section-head">
        <p className="home-kicker dark">{t("home.acknowledgement")}</p>
        <h2 id="acknowledgement-heading">{t("home.ackTitle")}</h2>
        <p className="home-subcopy">{t("home.ackBody")}</p>
      </div>

      <div className="home-badge-row" role="tablist" aria-label={t("home.acknowledgement")}>
        {BADGES.map((badge) => {
          const isSelected = badge.id === activeBadgeId;
          return (
            <button
              key={badge.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`home-badge-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => setActiveBadgeId(badge.id)}
            >
              <Image src={badge.src} alt="" width={68} height={68} />
              <h3>{t(badge.metal)}</h3>
              <div className="home-badge-meter" aria-hidden="true">
                <span className="home-badge-meter-fill" style={{ width: badge.meterWidth }} />
              </div>
            </button>
          );
        })}
      </div>

      <p className="home-badge-criteria" role="tabpanel" aria-live="polite">
        <strong>{t(activeBadge.metal)}:</strong> {t(activeBadge.criteria)}
      </p>
    </section>
  );
}
