"use client";

import { useEffect, useState } from "react";
import { NewPlanting } from "@/components/planting";
import { RegistrationProgress } from "@/components/registration-progress";
import { TreeFarmerStep } from "@/components/tree-farmer-step";
import { TreeInfoStep } from "@/components/tree-info-step";
import { TreeLocationStep } from "@/components/tree-location-step";
import { TreePlantingStep } from "@/components/tree-planting-step";
import { TreeReviewStep } from "@/components/tree-review-step";
import { useAuth } from "@/lib/auth";
import { readDraft, writeDraft } from "@/lib/tree-draft";

export default function NewTreePage() {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const saved = readDraft().step;
    if (user?.role === "farmer") {
      writeDraft({ farmer_id: user.farmer_id, step: saved > 1 ? saved : 2 });
      setStep(saved > 1 ? saved : 2);
      return;
    }
    if (saved === 2 || saved === 3 || saved === 4 || saved === 5) setStep(saved);
  }, [user]);

  function choosePhoto(file: File | null) {
    setPhotoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  const farmerAccount = user?.role === "farmer";
  if (user?.role !== "field_officer" && !farmerAccount) return <NewPlanting mode="tree" />;

  return (
    <div className="page">
      <RegistrationProgress step={farmerAccount && step === 1 ? 2 : step} forFarmer={farmerAccount} />
      {step === 1 && !farmerAccount ? <TreeFarmerStep onContinue={() => setStep(2)} /> : null}
      {step === 2 ? (
        <TreeInfoStep
          onBack={farmerAccount ? undefined : () => { writeDraft({ step: 1 }); setStep(1); }}
          onContinue={() => setStep(3)}
        />
      ) : null}
      {step === 3 ? (
        <TreeLocationStep
          onBack={() => { writeDraft({ step: 2 }); setStep(2); }}
          onContinue={() => setStep(4)}
        />
      ) : null}
      {step === 4 ? (
        <TreePlantingStep
          onBack={() => { writeDraft({ step: 3 }); setStep(3); }}
          onContinue={() => setStep(5)}
          onPhoto={choosePhoto}
        />
      ) : null}
      {step === 5 ? (
        <TreeReviewStep
          onBack={() => { writeDraft({ step: 4 }); setStep(4); }}
          photoUrl={photoUrl}
        />
      ) : null}
    </div>
  );
}
