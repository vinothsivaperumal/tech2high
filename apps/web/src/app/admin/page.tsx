"use client";

import { PortalShell } from "../../components/PortalShell";
import { AdminDashboard } from "../../components/dashboard/AdminDashboard";

export default function AdminPage() {
  return (
    <PortalShell role="admin" title="Admin Dashboard">
      <AdminDashboard />
    </PortalShell>
  );
}
