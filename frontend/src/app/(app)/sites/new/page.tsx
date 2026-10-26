"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { SiteForm } from "@/components/forms";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Farmer, Organization, Site } from "@/lib/types";

export default function NewSitePage() {
  const router = useRouter();
  const { canWrite, user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);

  useEffect(() => {
    api<Organization[]>("/organizations").then(setOrganizations).catch(() => setOrganizations([]));
    api<Farmer[]>("/farmers").then(setFarmers).catch(() => setFarmers([]));
  }, []);

  if (!canWrite) return <Banner tone="error">You do not have permission to register a site.</Banner>;
  return (
    <div className="page">
      <div>
        <h1>Register a planting site</h1>
        <p className="lede">Save the place once. Trees and batches will refer to it.</p>
      </div>
      <div className="card">
        <SiteForm
          organizations={organizations}
          farmers={farmers}
          initial={user?.farmer_id ? { farmer_id: user.farmer_id } : undefined}
          submitLabel="Save site"
          onCreateOrganization={async (input) => {
            const created = await api<Organization>("/organizations", { method: "POST", body: JSON.stringify(input) });
            setOrganizations((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
            return created;
          }}
          onSubmit={async (payload) => {
            const site = await api<Site>("/sites", { method: "POST", body: JSON.stringify(payload) });
            router.push(`/sites/${site.id}?created=1`);
          }}
        />
      </div>
    </div>
  );
}
