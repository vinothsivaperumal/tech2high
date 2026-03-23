"use client";

import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";
import { DashboardMenu } from "../DashboardMenu";
import { ProfileManager } from "../ProfileManager";
import { AdminStudentsSection } from "./AdminStudentsSection";
import { AdminTrainersSection } from "./AdminTrainersSection";
import { CoursesSection } from "./CoursesSection";
import { BatchManager } from "./BatchManager";
import { ProgramManager } from "./ProgramManager";
import { NotificationCenter } from "./NotificationCenter";
import { DashboardOverview } from "./DashboardOverview";
import { PaymentManager } from "./PaymentManager";
import { AgreementManager } from "./AgreementManager";
import { CertificationManager } from "./CertificationManager";
import { ResumeManager } from "./ResumeManager";
import { SettingsPanel } from "./SettingsPanel";
import { AuditLogsSection } from "./AuditLogsSection";
import { VideoManagement } from "./VideoManagement";
import { TrainerAssignment } from "./TrainerAssignment";
import { CredentialManager } from "./CredentialManager";
import { MaterialManager } from "./MaterialManager";
import { AccessLogsViewer } from "./AccessLogsViewer";
import { BusinessContextManager } from "./BusinessContextManager";
import { CompanySettingsPanel } from "./CompanySettingsPanel";

type AdminSection = "dashboard" | "calendar" | "requests" | "audit" | "students" | "trainers" | "batches" | "videos" | "programs" | "courses" | "notifications" | "profile" | "payments" | "agreements" | "certifications" | "resumes" | "settings" | "trainer-assignment" | "credentials" | "materials" | "access-logs" | "business-context" | "company-settings";

interface AdminIpRequest {
  id: string;
  student_id: string;
  student_email: string;
  requested_ip: string;
  protocol: string;
  port: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

export function AdminDashboard() {
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [requests, setRequests] = useState<AdminIpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadIpRequests() {
    const path = statusFilter === "all" ? "/admin/ip-requests" : `/admin/ip-requests?status=${statusFilter}`;
    const response = await apiRequest<{ requests: AdminIpRequest[] }>(path);
    setRequests(response.requests);
  }

  async function loadSectionData() {
    setLoading(true);
    setError("");

    try {
      if (section === "requests") {
        await loadIpRequests();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load admin dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSectionData();
  }, [section, statusFilter]);

  const pendingCount = useMemo(() => requests.filter((request) => request.status === "pending").length, [requests]);

  async function reviewRequest(request: AdminIpRequest, action: "approve" | "reject") {
    setActionLoadingId(request.id);
    setError("");
    setMessage("");

    const note = window.prompt(`Add review note (${action})`, request.review_note ?? "") ?? "";

    try {
      await apiRequest(`/admin/ip-requests/${request.id}/${action}`, "POST", {
        reviewNote: note
      });

      setMessage(`Request ${action}d successfully.`);
      await loadIpRequests();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Failed to ${action} request`);
    } finally {
      setActionLoadingId(null);
    }
  }

  function renderContent() {
    return (
      <div>
        {loading ? <p className="muted">Loading dashboard...</p> : null}
        {error ? <p className="message error">{error}</p> : null}
        {message ? <p className="message success">{message}</p> : null}

        {!loading && section === "requests" ? (
          <div className="stack">
            <section className="card">
              <header className="card-header">
                <h3>Queue Controls</h3>
                <p className="muted">Pending requests: {pendingCount}</p>
              </header>

              <div className="row-inline">
                <label style={{ minWidth: 220 }}>
                  Filter Status
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  >
                    <option value="all">all</option>
                    <option value="pending">pending</option>
                    <option value="approved">approved</option>
                    <option value="rejected">rejected</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="card">
              <header className="card-header">
                <h3>IP Requests</h3>
              </header>

              <ul className="list">
                {requests.map((request) => (
                  <li className="list-item" key={request.id}>
                    <div className="row-inline">
                      <strong>{request.student_email}</strong>
                      <span className={`badge badge-${request.status}`}>{request.status}</span>
                    </div>
                    <p className="muted">
                      {request.requested_ip}:{request.port} ({request.protocol})
                    </p>
                    {request.reason ? <p className="muted">Reason: {request.reason}</p> : null}
                    {request.review_note ? <p className="muted">Review: {request.review_note}</p> : null}

                    {request.status === "pending" ? (
                      <div className="row-inline" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="button"
                          onClick={() => void reviewRequest(request, "approve")}
                          disabled={actionLoadingId === request.id}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="button danger"
                          onClick={() => void reviewRequest(request, "reject")}
                          disabled={actionLoadingId === request.id}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
                {!requests.length ? <li className="list-item muted">No requests found for current filter.</li> : null}
              </ul>
            </section>
          </div>
        ) : null}

        {section === "calendar" ? (() => { const AdminCalendarPage = require("../../app/admin/calendar/page").default; return <AdminCalendarPage />; })() : null}
        {section === "audit" ? <AuditLogsSection /> : null}

        {section === "profile" ? <ProfileManager /> : null}

        {!loading && section === "students" ? <AdminStudentsSection /> : null}

        {!loading && section === "trainers" ? <AdminTrainersSection /> : null}

        {section === "courses" ? <CoursesSection manage /> : null}

        {!loading && section === "programs" ? <ProgramManager /> : null}

        {!loading && section === "batches" ? <BatchManager /> : null}

        {!loading && section === "videos" ? <VideoManagement /> : null}

        {!loading && section === "notifications" ? <NotificationCenter role="admin" apiBase="/admin" /> : null}

        {section === "dashboard" ? <DashboardOverview /> : null}

        {!loading && section === "payments" ? <PaymentManager /> : null}

        {!loading && section === "agreements" ? <AgreementManager /> : null}

        {!loading && section === "certifications" ? <CertificationManager /> : null}

        {!loading && section === "resumes" ? <ResumeManager /> : null}
        {!loading && section === "trainer-assignment" ? <TrainerAssignment /> : null}
        {!loading && section === "credentials" ? <CredentialManager /> : null}
        {!loading && section === "materials" ? <MaterialManager /> : null}
        {!loading && section === "access-logs" ? <AccessLogsViewer /> : null}
        {!loading && section === "business-context" ? <BusinessContextManager /> : null}
        {!loading && section === "company-settings" ? <CompanySettingsPanel /> : null}
        {section === "settings" ? <SettingsPanel /> : null}
      </div>
    );
  }

  return (
    <DashboardMenu
      sections={[
        {
          title: "OVERVIEW",
          items: [
            { key: "dashboard" as AdminSection, label: "Dashboard", icon: "📊" },
          ],
        },
        {
          title: "MANAGEMENT",
          items: [
            { key: "calendar" as AdminSection, label: "Calendar & Events", icon: "📅" },
            { key: "programs" as AdminSection, label: "Programs", icon: "📋" },
            { key: "batches" as AdminSection, label: "Batches", icon: "📦" },
            { key: "courses" as AdminSection, label: "Courses", icon: "📚" },
            { key: "videos" as AdminSection, label: "Videos", icon: "🎬" },
            { key: "students" as AdminSection, label: "Students", icon: "🎓" },
            { key: "trainers" as AdminSection, label: "Trainers", icon: "👨‍🏫" },
            { key: "trainer-assignment" as AdminSection, label: "Trainer Assignment", icon: "🔗" },
            { key: "credentials" as AdminSection, label: "Credentials", icon: "🔑" },
            { key: "materials" as AdminSection, label: "Course Materials", icon: "📄" },
            { key: "business-context" as AdminSection, label: "Business Context", icon: "🏢" },
          ],
        },
        {
          title: "OPERATIONS",
          items: [
            { key: "payments" as AdminSection, label: "Payments", icon: "💳" },
            { key: "agreements" as AdminSection, label: "Agreements", icon: "📄" },
            { key: "certifications" as AdminSection, label: "Certifications", icon: "🏆" },
            { key: "resumes" as AdminSection, label: "Resume Collection", icon: "📝" },
            { key: "requests" as AdminSection, label: "IP Approval Queue", icon: "🛡" },
            { key: "notifications" as AdminSection, label: "Notifications", icon: "🔔" },
            { key: "audit" as AdminSection, label: "Audit Logs", icon: "📋" },
            { key: "access-logs" as AdminSection, label: "Access Logs", icon: "🔍" },
          ],
        },
        {
          title: "ACCOUNT",
          items: [
            { key: "company-settings" as AdminSection, label: "Company Config", icon: "🏢" },
            { key: "profile" as AdminSection, label: "Registration Info", icon: "👤" },
            { key: "settings" as AdminSection, label: "Settings", icon: "⚙️" },
          ],
        },
      ]}
      active={section}
      onChange={setSection}
      mainContent={renderContent()}
    />
  );
}
