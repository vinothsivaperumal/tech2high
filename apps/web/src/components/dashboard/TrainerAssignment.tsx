"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";

interface Trainer {
  id: string;
  email: string;
  full_name: string | null;
}

interface Batch {
  id: string;
  name: string;
  program_id: string | null;
  program_title: string | null;
}

interface Course {
  id: string;
  title: string;
}

interface Assignment {
  id: string;
  batch_id: string;
  trainer_id: string;
  course_id: string | null;
  trainer_name: string | null;
  trainer_email: string;
  batch_name: string;
  program_id: string | null;
  program_title: string | null;
  course_title: string | null;
  created_at: string;
}

const ROWS_OPTIONS = [10, 25, 50];

export function TrainerAssignment() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchCourses, setBatchCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ trainerId: "", batchId: "", courseId: "" });
  const [coursesLoading, setCoursesLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filterBatch, setFilterBatch] = useState("all");
  const [filterTrainer, setFilterTrainer] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, filterBatch, filterTrainer, pageSize]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [aRes, tRes, bRes] = await Promise.all([
        apiRequest<{ assignments: Assignment[] }>("/admin/trainer-assignments"),
        apiRequest<{ trainers: Trainer[] }>("/admin/trainers"),
        apiRequest<{ batches: Batch[] }>("/admin/batches"),
      ]);
      setAssignments(aRes.assignments);
      setTrainers(tRes.trainers);
      setBatches(bRes.batches);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function onBatchChange(batchId: string) {
    setForm((f) => ({ ...f, batchId, courseId: "" }));
    setBatchCourses([]);
    if (!batchId) return;

    setCoursesLoading(true);
    try {
      const res = await apiRequest<{ courses: Course[] }>(`/admin/batches/${batchId}/courses`);
      setBatchCourses(res.courses);
    } catch {
      setBatchCourses([]);
    } finally {
      setCoursesLoading(false);
    }
  }

  async function createAssignment(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/admin/trainer-assignments", "POST", {
        trainerId: form.trainerId,
        batchId: form.batchId,
        courseId: form.courseId || undefined,
      });
      setForm({ trainerId: "", batchId: "", courseId: "" });
      setBatchCourses([]);
      setShowForm(false);
      setMessage("Trainer assigned successfully.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign trainer");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeAssignment(id: string) {
    if (!window.confirm("Remove this trainer assignment?")) return;
    setError("");
    try {
      await apiRequest(`/admin/trainer-assignments/${id}`, "DELETE");
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      setMessage("Assignment removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove assignment");
    }
  }

  const filtered = useMemo(() => {
    let list = assignments;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          (a.trainer_name ?? "").toLowerCase().includes(q) ||
          a.trainer_email.toLowerCase().includes(q) ||
          a.batch_name.toLowerCase().includes(q) ||
          (a.course_title ?? "").toLowerCase().includes(q) ||
          (a.program_title ?? "").toLowerCase().includes(q)
      );
    }
    if (filterBatch !== "all") list = list.filter((a) => a.batch_id === filterBatch);
    if (filterTrainer !== "all") list = list.filter((a) => a.trainer_id === filterTrainer);
    return list;
  }, [assignments, search, filterBatch, filterTrainer]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startRow = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(safePage * pageSize, filtered.length);

  const hasActiveFilters = search !== "" || filterBatch !== "all" || filterTrainer !== "all";

  // Get selected batch info for the form
  const selectedBatch = batches.find((b) => b.id === form.batchId);

  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      {showForm ? (
        <div className="dt-form-card">
          <h4>Assign Trainer</h4>
          <form className="form" onSubmit={(e) => void createAssignment(e)}>
            <label>
              Trainer
              <select
                required
                value={form.trainerId}
                onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))}
              >
                <option value="">Select Trainer…</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name || t.email}</option>
                ))}
              </select>
            </label>
            <label>
              Batch
              <select
                required
                value={form.batchId}
                onChange={(e) => void onBatchChange(e.target.value)}
              >
                <option value="">Select Batch…</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.program_title ? ` (${b.program_title})` : ""}</option>
                ))}
              </select>
            </label>
            {selectedBatch?.program_title ? (
              <label>
                Program (auto)
                <input type="text" readOnly value={selectedBatch.program_title} className="vm-input-readonly" />
              </label>
            ) : null}
            <label>
              Course (optional)
              <select
                value={form.courseId}
                onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                disabled={!form.batchId || coursesLoading}
              >
                <option value="">{coursesLoading ? "Loading…" : batchCourses.length === 0 && form.batchId ? "No courses in batch" : "All Courses (optional)"}</option>
                {batchCourses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
            <div className="row-inline" style={{ gap: "0.5rem" }}>
              <button type="submit" className="button" disabled={submitting}>
                {submitting ? "Assigning…" : "Assign Trainer"}
              </button>
              <button type="button" className="button danger" onClick={() => { setShowForm(false); setForm({ trainerId: "", batchId: "", courseId: "" }); setBatchCourses([]); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="dt-container">
        <div className="dt-header">
          <h3>Trainer Assignments</h3>
          <div className="dt-header-actions">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{assignments.length} total</span>
            <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "+ Assign Trainer"}
            </button>
          </div>
        </div>

        <div className="dt-filters">
          <div className="dt-search">
            <span className="dt-search-icon">🔍</span>
            <input placeholder="Search trainer, batch, course…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="dt-select" value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select className="dt-select" value={filterTrainer} onChange={(e) => setFilterTrainer(e.target.value)}>
            <option value="all">All Trainers</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name || t.email}</option>
            ))}
          </select>
          {hasActiveFilters ? (
            <button type="button" className="dt-clear-btn" onClick={() => { setSearch(""); setFilterBatch("all"); setFilterTrainer("all"); }}>
              ✕ Reset
            </button>
          ) : null}
        </div>

        <div className="dt-info">
          <span>Showing {startRow}–{endRow} of {filtered.length} assignment{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th>Trainer</th>
                <th>Batch</th>
                <th>Program</th>
                <th>Course</th>
                <th>Assigned</th>
                <th style={{ width: "80px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="dt-loading">Loading…</td></tr>
              ) : !paginated.length ? (
                <tr className="dt-empty"><td colSpan={6}>No trainer assignments found.</td></tr>
              ) : paginated.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="dt-name-cell">
                      <div className="dt-avatar">{(a.trainer_name ?? a.trainer_email).charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{a.trainer_name || "—"}</div>
                        <div className="dt-name-secondary">{a.trainer_email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="dt-cell-tag">{a.batch_name}</span></td>
                  <td><span className="dt-name-secondary">{a.program_title || "—"}</span></td>
                  <td>{a.course_title ? <span className="dt-cell-tag">{a.course_title}</span> : <span className="dt-name-secondary">All</span>}</td>
                  <td><span className="dt-name-secondary">{new Date(a.created_at).toLocaleDateString()}</span></td>
                  <td>
                    <button type="button" className="dt-action-btn danger" onClick={() => void removeAssignment(a.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="dt-footer">
          <div className="dt-rows-per-page">
            <span>Rows per page:</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {ROWS_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="dt-pagination">
            <button type="button" className="dt-page-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>««</button>
            <button type="button" className="dt-page-btn" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => { if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis"); acc.push(p); return acc; }, [])
              .map((item, idx) =>
                item === "ellipsis" ? <span key={`e${idx}`} className="dt-page-ellipsis">…</span> : <button key={item} type="button" className={`dt-page-btn ${item === safePage ? "active" : ""}`} onClick={() => setPage(item)}>{item}</button>
              )}
            <button type="button" className="dt-page-btn" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
            <button type="button" className="dt-page-btn" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»»</button>
          </div>
        </div>
      </div>
    </>
  );
}
