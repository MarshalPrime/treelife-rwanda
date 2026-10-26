"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign-in failed.");
      setSaving(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="card login-card" onSubmit={handleSubmit}>
        <div>
          <p className="lede">Ejo Labs</p>
          <h1>TreeLife Rwanda</h1>
        </div>
        <p>Register planting sites, individual trees, and planting batches. This demonstration is not connected to FMES.</p>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <label htmlFor="email">Email
          <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label htmlFor="password">Password
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button className="primary" type="submit" disabled={saving}>{saving ? "Signing in…" : "Sign in"}</button>
        <p className="help">Development accounts use the .local suffix and are created by the synthetic seed. They are not real mailboxes.</p>
      </form>
    </main>
  );
}
