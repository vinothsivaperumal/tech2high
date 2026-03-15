"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";
import { CoursesSection } from "./CoursesSection";
import { DashboardMenu } from "../DashboardMenu";
import { ProfileManager } from "../ProfileManager";
import { StatusCard } from "../StatusCard";

type StudentSection = "overview" | "requests" | "courses" | "profile";

interface StudentVideo {
  id: string;
  title: string;
  description: string | null;
  batch_name: string;
  created_at: string;
}

interface StudentAssignment {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  batch_name: string;
  created_at: string;
}

interface IpRequest {
  id: string;
  requested_ip: string;
  protocol: string;
  port: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

interface IpRequestForm {
  requestedIp: string;
  protocol: string;
  port: string;
  reason: string;
}

export function StudentDashboard() {
  const [section, setSection] = useState<StudentSection>("overview");
  const [videos, setVideos] = useState<StudentVideo[]>([]);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [requests, setRequests] = useState<IpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);
  const [ipForm, setIpForm] = useState<IpRequestForm>({
    requestedIp: "",
    protocol: "tcp",
    port: "22",
    reason: ""
  });

  async function loadDashboardData() {
    setLoading(true);
    setError("");

    try {
      const [videoResponse, assignmentResponse, requestResponse] = await Promise.all([
        apiRequest<{ videos: StudentVideo[] }>("/student/videos"),
        apiRequest<{ assignments: StudentAssignment[] }>("/student/assignments"),
        apiRequest<{ requests: IpRequest[] }>("/student/ip-requests")
      ]);

      setVideos(videoResponse.videos);
      setAssignments(assignmentResponse.assignments);
      setRequests(requestResponse.requests);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load student dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  const pendingCount = useMemo(() => requests.filter((request) => request.status === "pending").length, [requests]);

  async function detectMyIp() {
    setDetectingIp(true);
    setError("");
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      if (!res.ok) throw new Error("Could not reach IP detection service");
      const data = (await res.json()) as { ip: string };
      setIpForm((current) => ({ ...current, requestedIp: data.ip }));
    } catch {
      setError("Failed to detect your public IP. Please enter it manually.");
    } finally {
      setDetectingIp(false);
    }
  }

  async function submitIpRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setRequestMessage("");
    setError("");

    const parsedPort = Number(ipForm.port);

    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      setSubmitting(false);
      setError("Port must be an integer between 1 and 65535.");
      return;
    }

    try {
      await apiRequest<{ request: IpRequest }>("/student/ip-requests", "POST", {
        requestedIp: ipForm.requestedIp,
        protocol: ipForm.protocol,
        port: parsedPort,
        reason: ipForm.reason
      });

      setRequestMessage("IP update request submitted.");
      setIpForm({ requestedIp: "", protocol: "tcp", port: "22", reason: "" });
      await loadDashboardData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to submit IP request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-layout">
      <DashboardMenu
        title="Student Dashboard"
        active={section}
        onChange={setSection}
        items={[
          { key: "overview", label: "Overview", hint: "Videos, assignments, and progress" },
          { key: "requests", label: "IP Requests", hint: "Request AWS access updates" },
          { key: "courses", label: "Courses", hint: "Browse topics and watch videos" },
          { key: "profile", label: "Registration Info", hint: "Get and update your details" }
        ]}
      />

      <div className="menu-content">
        {loading ? <p className="muted">Loading dashboard...</p> : null}
        {error ? <p className="message error">{error}</p> : null}

        {!loading && section === "overview" ? (
          <div className="grid">
            <StatusCard title="Learning Snapshot" subtitle="Your current portal activity">
              <ul className="list">
                <li className="list-item">
                  <strong>Videos Available</strong>
                  <p className="muted">{videos.length}</p>
                </li>
                <li className="list-item">
                  <strong>Assignments Available</strong>
                  <p className="muted">{assignments.length}</p>
                </li>
                <li className="list-item">
                  <strong>Pending IP Requests</strong>
                  <p className="muted">{pendingCount}</p>
                </li>
              </ul>
            </StatusCard>

            <section className="card span-6">
              <header className="card-header">
                <h3>Recent Videos</h3>
              </header>
              <ul className="list">
                {videos.slice(0, 5).map((video) => (
                  <li className="list-item" key={video.id}>
                    <strong>{video.title}</strong>
                    <p className="muted">{video.batch_name}</p>
                  </li>
                ))}
                {!videos.length ? <li className="list-item muted">No videos assigned yet.</li> : null}
              </ul>
            </section>

            <section className="card span-6">
              <header className="card-header">
                <h3>Recent Assignments</h3>
              </header>
              <ul className="list">
                {assignments.slice(0, 5).map((assignment) => (
                  <li className="list-item" key={assignment.id}>
                    <strong>{assignment.title}</strong>
                    <p className="muted">{assignment.batch_name}</p>
                    {assignment.due_at ? <p className="muted">Due: {new Date(assignment.due_at).toLocaleString()}</p> : null}
                  </li>
                ))}
                {!assignments.length ? <li className="list-item muted">No assignments assigned yet.</li> : null}
              </ul>
            </section>
          </div>
        ) : null}

        {!loading && section === "requests" ? (
          <div className="stack">
            <section className="card">
              <header className="card-header">
                <h3>Submit IP Update Request</h3>
                <p className="muted">Ask admin to whitelist your current IP for secure access.</p>
              </header>

              <form className="form" onSubmit={submitIpRequest}>
                <label>
                  Requested IP
                  <div className="row-inline" style={{ alignItems: "center", gap: "0.5rem" }}>
                    <input
                      style={{ flex: 1 }}
                      value={ipForm.requestedIp}
                      onChange={(event) => setIpForm((current) => ({ ...current, requestedIp: event.target.value }))}
                      placeholder="203.0.113.10"
                      required
                    />
                    <button
                      type="button"
                      className="button"
                      style={{ whiteSpace: "nowrap" }}
                      disabled={detectingIp}
                      onClick={() => void detectMyIp()}
                    >
                      {detectingIp ? "Detecting..." : "Detect My IP"}
                    </button>
                  </div>
                </label>

                <label>
                  Protocol
                  <select
                    value={ipForm.protocol}
                    onChange={(event) => setIpForm((current) => ({ ...current, protocol: event.target.value }))}
                  >
                    <option value="tcp">tcp</option>
                    <option value="udp">udp</option>
                  </select>
                </label>

                <label>
                  Port
                  <div className="row-inline" style={{ alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <input
                      style={{ flex: 1, minWidth: 100 }}
                      value={ipForm.port}
                      onChange={(event) => setIpForm((current) => ({ ...current, port: event.target.value }))}
                      placeholder="e.g. 1433"
                      required
                    />
                    <button type="button" className="button" style={{ whiteSpace: "nowrap" }}
                      onClick={() => setIpForm((c) => ({ ...c, port: "1433" }))}>
                      1433 (MSSQL)
                    </button>
                    <button type="button" className="button" style={{ whiteSpace: "nowrap" }}
                      onClick={() => setIpForm((c) => ({ ...c, port: "5432" }))}>
                      5432 (PostgreSQL)
                    </button>
                  </div>
                </label>

                <label>
                  Reason
                  <textarea
                    value={ipForm.reason}
                    onChange={(event) => setIpForm((current) => ({ ...current, reason: event.target.value }))}
                    placeholder="Why this IP needs access"
                  />
                </label>

                {requestMessage ? <p className="message success">{requestMessage}</p> : null}

                <button type="submit" className="button" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
              </form>
            </section>

            <section className="card">
              <header className="card-header">
                <h3>Request History</h3>
              </header>

              <ul className="list">
                {requests.map((request) => (
                  <li className="list-item" key={request.id}>
                    <div className="row-inline">
                      <strong>
                        {request.requested_ip}:{request.port}
                      </strong>
                      <span className={`badge badge-${request.status}`}>{request.status}</span>
                    </div>
                    <p className="muted">Protocol: {request.protocol}</p>
                    {request.reason ? <p className="muted">Reason: {request.reason}</p> : null}
                    {request.review_note ? <p className="muted">Review: {request.review_note}</p> : null}
                  </li>
                ))}
                {!requests.length ? <li className="list-item muted">No IP requests yet.</li> : null}
              </ul>
            </section>
          </div>
        ) : null}

        {section === "profile" ? <ProfileManager /> : null}

        {section === "courses" ? <CoursesSection /> : null}
      </div>
    </div>
  );
}
