"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AssistantWidget } from "@/components/assistant";
import { FarmerAccount } from "@/components/farmer-account";
import { LanguageSwitch } from "@/components/language-switch";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { readOutbox, removeOutbox } from "@/lib/outbox";
import type { NotificationList } from "@/lib/types";
import "./app-shell.css";

const fieldLinks = [
  ["/dashboard", "nav.overview"],
  ["/monitoring", "nav.monitoring"],
  ["/farmers", "nav.farmers"],
  ["/sites", "nav.sites"],
  ["/trees", "nav.trees"],
  ["/batches", "nav.batches"],
  ["/forests", "nav.forests"],
  ["/nursery", "nav.nursery"],
  ["/field", "nav.field"],
  ["/harvest", "nav.harvest"],
  ["/analytics", "nav.analytics"],
  ["/map", "nav.map"],
  ["/species", "nav.species"],
];

const adminLinks = [
  ["/dashboard", "nav.overview"],
  ["/discover", "nav.harvests"],
  ["/monitoring", "nav.monitoring"],
  ["/fmes-preparation", "nav.fmes"],
  ["/analytics", "nav.reports"],
  ["/map", "nav.map"],
  ["/agents", "nav.agents"],
  ["/sites", "nav.sites"],
  ["/trees", "nav.trees"],
  ["/batches", "nav.batches"],
  ["/forests", "nav.forests"],
  ["/harvest", "nav.harvest"],
  ["/species", "nav.species"],
];

const farmerLinks = fieldLinks.filter(([href]) => href !== "/farmers");

const viewerLinks = [
  ["/dashboard", "nav.overview"],
  ["/discover", "nav.harvests"],
  ["/map", "nav.map"],
  ["/trees", "nav.trees"],
  ["/forests", "nav.forests"],
];

function NavIcon({ path }: { path: string }) {
  const common = { className: "shell-nav-icon", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (path === "/dashboard") return <svg {...common}><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="12" y="3" width="5" height="5" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></svg>;
  if (path === "/monitoring") return <svg {...common}><circle cx="10" cy="10" r="6.5" /><path d="M10 5.5v4.5l3 2" /><path d="M4.5 4.5 3 3M15.5 4.5 17 3" /></svg>;
  if (path === "/discover") return <svg {...common}><path d="M4 8h12v8H4z" /><path d="M7 8V6a3 3 0 0 1 6 0v2" /><path d="M10 11v2" /></svg>;
  if (path === "/fmes-preparation") return <svg {...common}><path d="M4 4.5h12v11H4z" /><path d="M7 8h6M7 11h4M7 14h6" /><path d="m13.5 13 1.5 1.5 2.5-3" /></svg>;
  if (path === "/map") return <svg {...common}><path d="M10 17s5-4.5 5-8.5a5 5 0 1 0-10 0C5 12.5 10 17 10 17Z" /><circle cx="10" cy="8.5" r="1.6" /></svg>;
  if (path === "/farmers" || path === "/agents") return <svg {...common}><circle cx="10" cy="6.5" r="2.5" /><path d="M5.5 16c.5-2.5 2-4 4.5-4s4 1.5 4.5 4" /><path d="M4 9.5h2M14 9.5h2" /></svg>;
  if (path === "/sites") return <svg {...common}><path d="M4 17V6.5L10 3l6 3.5V17" /><path d="M3 17h14M8 17v-4h4v4M7 8h.01M10 8h.01M13 8h.01" /></svg>;
  if (path === "/trees") return <svg {...common}><path d="M10 17V9" /><path d="M10 10c-3.5 0-5.5-2-5.5-5 3.5 0 5.5 1.5 5.5 4.5C10 6.5 12 5 15.5 5c0 3-2 5-5.5 5Z" /></svg>;
  if (path === "/batches") return <svg {...common}><path d="m10 3 6 3.5v7L10 17l-6-3.5v-7L10 3Z" /><path d="m4 6.5 6 3.5 6-3.5M10 10v7" /></svg>;
  if (path === "/forests" || path === "/species") return <svg {...common}><path d="M10 17V9" /><path d="m10 3 4 5h-2.2l3.2 4H5l3.2-4H6l4-5Z" /><path d="M6.5 17h7" /></svg>;
  if (path === "/carbon") return <svg {...common}><path d="M16 4C9 4 5 7 5 13c0 2 1.5 3 3.5 3C14 16 16 11 16 4Z" /><path d="M4 17c2.5-4 5-6 9-8" /></svg>;
  if (path === "/analytics") return <svg {...common}><path d="M4 16V9M10 16V5M16 16v-3" /><path d="M3 17h14" /></svg>;
  if (path === "/messages") return <svg {...common}><path d="M4 5.5h12v8H9l-3.5 3v-3H4v-8Z" /><path d="M7 9h6M7 11.5h4" /></svg>;
  if (path === "/audit") return <svg {...common}><circle cx="10" cy="10" r="6.5" /><path d="M10 6v4l2.5 1.5" /></svg>;
  if (path === "/nursery") return <svg {...common}><path d="M10 17V9" /><path d="M10 10c-2.5 0-4-1.5-4-4 2.5 0 4 1.2 4 3.5C10 7.2 11.5 6 14 6c0 2.5-1.5 4-4 4Z" /><path d="M6 17h8" /></svg>;
  if (path === "/field") return <svg {...common}><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2" /><path d="M10 3.5v2M16.5 10h-2M10 16.5v-2M3.5 10h2" /></svg>;
  if (path === "/harvest") return <svg {...common}><path d="M4 7h12l-1 10H5L4 7Z" /><path d="M7 7c.2-2 1.2-3 3-3s2.8 1 3 3M7 10v4M10 10v4M13 10v4" /></svg>;
  return <svg {...common}><circle cx="10" cy="10" r="6.5" /><path d="M10 9v4M10 6.5h.01" /></svg>;
}

export function linksForRole(role: string | undefined, _carbonMonitoring?: string | null) {
  const links = role === "admin"
    ? [...adminLinks]
    : role === "viewer"
      ? [...viewerLinks]
      : role === "farmer"
        ? [...farmerLinks]
        : [...fieldLinks];
  const showCarbon = role === "admin" || role === "field_officer";
  if (showCarbon && !links.some(([path]) => path === "/carbon")) {
    const harvest = links.findIndex(([path]) => path === "/harvest");
    links.splice(harvest >= 0 ? harvest + 1 : links.length, 0, ["/carbon", "nav.carbon"]);
  }
  return links;
}

export function pathAllowed(role: string, pathname: string, _carbonMonitoring?: string | null) {
  if (pathname === "/notifications" || pathname.startsWith("/notifications/")) return true;
  if (pathname === "/fmes-preparation" || pathname.startsWith("/fmes-preparation/")) return role === "admin";
  if (pathname === "/messages" || pathname.startsWith("/messages/")) return role === "admin";
  if (pathname === "/agents" || pathname.startsWith("/agents/")) return role === "admin";
  if (pathname === "/carbon/review" || pathname.startsWith("/carbon/review/")) return role === "admin";
  if (pathname === "/carbon" || pathname.startsWith("/carbon/")) {
    return role === "admin" || role === "field_officer";
  }
  if (role === "viewer") {
    if (pathname.endsWith("/new") || pathname.includes("/edit")) return false;
    return pathname === "/dashboard" || pathname === "/discover" || pathname === "/map" || pathname === "/trees" || pathname === "/forests" || pathname === "/advice" || /^\/trees\/[^/]+$/.test(pathname) || /^\/forests\/[^/]+$/.test(pathname);
  }
  if (role === "farmer") {
    if (pathname === "/farmers" || pathname.startsWith("/farmers/")) return false;
    if (pathname === "/forests/new" || /^\/forests\/[^/]+\/edit$/.test(pathname)) return false;
    return true;
  }
  if (role === "admin") {
    if (pathname === "/forests/new" || /^\/forests\/[^/]+\/edit$/.test(pathname)) return true;
    if (pathname.includes("/edit") || pathname.endsWith("/new")) return false;
    const hidden = ["/farmers", "/nursery", "/field"];
    return !hidden.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  }
  return true;
}

function NotificationBell() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    api<NotificationList>("/notifications")
      .then((data) => {
        if (active) setUnreadCount(data.unread_count);
      })
      .catch(() => {
        if (active) setUnreadCount(0);
      });
    return () => {
      active = false;
    };
  }, [pathname, user?.id]);

  return (
    <Link className="shell-notification" href="/notifications" aria-label={t("shell.notifications")}>
      <span aria-hidden="true">🔔</span>
      {unreadCount > 0 ? <b>{unreadCount > 99 ? "99+" : unreadCount}</b> : null}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [pending, setPending] = useState(0);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  const closeMenuButton = useRef<HTMLButtonElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const previousFocus = menuTrigger.current ?? document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeMenuButton.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key !== "Tab") return;
      const items = navigation.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus();
    };
  }, [menuOpen]);

  useEffect(() => {
    let active = true;
    async function flush() {
      const items = readOutbox();
      if (active) setPending(items.length);
      for (const item of items) {
        try {
          await api(item.path, { method: "POST", body: item.body });
          removeOutbox(item.id);
        } catch (error) {
          if (error instanceof ApiError && (error.status === 0 || error.status === 401)) break;
          removeOutbox(item.id);
          if (active) setSyncNote(error instanceof Error ? error.message : "A saved submission was rejected.");
        }
      }
      if (active) setPending(readOutbox().length);
    }
    flush();
    window.addEventListener("online", flush);
    return () => {
      active = false;
      window.removeEventListener("online", flush);
    };
  }, []);

  const hasAccount = user?.role === "farmer" || user?.role === "field_officer";
  const roleName = t(user?.role === "farmer" ? "shell.role.farmer" : user?.role === "field_officer" ? "shell.role.officer" : user?.role === "admin" ? "shell.role.admin" : "shell.role.viewer");
  const links = [...linksForRole(user?.role, user?.carbon_monitoring), ...(user?.role === "admin" ? [["/messages", "nav.messages"], ["/audit", "nav.audit"]] : [])];
  const groups = [
    { title: "group.workspace" as MessageKey, paths: ["/dashboard", "/discover", "/monitoring", "/map"] },
    { title: "group.institutional" as MessageKey, paths: ["/fmes-preparation"] },
    { title: "group.planting" as MessageKey, paths: user?.role === "admin"
      ? ["/agents", "/sites", "/trees", "/batches", "/forests", "/harvest", "/species"]
      : ["/agents", "/sites", "/trees", "/batches", "/forests", "/farmers", "/species"] },
    { title: "group.care" as MessageKey, paths: user?.role === "admin"
      ? ["/nursery", "/field", "/carbon"]
      : ["/nursery", "/field", "/harvest", "/carbon"] },
    { title: "group.insights" as MessageKey, paths: ["/analytics", "/messages", "/audit"] },
  ];
  const currentKey = links.find(([href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1];
  const currentPage = currentKey ? t(currentKey as MessageKey) : "TreeLife";

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="app-shell shell-v2">
      <a className="skip" href="#main">{t("shell.skip")}</a>
      {menuOpen ? <button className="shell-backdrop" type="button" aria-label={t("shell.closeBackdrop")} tabIndex={-1} onClick={() => setMenuOpen(false)} /> : null}
      <aside
        className={`sidebar${menuOpen ? " shell-menu-open" : ""}`}
        id="navigation-panel"
        ref={navigation}
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen ? true : undefined}
        aria-label={menuOpen ? t("shell.navigation") : undefined}
      >
        <button className="shell-close ghost" type="button" ref={closeMenuButton} onClick={() => setMenuOpen(false)} aria-label={t("shell.closeNav")}>{t("shell.closeWord")} <span aria-hidden="true">×</span></button>
        <Link className="brand" href="/dashboard" onClick={() => setMenuOpen(false)}>
          <strong>TreeLife</strong>
          <span>{t("shell.growing")}</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {groups.map((group) => {
            const items = links.filter(([href]) => group.paths.includes(href));
            if (!items.length) return null;
            return <div className="shell-nav-group" key={group.title}>
              <span className="shell-nav-heading">{t(group.title)}</span>
              {items.map(([href, name]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}>
                <NavIcon path={href} />{t(name as MessageKey)}
              </Link>)}
            </div>;
          })}
        </nav>
        <div className="sidebar-foot">
          <p>{user?.full_name}</p>
          <small>{roleName}</small>
          <button className="ghost" type="button" onClick={signOut}>{t("shell.logout")}</button>
        </div>
      </aside>
      <div className="shell-workspace" inert={menuOpen}>
        <header className="shell-header">
          <button className="shell-menu-toggle secondary" type="button" ref={menuTrigger} aria-controls="navigation-panel" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span aria-hidden="true">☰</span> {t("shell.menu")}</button>
          <div className="shell-breadcrumb"><span>TreeLife Rwanda</span><strong>{currentPage}</strong></div>
          <div className="shell-header-actions"><LanguageSwitch align="end" /><NotificationBell /><div className="shell-identity"><span>{user?.full_name}<small>{roleName}</small></span>{hasAccount ? <FarmerAccount /> : <span className="shell-initial" aria-hidden="true">{user?.full_name.slice(0, 1).toUpperCase()}</span>}</div></div>
        </header>
        <main className="content" id="main" tabIndex={-1}>
        {pending > 0 ? (
          <Banner tone="warning">
            {t(pending === 1 ? "shell.pendingOne" : "shell.pendingMany", { count: pending })}
          </Banner>
        ) : null}
        {syncNote ? <Banner tone="error">{syncNote}</Banner> : null}
        {children}
        </main>
      </div>
      <AssistantWidget />
    </div>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "warning" | "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <div className={`banner ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Field({
  label,
  name,
  error,
  children,
  help,
}: {
  label: string;
  name: string;
  error?: string;
  help?: string;
  children: React.ReactNode;
}) {
  const helpId = help ? `${name}-help` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children}
      {help ? <p className="help" id={helpId}>{help}</p> : null}
      {error ? <p className="error-text" id={errorId}>{error}</p> : null}
    </div>
  );
}

export function describedBy(name: string, error?: string, help?: string): string | undefined {
  return [help ? `${name}-help` : null, error ? `${name}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <button className="secondary" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("pager.previous")}
      </button>
      <span>{t("pager.page", { page, pages })}</span>
      <button className="secondary" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t("pager.next")}
      </button>
    </div>
  );
}

export function OriginBadge({ origin }: { origin: string }) {
  if (origin === "synthetic_demo") return null;
  const text = origin === "field_entry" ? "Field record" : origin === "imported" ? "Imported" : origin.replaceAll("_", " ");
  return <span className="badge">{text}</span>;
}
