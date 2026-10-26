"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { SiteForm } from "@/components/forms";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Organization, Site } from "@/lib/types";

export default function EditSitePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { canWrite } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Site>(`/sites/${params.id}`), api<Organization[]>("/organizations")])
      .then(([nextSite, nextOrganizations]) => {
        setSite(nextSite);
        setOrganizations(nextOrganizations);
      })
      .catch((caught: Error) => setError(caught.message));
  }, [params.id]);

  if (!canWrite) return <Banner tone="error">You do not have permission to edit this site.</Banner>;
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!site) return <p className="loading">Loading site…</p>;
  return (
    <div className="page">
      <h1>Edit {site.public_code}</h1>
      <div className="card">
        <SiteForm
          editing
          initial={site}
          organizations={organizations}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            await api(`/sites/${site.id}`, { method: "PATCH", body: JSON.stringify(payload) });
            router.push(`/sites/${site.id}?updated=1`);
          }}
        />
      </div>
    </div>
  );
}
