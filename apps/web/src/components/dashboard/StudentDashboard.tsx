"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";
import { CoursesSection } from "./CoursesSection";
import { CredentialViewer } from "./CredentialViewer";
import { MaterialViewer } from "./MaterialViewer";
import { DashboardMenu } from "../DashboardMenu";
import { ProfileManager } from "../ProfileManager";
import { NotificationCenter } from "./NotificationCenter";
import { SettingsPanel } from "./SettingsPanel";
import { ATSResumeBuilder } from "./ATSResumeBuilder";

type StudentSection =
  | "overview"
  | "calendar"
  | "courses"
  | "batch-videos"
  | "zoom-meetings"
  | "credentials"
  | "materials"
  | "notifications"
  | "requests"
  | "invoices"
  | "ip-whitelist"
  | "profile"
  | "payments"
  | "agreements"
  | "certifications"
  | "resume"
  | "settings";

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
const TAG_COLORS = ["#e94560", "#2196f3", "#ff9800", "#4caf50", "#8b5cf6", "#ec4899"];

/* ── Demo activity items ───────────────────────────── */
const DEMO_ACTIVITY = [
  {
    id: "a1",
    icon: "🖥",
    iconBg: "rgba(233,69,96,0.18)",
    title: "Completed: useEffect Deep Dive",
    subtitle: "Advanced React & Hooks · Lesson 14",
    time: "2h ago",
  },
  {
    id: "a2",
    icon: "✅",
    iconBg: "rgba(76,175,80,0.18)",
    title: "Assignment submitted: Pandas Basics",
    subtitle: "Python for Data Science · Week 3",
    time: "Yesterday",
  },
  {
    id: "a3",
    icon: "🏆",
    iconBg: "rgba(255,152,0,0.18)",
    title: "Badge earned: React Fundamentals",
    subtitle: "Milestone achievement",
    time: "2 days ago",
  },
  {
    id: "a4",
    icon: "💳",
    iconBg: "rgba(244,67,54,0.18)",
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

/* ── Student Zoom Meetings ─────────────────────────── */
interface StudentBatch {
  id: string;
  name: string;
  zoom_link: string | null;
  trainer_name: string | null;
  trainer_email: string | null;
  created_at: string;
}

function StudentZoomMeetings() {
  const [batches, setBatches] = useState<StudentBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ batches: StudentBatch[] }>("/student/batches")
      .then((r) => setBatches(r.batches))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading batches…</p>;

  const withZoom = batches.filter((b) => b.zoom_link);

  return (
    <div className="stack">
      <div className="dt-header"><h3>Zoom Meetings ({withZoom.length})</h3></div>
      {withZoom.length === 0 ? (
        <p className="muted">No Zoom meeting links available for your batches.</p>
      ) : (
        <div className="zoom-cards">
          {withZoom.map((b) => (
            <div className="zoom-card" key={b.id}>
              <div className="zoom-card-header">
                <span className="zoom-card-icon">📹</span>
                <div>
                  <strong>{b.name}</strong>
                  {b.trainer_name ? <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>Trainer: {b.trainer_name}</p> : null}
                </div>
              </div>
              <a href={b.zoom_link!} target="_blank" rel="noopener noreferrer" className="zoom-join-btn zoom-join-btn-lg">
                📹 Join Zoom Meeting
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Student Payments View ─────────────────────────── */
function StudentPaymentsView() {
  const [payments, setPayments] = useState<Array<{ id: string; amount: number; paid_amount: number; due_date: string | null; paid_date: string | null; status: string; method: string | null; batch_name: string | null; }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ payments: typeof payments }>("/student/payments")
      .then(r => setPayments(r.payments))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading payments...</p>;
  return (
    <div className="stack">
      <div className="dt-header"><h3>My Payments ({payments.length})</h3></div>
      <div className="dt-table-wrap">
        <table className="dt-table">
          <thead><tr><th>Batch</th><th>Amount</th><th>Paid</th><th>Due Date</th><th>Status</th><th>Method</th></tr></thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td>{p.batch_name || "—"}</td>
                <td>₹{Number(p.amount).toLocaleString()}</td>
                <td>₹{Number(p.paid_amount).toLocaleString()}</td>
                <td>{p.due_date ? new Date(p.due_date).toLocaleDateString() : "—"}</td>
                <td><span className={`badge badge-${p.status === "paid" ? "approved" : p.status === "overdue" ? "rejected" : "pending"}`}>{p.status}</span></td>
                <td>{p.method || "—"}</td>
              </tr>
            ))}
            {!payments.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center" }}>No payments found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Student Agreements View ───────────────────────── */
function StudentAgreementsView() {
  const [agreements, setAgreements] = useState<Array<{ id: string; agreement_type: string; status: string; sent_date: string | null; signed_date: string | null; batch_name: string | null; }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ agreements: typeof agreements }>("/student/agreements")
      .then(r => setAgreements(r.agreements))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function signAgreement(id: string) {
    try {
      await apiRequest(`/student/agreements/${id}/sign`, "PATCH");
      const res = await apiRequest<{ agreements: typeof agreements }>("/student/agreements");
      setAgreements(res.agreements);
    } catch {}
  }

  if (loading) return <p className="muted">Loading agreements...</p>;
  return (
    <div className="stack">
      <div className="dt-header"><h3>My Agreements ({agreements.length})</h3></div>
      <div className="dt-table-wrap">
        <table className="dt-table">
          <thead><tr><th>Type</th><th>Batch</th><th>Sent</th><th>Signed</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {agreements.map(a => (
              <tr key={a.id}>
                <td>{a.agreement_type}</td>
                <td>{a.batch_name || "—"}</td>
                <td>{a.sent_date ? new Date(a.sent_date).toLocaleDateString() : "—"}</td>
                <td>{a.signed_date ? new Date(a.signed_date).toLocaleDateString() : "—"}</td>
                <td><span className={`badge badge-${a.status === "signed" ? "approved" : a.status === "rejected" ? "rejected" : "pending"}`}>{a.status.replace(/_/g, " ")}</span></td>
                <td>{a.status === "sent" ? <button className="button" onClick={() => signAgreement(a.id)}>Sign</button> : "—"}</td>
              </tr>
            ))}
            {!agreements.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center" }}>No agreements found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Student Certifications View ───────────────────── */
function StudentCertificationsView() {
  const [certs, setCerts] = useState<Array<{ id: string; course_title: string | null; program_title: string | null; batch_name: string | null; completion_pct: number; status: string; issue_date: string | null; }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ certifications: typeof certs }>("/student/certifications")
      .then(r => setCerts(r.certifications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading certifications...</p>;
  return (
    <div className="stack">
      <div className="dt-header"><h3>My Certifications ({certs.length})</h3></div>
      <div className="dt-table-wrap">
        <table className="dt-table">
          <thead><tr><th>Course</th><th>Program</th><th>Completion</th><th>Status</th><th>Issued</th></tr></thead>
          <tbody>
            {certs.map(c => (
              <tr key={c.id}>
                <td>{c.course_title || "—"}</td>
                <td>{c.program_title || "—"}</td>
                <td>{c.completion_pct}%</td>
                <td><span className={`badge badge-${c.status === "issued" ? "approved" : c.status === "revoked" ? "rejected" : "pending"}`}>{c.status.replace(/_/g, " ")}</span></td>
                <td>{c.issue_date ? new Date(c.issue_date).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {!certs.length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center" }}>No certifications found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Student Resume Builder ────────────────────────── */
function StudentResumeView() {
  const [profile, setProfile] = useState<{ linkedin_url: string; github_url: string; portfolio_url: string; preferred_role: string; work_authorization: string; status: string; admin_notes: string | null; } | null>(null);
  const [education, setEducation] = useState<Array<{ id: string; institution: string; degree: string | null; field_of_study: string | null; start_year: number | null; end_year: number | null; }>>([]);
  const [experience, setExperience] = useState<Array<{ id: string; company: string; title: string | null; start_date: string | null; end_date: string | null; }>>([]);
  const [skills, setSkills] = useState<Array<{ id: string; skill_name: string; proficiency: string | null; }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; title: string; tech_stack: string | null; url: string | null; }>>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [profileForm, setProfileForm] = useState({ linkedinUrl: "", githubUrl: "", portfolioUrl: "", preferredRole: "", workAuthorization: "" });

  useEffect(() => { loadResume(); }, []);

  async function loadResume() {
    setLoading(true);
    try {
      const res = await apiRequest<{ profile: typeof profile; education: typeof education; experience: typeof experience; skills: typeof skills; projects: typeof projects; }>("/student/resume");
      setProfile(res.profile);
      setEducation(res.education); setExperience(res.experience); setSkills(res.skills); setProjects(res.projects);
      if (res.profile) {
        setProfileForm({ linkedinUrl: res.profile.linkedin_url || "", githubUrl: res.profile.github_url || "", portfolioUrl: res.profile.portfolio_url || "", preferredRole: res.profile.preferred_role || "", workAuthorization: res.profile.work_authorization || "" });
      }
    } catch {}
    finally { setLoading(false); }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setMessage("");
    try {
      await apiRequest("/student/resume/profile", "PUT", profileForm);
      setMessage("Profile saved."); await loadResume();
    } catch {}
  }

  async function addSkill() {
    const name = prompt("Skill name:");
    if (!name) return;
    const proficiency = prompt("Proficiency (beginner/intermediate/advanced):") || undefined;
    try { await apiRequest("/student/resume/skills", "POST", { skillName: name, proficiency }); await loadResume(); } catch {}
  }

  async function deleteSkill(id: string) {
    try { await apiRequest(`/student/resume/skills/${id}`, "DELETE"); await loadResume(); } catch {}
  }

  async function submitResume() {
    try { await apiRequest("/student/resume/submit", "POST"); setMessage("Resume submitted for review."); await loadResume(); } catch {}
  }

  if (loading) return <p className="muted">Loading resume...</p>;
  return (
    <div className="stack">
      <div className="dt-header">
        <h3>Resume Builder</h3>
        <div className="dt-header-actions">
          {profile && (profile.status === "in_progress" || profile.status === "changes_requested") && (
            <button className="button" onClick={submitResume}>Submit for Review</button>
          )}
        </div>
      </div>
      {profile && <p>Status: <span className={`badge badge-${profile.status === "approved" ? "approved" : profile.status === "changes_requested" ? "rejected" : "pending"}`}>{profile.status.replace(/_/g, " ")}</span></p>}
      {profile?.admin_notes && <p className="message warning">Admin: {profile.admin_notes}</p>}
      {message && <p className="message success">{message}</p>}

      <form className="card" onSubmit={saveProfile}>
        <h4>Profile</h4>
        <div className="form-grid-2">
          <label>Preferred Role<input value={profileForm.preferredRole} onChange={e => setProfileForm({...profileForm, preferredRole: e.target.value})} /></label>
          <label>Work Authorization<input value={profileForm.workAuthorization} onChange={e => setProfileForm({...profileForm, workAuthorization: e.target.value})} /></label>
          <label>LinkedIn<input value={profileForm.linkedinUrl} onChange={e => setProfileForm({...profileForm, linkedinUrl: e.target.value})} /></label>
          <label>GitHub<input value={profileForm.githubUrl} onChange={e => setProfileForm({...profileForm, githubUrl: e.target.value})} /></label>
          <label>Portfolio<input value={profileForm.portfolioUrl} onChange={e => setProfileForm({...profileForm, portfolioUrl: e.target.value})} /></label>
        </div>
        <button className="button" type="submit" style={{ marginTop: 12 }}>Save Profile</button>
      </form>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4>Skills ({skills.length})</h4>
          <button className="button" onClick={addSkill}>+ Add Skill</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {skills.map(s => (
            <span key={s.id} className="dt-cell-tag" style={{ cursor: "pointer" }} onClick={() => deleteSkill(s.id)} title="Click to remove">
              {s.skill_name}{s.proficiency ? ` (${s.proficiency})` : ""} ✕
            </span>
          ))}
          {!skills.length && <span className="muted">No skills added yet</span>}
        </div>
      </div>

      {education.length > 0 && (
        <div className="card">
          <h4>Education ({education.length})</h4>
          <div className="dt-table-wrap">
            <table className="dt-table"><thead><tr><th>Institution</th><th>Degree</th><th>Field</th><th>Years</th></tr></thead>
              <tbody>{education.map(e => <tr key={e.id}><td>{e.institution}</td><td>{e.degree || "—"}</td><td>{e.field_of_study || "—"}</td><td>{e.start_year || "?"} – {e.end_year || "present"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {experience.length > 0 && (
        <div className="card">
          <h4>Experience ({experience.length})</h4>
          <div className="dt-table-wrap">
            <table className="dt-table"><thead><tr><th>Company</th><th>Title</th><th>Period</th></tr></thead>
              <tbody>{experience.map(e => <tr key={e.id}><td>{e.company}</td><td>{e.title || "—"}</td><td>{e.start_date ? new Date(e.start_date).toLocaleDateString() : "?"} – {e.end_date ? new Date(e.end_date).toLocaleDateString() : "present"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="card">
          <h4>Projects ({projects.length})</h4>
          <div className="dt-table-wrap">
            <table className="dt-table"><thead><tr><th>Title</th><th>Tech Stack</th><th>URL</th></tr></thead>
              <tbody>{projects.map(p => <tr key={p.id}><td>{p.title}</td><td>{p.tech_stack || "—"}</td><td>{p.url || "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
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
  const [profileScore, setProfileScore] = useState<{ score: number; checks: Array<{ key: string; label: string; done: boolean; weight: number }> } | null>(null);
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
      const [videoResponse, assignmentResponse, requestResponse, programResponse, courseResponse, scoreResponse] =
        await Promise.all([
          apiRequest<{ videos: StudentVideo[] }>("/student/videos"),
          apiRequest<{ assignments: StudentAssignment[] }>(
            "/student/assignments"
          ),
          apiRequest<{ requests: IpRequest[] }>("/student/ip-requests"),
          apiRequest<{ programs: StudentProgram[] }>("/student/program"),
          apiRequest<{ courses: StudentCourse[] }>("/student/courses"),
          apiRequest<{ score: number; checks: Array<{ key: string; label: string; done: boolean; weight: number }> }>("/student/profile-score").catch(() => null),
        ]);

      setVideos(videoResponse.videos);
      setAssignments(assignmentResponse.assignments);
      setRequests(requestResponse.requests);
      setMyPrograms(programResponse.programs);
      setMyCourses(courseResponse.courses);
      if (scoreResponse) setProfileScore(scoreResponse);
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
      case "calendar":
        {
          const StudentCalendarPage = require("../../app/student/calendar/page").default;
          return <StudentCalendarPage />;
        }
      case "overview":
        return (
          <>
            {error ? <p className="message error">{error}</p> : null}

            {/* Profile Completion Banner */}
            {profileScore && profileScore.score < 100 && (
              <div className="profile-score-banner" onClick={() => setSection("resume")} style={{ cursor: "pointer" }}>
                <div className="profile-score-left">
                  <div className="profile-score-ring-sm">
                    <svg viewBox="0 0 60 60" width="52" height="52">
                      <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
                      <circle cx="30" cy="30" r="24" fill="none"
                        stroke={profileScore.score >= 80 ? "var(--success)" : profileScore.score >= 50 ? "var(--accent-2)" : "var(--danger)"}
                        strokeWidth="5" strokeDasharray={`${profileScore.score * 1.508} 151`} strokeLinecap="round"
                        transform="rotate(-90 30 30)" />
                      <text x="30" y="34" textAnchor="middle" fill="var(--text)" fontSize="13" fontWeight="700">{profileScore.score}%</text>
                    </svg>
                  </div>
                  <div>
                    <strong>Complete Your Profile</strong>
                    <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>
                      {profileScore.checks.filter(c => !c.done).length} items remaining · Click to open Resume Builder
                    </p>
                  </div>
                </div>
                <div className="profile-score-missing">
                  {profileScore.checks.filter(c => !c.done).slice(0, 3).map(c => (
                    <span key={c.key} className="profile-score-tag">⬜ {c.label}</span>
                  ))}
                  {profileScore.checks.filter(c => !c.done).length > 3 && (
                    <span className="profile-score-tag">+{profileScore.checks.filter(c => !c.done).length - 3} more</span>
                  )}
                </div>
              </div>
            )}

            {/* My Programs */}
            {myPrograms.length > 0 ? (
              <>
                <h2 className="section-heading">My Programs</h2>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                  {myPrograms.map((p) => (
                    <div key={p.id} style={{
                      padding: "0.75rem 1rem", borderRadius: "0.75rem",
                      background: "rgba(233,69,96,0.08)", border: "1px solid rgba(233,69,96,0.2)",
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

      case "zoom-meetings":
        return <StudentZoomMeetings />;

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

      case "payments":
        return <StudentPaymentsView />;

      case "agreements":
        return <StudentAgreementsView />;

      case "certifications":
        return <StudentCertificationsView />;

      case "credentials":
        return <CredentialViewer apiBase="/student" />;

      case "materials":
        return <MaterialViewer apiBase="/student" />;

      case "resume":
        return <ATSResumeBuilder />;

      case "profile":
        return <ProfileManager />;

      case "settings":
        return <SettingsPanel />;

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
            { key: "calendar" as StudentSection, label: "Calendar & Events", icon: "📅" },
            { key: "overview" as StudentSection, label: "Dashboard", icon: "📊" },
            { key: "courses" as StudentSection, label: "My Courses", icon: "📚" },
            { key: "batch-videos" as StudentSection, label: "Batch Videos", icon: "🎬" },
            { key: "zoom-meetings" as StudentSection, label: "Zoom Meetings", icon: "📹" },
            { key: "materials" as StudentSection, label: "Course Materials", icon: "📄" },
            { key: "credentials" as StudentSection, label: "My Credentials", icon: "🔑" },
          ],
        },
        {
          title: "COMMUNICATION",
          items: [
            { key: "notifications" as StudentSection, label: "Notifications", icon: "🔔" },
          ],
        },
        {
          title: "BILLING & DOCS",
          items: [
            { key: "payments" as StudentSection, label: "Payments", icon: "💳" },
            { key: "agreements" as StudentSection, label: "Agreements", icon: "📄" },
            { key: "certifications" as StudentSection, label: "Certifications", icon: "🏆" },
          ],
        },
        {
          title: "CAREER",
          items: [
            { key: "resume" as StudentSection, label: "Resume Builder", icon: "📝" },
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
            { key: "settings" as StudentSection, label: "Settings", icon: "⚙️" },
          ],
        },
      ]}
      active={section}
      onChange={setSection}
      mainContent={renderContent()}
    />
  );
}
