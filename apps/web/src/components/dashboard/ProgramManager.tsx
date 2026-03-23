"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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

export function ProgramManager() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [allCourses, setAllCourses] = useState<AllCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });

  // Expanded program
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [programCourses, setProgramCourses] = useState<Course[]>([]);
  const [programBatches, setProgramBatches] = useState<ProgramBatch[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // Dynamic search to add course
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [pRes, cRes] = await Promise.all([
        apiRequest<{ programs: Program[] }>("/admin/programs"),
        apiRequest<{ courses: AllCourse[] }>("/admin/courses"),
      ]);
      setPrograms(pRes.programs);
      setAllCourses(cRes.courses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function loadProgramCourses(programId: string) {
    setCoursesLoading(true);
    try {
      const [cRes, bRes] = await Promise.all([
        apiRequest<{ courses: Course[] }>(`/admin/programs/${programId}/courses`),
        apiRequest<{ batches: ProgramBatch[] }>(`/admin/programs/${programId}/batches`),
      ]);
      setProgramCourses(cRes.courses);
      setProgramBatches(bRes.batches);
    } catch {
      setProgramCourses([]);
      setProgramBatches([]);
    } finally {
      setCoursesLoading(false);
    }
  }

  function toggleExpand(programId: string) {
    if (expandedId === programId) {
      setExpandedId(null);
      setProgramCourses([]);
      setProgramBatches([]);
      setSearchQuery("");
      setShowSuggestions(false);
    } else {
      setExpandedId(programId);
      setSearchQuery("");
      setShowSuggestions(false);
      void loadProgramCourses(programId);
    }
  }

  async function createProgram(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/admin/programs", "POST", {
        title: form.title,
        description: form.description || undefined,
      });
      setForm({ title: "", description: "" });
      setShowForm(false);
      setMessage("Program created.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create program");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteProgram(id: string) {
    if (!window.confirm("Delete this program? Batches will be unlinked.")) return;
    setError("");
    try {
      await apiRequest(`/admin/programs/${id}`, "DELETE");
      setPrograms((prev) => prev.filter((p) => p.id !== id));
      if (expandedId === id) {
        setExpandedId(null);
        setProgramCourses([]);
      }
      setMessage("Program deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete program");
    }
  }

  async function assignCourse(courseId: string) {
    if (!expandedId) return;
    setError("");
    setMessage("");
    try {
      const res = await apiRequest<{ message: string }>(`/admin/programs/${expandedId}/courses`, "POST", {
        courseId,
        sortOrder: programCourses.length,
      });
      setMessage(res.message);
      setSearchQuery("");
      setShowSuggestions(false);
      await loadProgramCourses(expandedId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign course");
    }
  }

  async function removeCourse(courseId: string) {
    if (!expandedId) return;
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/programs/${expandedId}/courses/${courseId}`, "DELETE");
      setMessage("Course removed from program.");
      await loadProgramCourses(expandedId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove course");
    }
  }

  async function toggleProgramStatus(program: Program) {
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/programs/${program.id}/status`, "PATCH", { isActive: !program.is_active });
      setMessage(`Program ${program.is_active ? "deactivated" : "activated"}.`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  const assignedIds = useMemo(() => new Set(programCourses.map((c) => c.id)), [programCourses]);
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allCourses
      .filter((c) => !assignedIds.has(c.id))
      .filter((c) => {
        const title = c.title.toLowerCase();
        const desc = (c.description ?? "").toLowerCase();
        return title.includes(q) || desc.includes(q);
      })
      .slice(0, 8);
  }, [searchQuery, allCourses, assignedIds]);

  return (
    <div className="stack">
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="filter-bar">
        <div className="filter-bar-left">
          <span className="filter-count">{programs.length} program{programs.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="filter-bar-right">
          <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Create Program"}
          </button>
        </div>
      </div>

      {showForm ? (
        <section className="card">
          <header className="card-header">
            <h3>New Program</h3>
          </header>
          <form className="form" onSubmit={(e) => void createProgram(e)}>
            <label>
              Program Title
              <input required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </label>
            <label>
              Description
              <textarea maxLength={1000} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <button type="submit" className="button" disabled={submitting}>
              {submitting ? "Creating…" : "Create Program"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="card">
        <header className="card-header">
          <h3>Programs</h3>
        </header>
        {loading ? <p className="muted">Loading…</p> : null}
        <ul className="list" style={{ gap: 0 }}>
          {programs.map((p) => {
            const isExpanded = expandedId === p.id;
            return (
              <li className="list-item" key={p.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div className="row-inline">
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => toggleExpand(p.id)}>
                    <div className="row-inline" style={{ gap: "0.4rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                      <strong>{p.title}</strong>
                      <span style={{
                        fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "0.25rem", fontWeight: 600,
                        background: p.is_active ? "rgba(46,204,113,0.15)" : "rgba(231,76,60,0.15)",
                        color: p.is_active ? "#2ecc71" : "#e74c3c"
                      }}>
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="muted" style={{ fontSize: "0.78rem", marginLeft: "1rem" }}>
                      📚 {p.course_count} course{p.course_count !== 1 ? "s" : ""} · {new Date(p.created_at).toLocaleDateString()}
                    </p>
                    {p.description ? (
                      <p className="muted" style={{ fontSize: "0.75rem", marginLeft: "1rem" }}>{p.description}</p>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      type="button"
                      className={p.is_active ? "button danger" : "button"}
                      style={{ fontSize: "0.75rem" }}
                      onClick={() => void toggleProgramStatus(p)}
                    >
                      {p.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" className="button danger" style={{ fontSize: "0.75rem" }} onClick={() => void deleteProgram(p.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <div style={{ marginTop: "0.75rem", paddingLeft: "1rem", borderLeft: "2px solid var(--border)" }}>
                    {/* Dynamic search to add course */}
                    <div ref={searchRef} style={{ position: "relative", marginBottom: "0.75rem" }}>
                      <input
                        type="text"
                        placeholder="Search course by title to add…"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                        onFocus={() => { if (searchQuery.trim()) setShowSuggestions(true); }}
                        style={{ width: "100%" }}
                      />
                      {showSuggestions && suggestions.length > 0 ? (
                        <ul style={{
                          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                          background: "var(--card-bg, #1e1e2e)", border: "1px solid var(--border)",
                          borderRadius: "0.5rem", margin: 0, padding: 0, listStyle: "none",
                          maxHeight: "220px", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.3)"
                        }}>
                          {suggestions.map((c) => (
                            <li
                              key={c.id}
                              style={{
                                padding: "0.5rem 0.75rem", cursor: "pointer",
                                borderBottom: "1px solid var(--border)",
                                display: "flex", justifyContent: "space-between", alignItems: "center"
                              }}
                              onMouseDown={() => void assignCourse(c.id)}
                            >
                              <div>
                                <strong style={{ fontSize: "0.85rem" }}>{c.title}</strong>
                                {c.description ? (
                                  <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>{c.description}</span>
                                ) : null}
                              </div>
                              <span style={{ fontSize: "0.7rem", color: "var(--accent)", fontWeight: 600 }}>+ Add</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {showSuggestions && searchQuery.trim() && suggestions.length === 0 ? (
                        <div style={{
                          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                          background: "var(--card-bg, #1e1e2e)", border: "1px solid var(--border)",
                          borderRadius: "0.5rem", padding: "0.5rem 0.75rem",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.3)"
                        }}>
                          <span className="muted" style={{ fontSize: "0.8rem" }}>No matching courses found</span>
                        </div>
                      ) : null}
                    </div>

                    {/* Assigned courses list */}
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem", color: "var(--muted)" }}>
                      Courses in Program ({programCourses.length})
                    </div>
                    {coursesLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>Loading courses…</p> : null}
                    {!coursesLoading && programCourses.length === 0 ? (
                      <p className="muted" style={{ fontSize: "0.8rem" }}>No courses assigned yet. Use the search above to add courses.</p>
                    ) : null}
                    {!coursesLoading && programCourses.length > 0 ? (
                      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {programCourses.map((c, idx) => (
                          <li key={c.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "0.4rem 0.5rem", borderBottom: "1px solid var(--border)",
                            fontSize: "0.82rem"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{
                                width: "24px", height: "24px", borderRadius: "50%",
                                background: "var(--accent)", color: "#fff", display: "flex",
                                alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, flexShrink: 0
                              }}>
                                {idx + 1}
                              </span>
                              <div>
                                <div style={{ fontWeight: 500 }}>{c.title}</div>
                                {c.description ? (
                                  <div className="muted" style={{ fontSize: "0.72rem" }}>{c.description}</div>
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="button danger"
                              style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem" }}
                              onClick={() => void removeCourse(c.id)}
                              title="Remove from program"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {/* Associated Batches */}
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, marginTop: "1rem", marginBottom: "0.4rem", color: "var(--muted)" }}>
                      Batches using this Program ({programBatches.length})
                    </div>
                    {coursesLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>Loading…</p> : null}
                    {!coursesLoading && programBatches.length === 0 ? (
                      <p className="muted" style={{ fontSize: "0.8rem" }}>No batches assigned to this program yet.</p>
                    ) : null}
                    {!coursesLoading && programBatches.length > 0 ? (
                      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {programBatches.map((b) => (
                          <li key={b.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "0.4rem 0.5rem", borderBottom: "1px solid var(--border)",
                            fontSize: "0.82rem"
                          }}>
                            <div>
                              <span style={{ fontWeight: 500 }}>{b.name}</span>
                              <span className="muted" style={{ fontSize: "0.72rem", marginLeft: "0.5rem" }}>
                                {b.trainer_name ?? "No trainer"} · {b.student_count} student{b.student_count !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <span style={{
                              fontSize: "0.65rem", padding: "0.1rem 0.35rem", borderRadius: "0.25rem", fontWeight: 600,
                              background: b.is_active ? "rgba(46,204,113,0.15)" : "rgba(231,76,60,0.15)",
                              color: b.is_active ? "#2ecc71" : "#e74c3c"
                            }}>
                              {b.is_active ? "Active" : "Inactive"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
          {!programs.length && !loading ? (
            <li className="list-item muted">No programs yet. Create one to start organizing courses.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
