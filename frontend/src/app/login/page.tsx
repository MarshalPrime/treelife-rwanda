"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { AccountSourceChoice, AmisPreview, type AccountSource } from "@/components/account-source-choice";
import { LanguageSwitch } from "@/components/language-switch";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const { t } = useI18n();
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
      setError(caught instanceof ApiError ? caught.message : t("auth.failed"));
      setSaving(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="card login-card auth-card" onSubmit={handleSubmit}>
        <div className="auth-head">
          <Link className="auth-mark" href="/" aria-label={t("auth.home")}>TL</Link>
          <div>
            {/* <p className="lede">Ejo Labs</p> */}
            <h1>TreeLife Rwanda</h1>
          </div>
        </div>
        <div className="auth-choice-intro">
          <LanguageSwitch />
          <p className="lede">{t("auth.secure")}</p>
          <h2>{t("auth.choose")}</h2>
          <p>{t("auth.chooseHelp")}</p>
        </div>

        <AccountSourceChoice source={source} onChange={setSource} />

        {source === "amis" ? (
          <AmisPreview returnLabel={t("auth.useTreelife")} onReturn={() => setSource("treelife")} />
        ) : (
          <>
            {error ? <Banner tone="error">{error}</Banner> : null}
            <label htmlFor="email">{t("auth.email")}
              <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label htmlFor="password">{t("auth.password")}
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button className="primary" type="submit" disabled={saving}>{saving ? t("auth.signingIn") : t("auth.signIn")}</button>
            <p className="help">{t("auth.new")} <Link href="/register">{t("home.create")}</Link> · <Link href="/">{t("auth.about")}</Link></p>
          </>
        )}
      </form>
    </main>
  );
}
