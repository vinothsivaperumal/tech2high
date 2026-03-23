"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

interface Material {
  id: string;
  title: string;
  material_type: string;
  description: string | null;
  s3_key: string | null;
  url: string | null;
  view_only: boolean;
  display_order: number;
  is_active: boolean;
  course_id: string | null;
  course_title: string | null;
  batch_id: string | null;
  batch_name: string | null;
  program_id: string | null;
  program_title: string | null;
  topic_id: string | null;
  topic_title: string | null;
  created_by_email: string | null;
  created_at: string;
}

interface Batch { id: string; name: string; }
interface Course { id: string; title: string; }
interface Program { id: string; title: string; }
interface Topic { id: string; title: string; }

const MATERIAL_TYPES = ["pdf", "doc", "link", "sql", "zip", "other"] as const;
const TYPE_ICONS: Record<string, string> = { pdf: "📄", doc: "📝", link: "🔗", sql: "💾", zip: "📦", other: "📎" };

const defaultForm = {
  title: "", materialType: "pdf" as string, description: "", url: "",
  displayOrder: "0", viewOnly: true, isActive: true,
  batchId: "", courseId: "", programId: "", topicId: "",
};

export function MaterialManager() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [viewingTitle, setViewingTitle] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (batchFilter) params.set("batchId", batchFilter);
      if (courseFilter) params.set("courseId", courseFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";

      const [matRes, batchRes, courseRes, progRes] = await Promise.all([
        apiRequest<{ materials: Material[] }>(`/admin/materials${qs}`),
        apiRequest<{ batches: Batch[] }>("/admin/batches"),
        apiRequest<{ courses: Course[] }>("/admin/courses"),
        apiRequest<{ programs: Program[] }>("/admin/programs"),
      ]);
      setMaterials(matRes.materials);
      setBatches(batchRes.batches);
      setCourses(courseRes.courses);
      setPrograms(progRes.programs);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [batchFilter, courseFilter]);

  // Load topics when course changes in form
  async function loadTopics(courseId: string) {
    if (!courseId) { setTopics([]); return; }
    try {
      const res = await apiRequest<{ topics: Topic[] }>(`/admin/courses/${courseId}/topics`);
      setTopics(res.topics);
    } catch { setTopics([]); }
  }

  function openCreate() {
    setForm(defaultForm);
    setEditingId(null);
    setFile(null);
    setTopics([]);
    setShowForm(true);
  }

  function openEdit(m: Material) {
    setForm({
      title: m.title, materialType: m.material_type, description: m.description ?? "",
      url: m.url ?? "", displayOrder: m.display_order.toString(), viewOnly: m.view_only,
      isActive: m.is_active, batchId: m.batch_id ?? "", courseId: m.course_id ?? "",
      programId: m.program_id ?? "", topicId: m.topic_id ?? "",
    });
    setEditingId(m.id);
    setFile(null);
    if (m.course_id) void loadTopics(m.course_id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(""); setMessage("");
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("materialType", form.materialType);
      if (form.description) fd.append("description", form.description);
      if (form.url) fd.append("url", form.url);
      fd.append("displayOrder", form.displayOrder);
      fd.append("viewOnly", String(form.viewOnly));
      fd.append("isActive", String(form.isActive));
      if (form.batchId) fd.append("batchId", form.batchId);
      if (form.courseId) fd.append("courseId", form.courseId);
      if (form.programId) fd.append("programId", form.programId);
      if (form.topicId) fd.append("topicId", form.topicId);
      if (file) fd.append("file", file);

      if (editingId) {
        await apiRequest(`/admin/materials/${editingId}`, "PUT", fd);
        setMessage("Material updated");
      } else {
        await apiRequest("/admin/materials", "POST", fd);
        setMessage("Material created");
      }
      setShowForm(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this material?")) return;
    try {
      await apiRequest(`/admin/materials/${id}`, "DELETE");
      setMessage("Material deleted");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
  }

  async function viewMaterial(m: Material) {
    if (m.url) { window.open(m.url, "_blank", "noopener"); return; }
    if (!m.s3_key) return;
    try {
      const res = await apiRequest<{ url: string; title: string }>(`/admin/materials/${m.id}/view`);
      if (m.material_type === "pdf") {
        setViewingUrl(res.url);
        setViewingTitle(res.title);
      } else {
        window.open(res.url, "_blank", "noopener");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to open"); }
  }

  const filtered = materials.filter((m) => {
    if (typeFilter !== "all" && m.material_type !== typeFilter) return false;
    return true;
  });

  if (loading) return <p className="muted">Loading materials…</p>;

  // PDF Viewer overlay
  if (viewingUrl) {
    return (
      <div className="pdf-viewer-overlay">
        <div className="pdf-viewer-header">
          <h3>{viewingTitle}</h3>
          <button className="button danger" onClick={() => { setViewingUrl(null); setViewingTitle(""); }}>Close</button>
        </div>
        <iframe src={`${viewingUrl}#toolbar=0&navpanes=0`} className="pdf-viewer-frame" title={viewingTitle} />
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <p className="message error">{error}</p>}
      {message && <p className="message success">{message}</p>}

      {/* Controls */}
      <section className="card">
        <header className="card-header">
          <h3>Course Materials</h3>
          <button className="button" onClick={openCreate}>+ Add Material</button>
        </header>
        <div className="row-inline" style={{ gap: 12, flexWrap: "wrap" }}>
          <label style={{ minWidth: 160 }}>
            Filter by Type
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
            </select>
          </label>
          <label style={{ minWidth: 200 }}>
            Filter by Batch
            <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
              <option value="">All Batches</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label style={{ minWidth: 200 }}>
            Filter by Course
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="">All Courses</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <p className="muted" style={{ alignSelf: "flex-end" }}>{filtered.length} material(s)</p>
        </div>
      </section>

      {/* Form */}
      {showForm && (
        <section className="card">
          <header className="card-header">
            <h3>{editingId ? "Edit Material" : "Add Material"}</h3>
            <button className="button danger" onClick={() => setShowForm(false)}>Cancel</button>
          </header>
          <form onSubmit={(e) => void handleSubmit(e)} className="form-grid">
            <label>Title *<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
            <label>Type *
              <select value={form.materialType} onChange={(e) => setForm({ ...form, materialType: e.target.value })}>
                {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>Batch
              <select value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}>
                <option value="">None</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>Course
              <select value={form.courseId} onChange={(e) => { setForm({ ...form, courseId: e.target.value, topicId: "" }); void loadTopics(e.target.value); }}>
                <option value="">None</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <label>Topic
              <select value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })} disabled={!topics.length}>
                <option value="">None</option>
                {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
            <label>Program
              <select value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })}>
                <option value="">None</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>
            <label>URL (for links)<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></label>
            <label>File Upload<input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept=".pdf,.doc,.docx,.sql,.zip,.txt" /></label>
            <label>Display Order<input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} /></label>
            <div className="row-inline" style={{ gap: 20 }}>
              <label className="checkbox-label"><input type="checkbox" checked={form.viewOnly} onChange={(e) => setForm({ ...form, viewOnly: e.target.checked })} /> View Only (no download)</label>
              <label className="checkbox-label"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
            </div>
            <button type="submit" className="button" disabled={submitting}>{submitting ? "Saving…" : editingId ? "Update" : "Create"}</button>
          </form>
        </section>
      )}

      {/* Table */}
      <section className="card">
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th>Type</th><th>Title</th><th>Batch</th><th>Course</th><th>Topic</th><th>Source</th><th>View Only</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td><span className="mat-type-badge">{TYPE_ICONS[m.material_type] ?? "📎"} {m.material_type}</span></td>
                  <td><strong>{m.title}</strong>{m.description && <span className="muted" style={{ display: "block", fontSize: "0.8rem" }}>{m.description.slice(0, 60)}</span>}</td>
                  <td className="muted">{m.batch_name ?? "—"}</td>
                  <td className="muted">{m.course_title ?? "—"}</td>
                  <td className="muted">{m.topic_title ?? "—"}</td>
                  <td>{m.s3_key ? "📁 S3" : m.url ? "🔗 URL" : "—"}</td>
                  <td>{m.view_only ? "🔒 Yes" : "📥 No"}</td>
                  <td><span className={`badge badge-${m.is_active ? "approved" : "rejected"}`}>{m.is_active ? "Active" : "Inactive"}</span></td>
                  <td>
                    <div className="row-inline" style={{ gap: 4 }}>
                      {(m.s3_key || m.url) && <button className="button-sm" onClick={() => void viewMaterial(m)}>View</button>}
                      <button className="button-sm" onClick={() => openEdit(m)}>Edit</button>
                      <button className="button-sm danger" onClick={() => void handleDelete(m.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={9} className="muted" style={{ textAlign: "center" }}>No materials found</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
