"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";

interface ResumeProfile {
  id: string;
  student_id: string;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  preferred_role: string | null;
  work_authorization: string | null;
  status: string;
  admin_notes: string | null;
  student_name: string;
  student_email: string;
  education_count: number;
  experience_count: number;
  skills_count: number;
  projects_count: number;
  updated_at: string;
}

interface ResumeDetail {
  profile: ResumeProfile | null;
  education: Array<{ id: string; institution: string; degree: string | null; field_of_study: string | null; start_year: number | null; end_year: number | null; grade: string | null; }>;
  experience: Array<{ id: string; company: string; title: string | null; start_date: string | null; end_date: string | null; description: string | null; }>;
  skills: Array<{ id: string; skill_name: string; proficiency: string | null; }>;
  projects: Array<{ id: string; title: string; description: string | null; tech_stack: string | null; url: string | null; }>;
}

const ROWS_OPTIONS = [5, 10, 25, 50];
const STATUS_COLORS: Record<string, string> = { not_started: "badge-inactive", in_progress: "badge-warning", submitted: "badge-pending", approved: "badge-approved", changes_requested: "badge-rejected" };

export function ResumeManager() {
  const [resumes, setResumes] = useState<ResumeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Detail view
  const [detail, setDetail] = useState<ResumeDetail | null>(null);
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState({ status: "", adminNotes: "" });

  useEffect(() => { void loadData(); }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, pageSize]);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const res = await apiRequest<{ resumes: ResumeProfile[] }>("/admin/resumes");
      setResumes(res.resumes);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  async function loadDetail(studentId: string) {
    setDetailLoading(true); setDetailStudentId(studentId);
    try {
      const res = await apiRequest<ResumeDetail>(`/admin/resumes/${studentId}`);
      setDetail(res);
      if (res.profile) setStatusUpdate({ status: res.profile.status, adminNotes: res.profile.admin_notes || "" });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); setDetail(null); }
    finally { setDetailLoading(false); }
  }

  async function updateStatus() {
    if (!detailStudentId || !statusUpdate.status) return;
    try {
      await apiRequest(`/admin/resumes/${detailStudentId}/status`, "PATCH", {
        status: statusUpdate.status,
        adminNotes: statusUpdate.adminNotes || undefined
      });
      setMessage("Status updated."); await loadData(); await loadDetail(detailStudentId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  const filtered = useMemo(() => {
    let list = resumes;
    if (filterStatus !== "all") list = list.filter(r => r.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.student_name?.toLowerCase().includes(q) || r.student_email?.toLowerCase().includes(q));
    }
    return list;
  }, [resumes, search, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (detailStudentId) {
    return (
      <div className="stack">
        <div className="dt-header">
          <h3>Resume Detail</h3>
          <div className="dt-header-actions">
            <button className="button secondary" onClick={() => { setDetailStudentId(null); setDetail(null); }}>← Back</button>
          </div>
        </div>
        {detailLoading ? <p className="muted">Loading...</p> : detail ? (
          <>
            {detail.profile ? (
              <div className="card">
                <h4>{detail.profile.student_name} — {detail.profile.student_email}</h4>
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  <p><strong>Preferred Role:</strong> {detail.profile.preferred_role || "—"}</p>
                  <p><strong>Work Auth:</strong> {detail.profile.work_authorization || "—"}</p>
                  <p><strong>LinkedIn:</strong> {detail.profile.linkedin_url || "—"}</p>
                  <p><strong>GitHub:</strong> {detail.profile.github_url || "—"}</p>
                  <p><strong>Portfolio:</strong> {detail.profile.portfolio_url || "—"}</p>
                  <p><strong>Status:</strong> <span className={`badge ${STATUS_COLORS[detail.profile.status] || ""}`}>{detail.profile.status.replace(/_/g, " ")}</span></p>
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label>Update Status
                    <select value={statusUpdate.status} onChange={e => setStatusUpdate({...statusUpdate, status: e.target.value})}>
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="submitted">Submitted</option>
                      <option value="approved">Approved</option>
                      <option value="changes_requested">Changes Requested</option>
                    </select>
                  </label>
                  <label>Admin Notes<input value={statusUpdate.adminNotes} onChange={e => setStatusUpdate({...statusUpdate, adminNotes: e.target.value})} /></label>
                  <button className="button" onClick={updateStatus}>Update</button>
                </div>
                {detail.profile.admin_notes && <p className="muted" style={{ marginTop: 8 }}>Admin Notes: {detail.profile.admin_notes}</p>}
              </div>
            ) : <p className="muted">No resume profile yet</p>}

            {detail.education.length > 0 && (
              <div className="card">
                <h4>Education ({detail.education.length})</h4>
                <div className="dt-table-wrap">
                  <table className="dt-table"><thead><tr><th>Institution</th><th>Degree</th><th>Field</th><th>Years</th><th>Grade</th></tr></thead>
                    <tbody>{detail.education.map(e => (
                      <tr key={e.id}><td>{e.institution}</td><td>{e.degree || "—"}</td><td>{e.field_of_study || "—"}</td><td>{e.start_year || "?"} – {e.end_year || "present"}</td><td>{e.grade || "—"}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.experience.length > 0 && (
              <div className="card">
                <h4>Experience ({detail.experience.length})</h4>
                <div className="dt-table-wrap">
                  <table className="dt-table"><thead><tr><th>Company</th><th>Title</th><th>Period</th><th>Description</th></tr></thead>
                    <tbody>{detail.experience.map(e => (
                      <tr key={e.id}><td>{e.company}</td><td>{e.title || "—"}</td><td>{e.start_date ? new Date(e.start_date).toLocaleDateString() : "?"} – {e.end_date ? new Date(e.end_date).toLocaleDateString() : "present"}</td><td>{e.description || "—"}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.skills.length > 0 && (
              <div className="card">
                <h4>Skills ({detail.skills.length})</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8 }}>
                  {detail.skills.map(s => (
                    <span key={s.id} className="dt-cell-tag">{s.skill_name}{s.proficiency ? ` (${s.proficiency})` : ""}</span>
                  ))}
                </div>
              </div>
            )}

            {detail.projects.length > 0 && (
              <div className="card">
                <h4>Projects ({detail.projects.length})</h4>
                <div className="dt-table-wrap">
                  <table className="dt-table"><thead><tr><th>Title</th><th>Tech Stack</th><th>URL</th><th>Description</th></tr></thead>
                    <tbody>{detail.projects.map(p => (
                      <tr key={p.id}><td>{p.title}</td><td>{p.tech_stack || "—"}</td><td>{p.url || "—"}</td><td>{p.description || "—"}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : <p className="muted">No data</p>}
        {error && <p className="message error">{error}</p>}
        {message && <p className="message success">{message}</p>}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="dt-header">
        <h3>Resume Collection ({filtered.length})</h3>
      </div>
      {error && <p className="message error">{error}</p>}
      {message && <p className="message success">{message}</p>}

      <div className="dt-filters">
        <input className="dt-search" placeholder="Search student..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="changes_requested">Changes Requested</option>
        </select>
      </div>

      {loading ? <p className="muted">Loading...</p> : (
        <>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Role</th>
                  <th>Education</th>
                  <th>Experience</th>
                  <th>Skills</th>
                  <th>Projects</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.student_name}</strong><br /><span className="muted">{r.student_email}</span></td>
                    <td>{r.preferred_role || "—"}</td>
                    <td>{r.education_count}</td>
                    <td>{r.experience_count}</td>
                    <td>{r.skills_count}</td>
                    <td>{r.projects_count}</td>
                    <td><span className={`badge ${STATUS_COLORS[r.status] || ""}`}>{r.status.replace(/_/g, " ")}</span></td>
                    <td>
                      <div className="dt-actions">
                        <button className="dt-action-btn" title="View" onClick={() => loadDetail(r.student_id)}>👁</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!paged.length && <tr><td colSpan={8} className="muted" style={{ textAlign: "center" }}>No resumes found</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="dt-pagination">
            <div className="dt-rows-per-page">
              Rows: <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                {ROWS_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <span className="dt-page-info">Page {page} of {totalPages}</span>
            <div className="dt-page-buttons">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
