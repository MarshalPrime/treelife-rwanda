"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { AccountSourceChoice, AmisPreview, type AccountSource } from "@/components/account-source-choice";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [source, setSource] = useState<AccountSource>("treelife");
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
      const account = await login(email, password);
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign-in failed.");
      setSaving(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="card login-card auth-card" onSubmit={handleSubmit}>
        <div className="auth-head">
          <Link className="auth-mark" href="/" aria-label="TreeLife home">TL</Link>
          <div>
            <p className="lede">Ejo Labs</p>
            <h1>TreeLife Rwanda</h1>
          </div>
        </div>
        <div className="auth-choice-intro">
          <p className="lede">Secure access for forest teams and farmers</p>
          <h2>Choose how you sign in</h2>
          <p>Use your TreeLife account, or connect through an organisation that manages farmer records.</p>
        </div>

        <AccountSourceChoice source={source} onChange={setSource} />

        {source === "amis" ? (
          <AmisPreview returnLabel="Use a TreeLife account" onReturn={() => setSource("treelife")} />
        ) : (
          <>
            {error ? <Banner tone="error">{error}</Banner> : null}
            <label htmlFor="email">Email
              <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label htmlFor="password">Password
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button className="primary" type="submit" disabled={saving}>{saving ? "Signing in…" : "Sign in"}</button>
            <p className="help">New to TreeLife? <Link href="/register">Create an account</Link> · <Link href="/">About TreeLife</Link></p>
          </>
        )}
      </form>
    </main>
  );
}
