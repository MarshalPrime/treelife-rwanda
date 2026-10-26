"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { readOutbox, removeOutbox } from "@/lib/outbox";

const links = [
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(0);
  const [syncNote, setSyncNote] = useState<string | null>(null);

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

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="app-shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="mobile-bar">
        <strong>TreeLife</strong>
        <span>{user?.full_name}</span>
        <button className="ghost" type="button" onClick={signOut}>Log out</button>
      </header>
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <strong>TreeLife</strong>
          <span>Rwanda registration</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {links.map(([href, name]) => (
            <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>
              {name}
            </Link>
          ))}
          {user?.role === "admin" ? (
            <Link href="/audit" aria-current={pathname.startsWith("/audit") ? "page" : undefined}>
              Audit
            </Link>
          ) : null}
        </nav>
        <div className="sidebar-foot">
          <p>{user?.full_name}</p>
          <small>{user?.role.replace("_", " ")}</small>
          <button className="ghost" type="button" onClick={signOut}>Log out</button>
        </div>
      </aside>
      <div className="content" id="main">
        {pending > 0 ? (
          <Banner tone="warning">
            {pending} submission{pending === 1 ? "" : "s"} saved on this device. They send when the connection returns.
          </Banner>
        ) : null}
        {syncNote ? <Banner tone="error">{syncNote}</Banner> : null}
        {children}
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
  if (origin === "synthetic_demo") return <span className="badge warn">Synthetic demo</span>;
  return <span className="badge">{origin.replaceAll("_", " ")}</span>;
}
