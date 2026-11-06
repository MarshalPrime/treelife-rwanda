"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FarmerAccount } from "@/components/farmer-account";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { readOutbox, removeOutbox } from "@/lib/outbox";
import "./app-shell.css";

const fieldLinks = [
  ["/dashboard", "Overview"],
  ["/sites", "Sites"],
  ["/trees", "Trees"],
  ["/batches", "Batches"],
  ["/farmers", "Farmers"],
  ["/nursery", "Nursery"],
  ["/field", "Field"],
  ["/harvest", "Harvest"],
  ["/advice", "Advice"],
  ["/analytics", "Analytics"],
  ["/map", "Map"],
  ["/species", "Species"],
  ["/about", "About"],
];

const adminLinks = [
  ["/dashboard", "Overview"],
  ["/analytics", "Reports"],
  ["/map", "Map"],
  ["/sites", "Sites"],
  ["/trees", "Trees"],
  ["/batches", "Batches"],
  ["/species", "Species"],
  ["/about", "About"],
];

const farmerLinks = fieldLinks.filter(([href]) => href !== "/farmers");

const viewerLinks = [
  ["/dashboard", "Overview"],
  ["/map", "Map"],
  ["/trees", "Trees"],
];

export function linksForRole(role: string | undefined) {
  if (role === "admin") return adminLinks;
  if (role === "viewer") return viewerLinks;
  if (role === "farmer") return farmerLinks;
  return fieldLinks;
}

export function pathAllowed(role: string, pathname: string) {
  if (role === "viewer") {
    if (pathname.endsWith("/new") || pathname.includes("/edit")) return false;
    return pathname === "/dashboard" || pathname === "/map" || pathname === "/trees" || /^\/trees\/[^/]+$/.test(pathname);
  }
  if (role === "farmer") {
    if (pathname === "/farmers" || pathname.startsWith("/farmers/")) return false;
    return true;
  }
  if (role === "admin") {
    if (pathname.includes("/edit") || pathname.endsWith("/new")) return false;
    const hidden = ["/farmers", "/nursery", "/field", "/harvest", "/advice"];
    return !hidden.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  }
  return true;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
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
  const roleName = user?.role === "farmer" ? "Smallholder farmer" : user?.role === "field_officer" ? "Field officer" : user?.role === "admin" ? "Administrator" : "Viewer";
  const links = [...linksForRole(user?.role), ...(user?.role === "admin" ? [["/audit", "Audit log"]] : [])];
  const groups = [
    { title: "Workspace", paths: ["/dashboard", "/map"] },
    { title: "Planting & people", paths: ["/sites", "/trees", "/batches", "/farmers", "/species"] },
    { title: "Care & production", paths: ["/nursery", "/field", "/harvest", "/advice"] },
    { title: "Insights", paths: ["/analytics", "/audit", "/about"] },
  ];
  const currentPage = links.find(([href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1] ?? "TreeLife";

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="app-shell shell-v2">
      <a className="skip" href="#main">Skip to content</a>
      {menuOpen ? <button className="shell-backdrop" type="button" aria-label="Close navigation backdrop" tabIndex={-1} onClick={() => setMenuOpen(false)} /> : null}
      <aside
        className={`sidebar${menuOpen ? " shell-menu-open" : ""}`}
        id="navigation-panel"
        ref={navigation}
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen ? true : undefined}
        aria-label={menuOpen ? "Navigation" : undefined}
      >
        <button className="shell-close ghost" type="button" ref={closeMenuButton} onClick={() => setMenuOpen(false)} aria-label="Close navigation">Close <span aria-hidden="true">×</span></button>
        <Link className="brand" href="/dashboard" onClick={() => setMenuOpen(false)}>
          <strong>TreeLife</strong>
          <span>Growing Rwanda, together</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {groups.map((group) => {
            const items = links.filter(([href]) => group.paths.includes(href));
            if (!items.length) return null;
            return <div className="shell-nav-group" key={group.title}>
              <span className="shell-nav-heading">{group.title}</span>
              {items.map(([href, name]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}>
                <span className="shell-nav-dot" aria-hidden="true" />{name}
              </Link>)}
            </div>;
          })}
        </nav>
        <div className="sidebar-foot">
          <p>{user?.full_name}</p>
          <small>{roleName}</small>
          <button className="ghost" type="button" onClick={signOut}>Log out</button>
        </div>
      </aside>
      <div className="shell-workspace" inert={menuOpen}>
        <header className="shell-header">
          <button className="shell-menu-toggle secondary" type="button" ref={menuTrigger} aria-controls="navigation-panel" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span aria-hidden="true">☰</span> Menu</button>
          <div className="shell-breadcrumb"><span>TreeLife Rwanda</span><strong>{currentPage}</strong></div>
          <div className="shell-identity"><span>{user?.full_name}<small>{roleName}</small></span>{hasAccount ? <FarmerAccount /> : <span className="shell-initial" aria-hidden="true">{user?.full_name.slice(0, 1).toUpperCase()}</span>}</div>
        </header>
        <main className="content" id="main" tabIndex={-1}>
        {pending > 0 ? (
          <Banner tone="warning">
            {pending} submission{pending === 1 ? "" : "s"} saved on this device. They send when the connection returns.
          </Banner>
        ) : null}
        {syncNote ? <Banner tone="error">{syncNote}</Banner> : null}
        {children}
        </main>
      </div>
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
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <button className="secondary" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>Page {page} of {pages}</span>
      <button className="secondary" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

export function OriginBadge({ origin }: { origin: string }) {
  if (origin === "synthetic_demo") return null;
  const text = origin === "field_entry" ? "Field record" : origin === "imported" ? "Imported" : origin.replaceAll("_", " ");
  return <span className="badge">{text}</span>;
}
