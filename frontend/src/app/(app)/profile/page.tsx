"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Banner, Field } from "@/components/AppShell";
import { TreePlace } from "@/components/forms";
import { ApiError, api, apiUpload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useProfilePhoto } from "@/lib/profile-photo";

type Profile = {
  display_name: string;
  phone: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  isibo: string | null;
  household: string | null;
  profile_photo_at: string | null;
};

export default function ProfilePage() {
  const { user, rename, setPhoto } = useAuth();
  const photoUrl = useProfilePhoto(user?.profile_photo_at);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [place, setPlace] = useState({ province: "", district: "", sector: "", cell: "", village: "", isibo: "", household: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  async function uploadPhoto(file: File | null) {
    if (!file) return;
    setError(null);
    setPhotoNote(null);
    const body = new FormData();
    body.set("file", file);
    try {
      const saved = await apiUpload<{ profile_photo_at: string }>("/profile/photo", body);
      setPhoto(saved.profile_photo_at);
      setPhotoNote("Your photo is saved.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The photo could not be saved.");
    }
  }

  async function removePhoto() {
    setError(null);
    setPhotoNote(null);
    try {
      await api("/profile/photo", { method: "DELETE" });
      setPhoto(null);
      setPhotoNote("Your photo is removed.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The photo could not be removed.");
    }
  }

  useEffect(() => {
    api<Profile>("/profile")
      .then((row) => {
        setProfile(row);
        setName(row.display_name);
        setPhone(row.phone ?? "");
        setPlace({
          province: row.province ?? "",
          district: row.district ?? "",
          sector: row.sector ?? "",
          cell: row.cell ?? "",
          village: row.village ?? "",
          isibo: row.isibo ?? "",
          household: row.household ?? "",
        });
      })
      .catch((caught: Error) => setError(caught.message));
  }, []);

  function setProfilePlace(field: keyof typeof place, value: string) {
    if (field === "isibo" || field === "household") {
      setPlace((current) => ({ ...current, [field]: value }));
      return;
    }
    const order = ["province", "district", "sector", "cell", "village"] as const;
    setPlace((current) => {
      const next = { ...current, [field]: value };
      let clear = false;
      for (const name of order) {
        if (clear) next[name] = "";
        if (name === field) clear = true;
      }
      return next;
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api<Profile>("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: name.trim(),
          phone: phone.trim() || null,
          province: place.province.trim() || null,
          district: place.district.trim() || null,
          sector: place.sector.trim() || null,
          cell: place.cell.trim() || null,
          village: place.village.trim() || null,
          isibo: place.isibo.trim() || null,
          household: place.household.trim() || null,
        }),
      });
      setProfile(saved);
      rename(saved.display_name);
      setNotice("Your details are saved.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Your details could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>Your details</h1>
      <p className="lede">
        {user?.role === "field_officer"
          ? "Add your name and where you live. Phone is optional and sensitive. Do not enter a national ID."
          : "Add where you live. Trees you record use this address. Phone is optional and sensitive. Do not enter a national ID."}
      </p>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {profile ? (
        <form className="card form" onSubmit={save}>
          <div className="profile-photo">
            {photoUrl ? (
              // The address is a local preview created in this browser.
              // eslint-disable-next-line @next/next/no-img-element
              <img className="profile-photo-preview" src={photoUrl} alt="" />
            ) : (
              <span className="profile-photo-preview letter">{(name || user?.full_name || "?").slice(0, 1).toUpperCase()}</span>
            )}
            <div>
              <Field label="Profile photo" name="photo" help="Optional. A photo of you is sensitive. You can skip it or remove it later. It appears in the circle on your account. Use a JPEG, PNG, or WebP file under 2 MB.">
                <input
                  id="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    void uploadPhoto(file);
                  }}
                />
              </Field>
              {user?.profile_photo_at ? (
                <button className="ghost" type="button" onClick={() => void removePhoto()}>Remove photo</button>
              ) : null}
              {photoNote ? <p className="help">{photoNote}</p> : null}
            </div>
          </div>
          <Field label="Name" name="display_name">
            <input id="display_name" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Phone" name="phone" help="Optional. Treat this as sensitive contact information.">
            <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <TreePlace
            legend="Where you live"
            help="Province through village follow the national village list. Isibo and household are typed. You can change this later."
            province={place.province}
            district={place.district}
            sector={place.sector}
            cell={place.cell}
            village={place.village}
            isibo={place.isibo}
            household={place.household}
            onChange={setProfilePlace}
          />
          <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save details"}</button>
        </form>
      ) : null}
    </div>
  );
}
