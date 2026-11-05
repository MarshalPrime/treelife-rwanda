"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

const roles: { value: Role; title: string; detail: string }[] = [
  {
    value: "field_officer",
    title: "Field officer",
    detail: "Register a tree or batch, and name the smallholder you are helping.",
  },
  {
    value: "farmer",
    title: "Farmer",
    detail: "Register a tree or batch for your household. Your own name is used.",
  },
  {
    value: "viewer",
    title: "Viewer",
    detail: "See the map and the trees across the country. Records cannot be changed.",
  },
];

function passwordChecks(password: string, confirm: string) {
  return [
    { ok: password.length >= 8, text: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(password), text: "At least one letter" },
    { ok: /\d/.test(password), text: "At least one number" },
    { ok: password.length > 0 && password === confirm, text: "Both passwords match" },
  ];
}

export default function RegisterPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role>("farmer");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [district, setDistrict] = useState("");
  const [phone, setPhone] = useState("");
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
      setError(password !== confirm ? "The two passwords do not match." : "Choose a stronger password.");
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
          district: role === "farmer" ? district.trim() || null : null,
          phone: role === "farmer" ? phone.trim() || null : null,
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
      <form className="card login-card wide" onSubmit={handleSubmit}>
        <div className="auth-head">
          <Link className="auth-mark" href="/" aria-label="TreeLife home">TL</Link>
          <div>
            <p className="lede">Ejo Labs</p>
            <h1>Create an account</h1>
          </div>
        </div>
        <p>Choose the account that matches your responsibility. TreeLife follows a tree from the nursery through planting, care, harvest, and sale.</p>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <fieldset className="role-choice">
          <legend>Which account are you?</legend>
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
                <strong>{choice.title}</strong>
                <span className="help">{choice.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label htmlFor="full_name">Full name
          <input id="full_name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </label>
        <label htmlFor="email">Email
          <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <div className="row">
          <label htmlFor="password">Password
            <input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <label htmlFor="confirm_password">Confirm password
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
        </div>
        <ul className="password-rules" aria-live="polite">
          {checks.map((check) => (
            <li key={check.text} className={check.ok ? "met" : undefined}>{check.ok ? "Met" : "Needed"}: {check.text}</li>
          ))}
        </ul>
        {role === "farmer" ? (
          <>
            <div className="row">
              <label htmlFor="district">District
                <input id="district" value={district} onChange={(event) => setDistrict(event.target.value)} />
              </label>
              <label htmlFor="phone">Phone
                <input id="phone" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
            </div>
            <p className="help">District and phone are optional. A phone number is sensitive. Do not enter a national ID.</p>
          </>
        ) : (
          <label htmlFor="organization_name">Organisation
            <input id="organization_name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
          </label>
        )}
        <button className="primary" type="submit" disabled={saving || !passwordReady}>{saving ? "Creating account…" : "Create account"}</button>
        <p className="help">Already have an account? <Link href="/login">Sign in</Link></p>
      </form>
    </main>
  );
}
