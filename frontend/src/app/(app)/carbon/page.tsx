"use client";

import { CarbonAuthorizationPanel } from "@/components/carbon-authorization";
import { CarbonOverview } from "@/components/carbon-dashboard";
import { CarbonMeasurements } from "@/components/carbon-measurements";
import { useAuth } from "@/lib/auth";

export default function CarbonPage() {
  const { user } = useAuth();
  if (user?.role === "admin") return <div className="page dashboard-view"><CarbonOverview detail /></div>;
  if (user?.carbon_monitoring === "approved") return <CarbonMeasurements />;
  return (
    <div className="page">
      <div>
        <h1>Carbon monitoring</h1>
        <p className="lede">
          Carbon measurement is available upon request. A field officer asks here, and an administrator approves that same account. Approval does not create another role. Until then, specialist measurements stay closed.
        </p>
      </div>
      <CarbonAuthorizationPanel />
    </div>
  );
}
