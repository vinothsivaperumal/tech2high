"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "../../lib/api";

interface Batch {
  id: string;
  name: string;
  is_active: boolean;
  trainer_id: string;
  trainer_email: string | null;
  trainer_name: string | null;
  program_id: string | null;
  program_title: string | null;
  zoom_link: string | null;
  student_count: number;
  created_at: string;
}

interface Trainer {
  id: string;
  email: string;
  full_name: string | null;
}

interface Student {
  id: string;
  email: string;
  full_name: string | null;
}

interface Program {
  id: string;
  title: string;
}

interface BatchStudent {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  experience_level: string | null;
}

interface BatchCourse {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

interface AllCourse {
  id: string;
  title: string;
  description: string | null;
}

const ROWS_OPTIONS = [5, 10, 25, 50];

export function BatchManager() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [allCourses, setAllCourses] = useState<AllCourse[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", trainerId: "", programId: "", zoomLink: "" });

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [batchStudents, setBatchStudents] = useState<BatchStudent[]>([]);
  const [batchCourses, setBatchCourses] = useState<BatchCourse[]>([]);
  const [batchStudentsLoading, setBatchStudentsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [showCourseSuggestions, setShowCourseSuggestions] = useState(false);
  const courseSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void loadData(); }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, pageSize]);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
      if (courseSearchRef.current && !courseSearchRef.current.contains(e.target as Node)) setShowCourseSuggestions(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [bRes, tRes, sRes, pRes, cRes] = await Promise.all([
        apiRequest<{ batches: Batch[] }>("/admin/batches"),
        apiRequest<{ trainers: Trainer[] }>("/admin/trainers"),
        apiRequest<{ students: Student[] }>("/admin/students"),
        apiRequest<{ programs: Program[] }>("/admin/programs"),
        apiRequest<{ courses: AllCourse[] }>("/admin/courses"),
      ]);
      setBatches(bRes.batches); setTrainers(tRes.trainers); setAllStudents(sRes.students); setPrograms(pRes.programs); setAllCourses(cRes.courses);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load data"); }
    finally { setLoading(false); }
  }

  async function loadBatchDetails(batchId: string) {
    setBatchStudentsLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([apiRequest<{ students: BatchStudent[] }>(`/admin/batches/${batchId}/students`), apiRequest<{ courses: BatchCourse[] }>(`/admin/batches/${batchId}/courses`)]);
      setBatchStudents(sRes.students); setBatchCourses(cRes.courses);
    } catch { setBatchStudents([]); setBatchCourses([]); }
    finally { setBatchStudentsLoading(false); }
  }

  function toggleExpand(batchId: string) {
    if (expandedId === batchId) { setExpandedId(null); setBatchStudents([]); setBatchCourses([]); setSearchQuery(""); setCourseSearchQuery(""); setShowSuggestions(false); setShowCourseSuggestions(false); }
    else { setExpandedId(batchId); setSearchQuery(""); setCourseSearchQuery(""); setShowSuggestions(false); setShowCourseSuggestions(false); void loadBatchDetails(batchId); }
  }

  async function createBatch(e: FormEvent) {
    e.preventDefault(); setSubmitting(true); setError(""); setMessage("");
    try { await apiRequest("/admin/batches", "POST", { name: form.name, trainerId: form.trainerId, programId: form.programId || undefined, zoomLink: form.zoomLink || undefined }); setForm({ name: "", trainerId: "", programId: "", zoomLink: "" }); setShowForm(false); setMessage("Batch created."); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to create batch"); }
    finally { setSubmitting(false); }
  }

  async function deleteBatch(id: string) {
    if (!window.confirm("Delete this batch? All related data will be removed.")) return;
    setError("");
    try { await apiRequest(`/admin/batches/${id}`, "DELETE"); setBatches((p) => p.filter((b) => b.id !== id)); if (expandedId === id) { setExpandedId(null); setBatchStudents([]); } setMessage("Batch deleted."); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to delete batch"); }
  }

  async function assignStudent(studentId: string) {
    if (!expandedId) return; setError(""); setMessage("");
    try { const res = await apiRequest<{ message: string }>(`/admin/students/${studentId}/batches`, "POST", { batchId: expandedId }); setMessage(res.message); setSearchQuery(""); setShowSuggestions(false); await loadBatchDetails(expandedId); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to assign student"); }
  }

  async function removeStudent(studentId: string) {
    if (!expandedId) return; setError(""); setMessage("");
    try { await apiRequest(`/admin/students/${studentId}/batches/${expandedId}`, "DELETE"); setMessage("Student removed from batch."); await loadBatchDetails(expandedId); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to remove student"); }
  }

  async function toggleBatchStatus(batch: Batch) {
    setError(""); setMessage("");
    try { await apiRequest(`/admin/batches/${batch.id}/status`, "PATCH", { isActive: !batch.is_active }); setMessage(`Batch ${batch.is_active ? "deactivated" : "activated"}.`); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to update status"); }
  }

  async function assignCourse(courseId: string) {
    if (!expandedId) return; setError(""); setMessage("");
    try { const res = await apiRequest<{ message: string }>(`/admin/batches/${expandedId}/courses`, "POST", { courseId, sortOrder: batchCourses.length }); setMessage(res.message); setCourseSearchQuery(""); setShowCourseSuggestions(false); await loadBatchDetails(expandedId); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to assign course"); }
  }

  async function removeCourse(courseId: string) {
    if (!expandedId) return; setError(""); setMessage("");
    try { await apiRequest(`/admin/batches/${expandedId}/courses/${courseId}`, "DELETE"); setMessage("Course removed from batch."); await loadBatchDetails(expandedId); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to remove course"); }
  }

  async function syncFromProgram() {
    if (!expandedId) return;
    const batch = batches.find((b) => b.id === expandedId);
    if (!batch?.program_id) return;
    setError(""); setMessage("");
    try { const res = await apiRequest<{ message: string; added: number }>(`/admin/batches/${expandedId}/sync-program-courses`, "POST"); setMessage(res.message); await loadBatchDetails(expandedId); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to sync courses"); }
  }

  const assignedIds = useMemo(() => new Set(batchStudents.map((s) => s.id)), [batchStudents]);
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allStudents.filter((s) => !assignedIds.has(s.id)).filter((s) => (s.full_name ?? "").toLowerCase().includes(q) || s.email.toLowerCase().includes(q)).slice(0, 8);
  }, [searchQuery, allStudents, assignedIds]);

  const assignedCourseIds = useMemo(() => new Set(batchCourses.map((c) => c.id)), [batchCourses]);
  const courseSuggestions = useMemo(() => {
    if (!courseSearchQuery.trim()) return [];
    const q = courseSearchQuery.toLowerCase();
    return allCourses.filter((c) => !assignedCourseIds.has(c.id)).filter((c) => c.title.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [courseSearchQuery, allCourses, assignedCourseIds]);

  const filtered = useMemo(() => {
    let list = batches;
    if (search) { const q = search.toLowerCase(); list = list.filter((b) => b.name.toLowerCase().includes(q) || (b.trainer_name ?? "").toLowerCase().includes(q) || (b.program_title ?? "").toLowerCase().includes(q)); }
    if (filterStatus !== "all") list = list.filter((b) => filterStatus === "active" ? b.is_active : !b.is_active);
    return list;
  }, [batches, search, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startRow = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(safePage * pageSize, filtered.length);

  const hasActiveFilters = search !== "" || filterStatus !== "all";
  const filterTags: { label: string; onClear: () => void }[] = [];
  if (search) filterTags.push({ label: `Search: ${search}`, onClear: () => setSearch("") });
  if (filterStatus !== "all") filterTags.push({ label: `Status: ${filterStatus}`, onClear: () => setFilterStatus("all") });

  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      {showForm ? (
        <div className="dt-form-card">
          <h4>New Batch</h4>
          <form className="form" onSubmit={(e) => void createBatch(e)}>
            <label>Batch Name<input required minLength={2} maxLength={200} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
            <label>Assign Trainer
              <select required value={form.trainerId} onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))}>
                <option value="">Select Trainer…</option>
                {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}
              </select>
            </label>
            <label>Assign Program
              <select value={form.programId} onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))}>
                <option value="">No Program</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <label>Zoom Meeting Link
              <input type="url" placeholder="https://zoom.us/j/..." value={form.zoomLink} onChange={(e) => setForm((f) => ({ ...f, zoomLink: e.target.value }))} maxLength={500} />
            </label>
            <div className="row-inline" style={{ gap: "0.5rem" }}>
              <button type="submit" className="button" disabled={submitting}>{submitting ? "Creating…" : "Create Batch"}</button>
              <button type="button" className="button danger" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="dt-container">
        <div className="dt-header">
          <h3>Batches Management</h3>
          <div className="dt-header-actions">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{batches.length} total</span>
            <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ Create Batch"}</button>
          </div>
        </div>

        <div className="dt-filters">
          <div className="dt-search">
            <span className="dt-search-icon">🔍</span>
            <input placeholder="Search batch, trainer, program…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="dt-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {hasActiveFilters ? <button type="button" className="dt-clear-btn" onClick={() => { setSearch(""); setFilterStatus("all"); }}>✕ Reset</button> : null}
        </div>

        {filterTags.length > 0 ? (
          <div className="dt-filter-tags">
            {filterTags.map((t) => <span className="dt-filter-tag" key={t.label}>{t.label} <button type="button" onClick={t.onClear}>✕</button></span>)}
          </div>
        ) : null}

        <div className="dt-info">
          <span>Showing {startRow}–{endRow} of {filtered.length} batch{filtered.length !== 1 ? "es" : ""}</span>
        </div>

        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ width: "36px" }}></th>
                <th>Batch Name</th>
                <th>Trainer</th>
                <th>Program</th>
                <th>Students</th>
                <th>Status</th>
                <th>Zoom</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="dt-loading">Loading…</td></tr>
              ) : !paginated.length ? (
                <tr className="dt-empty"><td colSpan={9}>No batches found.</td></tr>
              ) : paginated.map((b) => {
                const isExpanded = expandedId === b.id;
                return (
                  <>{/* Use key on first tr */}
                    <tr key={b.id} className={isExpanded ? "expanded" : ""}>
                      <td style={{ textAlign: "center", cursor: "pointer" }} onClick={() => toggleExpand(b.id)}>
                        <span style={{ fontSize: "0.7rem", color: "var(--muted)", transition: "transform 0.2s", display: "inline-block", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                      </td>
                      <td><strong>{b.name}</strong></td>
                      <td><span className="dt-name-secondary">{b.trainer_name || b.trainer_email || "—"}</span></td>
                      <td>{b.program_title ? <span className="dt-cell-tag">{b.program_title}</span> : <span className="dt-name-secondary">—</span>}</td>
                      <td><span className="dt-cell-tag">{b.student_count}</span></td>
                      <td><span className={`dt-badge ${b.is_active ? "dt-badge-active" : "dt-badge-inactive"}`}>{b.is_active ? "Active" : "Inactive"}</span></td>
                      <td>{b.zoom_link ? <a href={b.zoom_link} target="_blank" rel="noopener noreferrer" className="zoom-join-btn">📹 Join</a> : <span className="dt-name-secondary">—</span>}</td>
                      <td><span className="dt-name-secondary">{new Date(b.created_at).toLocaleDateString()}</span></td>
                      <td>
                        <div className="dt-actions">
                          <button type="button" className="dt-action-btn" onClick={() => toggleExpand(b.id)}>{isExpanded ? "Close" : "Manage"}</button>
                          <button type="button" className="dt-action-btn" onClick={() => void toggleBatchStatus(b)}>{b.is_active ? "Deactivate" : "Activate"}</button>
                          <button type="button" className="dt-action-btn danger" onClick={() => void deleteBatch(b.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr key={`${b.id}-expand`} className="dt-expand-row">
                        <td colSpan={9}>
                          <div className="dt-expand-content">
                            {/* Zoom Link section */}
                            <div style={{ marginBottom: "1.25rem" }}>
                              <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text)" }}>
                                Zoom Meeting Link
                              </div>
                              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                <input
                                  type="url"
                                  placeholder="https://zoom.us/j/..."
                                  defaultValue={b.zoom_link ?? ""}
                                  id={`zoom-input-${b.id}`}
                                  style={{ flex: 1, padding: "0.4rem 0.6rem", background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.4rem", color: "var(--text)", fontSize: "0.82rem" }}
                                />
                                <button type="button" className="dt-action-btn" onClick={async () => {
                                  const input = document.getElementById(`zoom-input-${b.id}`) as HTMLInputElement;
                                  const val = input?.value?.trim() || null;
                                  try { await apiRequest(`/admin/batches/${b.id}/zoom-link`, "PATCH", { zoomLink: val }); setMessage("Zoom link updated."); await loadData(); }
                                  catch (e) { setError(e instanceof Error ? e.message : "Failed to update zoom link"); }
                                }}>Save</button>
                                {b.zoom_link ? <a href={b.zoom_link} target="_blank" rel="noopener noreferrer" className="zoom-join-btn">📹 Join</a> : null}
                              </div>
                            </div>
                            {/* Students section */}
                            <div style={{ marginBottom: "1.25rem" }}>
                              <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text)" }}>
                                Assigned Students ({batchStudents.length})
                              </div>
                              <div ref={searchRef} style={{ position: "relative", marginBottom: "0.5rem" }}>
                                <input type="text" placeholder="Search student by name or email to add…" value={searchQuery}
                                  onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                                  onFocus={() => { if (searchQuery.trim()) setShowSuggestions(true); }}
                                  style={{ width: "100%", padding: "0.4rem 0.6rem", background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.4rem", color: "var(--text)", fontSize: "0.82rem" }}
                                />
                                {showSuggestions && suggestions.length > 0 ? (
                                  <ul style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.5rem", margin: 0, padding: 0, listStyle: "none", maxHeight: "220px", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                                    {suggestions.map((s) => (
                                      <li key={s.id} style={{ padding: "0.5rem 0.75rem", cursor: "pointer", borderBottom: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseDown={() => void assignStudent(s.id)}>
                                        <div><strong style={{ fontSize: "0.85rem" }}>{s.full_name || "—"}</strong><span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>{s.email}</span></div>
                                        <span style={{ fontSize: "0.7rem", color: "var(--accent)", fontWeight: 600 }}>+ Add</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                {showSuggestions && searchQuery.trim() && suggestions.length === 0 ? (
                                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                                    <span className="muted" style={{ fontSize: "0.8rem" }}>No matching students found</span>
                                  </div>
                                ) : null}
                              </div>
                              {batchStudentsLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>Loading students…</p> : null}
                              {!batchStudentsLoading && batchStudents.length === 0 ? <p className="muted" style={{ fontSize: "0.8rem" }}>No students assigned yet.</p> : null}
                              {!batchStudentsLoading && batchStudents.length > 0 ? (
                                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                                  {batchStudents.map((s) => (
                                    <li key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.82rem" }}>
                                      <div className="dt-name-cell">
                                        <div className="dt-avatar" style={{ width: "26px", height: "26px", fontSize: "0.65rem" }}>{(s.full_name ?? s.email).charAt(0).toUpperCase()}</div>
                                        <div>
                                          <div style={{ fontWeight: 500 }}>{s.full_name || "—"}</div>
                                          <div className="dt-name-secondary">{s.email}</div>
                                        </div>
                                        {s.experience_level ? <span className="dt-cell-tag">{s.experience_level}</span> : null}
                                      </div>
                                      <button type="button" className="dt-action-btn danger" style={{ fontSize: "0.7rem" }} onClick={() => void removeStudent(s.id)}>✕</button>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>

                            {/* Courses section */}
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>Courses in Batch ({batchCourses.length})</span>
                                {b.program_id ? <button type="button" className="dt-action-btn" onClick={() => void syncFromProgram()}>Sync from Program</button> : null}
                              </div>
                              <div ref={courseSearchRef} style={{ position: "relative", marginBottom: "0.5rem" }}>
                                <input type="text" placeholder="Search course by title to add…" value={courseSearchQuery}
                                  onChange={(e) => { setCourseSearchQuery(e.target.value); setShowCourseSuggestions(true); }}
                                  onFocus={() => { if (courseSearchQuery.trim()) setShowCourseSuggestions(true); }}
                                  style={{ width: "100%", padding: "0.4rem 0.6rem", background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.4rem", color: "var(--text)", fontSize: "0.82rem" }}
                                />
                                {showCourseSuggestions && courseSuggestions.length > 0 ? (
                                  <ul style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.5rem", margin: 0, padding: 0, listStyle: "none", maxHeight: "220px", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                                    {courseSuggestions.map((c) => (
                                      <li key={c.id} style={{ padding: "0.5rem 0.75rem", cursor: "pointer", borderBottom: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseDown={() => void assignCourse(c.id)}>
                                        <div><strong style={{ fontSize: "0.85rem" }}>{c.title}</strong>{c.description ? <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>{c.description}</span> : null}</div>
                                        <span style={{ fontSize: "0.7rem", color: "var(--accent)", fontWeight: 600 }}>+ Add</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                {showCourseSuggestions && courseSearchQuery.trim() && courseSuggestions.length === 0 ? (
                                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                                    <span className="muted" style={{ fontSize: "0.8rem" }}>No matching courses found</span>
                                  </div>
                                ) : null}
                              </div>
                              {batchStudentsLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>Loading…</p> : null}
                              {!batchStudentsLoading && batchCourses.length === 0 ? <p className="muted" style={{ fontSize: "0.8rem" }}>No courses assigned. {b.program_id ? "Click \"Sync from Program\" or search to add." : "Search to add courses."}</p> : null}
                              {!batchStudentsLoading && batchCourses.length > 0 ? (
                                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                                  {batchCourses.map((c, idx) => (
                                    <li key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.82rem" }}>
                                      <div className="dt-name-cell">
                                        <div className="dt-avatar" style={{ width: "24px", height: "24px", fontSize: "0.6rem" }}>{idx + 1}</div>
                                        <div>
                                          <div style={{ fontWeight: 500 }}>{c.title}</div>
                                          {c.description ? <div className="dt-name-secondary">{c.description}</div> : null}
                                        </div>
                                      </div>
                                      <button type="button" className="dt-action-btn danger" style={{ fontSize: "0.7rem" }} onClick={() => void removeCourse(c.id)}>✕</button>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
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
