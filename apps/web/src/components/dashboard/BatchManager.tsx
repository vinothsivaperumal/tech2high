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
  const [form, setForm] = useState({ name: "", trainerId: "", programId: "" });

  // Expanded batch
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [batchStudents, setBatchStudents] = useState<BatchStudent[]>([]);
  const [batchCourses, setBatchCourses] = useState<BatchCourse[]>([]);
  const [batchStudentsLoading, setBatchStudentsLoading] = useState(false);

  // Dynamic search to add student
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Dynamic search to add course
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [showCourseSuggestions, setShowCourseSuggestions] = useState(false);
  const courseSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadData();
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
      if (courseSearchRef.current && !courseSearchRef.current.contains(e.target as Node)) {
        setShowCourseSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [bRes, tRes, sRes, pRes, cRes] = await Promise.all([
        apiRequest<{ batches: Batch[] }>("/admin/batches"),
        apiRequest<{ trainers: Trainer[] }>("/admin/trainers"),
        apiRequest<{ students: Student[] }>("/admin/students"),
        apiRequest<{ programs: Program[] }>("/admin/programs"),
        apiRequest<{ courses: AllCourse[] }>("/admin/courses"),
      ]);
      setBatches(bRes.batches);
      setTrainers(tRes.trainers);
      setAllStudents(sRes.students);
      setPrograms(pRes.programs);
      setAllCourses(cRes.courses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function loadBatchDetails(batchId: string) {
    setBatchStudentsLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        apiRequest<{ students: BatchStudent[] }>(`/admin/batches/${batchId}/students`),
        apiRequest<{ courses: BatchCourse[] }>(`/admin/batches/${batchId}/courses`),
      ]);
      setBatchStudents(sRes.students);
      setBatchCourses(cRes.courses);
    } catch {
      setBatchStudents([]);
      setBatchCourses([]);
    } finally {
      setBatchStudentsLoading(false);
    }
  }

  function toggleExpand(batchId: string) {
    if (expandedId === batchId) {
      setExpandedId(null);
      setBatchStudents([]);
      setBatchCourses([]);
      setSearchQuery("");
      setCourseSearchQuery("");
      setShowSuggestions(false);
      setShowCourseSuggestions(false);
    } else {
      setExpandedId(batchId);
      setSearchQuery("");
      setCourseSearchQuery("");
      setShowSuggestions(false);
      setShowCourseSuggestions(false);
      void loadBatchDetails(batchId);
    }
  }

  async function createBatch(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/admin/batches", "POST", {
        name: form.name,
        trainerId: form.trainerId,
        programId: form.programId || undefined,
      });
      setForm({ name: "", trainerId: "", programId: "" });
      setShowForm(false);
      setMessage("Batch created.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create batch");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteBatch(id: string) {
    if (!window.confirm("Delete this batch? All related data will be removed.")) return;
    setError("");
    try {
      await apiRequest(`/admin/batches/${id}`, "DELETE");
      setBatches((prev) => prev.filter((b) => b.id !== id));
      if (expandedId === id) {
        setExpandedId(null);
        setBatchStudents([]);
      }
      setMessage("Batch deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete batch");
    }
  }

  async function assignStudent(studentId: string) {
    if (!expandedId) return;
    setError("");
    setMessage("");
    try {
      const res = await apiRequest<{ message: string }>(`/admin/students/${studentId}/batches`, "POST", {
        batchId: expandedId,
      });
      setMessage(res.message);
      setSearchQuery("");
      setShowSuggestions(false);
      await loadBatchDetails(expandedId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign student");
    }
  }

  async function removeStudent(studentId: string) {
    if (!expandedId) return;
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/students/${studentId}/batches/${expandedId}`, "DELETE");
      setMessage("Student removed from batch.");
      await loadBatchDetails(expandedId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove student");
    }
  }

  async function toggleBatchStatus(batch: Batch) {
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/batches/${batch.id}/status`, "PATCH", { isActive: !batch.is_active });
      setMessage(`Batch ${batch.is_active ? "deactivated" : "activated"}.`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  async function assignCourse(courseId: string) {
    if (!expandedId) return;
    setError("");
    setMessage("");
    try {
      const res = await apiRequest<{ message: string }>(`/admin/batches/${expandedId}/courses`, "POST", {
        courseId,
        sortOrder: batchCourses.length,
      });
      setMessage(res.message);
      setCourseSearchQuery("");
      setShowCourseSuggestions(false);
      await loadBatchDetails(expandedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign course");
    }
  }

  async function removeCourse(courseId: string) {
    if (!expandedId) return;
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/batches/${expandedId}/courses/${courseId}`, "DELETE");
      setMessage("Course removed from batch.");
      await loadBatchDetails(expandedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove course");
    }
  }

  async function syncFromProgram() {
    if (!expandedId) return;
    const batch = batches.find((b) => b.id === expandedId);
    if (!batch?.program_id) return;
    setError("");
    setMessage("");
    try {
      const res = await apiRequest<{ message: string; added: number }>(`/admin/batches/${expandedId}/sync-program-courses`, "POST");
      setMessage(res.message);
      await loadBatchDetails(expandedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sync courses");
    }
  }

  // Filter suggestions: students not already in the batch, matching search query
  const assignedIds = useMemo(() => new Set(batchStudents.map((s) => s.id)), [batchStudents]);
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allStudents
      .filter((s) => !assignedIds.has(s.id))
      .filter((s) => {
        const name = (s.full_name ?? "").toLowerCase();
        const email = s.email.toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 8);
  }, [searchQuery, allStudents, assignedIds]);

  // Filter suggestions: courses not already in the batch
  const assignedCourseIds = useMemo(() => new Set(batchCourses.map((c) => c.id)), [batchCourses]);
  const courseSuggestions = useMemo(() => {
    if (!courseSearchQuery.trim()) return [];
    const q = courseSearchQuery.toLowerCase();
    return allCourses
      .filter((c) => !assignedCourseIds.has(c.id))
      .filter((c) => {
        const title = c.title.toLowerCase();
        const desc = (c.description ?? "").toLowerCase();
        return title.includes(q) || desc.includes(q);
      })
      .slice(0, 8);
  }, [courseSearchQuery, allCourses, assignedCourseIds]);

  return (
    <div className="stack">
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="filter-bar">
        <div className="filter-bar-left">
          <span className="filter-count">{batches.length} batch{batches.length !== 1 ? "es" : ""}</span>
        </div>
        <div className="filter-bar-right">
          <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Create Batch"}
          </button>
        </div>
      </div>

      {showForm ? (
        <section className="card">
          <header className="card-header">
            <h3>New Batch</h3>
          </header>
          <form className="form" onSubmit={(e) => void createBatch(e)}>
            <label>
              Batch Name
              <input required minLength={2} maxLength={200} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label>
              Assign Trainer
              <select required value={form.trainerId} onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))}>
                <option value="">Select Trainer…</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name || t.email}</option>
                ))}
              </select>
            </label>
            <label>
              Assign Program
              <select value={form.programId} onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))}>
                <option value="">No Program</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="button" disabled={submitting}>
              {submitting ? "Creating…" : "Create Batch"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="card">
        <header className="card-header">
          <h3>Batches</h3>
        </header>
        {loading ? <p className="muted">Loading…</p> : null}
        <ul className="list" style={{ gap: 0 }}>
          {batches.map((b) => {
            const isExpanded = expandedId === b.id;
            return (
              <li className="list-item" key={b.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div className="row-inline">
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => toggleExpand(b.id)}>
                    <div className="row-inline" style={{ gap: "0.4rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                      <strong>{b.name}</strong>
                      <span style={{
                        fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "0.25rem", fontWeight: 600,
                        background: b.is_active ? "rgba(46,204,113,0.15)" : "rgba(231,76,60,0.15)",
                        color: b.is_active ? "#2ecc71" : "#e74c3c"
                      }}>
                        {b.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="muted" style={{ fontSize: "0.78rem", marginLeft: "1rem" }}>
                      👨‍🏫 {b.trainer_name || b.trainer_email || "N/A"} · 🎓 {b.student_count} student{b.student_count !== 1 ? "s" : ""}
                      {b.program_title ? ` · 📋 ${b.program_title}` : ""} · {new Date(b.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      type="button"
                      className={b.is_active ? "button danger" : "button"}
                      style={{ fontSize: "0.75rem" }}
                      onClick={() => void toggleBatchStatus(b)}
                    >
                      {b.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" className="button danger" style={{ fontSize: "0.75rem" }} onClick={() => void deleteBatch(b.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <div style={{ marginTop: "0.75rem", paddingLeft: "1rem", borderLeft: "2px solid var(--border)" }}>
                    {/* ── Dynamic search to add student ── */}
                    <div ref={searchRef} style={{ position: "relative", marginBottom: "0.75rem" }}>
                      <input
                        type="text"
                        placeholder="Search student by name or email to add…"
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
                          {suggestions.map((s) => (
                            <li
                              key={s.id}
                              style={{
                                padding: "0.5rem 0.75rem", cursor: "pointer",
                                borderBottom: "1px solid var(--border)",
                                display: "flex", justifyContent: "space-between", alignItems: "center"
                              }}
                              onMouseDown={() => void assignStudent(s.id)}
                            >
                              <div>
                                <strong style={{ fontSize: "0.85rem" }}>{s.full_name || "—"}</strong>
                                <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>{s.email}</span>
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
                          <span className="muted" style={{ fontSize: "0.8rem" }}>No matching students found</span>
                        </div>
                      ) : null}
                    </div>

                    {/* ── Assigned students list ── */}
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem", color: "var(--muted)" }}>
                      Assigned Students ({batchStudents.length})
                    </div>
                    {batchStudentsLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>Loading students…</p> : null}
                    {!batchStudentsLoading && batchStudents.length === 0 ? (
                      <p className="muted" style={{ fontSize: "0.8rem" }}>No students assigned yet. Use the search above to add students.</p>
                    ) : null}
                    {!batchStudentsLoading && batchStudents.length > 0 ? (
                      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {batchStudents.map((s) => (
                          <li key={s.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "0.4rem 0.5rem", borderBottom: "1px solid var(--border)",
                            fontSize: "0.82rem"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{
                                width: "28px", height: "28px", borderRadius: "50%",
                                background: "var(--accent)", color: "#fff", display: "flex",
                                alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0
                              }}>
                                {(s.full_name ?? s.email).charAt(0).toUpperCase()}
                              </span>
                              <div>
                                <div style={{ fontWeight: 500 }}>{s.full_name || "—"}</div>
                                <div className="muted" style={{ fontSize: "0.72rem" }}>{s.email}</div>
                              </div>
                              {s.experience_level ? (
                                <span className="student-tag" style={{ fontSize: "0.65rem" }}>{s.experience_level}</span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="button danger"
                              style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem" }}
                              onClick={() => void removeStudent(s.id)}
                              title="Remove from batch"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {/* ── Courses section ── */}
                    <div style={{ marginTop: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted)" }}>
                          Courses in Batch ({batchCourses.length})
                        </span>
                        {b.program_id ? (
                          <button type="button" className="button" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }} onClick={() => void syncFromProgram()}>
                            Sync from Program
                          </button>
                        ) : null}
                      </div>

                      {/* Search to add course */}
                      <div ref={courseSearchRef} style={{ position: "relative", marginBottom: "0.75rem" }}>
                        <input
                          type="text"
                          placeholder="Search course by title to add…"
                          value={courseSearchQuery}
                          onChange={(e) => { setCourseSearchQuery(e.target.value); setShowCourseSuggestions(true); }}
                          onFocus={() => { if (courseSearchQuery.trim()) setShowCourseSuggestions(true); }}
                          style={{ width: "100%" }}
                        />
                        {showCourseSuggestions && courseSuggestions.length > 0 ? (
                          <ul style={{
                            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                            background: "var(--card-bg, #1e1e2e)", border: "1px solid var(--border)",
                            borderRadius: "0.5rem", margin: 0, padding: 0, listStyle: "none",
                            maxHeight: "220px", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.3)"
                          }}>
                            {courseSuggestions.map((c) => (
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
                                  {c.description ? <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>{c.description}</span> : null}
                                </div>
                                <span style={{ fontSize: "0.7rem", color: "var(--accent)", fontWeight: 600 }}>+ Add</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {showCourseSuggestions && courseSearchQuery.trim() && courseSuggestions.length === 0 ? (
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
                      {batchStudentsLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>Loading…</p> : null}
                      {!batchStudentsLoading && batchCourses.length === 0 ? (
                        <p className="muted" style={{ fontSize: "0.8rem" }}>No courses assigned. {b.program_id ? 'Click "Sync from Program" or search to add.' : "Search to add courses."}</p>
                      ) : null}
                      {!batchStudentsLoading && batchCourses.length > 0 ? (
                        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                          {batchCourses.map((c, idx) => (
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
                                  {c.description ? <div className="muted" style={{ fontSize: "0.72rem" }}>{c.description}</div> : null}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="button danger"
                                style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem" }}
                                onClick={() => void removeCourse(c.id)}
                                title="Remove from batch"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
          {!batches.length && !loading ? (
            <li className="list-item muted">No batches yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
