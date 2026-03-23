"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api";
import { CoursesSection } from "./CoursesSection";
import { CredentialViewer } from "./CredentialViewer";
import { MaterialViewer } from "./MaterialViewer";
import { DashboardMenu } from "../DashboardMenu";
import { ProfileManager } from "../ProfileManager";
import { NotificationCenter } from "./NotificationCenter";
import { SettingsPanel } from "./SettingsPanel";

type TrainerSection =
  | "overview" | "calendar" | "batches" | "courses" | "credentials" | "materials"
  | "batch-assignments" | "batch-videos" | "batch-materials"
  | "student-projects" | "notifications" | "profile" | "settings";

interface Batch {
  id: string;
  name: string;
  zoom_link: string | null;
  created_at: string;
}

interface BatchInsights {
  students: number;
  assignments: number;
  videos: number;
  materials: number;
  submissions: number;
}

interface Assignment {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  created_at: string;
  submission_count: number;
}

interface BatchVideo {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  created_at: string;
}

interface BatchMaterial {
  id: string;
  title: string;
  material_type: string;
  description: string | null;
  url: string | null;
  s3_key: string | null;
  view_only: boolean;
  display_order: number;
  course_id: string | null;
  topic_id: string | null;
  course_title: string | null;
  topic_title: string | null;
  created_at: string;
}

/* ─── Trainer Student-Projects Component ────────────────────────────────── */

interface StudentProjectEntry {
  id: string;
  student_name: string;
  student_email: string;
  project_title: string;
  client_name: string;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

interface ProjectOption {
  id: string;
  title: string;
  client_name: string;
}

interface BatchStudent {
  user_id: string;
  name: string;
  email: string;
}

function TrainerStudentProjects({ batches }: { batches: Batch[] }) {
  const [batchId, setBatchId] = useState("");
  const [entries, setEntries] = useState<StudentProjectEntry[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [students, setStudents] = useState<BatchStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ studentId: "", projectId: "", role: "", startDate: "", endDate: "", description: "" });

  async function loadEntries(bid: string) {
    if (!bid) return;
    setLoading(true); setError("");
    try {
      const [spRes, pRes] = await Promise.all([
        apiRequest<{ studentProjects: StudentProjectEntry[] }>(`/trainer/batches/${bid}/student-projects`),
        apiRequest<{ projects: ProjectOption[] }>("/trainer/projects"),
      ]);
      setEntries(spRes.studentProjects);
      setProjects(pRes.projects);
      // derive students list from entries or fetch batch students
      try {
        const sRes = await apiRequest<{ students: BatchStudent[] }>(`/trainer/batches/${bid}/students`);
        setStudents(sRes.students);
      } catch { setStudents([]); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (batchId) { void loadEntries(batchId); setShowForm(false); } else { setEntries([]); } }, [batchId]);

  async function handleAssign(e: FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    try {
      await apiRequest(`/trainer/batches/${batchId}/student-projects`, "POST", {
        studentId: form.studentId,
        projectId: form.projectId,
        role: form.role || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        description: form.description || undefined,
      });
      setMessage("Project assigned.");
      setShowForm(false);
      setForm({ studentId: "", projectId: "", role: "", startDate: "", endDate: "", description: "" });
      await loadEntries(batchId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this project assignment?")) return;
    try {
      await apiRequest(`/trainer/batches/${batchId}/student-projects/${id}`, "DELETE");
      setMessage("Assignment removed.");
      await loadEntries(batchId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="stack">
      <BatchSelector batches={batches} selectedBatchId={batchId} onChange={setBatchId} />
      {error && <p className="message error">{error}</p>}
      {message && <p className="message success">{message}</p>}

      {batchId && (
        <section className="card">
          <header className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>🏢 Student Project Assignments</h3>
            <button className="button" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "+ Assign Project"}</button>
          </header>

          {showForm && (
            <form className="form" onSubmit={handleAssign} style={{ padding: "1rem" }}>
              <label>
                Student
                <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required>
                  <option value="">— select student —</option>
                  {students.map((s) => <option key={s.user_id} value={s.user_id}>{s.name} ({s.email})</option>)}
                </select>
              </label>
              <label>
                Project
                <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} required>
                  <option value="">— select project —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.client_name})</option>)}
                </select>
              </label>
              <label>
                Role
                <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Full Stack Developer" />
              </label>
              <div style={{ display: "flex", gap: "1rem" }}>
                <label style={{ flex: 1 }}>
                  Start Date
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </label>
                <label style={{ flex: 1 }}>
                  End Date
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </label>
              </div>
              <label>
                Description
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Project responsibilities…" />
              </label>
              <button type="submit" className="button">Assign</button>
            </form>
          )}

          {loading ? <p className="muted" style={{ padding: "1rem" }}>Loading…</p> : (
            <ul className="list">
              {entries.map((sp) => (
                <li className="list-item" key={sp.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <strong>{sp.student_name}</strong> <span className="muted">({sp.student_email})</span>
                      <p style={{ margin: "0.25rem 0" }}>{sp.project_title} — <span className="muted">{sp.client_name}</span></p>
                      {sp.role && <p className="muted">Role: {sp.role}</p>}
                      {sp.start_date && <p className="muted">{new Date(sp.start_date).toLocaleDateString()} – {sp.end_date ? new Date(sp.end_date).toLocaleDateString() : "Present"}</p>}
                      {sp.description && <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>{sp.description}</p>}
                    </div>
                    <button className="button" style={{ background: "#e74c3c", fontSize: "0.8rem" }} onClick={() => handleRemove(sp.id)}>Remove</button>
                  </div>
                </li>
              ))}
              {!entries.length && <li className="list-item muted">No project assignments yet.</li>}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/* ─── Batch Selector Component ─────────────────────────────────────────── */

function BatchSelector({ batches, selectedBatchId, onChange }: { batches: Batch[]; selectedBatchId: string; onChange: (id: string) => void }) {
  return (
    <div className="tbm-batch-selector">
      <label>Select Batch</label>
      <select value={selectedBatchId} onChange={(e) => onChange(e.target.value)}>
        <option value="">— choose batch —</option>
        {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  );
}

/* ─── Batch Assignments Component ──────────────────────────────────────── */

function TrainerAssignments({ batches }: { batches: Batch[] }) {
  const [batchId, setBatchId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", instructions: "", dueAt: "" });

  async function loadAssignments(id: string) {
    if (!id) return;
    setLoading(true); setError("");
    try {
      const res = await apiRequest<{ assignments: Assignment[] }>(`/trainer/batches/${id}/assignments`);
      setAssignments(res.assignments);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (batchId) { void loadAssignments(batchId); setShowForm(false); setEditId(null); } else { setAssignments([]); } }, [batchId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    try {
      const body = { title: form.title, instructions: form.instructions || undefined, dueAt: form.dueAt || undefined };
      if (editId) {
        await apiRequest(`/trainer/batches/${batchId}/assignments/${editId}`, "PUT", body);
        setMessage("Assignment updated.");
      } else {
        await apiRequest(`/trainer/batches/${batchId}/assignments`, "POST", body);
        setMessage("Assignment created.");
      }
      setShowForm(false); setEditId(null); setForm({ title: "", instructions: "", dueAt: "" });
      await loadAssignments(batchId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete(assignmentId: string) {
    if (!confirm("Delete this assignment?")) return;
    try {
      await apiRequest(`/trainer/batches/${batchId}/assignments/${assignmentId}`, "DELETE");
      setMessage("Assignment deleted."); await loadAssignments(batchId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
  }

  function startEdit(a: Assignment) {
    setEditId(a.id);
    setForm({ title: a.title, instructions: a.instructions ?? "", dueAt: a.due_at ? a.due_at.slice(0, 16) : "" });
    setShowForm(true);
  }

  return (
    <div className="stack">
      <BatchSelector batches={batches} selectedBatchId={batchId} onChange={setBatchId} />
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      {batchId ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Assignments ({assignments.length})</h3>
            <button className="button" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ title: "", instructions: "", dueAt: "" }); }}>
              {showForm && !editId ? "Cancel" : "+ New Assignment"}
            </button>
          </div>

          {showForm ? (
            <section className="card">
              <header className="card-header"><h3>{editId ? "Edit Assignment" : "Create Assignment"}</h3></header>
              <form className="form" onSubmit={handleSubmit}>
                <label>Title <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} maxLength={300} /></label>
                <label>Instructions <textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={4} maxLength={5000} /></label>
                <label>Due Date <input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
                <button type="submit" className="button">{editId ? "Update" : "Create"}</button>
              </form>
            </section>
          ) : null}

          {loading ? <p className="muted">Loading…</p> : (
            <div className="tbm-list">
              {assignments.map((a) => (
                <div className="tbm-item" key={a.id}>
                  <div className="tbm-item-header">
                    <div>
                      <strong>{a.title}</strong>
                      <p className="muted">{a.due_at ? `Due: ${new Date(a.due_at).toLocaleString()}` : "No due date"} · {a.submission_count} submissions</p>
                    </div>
                    <div className="tbm-item-actions">
                      <button className="button button-sm" onClick={() => startEdit(a)}>Edit</button>
                      <button className="button button-sm button-danger" onClick={() => handleDelete(a.id)}>Delete</button>
                    </div>
                  </div>
                  {a.instructions ? <p className="tbm-item-desc">{a.instructions}</p> : null}
                </div>
              ))}
              {!assignments.length ? <p className="muted">No assignments for this batch.</p> : null}
            </div>
          )}
        </>
      ) : <p className="muted">Select a batch to manage assignments.</p>}
    </div>
  );
}

/* ─── Batch Videos Component ───────────────────────────────────────────── */

function TrainerBatchVideos({ batches }: { batches: Batch[] }) {
  const [batchId, setBatchId] = useState("");
  const [videos, setVideos] = useState<BatchVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", youtubeUrl: "", description: "" });

  async function loadVideos(id: string) {
    if (!id) return;
    setLoading(true); setError("");
    try {
      const res = await apiRequest<{ videos: BatchVideo[] }>(`/trainer/batches/${id}/batch-videos`);
      setVideos(res.videos);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (batchId) { void loadVideos(batchId); setShowForm(false); setEditId(null); } else { setVideos([]); } }, [batchId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    try {
      const body = { title: form.title, youtubeUrl: form.youtubeUrl, description: form.description || undefined };
      if (editId) {
        await apiRequest(`/trainer/batches/${batchId}/batch-videos/${editId}`, "PUT", body);
        setMessage("Video updated.");
      } else {
        await apiRequest(`/trainer/batches/${batchId}/batch-videos`, "POST", body);
        setMessage("Video added.");
      }
      setShowForm(false); setEditId(null); setForm({ title: "", youtubeUrl: "", description: "" });
      await loadVideos(batchId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete(videoId: string) {
    if (!confirm("Delete this video?")) return;
    try {
      await apiRequest(`/trainer/batches/${batchId}/batch-videos/${videoId}`, "DELETE");
      setMessage("Video deleted."); await loadVideos(batchId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
  }

  function startEdit(v: BatchVideo) {
    setEditId(v.id); setForm({ title: v.title, youtubeUrl: v.youtube_url, description: v.description ?? "" }); setShowForm(true);
  }

  function extractYoutubeId(url: string): string | null {
    const m = url.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  return (
    <div className="stack">
      <BatchSelector batches={batches} selectedBatchId={batchId} onChange={setBatchId} />
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      {batchId ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Course Videos ({videos.length})</h3>
            <button className="button" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ title: "", youtubeUrl: "", description: "" }); }}>
              {showForm && !editId ? "Cancel" : "+ Add Video"}
            </button>
          </div>

          {showForm ? (
            <section className="card">
              <header className="card-header"><h3>{editId ? "Edit Video" : "Add YouTube Video"}</h3></header>
              <form className="form" onSubmit={handleSubmit}>
                <label>Title <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={1} maxLength={300} /></label>
                <label>YouTube URL <input type="url" value={form.youtubeUrl} onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })} required placeholder="https://youtube.com/watch?v=..." maxLength={500} /></label>
                <label>Description <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={1000} /></label>
                <button type="submit" className="button">{editId ? "Update" : "Add Video"}</button>
              </form>
            </section>
          ) : null}

          {loading ? <p className="muted">Loading…</p> : (
            <div className="tbm-video-grid">
              {videos.map((v) => {
                const ytId = extractYoutubeId(v.youtube_url);
                return (
                  <div className="tbm-video-card" key={v.id}>
                    {ytId ? (
                      <div className="tbm-video-thumb">
                        <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={v.title} />
                      </div>
                    ) : null}
                    <div className="tbm-video-info">
                      <strong>{v.title}</strong>
                      {v.description ? <p className="muted">{v.description}</p> : null}
                      <p className="muted" style={{ fontSize: "0.75rem" }}>{new Date(v.created_at).toLocaleDateString()}</p>
                      <div className="tbm-item-actions" style={{ marginTop: "0.5rem" }}>
                        <a href={v.youtube_url} target="_blank" rel="noopener noreferrer" className="button button-sm">Watch</a>
                        <button className="button button-sm" onClick={() => startEdit(v)}>Edit</button>
                        <button className="button button-sm button-danger" onClick={() => handleDelete(v.id)}>Del</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!videos.length ? <p className="muted">No videos for this batch.</p> : null}
            </div>
          )}
        </>
      ) : <p className="muted">Select a batch to manage videos.</p>}
    </div>
  );
}

/* ─── Batch Materials Component ────────────────────────────────────────── */

function TrainerBatchMaterials({ batches }: { batches: Batch[] }) {
  const [batchId, setBatchId] = useState("");
  const [materials, setMaterials] = useState<BatchMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", materialType: "pdf" as string, description: "", url: "", displayOrder: 0, viewOnly: true });
  const [file, setFile] = useState<File | null>(null);

  async function loadMaterials(id: string) {
    if (!id) return;
    setLoading(true); setError("");
    try {
      const res = await apiRequest<{ materials: BatchMaterial[] }>(`/trainer/batches/${id}/materials`);
      setMaterials(res.materials);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (batchId) { void loadMaterials(batchId); setShowForm(false); setEditId(null); } else { setMaterials([]); } }, [batchId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    try {
      if (editId) {
        await apiRequest(`/trainer/batches/${batchId}/materials/${editId}`, "PUT", {
          title: form.title, materialType: form.materialType,
          description: form.description || undefined, url: form.url || undefined,
          displayOrder: form.displayOrder, viewOnly: form.viewOnly,
        });
        setMessage("Material updated.");
      } else {
        const fd = new FormData();
        fd.append("title", form.title);
        fd.append("materialType", form.materialType);
        if (form.description) fd.append("description", form.description);
        if (form.url) fd.append("url", form.url);
        fd.append("displayOrder", String(form.displayOrder));
        fd.append("viewOnly", String(form.viewOnly));
        if (file) fd.append("file", file);
        await apiRequest(`/trainer/batches/${batchId}/materials`, "POST", fd);
        setMessage("Material uploaded.");
      }
      setShowForm(false); setEditId(null); setFile(null);
      setForm({ title: "", materialType: "pdf", description: "", url: "", displayOrder: 0, viewOnly: true });
      await loadMaterials(batchId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete(materialId: string) {
    if (!confirm("Remove this material?")) return;
    try {
      await apiRequest(`/trainer/batches/${batchId}/materials/${materialId}`, "DELETE");
      setMessage("Material removed."); await loadMaterials(batchId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
  }

  function startEdit(m: BatchMaterial) {
    setEditId(m.id);
    setForm({ title: m.title, materialType: m.material_type, description: m.description ?? "", url: m.url ?? "", displayOrder: m.display_order, viewOnly: m.view_only });
    setShowForm(true);
  }

  const typeLabel: Record<string, string> = { pdf: "PDF", doc: "Document", link: "Link", sql: "SQL", zip: "Archive", other: "Other" };

  return (
    <div className="stack">
      <BatchSelector batches={batches} selectedBatchId={batchId} onChange={setBatchId} />
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      {batchId ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Course Materials ({materials.length})</h3>
            <button className="button" onClick={() => {
              setShowForm(!showForm); setEditId(null); setFile(null);
              setForm({ title: "", materialType: "pdf", description: "", url: "", displayOrder: 0, viewOnly: true });
            }}>
              {showForm && !editId ? "Cancel" : "+ Upload Material"}
            </button>
          </div>

          {showForm ? (
            <section className="card">
              <header className="card-header"><h3>{editId ? "Edit Material" : "Upload Material"}</h3></header>
              <form className="form" onSubmit={handleSubmit}>
                <label>Title <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={300} /></label>
                <label>Type
                  <select value={form.materialType} onChange={(e) => setForm({ ...form, materialType: e.target.value })}>
                    {Object.entries(typeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
                <label>Description <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={1000} /></label>
                <label>URL (optional) <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." maxLength={500} /></label>
                {!editId ? (
                  <label>File <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
                ) : null}
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input type="checkbox" checked={form.viewOnly} onChange={(e) => setForm({ ...form, viewOnly: e.target.checked })} /> View-only (no download)
                </label>
                <label>Display Order <input type="number" min={0} value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} /></label>
                <button type="submit" className="button">{editId ? "Update" : "Upload"}</button>
              </form>
            </section>
          ) : null}

          {loading ? <p className="muted">Loading…</p> : (
            <div className="tbm-list">
              {materials.map((m) => (
                <div className="tbm-item" key={m.id}>
                  <div className="tbm-item-header">
                    <div>
                      <span className="tbm-badge">{typeLabel[m.material_type] || m.material_type}</span>
                      <strong style={{ marginLeft: "0.5rem" }}>{m.title}</strong>
                      {m.course_title ? <span className="muted" style={{ marginLeft: "0.5rem" }}>· {m.course_title}</span> : null}
                      {m.topic_title ? <span className="muted"> / {m.topic_title}</span> : null}
                    </div>
                    <div className="tbm-item-actions">
                      {m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer" className="button button-sm">Open</a> : null}
                      <button className="button button-sm" onClick={() => startEdit(m)}>Edit</button>
                      <button className="button button-sm button-danger" onClick={() => handleDelete(m.id)}>Del</button>
                    </div>
                  </div>
                  {m.description ? <p className="tbm-item-desc">{m.description}</p> : null}
                  <p className="muted" style={{ fontSize: "0.75rem" }}>
                    {m.view_only ? "View-only" : "Downloadable"} · Order: {m.display_order} · {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {!materials.length ? <p className="muted">No materials for this batch.</p> : null}
            </div>
          )}
        </>
      ) : <p className="muted">Select a batch to manage materials.</p>}
    </div>
  );
}

/* ─── Main Dashboard ───────────────────────────────────────────────────── */

export function TrainerDashboard() {
  const [section, setSection] = useState<TrainerSection>("overview");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [insights, setInsights] = useState<Record<string, BatchInsights>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newBatchName, setNewBatchName] = useState("");
  const [newBatchZoomLink, setNewBatchZoomLink] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadBatches() {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest<{ batches: Batch[] }>("/trainer/batches");
      setBatches(response.batches);

      // Load insights for each batch
      const insightMap: Record<string, BatchInsights> = {};
      await Promise.all(
        response.batches.map(async (b) => {
          try {
            const ins = await apiRequest<BatchInsights>(`/trainer/batches/${b.id}/insights`);
            insightMap[b.id] = ins;
          } catch { /* ignore */ }
        })
      );
      setInsights(insightMap);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load trainer dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBatches();
  }, []);

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      await apiRequest("/trainer/batches", "POST", { name: newBatchName, zoomLink: newBatchZoomLink || undefined });
      setMessage("Batch created successfully.");
      setNewBatchName("");
      setNewBatchZoomLink("");
      await loadBatches();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create batch");
    } finally {
      setSubmitting(false);
    }
  }

  function renderContent() {
    if (loading) return <p className="muted">Loading dashboard…</p>;

    switch (section) {
      case "calendar":
        {
          const TrainerCalendarPage = require("../../app/trainer/calendar/page").default;
          return <TrainerCalendarPage />;
        }
      case "overview":
        return (
          <>
            {error ? <p className="message error">{error}</p> : null}
            {message ? <p className="message success">{message}</p> : null}

            {/* Summary Stats */}
            <div className="grid" style={{ marginBottom: "1.5rem" }}>
              <section className="card span-3"><header className="card-header"><h3>Batches</h3></header><p className="tbm-stat">{batches.length}</p></section>
              <section className="card span-3"><header className="card-header"><h3>Students</h3></header><p className="tbm-stat">{Object.values(insights).reduce((s, i) => s + i.students, 0)}</p></section>
              <section className="card span-3"><header className="card-header"><h3>Assignments</h3></header><p className="tbm-stat">{Object.values(insights).reduce((s, i) => s + i.assignments, 0)}</p></section>
              <section className="card span-3"><header className="card-header"><h3>Materials</h3></header><p className="tbm-stat">{Object.values(insights).reduce((s, i) => s + i.materials, 0)}</p></section>
            </div>

            {/* Per-Batch Insights */}
            <h3 style={{ marginBottom: "0.75rem" }}>Batch Insights</h3>
            <div className="tbm-insights-grid">
              {batches.map((b) => {
                const ins = insights[b.id];
                return (
                  <div className="tbm-insight-card" key={b.id}>
                    <h4>{b.name}</h4>
                    {ins ? (
                      <div className="tbm-insight-stats">
                        <span>👥 {ins.students} students</span>
                        <span>📝 {ins.assignments} assignments</span>
                        <span>🎥 {ins.videos} videos</span>
                        <span>📄 {ins.materials} materials</span>
                        <span>📤 {ins.submissions} submissions</span>
                      </div>
                    ) : <p className="muted">Loading…</p>}
                    {b.zoom_link ? <a href={b.zoom_link} target="_blank" rel="noopener noreferrer" className="zoom-join-btn" style={{ marginTop: "0.5rem" }}>📹 Join Zoom</a> : null}
                  </div>
                );
              })}
              {!batches.length ? <p className="muted">No batches created yet.</p> : null}
            </div>
          </>
        );

      case "batches":
        return (
          <div className="stack">
            {error ? <p className="message error">{error}</p> : null}
            {message ? <p className="message success">{message}</p> : null}
            <section className="card">
              <header className="card-header">
                <h3>Create New Batch</h3>
              </header>
              <form className="form" onSubmit={createBatch}>
                <label>
                  Batch Name
                  <input
                    value={newBatchName}
                    onChange={(event) => setNewBatchName(event.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <label>
                  Zoom Meeting Link
                  <input
                    type="url"
                    placeholder="https://zoom.us/j/..."
                    value={newBatchZoomLink}
                    onChange={(event) => setNewBatchZoomLink(event.target.value)}
                    maxLength={500}
                  />
                </label>
                <button type="submit" className="button" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Batch"}
                </button>
              </form>
            </section>

            <section className="card">
              <header className="card-header">
                <h3>Your Batches</h3>
              </header>
              <ul className="list">
                {batches.map((batch) => (
                  <li className="list-item" key={batch.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong>{batch.name}</strong>
                        <p className="muted">ID: {batch.id}</p>
                        <p className="muted">Created: {new Date(batch.created_at).toLocaleString()}</p>
                      </div>
                      {batch.zoom_link ? (
                        <a href={batch.zoom_link} target="_blank" rel="noopener noreferrer" className="zoom-join-btn">📹 Join Zoom</a>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
                      <input
                        type="url"
                        placeholder="Zoom link..."
                        defaultValue={batch.zoom_link ?? ""}
                        id={`trainer-zoom-${batch.id}`}
                        style={{ flex: 1, padding: "0.35rem 0.5rem", fontSize: "0.82rem", border: "1px solid var(--card-border)", borderRadius: "0.4rem" }}
                      />
                      <button type="button" className="button" style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }} onClick={async () => {
                        const input = document.getElementById(`trainer-zoom-${batch.id}`) as HTMLInputElement;
                        const val = input?.value?.trim() || null;
                        try { await apiRequest(`/trainer/batches/${batch.id}/zoom-link`, "PATCH", { zoomLink: val }); setMessage("Zoom link updated."); await loadBatches(); }
                        catch (e) { setError(e instanceof Error ? e.message : "Failed to update zoom link"); }
                      }}>Save</button>
                    </div>
                  </li>
                ))}
                {!batches.length ? <li className="list-item muted">No batches to show.</li> : null}
              </ul>
            </section>
          </div>
        );

      case "batch-assignments":
        return <TrainerAssignments batches={batches} />;

      case "batch-videos":
        return <TrainerBatchVideos batches={batches} />;

      case "batch-materials":
        return <TrainerBatchMaterials batches={batches} />;

      case "student-projects":
        return <TrainerStudentProjects batches={batches} />;

      case "courses":
        return <CoursesSection apiBase="/trainer" />;

      case "credentials":
        return <CredentialViewer apiBase="/trainer" />;

      case "materials":
        return <MaterialViewer apiBase="/trainer" />;

      case "profile":
        return <ProfileManager />;

      case "settings":
        return <SettingsPanel />;

      case "notifications":
        return (
          <NotificationCenter
            role="trainer"
            apiBase="/trainer"
            batches={batches.map((b) => ({ id: b.id, name: b.name }))}
          />
        );

      default:
        return null;
    }
  }

  return (
    <DashboardMenu
      sections={[
        {
          title: "TRAINING",
          items: [
            { key: "calendar" as TrainerSection, label: "Calendar & Events", icon: "📅" },
            { key: "overview" as TrainerSection, label: "Overview", icon: "📊" },
            { key: "batches" as TrainerSection, label: "Batch Manager", icon: "📦" },
            { key: "batch-assignments" as TrainerSection, label: "Assignments", icon: "📝" },
            { key: "batch-videos" as TrainerSection, label: "Course Videos", icon: "🎥" },
            { key: "batch-materials" as TrainerSection, label: "Batch Materials", icon: "📎" },
            { key: "student-projects" as TrainerSection, label: "Student Projects", icon: "🏢" },
            { key: "courses" as TrainerSection, label: "Courses", icon: "📚" },
            { key: "materials" as TrainerSection, label: "All Materials", icon: "📄" },
            { key: "credentials" as TrainerSection, label: "Credentials", icon: "🔑" },
            { key: "notifications" as TrainerSection, label: "Notifications", icon: "🔔" },
          ],
        },
        {
          title: "ACCOUNT",
          items: [
            { key: "profile" as TrainerSection, label: "Registration Info", icon: "👤" },
            { key: "settings" as TrainerSection, label: "Settings", icon: "⚙️" },
          ],
        },
      ]}
      active={section}
      onChange={setSection}
      mainContent={renderContent()}
    />
  );
}
