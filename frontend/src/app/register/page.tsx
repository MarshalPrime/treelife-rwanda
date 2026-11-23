"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { AccountSourceChoice, AmisPreview, type AccountSource } from "@/components/account-source-choice";
import { LanguageSwitch } from "@/components/language-switch";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import type { Role } from "@/lib/types";

const roles: { value: Role; title: MessageKey; detail: MessageKey }[] = [
  { value: "field_officer", title: "auth.officer", detail: "auth.officerHelp" },
  { value: "farmer", title: "auth.farmer", detail: "auth.farmerHelp" },
  { value: "viewer", title: "auth.viewer", detail: "auth.viewerHelp" },
];

function passwordChecks(password: string, confirm: string) {
  return [
    { id: "length", ok: password.length >= 8, text: "auth.ruleLength" as MessageKey },
    { id: "letter", ok: /[A-Za-z]/.test(password), text: "auth.ruleLetter" as MessageKey },
    { id: "number", ok: /\d/.test(password), text: "auth.ruleNumber" as MessageKey },
    { id: "match", ok: password.length > 0 && password === confirm, text: "auth.ruleMatch" as MessageKey },
  ];
}

export default function RegisterPage() {
  const { user, loading, login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [source, setSource] = useState<AccountSource>("treelife");
  const [role, setRole] = useState<Role>("farmer");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const checks = passwordChecks(password, confirm);
  const passwordReady = checks.every((check) => check.ok);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!passwordReady) {
      setError(password !== confirm ? t("auth.mismatch") : t("auth.stronger"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          role,
          organization_name: organizationName.trim() || null,
        }),
      });
      const account = await login(email, password);
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Registration failed.");
      setSaving(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="card login-card register-card" onSubmit={handleSubmit}>
        <div className="auth-head">
          <Link className="auth-mark" href="/" aria-label="TreeLife home">TL</Link>
          <div>
            {/* <p className="lede">Ejo Labs</p> */}
            <h1>{t("auth.createTitle")}</h1>
          </div>
        </div>
        <div className="auth-choice-intro">
          <LanguageSwitch />
          <p className="lede">{t("auth.setup")}</p>
          <h2>{t("auth.createTitle")}</h2>
          <p>{t("auth.createHelp")}</p>
        </div>
        <AccountSourceChoice source={source} onChange={setSource} />
        {source === "amis" ? (
          <AmisPreview returnLabel={t("auth.createInstead")} onReturn={() => setSource("treelife")} />
        ) : (
          <>
            {error ? <Banner tone="error">{error}</Banner> : null}
            <fieldset className="role-choice">
              <legend>{t("auth.which")}</legend>
              {roles.map((choice) => (
                <label key={choice.value} className={role === choice.value ? "role-option selected" : "role-option"}>
                  <input
                    type="radio"
                    name="role"
                    value={choice.value}
                    checked={role === choice.value}
                    onChange={() => setRole(choice.value)}
                  />
                  <span className="role-copy">
                    <strong>{t(choice.title)}</strong>
                    <span className="help">{t(choice.detail)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="register-fields">
              <label htmlFor="full_name">{t("auth.fullName")}
                <input id="full_name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              </label>
              <label htmlFor="email">{t("auth.email")}
                <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label htmlFor="password">{t("auth.password")}
                <input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              <label htmlFor="confirm_password">{t("auth.confirm")}
                <input
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  aria-invalid={confirm.length > 0 && password !== confirm}
                  required
                />
              </label>
              {role === "farmer" ? null : (
                <label className="register-field-full" htmlFor="organization_name">{t("auth.organisation")}
                  <input id="organization_name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
                </label>
              )}
            </div>
            <ul className="password-rules" aria-live="polite">
              {checks.map((check) => (
                <li key={check.id} className={check.ok ? "met" : undefined}>{check.ok ? t("auth.met") : t("auth.needed")}: {t(check.text)}</li>
              ))}
            </ul>
            <button className="primary" type="submit" disabled={saving || !passwordReady}>{saving ? t("auth.creating") : t("auth.createButton")}</button>
            <p className="help">{t("auth.already")} <Link href="/login">{t("auth.signIn")}</Link></p>
          </>
        )}
      </form>
    </main>
  );
}
