"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, Fragment } from "react";

import { apiRequest } from "../../lib/api";

interface Program {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  course_count: number;
  created_at: string;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

interface ProgramBatch {
  id: string;
  name: string;
  is_active: boolean;
  trainer_name: string | null;
  student_count: number;
}

interface AllCourse {
  id: string;
  title: string;
  description: string | null;
}

const ROWS_OPTIONS = [5, 10, 25, 50];

export function ProgramManager() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [allCourses, setAllCourses] = useState<AllCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [programCourses, setProgramCourses] = useState<Course[]>([]);
  const [programBatches, setProgramBatches] = useState<ProgramBatch[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void loadData(); }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, pageSize]);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [pRes, cRes] = await Promise.all([apiRequest<{ programs: Program[] }>("/admin/programs"), apiRequest<{ courses: AllCourse[] }>("/admin/courses")]);
      setPrograms(pRes.programs); setAllCourses(cRes.courses);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load data"); }
    finally { setLoading(false); }
  }

  async function loadProgramCourses(programId: string) {
    setCoursesLoading(true);
    try {
      const [cRes, bRes] = await Promise.all([apiRequest<{ courses: Course[] }>(`/admin/programs/${programId}/courses`), apiRequest<{ batches: ProgramBatch[] }>(`/admin/programs/${programId}/batches`)]);
      setProgramCourses(cRes.courses); setProgramBatches(bRes.batches);
    } catch { setProgramCourses([]); setProgramBatches([]); }
    finally { setCoursesLoading(false); }
  }

  function toggleExpand(programId: string) {
    if (expandedId === programId) { setExpandedId(null); setProgramCourses([]); setProgramBatches([]); setSearchQuery(""); setShowSuggestions(false); }
    else { setExpandedId(programId); setSearchQuery(""); setShowSuggestions(false); void loadProgramCourses(programId); }
  }

  async function createProgram(e: FormEvent) {
    e.preventDefault(); setSubmitting(true); setError(""); setMessage("");
    try { await apiRequest("/admin/programs", "POST", { title: form.title, description: form.description || undefined }); setForm({ title: "", description: "" }); setShowForm(false); setMessage("Program created."); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to create program"); }
    finally { setSubmitting(false); }
  }

  async function deleteProgram(id: string) {
    if (!window.confirm("Delete this program? Batches will be unlinked.")) return;
    setError("");
    try { await apiRequest(`/admin/programs/${id}`, "DELETE"); setPrograms((p) => p.filter((pr) => pr.id !== id)); if (expandedId === id) { setExpandedId(null); setProgramCourses([]); } setMessage("Program deleted."); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to delete program"); }
  }

  async function assignCourse(courseId: string) {
    if (!expandedId) return; setError(""); setMessage("");
    try { const res = await apiRequest<{ message: string }>(`/admin/programs/${expandedId}/courses`, "POST", { courseId, sortOrder: programCourses.length }); setMessage(res.message); setSearchQuery(""); setShowSuggestions(false); await loadProgramCourses(expandedId); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to assign course"); }
  }

  async function removeCourse(courseId: string) {
    if (!expandedId) return; setError(""); setMessage("");
    try { await apiRequest(`/admin/programs/${expandedId}/courses/${courseId}`, "DELETE"); setMessage("Course removed from program."); await loadProgramCourses(expandedId); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to remove course"); }
  }

  async function toggleProgramStatus(program: Program) {
    setError(""); setMessage("");
    try { await apiRequest(`/admin/programs/${program.id}/status`, "PATCH", { isActive: !program.is_active }); setMessage(`Program ${program.is_active ? "deactivated" : "activated"}.`); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to update status"); }
  }

  const assignedIds = useMemo(() => new Set(programCourses.map((c) => c.id)), [programCourses]);
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allCourses.filter((c) => !assignedIds.has(c.id)).filter((c) => c.title.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [searchQuery, allCourses, assignedIds]);

  const filtered = useMemo(() => {
    let list = programs;
    if (search) { const q = search.toLowerCase(); list = list.filter((p) => p.title.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)); }
    if (filterStatus !== "all") list = list.filter((p) => filterStatus === "active" ? p.is_active : !p.is_active);
    return list;
  }, [programs, search, filterStatus]);

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
          <h4>New Program</h4>
          <form className="form" onSubmit={(e) => void createProgram(e)}>
            <label>Program Title<input required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
            <label>Description<textarea maxLength={1000} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label>
            <div className="row-inline" style={{ gap: "0.5rem" }}>
              <button type="submit" className="button" disabled={submitting}>{submitting ? "Creating…" : "Create Program"}</button>
              <button type="button" className="button danger" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="dt-container">
        <div className="dt-header">
          <h3>Programs Management</h3>
          <div className="dt-header-actions">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{programs.length} total</span>
            <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ Create Program"}</button>
          </div>
        </div>

        <div className="dt-filters">
          <div className="dt-search">
            <span className="dt-search-icon">🔍</span>
            <input placeholder="Search programs…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
          <span>Showing {startRow}–{endRow} of {filtered.length} program{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ width: "36px" }}></th>
                <th>Title</th>
                <th>Description</th>
                <th>Courses</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="dt-loading">Loading…</td></tr>
              ) : !paginated.length ? (
                <tr className="dt-empty"><td colSpan={7}>No programs found.</td></tr>
              ) : paginated.map((p) => {
                const isExpanded = expandedId === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr className={isExpanded ? "expanded" : ""}>
                      <td style={{ textAlign: "center", cursor: "pointer" }} onClick={() => toggleExpand(p.id)}>
                        <span style={{ fontSize: "0.7rem", color: "var(--muted)", transition: "transform 0.2s", display: "inline-block", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                      </td>
                      <td><strong>{p.title}</strong></td>
                      <td><span className="dt-name-secondary" style={{ maxWidth: "220px", display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description || "—"}</span></td>
                      <td><span className="dt-cell-tag">{p.course_count}</span></td>
                      <td><span className={`dt-badge ${p.is_active ? "dt-badge-active" : "dt-badge-inactive"}`}>{p.is_active ? "Active" : "Inactive"}</span></td>
                      <td><span className="dt-name-secondary">{new Date(p.created_at).toLocaleDateString()}</span></td>
                      <td>
                        <div className="dt-actions">
                          <button type="button" className="dt-action-btn" onClick={() => toggleExpand(p.id)}>{isExpanded ? "Close" : "Manage"}</button>
                          <button type="button" className="dt-action-btn" onClick={() => void toggleProgramStatus(p)}>{p.is_active ? "Deactivate" : "Activate"}</button>
                          <button type="button" className="dt-action-btn danger" onClick={() => void deleteProgram(p.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr key={`${p.id}-expand`} className="dt-expand-row">
                        <td colSpan={7}>
                          <div className="dt-expand-content">
                            {/* Courses section */}
                            <div style={{ marginBottom: "1.25rem" }}>
                              <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text)" }}>
                                Courses in Program ({programCourses.length})
                              </div>
                              <div ref={searchRef} style={{ position: "relative", marginBottom: "0.5rem" }}>
                                <input type="text" placeholder="Search course by title to add…" value={searchQuery}
                                  onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                                  onFocus={() => { if (searchQuery.trim()) setShowSuggestions(true); }}
                                  style={{ width: "100%", padding: "0.4rem 0.6rem", background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.4rem", color: "var(--text)", fontSize: "0.82rem" }}
                                />
                                {showSuggestions && suggestions.length > 0 ? (
                                  <ul style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.5rem", margin: 0, padding: 0, listStyle: "none", maxHeight: "220px", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                                    {suggestions.map((c) => (
                                      <li key={c.id} style={{ padding: "0.5rem 0.75rem", cursor: "pointer", borderBottom: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseDown={() => void assignCourse(c.id)}>
                                        <div><strong style={{ fontSize: "0.85rem" }}>{c.title}</strong>{c.description ? <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>{c.description}</span> : null}</div>
                                        <span style={{ fontSize: "0.7rem", color: "var(--accent)", fontWeight: 600 }}>+ Add</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                {showSuggestions && searchQuery.trim() && suggestions.length === 0 ? (
                                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "var(--bg-1)", border: "1px solid var(--card-border)", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                                    <span className="muted" style={{ fontSize: "0.8rem" }}>No matching courses found</span>
                                  </div>
                                ) : null}
                              </div>
                              {coursesLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>Loading courses…</p> : null}
                              {!coursesLoading && programCourses.length === 0 ? <p className="muted" style={{ fontSize: "0.8rem" }}>No courses assigned yet.</p> : null}
                              {!coursesLoading && programCourses.length > 0 ? (
                                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                                  {programCourses.map((c, idx) => (
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

                            {/* Batches section */}
                            <div>
                              <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text)" }}>
                                Batches using this Program ({programBatches.length})
                              </div>
                              {coursesLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>Loading…</p> : null}
                              {!coursesLoading && programBatches.length === 0 ? <p className="muted" style={{ fontSize: "0.8rem" }}>No batches assigned to this program yet.</p> : null}
                              {!coursesLoading && programBatches.length > 0 ? (
                                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                                  {programBatches.map((b) => (
                                    <li key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.82rem" }}>
                                      <div className="dt-name-cell">
                                        <div className="dt-avatar" style={{ width: "24px", height: "24px", fontSize: "0.6rem" }}>{b.name.charAt(0).toUpperCase()}</div>
                                        <div>
                                          <div style={{ fontWeight: 500 }}>{b.name}</div>
                                          <div className="dt-name-secondary">{b.trainer_name ?? "No trainer"} · {b.student_count} student{b.student_count !== 1 ? "s" : ""}</div>
                                        </div>
                                      </div>
                                      <span className={`dt-badge ${b.is_active ? "dt-badge-active" : "dt-badge-inactive"}`}>{b.is_active ? "Active" : "Inactive"}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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
