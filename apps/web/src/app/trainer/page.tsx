"use client";

import { PortalShell } from "../../components/PortalShell";
import { TrainerDashboard } from "../../components/dashboard/TrainerDashboard";

export default function TrainerPage() {
  return (
    <PortalShell role="trainer" title="Trainer Dashboard">
      <TrainerDashboard />
    </PortalShell>
  );
}
