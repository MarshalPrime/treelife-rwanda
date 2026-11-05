"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Account = {
  name: string;
  recorded_trees: number;
  facts: string[];
  metal: "bronze" | "silver" | "gold" | null;
};

const metalLabel: Record<NonNullable<Account["metal"]>, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export function FarmerAccount() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const slot = useRef<HTMLDivElement>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const officer = user?.role === "field_officer";

  useEffect(() => {
    if (!user || (user.role !== "farmer" && user.role !== "field_officer")) return;
    const path = user.role === "field_officer" ? "/overview/officer" : "/overview/mine";
    api<Record<string, unknown>>(path)
      .then((body) => {
        const facts = officer
          ? []
          : [body.district, body.organization_name, body.phone].filter(
              (item): item is string => typeof item === "string" && item.length > 0,
            );
        setAccount({
          name: String(officer ? body.officer_name : body.farmer_name),
          recorded_trees: Number(body.recorded_trees),
          facts,
          metal: (body.metal as Account["metal"]) ?? null,
        });
      })
      .catch(() => setAccount(null));
  }, [user, officer]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!slot.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = account?.name || user?.full_name || (officer ? "Officer" : "Farmer");
  const facts = account?.facts ?? [];
  const metal = account?.metal ?? null;

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="account-slot" ref={slot}>
      <button
        className={`account-orb${metal ? ` metal-${metal}` : ""}`}
        type="button"
        aria-label="Open your account"
        aria-expanded={open}
        aria-controls="farmer-account"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{name.slice(0, 1).toUpperCase()}</span>
      </button>
      {open ? (
        <div className="account-panel" id="farmer-account" role="dialog" aria-label="Your account">
          <div className="account-identity">
            <strong>{name}</strong>
            {facts.length > 0 ? <p>{facts.join(" · ")}</p> : null}
          </div>
          <p className="account-line">
            Badge: {metal ? metalLabel[metal] : "—"}
            {metal ? (
              <Image src={`/badges/${metal}.jpg`} alt="" width={22} height={22} className="account-medal" />
            ) : null}
          </p>
          <p className="account-line">Trees: {account ? account.recorded_trees.toLocaleString("en-GB") : "—"}</p>
          <button className="ghost" type="button" onClick={signOut}>Log out</button>
        </div>
      ) : null}
    </div>
  );
}
