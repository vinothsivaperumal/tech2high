"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";

interface Certification {
  id: string;
  student_id: string;
  batch_id: string | null;
  course_id: string | null;
  program_id: string | null;
  completion_pct: number;
  status: string;
  issue_date: string | null;
  student_name: string;
  student_email: string;
  batch_name: string | null;
  course_title: string | null;
  program_title: string | null;
  created_at: string;
}

interface Student { id: string; full_name: string; email: string; }
interface Batch { id: string; name: string; }
interface Course { id: string; title: string; }
interface Program { id: string; title: string; }

const ROWS_OPTIONS = [5, 10, 25, 50];
const STATUS_COLORS: Record<string, string> = { not_eligible: "badge-inactive", eligible: "badge-warning", issued: "badge-approved", revoked: "badge-rejected" };

export function CertificationManager() {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const initForm = { studentId: "", batchId: "", courseId: "", programId: "", completionPct: "0", status: "not_eligible", issueDate: "" };
  const [form, setForm] = useState(initForm);

  useEffect(() => { void loadData(); }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, pageSize]);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [cRes, sRes, bRes, crRes, pRes] = await Promise.all([
        apiRequest<{ certifications: Certification[] }>("/admin/certifications"),
        apiRequest<{ students: Student[] }>("/admin/students"),
        apiRequest<{ batches: Batch[] }>("/admin/batches"),
        apiRequest<{ courses: Course[] }>("/admin/courses"),
        apiRequest<{ programs: Program[] }>("/admin/programs")
      ]);
      setCertifications(cRes.certifications); setStudents(sRes.students); setBatches(bRes.batches); setCourses(crRes.courses); setPrograms(pRes.programs);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  const filtered = useMemo(() => {
    let list = certifications;
    if (filterStatus !== "all") list = list.filter(c => c.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.student_name?.toLowerCase().includes(q) || c.course_title?.toLowerCase().includes(q));
    }
    return list;
  }, [certifications, search, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  function openEdit(c: Certification) {
    setEditId(c.id);
    setForm({ studentId: c.student_id, batchId: c.batch_id || "", courseId: c.course_id || "", programId: c.program_id || "", completionPct: String(c.completion_pct), status: c.status, issueDate: c.issue_date?.split("T")[0] || "" });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSubmitting(true); setError(""); setMessage("");
    try {
      const body: Record<string, unknown> = {
        studentId: form.studentId,
        batchId: form.batchId || undefined,
        courseId: form.courseId || undefined,
        programId: form.programId || undefined,
        completionPct: Number(form.completionPct),
        status: form.status,
        issueDate: form.issueDate || undefined
      };
      if (editId) {
        await apiRequest(`/admin/certifications/${editId}`, "PATCH", body);
        setMessage("Certification updated.");
      } else {
        await apiRequest("/admin/certifications", "POST", body);
        setMessage("Certification created.");
      }
      setShowForm(false); await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSubmitting(false); }
  }

  if (showForm) {
    return (
      <div className="stack">
        <div className="dt-header">
          <h3>{editId ? "Edit Certification" : "Add Certification"}</h3>
          <div className="dt-header-actions"><button className="button secondary" onClick={() => setShowForm(false)}>← Back</button></div>
        </div>
        <form className="card" onSubmit={handleSubmit}>
          {error && <p className="message error">{error}</p>}
          <div className="form-grid-2">
            <label>Student *
              <select value={form.studentId} onChange={e => setForm({...form, studentId: e.target.value})} required disabled={!!editId}>
                <option value="">Select Student</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>)}
              </select>
            </label>
            <label>Program
              <select value={form.programId} onChange={e => setForm({...form, programId: e.target.value})}>
                <option value="">Select Program</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <label>Batch
              <select value={form.batchId} onChange={e => setForm({...form, batchId: e.target.value})}>
                <option value="">Select Batch</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>Course
              <select value={form.courseId} onChange={e => setForm({...form, courseId: e.target.value})}>
                <option value="">Select Course</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <label>Completion %<input type="number" min="0" max="100" value={form.completionPct} onChange={e => setForm({...form, completionPct: e.target.value})} /></label>
            <label>Status
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="not_eligible">Not Eligible</option>
                <option value="eligible">Eligible</option>
                <option value="issued">Issued</option>
                <option value="revoked">Revoked</option>
              </select>
            </label>
            <label>Issue Date<input type="date" value={form.issueDate} onChange={e => setForm({...form, issueDate: e.target.value})} /></label>
          </div>
          <div className="row-inline" style={{ marginTop: 16 }}>
            <button className="button" type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save"}</button>
            <button className="button secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="dt-header">
        <h3>Certifications ({filtered.length})</h3>
        <div className="dt-header-actions">
          <button className="button" onClick={() => { setEditId(null); setForm(initForm); setShowForm(true); }}>+ Add Certification</button>
        </div>
      </div>
      {error && <p className="message error">{error}</p>}
      {message && <p className="message success">{message}</p>}

      <div className="dt-filters">
        <input className="dt-search" placeholder="Search student or course..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="not_eligible">Not Eligible</option>
          <option value="eligible">Eligible</option>
          <option value="issued">Issued</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      {loading ? <p className="muted">Loading...</p> : (
        <>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Program</th>
                  <th>Course</th>
                  <th>Batch</th>
                  <th>Completion</th>
                  <th>Status</th>
                  <th>Issue Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.student_name}</strong><br /><span className="muted">{c.student_email}</span></td>
                    <td>{c.program_title || "—"}</td>
                    <td>{c.course_title || "—"}</td>
                    <td>{c.batch_name || "—"}</td>
                    <td>{c.completion_pct}%</td>
                    <td><span className={`badge ${STATUS_COLORS[c.status] || ""}`}>{c.status.replace(/_/g, " ")}</span></td>
                    <td>{c.issue_date ? new Date(c.issue_date).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className="dt-actions">
                        <button className="dt-action-btn" title="Edit" onClick={() => openEdit(c)}>✏️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!paged.length && <tr><td colSpan={8} className="muted" style={{ textAlign: "center" }}>No certifications found</td></tr>}
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
