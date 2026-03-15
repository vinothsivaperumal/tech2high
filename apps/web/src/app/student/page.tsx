"use client";

import { PortalShell } from "../../components/PortalShell";
import { StudentDashboard } from "../../components/dashboard/StudentDashboard";

export default function StudentPage() {
  return (
    <PortalShell role="student" title="Student Dashboard">
      <StudentDashboard />
    </PortalShell>
  );
}
