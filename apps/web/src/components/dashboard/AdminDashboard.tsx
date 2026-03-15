"use client";

import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";
import { DashboardMenu } from "../DashboardMenu";
import { ProfileManager } from "../ProfileManager";
import { AdminStudentsSection } from "./AdminStudentsSection";
import { CoursesSection } from "./CoursesSection";

type AdminSection = "requests" | "audit" | "students" | "courses" | "profile";

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

interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function AdminDashboard() {
  const [section, setSection] = useState<AdminSection>("requests");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [requests, setRequests] = useState<AdminIpRequest[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadIpRequests() {
    const path = statusFilter === "all" ? "/admin/ip-requests" : `/admin/ip-requests?status=${statusFilter}`;
    const response = await apiRequest<{ requests: AdminIpRequest[] }>(path);
    setRequests(response.requests);
  }

  async function loadAuditLogs() {
    const response = await apiRequest<{ logs: AuditLog[] }>("/admin/audit-logs");
    setLogs(response.logs);
  }

  async function loadSectionData() {
    setLoading(true);
    setError("");

    try {
      if (section === "requests") {
        await loadIpRequests();
      }

      if (section === "audit") {
        await loadAuditLogs();
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

  return (
    <div className="dashboard-layout">
      <DashboardMenu
        title="Admin Dashboard"
        active={section}
        onChange={setSection}
        items={[
          { key: "requests", label: "IP Approval Queue", hint: "Approve or reject student requests" },
          { key: "students", label: "Students", hint: "View and manage student profiles" },
          { key: "courses", label: "Courses", hint: "Manage courses, topics and videos" },
          { key: "audit", label: "Audit Logs", hint: "Security and activity history" },
          { key: "profile", label: "Registration Info", hint: "Get and update your details" }
        ]}
      />

      <div className="menu-content">
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

        {!loading && section === "audit" ? (
          <section className="card">
            <header className="card-header">
              <h3>Audit Logs</h3>
            </header>

            <ul className="list">
              {logs.map((log) => (
                <li className="list-item" key={log.id}>
                  <strong>{log.action}</strong>
                  <p className="muted">Entity: {log.entity_type}</p>
                  <p className="muted">Time: {new Date(log.created_at).toLocaleString()}</p>
                </li>
              ))}
              {!logs.length ? <li className="list-item muted">No audit logs available.</li> : null}
            </ul>
          </section>
        ) : null}

        {section === "profile" ? <ProfileManager /> : null}

        {!loading && section === "students" ? <AdminStudentsSection /> : null}

        {section === "courses" ? <CoursesSection manage /> : null}
      </div>
    </div>
  );
}
