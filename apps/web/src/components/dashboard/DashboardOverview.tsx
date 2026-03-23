"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

interface DashboardStats {
  totalPrograms: number;
  totalBatches: number;
  totalCourses: number;
  totalStudents: number;
  totalTrainers: number;
  activeStudents: number;
  inactiveStudents: number;
  pendingIpApprovals: number;
  totalVideos: number;
  pendingAgreements: number;
  issuedCertifications: number;
  pendingPayments: number;
}

const STAT_CARDS = [
  { key: "totalPrograms", label: "Programs", icon: "📋", color: "#e94560" },
  { key: "totalBatches", label: "Batches", icon: "📦", color: "#0ea5e9" },
  { key: "totalCourses", label: "Courses", icon: "📚", color: "#22c55e" },
  { key: "totalStudents", label: "Students", icon: "🎓", color: "#f59e0b" },
  { key: "activeStudents", label: "Active Students", icon: "✅", color: "#10b981" },
  { key: "inactiveStudents", label: "Inactive Students", icon: "⏸", color: "#6b7280" },
  { key: "totalTrainers", label: "Trainers", icon: "👨‍🏫", color: "#8b5cf6" },
  { key: "totalVideos", label: "Videos", icon: "🎬", color: "#ec4899" },
  { key: "pendingIpApprovals", label: "Pending IP Approvals", icon: "🛡", color: "#f97316" },
  { key: "pendingPayments", label: "Pending Payments", icon: "💳", color: "#ef4444" },
  { key: "pendingAgreements", label: "Pending Agreements", icon: "📄", color: "#6366f1" },
  { key: "issuedCertifications", label: "Issued Certifications", icon: "🏆", color: "#14b8a6" },
] as const;

export function DashboardOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<DashboardStats>("/admin/dashboard-stats")
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading dashboard...</p>;
  if (!stats) return <p className="message error">Failed to load dashboard stats</p>;

  return (
    <div className="stack">
      <div className="dt-header">
        <h3>Dashboard Overview</h3>
      </div>
      <div className="stats-grid">
        {STAT_CARDS.map(({ key, label, icon, color }) => (
          <div key={key} className="stat-card" style={{ borderLeftColor: color }}>
            <div className="stat-card-icon">{icon}</div>
            <div className="stat-card-body">
              <span className="stat-card-value">{stats[key]}</span>
              <span className="stat-card-label">{label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
