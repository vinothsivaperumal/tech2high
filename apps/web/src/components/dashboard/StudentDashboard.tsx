"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";
import { CoursesSection } from "./CoursesSection";
import { DashboardMenu } from "../DashboardMenu";
import { ProfileManager } from "../ProfileManager";
import { NotificationCenter } from "./NotificationCenter";

type StudentSection =
  | "overview"
  | "courses"
  | "batch-videos"
  | "notifications"
  | "requests"
  | "invoices"
  | "ip-whitelist"
  | "profile";

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

interface StudentProgram {
  id: string;
  title: string;
  description: string | null;
}

interface StudentCourse {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

/* ── Course tag colors ─────────────────────────────── */
const TAG_COLORS = ["#4be2c2", "#6dacff", "#ffb347", "#ff6f7d", "#b694ff", "#ffd166"];

/* ── Demo activity items ───────────────────────────── */
const DEMO_ACTIVITY = [
  {
    id: "a1",
    icon: "🖥",
    iconBg: "rgba(75,226,194,0.18)",
    title: "Completed: useEffect Deep Dive",
    subtitle: "Advanced React & Hooks · Lesson 14",
    time: "2h ago",
  },
  {
    id: "a2",
    icon: "✅",
    iconBg: "rgba(109,255,166,0.18)",
    title: "Assignment submitted: Pandas Basics",
    subtitle: "Python for Data Science · Week 3",
    time: "Yesterday",
  },
  {
    id: "a3",
    icon: "🏆",
    iconBg: "rgba(255,179,71,0.18)",
    title: "Badge earned: React Fundamentals",
    subtitle: "Milestone achievement",
    time: "2 days ago",
  },
  {
    id: "a4",
    icon: "💳",
    iconBg: "rgba(255,111,125,0.18)",
    title: "Payment due: Installment 2 of 3",
    subtitle: "$499 due Apr 1, 2026",
    time: "Apr 1",
  },
];

/* ── Batch YouTube Videos sub-component ────────────── */
interface BatchYouTubeVideo {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  batch_name: string;
  batch_id: string;
  created_at: string;
}

function youtubeEmbedUrl(url: string): string | null {
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return `https://www.youtube.com/embed/${embedMatch[1]}`;
  return null;
}

function StudentBatchVideos() {
  const [batchVideos, setBatchVideos] = useState<BatchYouTubeVideo[]>([]);
  const [loadingVids, setLoadingVids] = useState(true);
  const [vidError, setVidError] = useState("");
  const [playing, setPlaying] = useState<BatchYouTubeVideo | null>(null);
  const [filterBatch, setFilterBatch] = useState("all");

  useEffect(() => {
    void loadBatchVideos();
  }, []);

  async function loadBatchVideos() {
    setLoadingVids(true);
    setVidError("");
    try {
      const res = await apiRequest<{ videos: BatchYouTubeVideo[] }>("/student/batch-videos");
      setBatchVideos(res.videos);
    } catch (e) {
      setVidError(e instanceof Error ? e.message : "Failed to load videos");
    } finally {
      setLoadingVids(false);
    }
  }

  const uniqueBatches = useMemo(
    () => Array.from(new Map(batchVideos.map((v) => [v.batch_id, v.batch_name])).entries()),
    [batchVideos]
  );

  const filtered = useMemo(() => {
    if (filterBatch === "all") return batchVideos;
    return batchVideos.filter((v) => v.batch_id === filterBatch);
  }, [batchVideos, filterBatch]);

  const embedUrl = playing ? youtubeEmbedUrl(playing.youtube_url) : null;

  return (
    <div className="stack">
      {vidError ? <p className="message error">{vidError}</p> : null}

      {playing && embedUrl ? (
        <section className="card">
          <header className="card-header">
            <h3>{playing.title}</h3>
            <button type="button" className="button" style={{ marginLeft: "auto" }} onClick={() => setPlaying(null)}>✕ Close</button>
          </header>
          <div className="yt-player-wrap">
            <iframe src={embedUrl} title={playing.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="yt-player" />
          </div>
        </section>
      ) : null}

      <div className="filter-bar">
        <div className="filter-bar-left">
          <select className="filter-select" value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
            <option value="all">All Batches</option>
            {uniqueBatches.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <span className="filter-count">{filtered.length} video{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <section className="card">
        <header className="card-header">
          <h3>Batch Videos</h3>
        </header>
        {loadingVids ? <p className="muted">Loading…</p> : null}
        <ul className="list">
          {filtered.map((v) => (
            <li
              key={v.id}
              className="list-item"
              style={{ cursor: "pointer" }}
              onClick={() => { setPlaying(v); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            >
              <strong style={{ color: "var(--accent)" }}>▶ {v.title}</strong>
              <p className="muted" style={{ fontSize: "0.78rem" }}>📦 {v.batch_name} · {new Date(v.created_at).toLocaleDateString()}</p>
              {v.description ? <p className="muted" style={{ fontSize: "0.78rem" }}>{v.description}</p> : null}
            </li>
          ))}
          {!filtered.length && !loadingVids ? (
            <li className="list-item muted">No videos available for your batches.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

export function StudentDashboard() {
  const [section, setSection] = useState<StudentSection>("overview");
  const [videos, setVideos] = useState<StudentVideo[]>([]);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [requests, setRequests] = useState<IpRequest[]>([]);
  const [myPrograms, setMyPrograms] = useState<StudentProgram[]>([]);
  const [myCourses, setMyCourses] = useState<StudentCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);
  const [ipForm, setIpForm] = useState<IpRequestForm>({
    requestedIp: "",
    protocol: "tcp",
    port: "22",
    reason: "",
  });

  async function loadDashboardData() {
    setLoading(true);
    setError("");

    try {
      const [videoResponse, assignmentResponse, requestResponse, programResponse, courseResponse] =
        await Promise.all([
          apiRequest<{ videos: StudentVideo[] }>("/student/videos"),
          apiRequest<{ assignments: StudentAssignment[] }>(
            "/student/assignments"
          ),
          apiRequest<{ requests: IpRequest[] }>("/student/ip-requests"),
          apiRequest<{ programs: StudentProgram[] }>("/student/program"),
          apiRequest<{ courses: StudentCourse[] }>("/student/courses"),
        ]);

      setVideos(videoResponse.videos);
      setAssignments(assignmentResponse.assignments);
      setRequests(requestResponse.requests);
      setMyPrograms(programResponse.programs);
      setMyCourses(courseResponse.courses);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load student dashboard"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  async function detectMyIp() {
    setDetectingIp(true);
    setError("");
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      if (!res.ok) throw new Error("Could not reach IP detection service");
      const data = (await res.json()) as { ip: string };
      setIpForm((c) => ({ ...c, requestedIp: data.ip }));
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

    if (
      !Number.isInteger(parsedPort) ||
      parsedPort <= 0 ||
      parsedPort > 65535
    ) {
      setSubmitting(false);
      setError("Port must be an integer between 1 and 65535.");
      return;
    }

    try {
      await apiRequest<{ request: IpRequest }>(
        "/student/ip-requests",
        "POST",
        {
          requestedIp: ipForm.requestedIp,
          protocol: ipForm.protocol,
          port: parsedPort,
          reason: ipForm.reason,
        }
      );

      setRequestMessage("IP update request submitted.");
      setIpForm({ requestedIp: "", protocol: "tcp", port: "22", reason: "" });
      await loadDashboardData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to submit IP request"
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ── render main content per section ─────────────── */
  function renderContent() {
    if (loading) return <p className="muted">Loading dashboard…</p>;

    switch (section) {
      case "overview":
        return (
          <>
            {error ? <p className="message error">{error}</p> : null}

            {/* My Programs */}
            {myPrograms.length > 0 ? (
              <>
                <h2 className="section-heading">My Programs</h2>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                  {myPrograms.map((p) => (
                    <div key={p.id} style={{
                      padding: "0.75rem 1rem", borderRadius: "0.75rem",
                      background: "rgba(75,226,194,0.08)", border: "1px solid rgba(75,226,194,0.2)",
                      minWidth: "200px", flex: "1 1 200px", maxWidth: "300px"
                    }}>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>📋 {p.title}</div>
                      {p.description ? <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>{p.description}</p> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {/* My Courses */}
            <h2 className="section-heading">My Courses</h2>
            <div className="course-cards">
              {myCourses.map((c, idx) => {
                const color = TAG_COLORS[idx % TAG_COLORS.length];
                return (
                  <div className="course-card" key={c.id} onClick={() => setSection("courses")} style={{ cursor: "pointer" }}>
                    <div className="course-icon">📘</div>
                    <span className="course-tag" style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
                      Course {idx + 1}
                    </span>
                    <h3 className="course-title">{c.title}</h3>
                    {c.description ? <p className="muted" style={{ fontSize: "0.78rem" }}>{c.description}</p> : null}
                  </div>
                );
              })}
              {!myCourses.length ? (
                <p className="muted">No courses assigned yet. Contact your trainer or admin.</p>
              ) : null}
            </div>

            {/* Recent Activity */}
            <h2 className="section-heading" style={{ marginTop: 32 }}>
              Recent Activity
            </h2>
            <div className="activity-list">
              {DEMO_ACTIVITY.map((a) => (
                <div className="activity-row" key={a.id}>
                  <div
                    className="activity-icon"
                    style={{ background: a.iconBg }}
                  >
                    {a.icon}
                  </div>
                  <div className="activity-content">
                    <p className="activity-title">{a.title}</p>
                    <p className="activity-sub">{a.subtitle}</p>
                  </div>
                  <span className="activity-time">{a.time}</span>
                </div>
              ))}
            </div>
          </>
        );

      case "courses":
        return <CoursesSection />;

      case "batch-videos":
        return <StudentBatchVideos />;

      case "notifications":
        return <NotificationCenter role="student" apiBase="/student" />;

      case "requests":
        return (
          <div className="stack">
            {error ? <p className="message error">{error}</p> : null}

            <section className="card">
              <header className="card-header">
                <h3>Submit IP Update Request</h3>
                <p className="muted">
                  Ask admin to whitelist your current IP for secure access.
                </p>
              </header>

              <form className="form" onSubmit={submitIpRequest}>
                <label>
                  Requested IP
                  <div
                    className="row-inline"
                    style={{ alignItems: "center", gap: "0.5rem" }}
                  >
                    <input
                      style={{ flex: 1 }}
                      value={ipForm.requestedIp}
                      onChange={(e) =>
                        setIpForm((c) => ({ ...c, requestedIp: e.target.value }))
                      }
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
                      {detectingIp ? "Detecting…" : "Detect My IP"}
                    </button>
                  </div>
                </label>

                <label>
                  Protocol
                  <select
                    value={ipForm.protocol}
                    onChange={(e) =>
                      setIpForm((c) => ({ ...c, protocol: e.target.value }))
                    }
                  >
                    <option value="tcp">tcp</option>
                    <option value="udp">udp</option>
                  </select>
                </label>

                <label>
                  Port
                  <div
                    className="row-inline"
                    style={{
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <input
                      style={{ flex: 1, minWidth: 100 }}
                      value={ipForm.port}
                      onChange={(e) =>
                        setIpForm((c) => ({ ...c, port: e.target.value }))
                      }
                      placeholder="e.g. 1433"
                      required
                    />
                    <button
                      type="button"
                      className="button"
                      style={{ whiteSpace: "nowrap" }}
                      onClick={() =>
                        setIpForm((c) => ({ ...c, port: "1433" }))
                      }
                    >
                      1433 (MSSQL)
                    </button>
                    <button
                      type="button"
                      className="button"
                      style={{ whiteSpace: "nowrap" }}
                      onClick={() =>
                        setIpForm((c) => ({ ...c, port: "5432" }))
                      }
                    >
                      5432 (PostgreSQL)
                    </button>
                  </div>
                </label>

                <label>
                  Reason
                  <textarea
                    value={ipForm.reason}
                    onChange={(e) =>
                      setIpForm((c) => ({ ...c, reason: e.target.value }))
                    }
                    placeholder="Why this IP needs access"
                  />
                </label>

                {requestMessage ? (
                  <p className="message success">{requestMessage}</p>
                ) : null}

                <button type="submit" className="button" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit Request"}
                </button>
              </form>
            </section>

            <section className="card">
              <header className="card-header">
                <h3>Request History</h3>
              </header>
              <ul className="list">
                {requests.map((r) => (
                  <li className="list-item" key={r.id}>
                    <div className="row-inline">
                      <strong>
                        {r.requested_ip}:{r.port}
                      </strong>
                      <span className={`badge badge-${r.status}`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="muted">Protocol: {r.protocol}</p>
                    {r.reason ? (
                      <p className="muted">Reason: {r.reason}</p>
                    ) : null}
                    {r.review_note ? (
                      <p className="muted">Review: {r.review_note}</p>
                    ) : null}
                  </li>
                ))}
                {!requests.length ? (
                  <li className="list-item muted">No IP requests yet.</li>
                ) : null}
              </ul>
            </section>
          </div>
        );

      case "invoices":
        return (
          <div className="card">
            <header className="card-header">
              <h3>Invoice & Payments</h3>
              <p className="muted">Your billing history and upcoming payments.</p>
            </header>
            <ul className="list">
              <li className="list-item">
                <div className="row-inline">
                  <strong>Installment 2 of 3</strong>
                  <span className="badge badge-pending">Due</span>
                </div>
                <p className="muted">$499 · Due Apr 1, 2026</p>
              </li>
              <li className="list-item">
                <div className="row-inline">
                  <strong>Installment 1 of 3</strong>
                  <span className="badge badge-approved">Paid</span>
                </div>
                <p className="muted">$499 · Paid Jan 1, 2026</p>
              </li>
            </ul>
          </div>
        );

      case "ip-whitelist":
        return (
          <div className="card">
            <header className="card-header">
              <h3>IP Whitelist DB</h3>
              <p className="muted">Currently whitelisted IPs for your account.</p>
            </header>
            <ul className="list">
              {requests
                .filter((r) => r.status === "approved")
                .map((r) => (
                  <li className="list-item" key={r.id}>
                    <strong>
                      {r.requested_ip}:{r.port}
                    </strong>
                    <p className="muted">
                      {r.protocol} · Approved{" "}
                      {r.reviewed_at
                        ? new Date(r.reviewed_at).toLocaleDateString()
                        : ""}
                    </p>
                  </li>
                ))}
              {!requests.filter((r) => r.status === "approved").length ? (
                <li className="list-item muted">No approved IPs yet.</li>
              ) : null}
            </ul>
          </div>
        );

      case "profile":
        return <ProfileManager />;

      default:
        return null;
    }
  }

  return (
    <DashboardMenu
      sections={[
        {
          title: "LEARNING",
          items: [
            { key: "overview" as StudentSection, label: "Dashboard", icon: "📊" },
            { key: "courses" as StudentSection, label: "My Courses", icon: "📚" },
            { key: "batch-videos" as StudentSection, label: "Batch Videos", icon: "🎬" },
          ],
        },
        {
          title: "COMMUNICATION",
          items: [
            { key: "notifications" as StudentSection, label: "Notifications", icon: "🔔" },
          ],
        },
        {
          title: "BILLING",
          items: [
            {
              key: "invoices" as StudentSection,
              label: "Invoice & Payments",
              icon: "🧾",
              badge: 1,
            },
          ],
        },
        {
          title: "ADMIN",
          items: [
            { key: "ip-whitelist" as StudentSection, label: "IP Whitelist DB", icon: "🔒" },
            {
              key: "requests" as StudentSection,
              label: "IP Requests",
              icon: "🌐",
              badge: pendingCount || undefined,
            },
          ],
        },
        {
          title: "ACCOUNT",
          items: [
            { key: "profile" as StudentSection, label: "Registration Info", icon: "👤" },
          ],
        },
      ]}
      active={section}
      onChange={setSection}
      mainContent={renderContent()}
    />
  );
}
