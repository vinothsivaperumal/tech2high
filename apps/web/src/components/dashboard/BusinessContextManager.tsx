"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Client {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  created_at: string;
}

interface Project {
  id: string;
  title: string;
  client_id: string | null;
  client_name: string | null;
  description: string | null;
  technologies: string | null;
  domain: string | null;
  created_at: string;
}

interface StudentProject {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  project_id: string;
  project_title: string;
  client_name: string | null;
  batch_name: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

interface StudentOption {
  id: string;
  full_name: string;
  email: string;
}

interface Batch {
  id: string;
  name: string;
}

type BizTab = "clients" | "projects" | "assignments";

/* ── Client Manager Sub-Component ───────────────────────────────────────── */

function ClientManager() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", industry: "", description: "", logoUrl: "", website: "" });

  async function load() {
    setLoading(true);
    try {
      const r = await apiRequest<{ clients: Client[] }>("/admin/clients");
      setClients(r.clients);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    try {
      const body = { name: form.name, industry: form.industry || undefined, description: form.description || undefined, logoUrl: form.logoUrl || undefined, website: form.website || undefined };
      if (editId) {
        await apiRequest(`/admin/clients/${editId}`, "PUT", body);
        setMessage("Client updated.");
      } else {
        await apiRequest("/admin/clients", "POST", body);
        setMessage("Client created.");
      }
      resetForm(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this client?")) return;
    try { await apiRequest(`/admin/clients/${id}`, "DELETE"); setMessage("Client deleted."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
  }

  function startEdit(c: Client) {
    setEditId(c.id);
    setForm({ name: c.name, industry: c.industry ?? "", description: c.description ?? "", logoUrl: c.logo_url ?? "", website: c.website ?? "" });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false); setEditId(null);
    setForm({ name: "", industry: "", description: "", logoUrl: "", website: "" });
  }

  return (
    <div className="stack">
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Clients ({clients.length})</h3>
        <button className="button" onClick={() => { showForm && !editId ? resetForm() : setShowForm(true); setEditId(null); setForm({ name: "", industry: "", description: "", logoUrl: "", website: "" }); }}>
          {showForm && !editId ? "Cancel" : "+ New Client"}
        </button>
      </div>

      {showForm ? (
        <section className="card">
          <header className="card-header"><h3>{editId ? "Edit Client" : "Create Client"}</h3></header>
          <form className="form" onSubmit={handleSubmit}>
            <label>Name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={200} /></label>
            <label>Industry <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} maxLength={100} placeholder="e.g. Finance, Healthcare" /></label>
            <label>Description <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={2000} /></label>
            <label>Website <input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." maxLength={500} /></label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="button">{editId ? "Update" : "Create"}</button>
              {editId ? <button type="button" className="button" onClick={resetForm}>Cancel</button> : null}
            </div>
          </form>
        </section>
      ) : null}

      {loading ? <p className="muted">Loading…</p> : (
        <div className="tbm-list">
          {clients.map((c) => (
            <div className="tbm-item" key={c.id}>
              <div className="tbm-item-header">
                <div>
                  <strong>{c.name}</strong>
                  {c.industry ? <span className="tbm-badge" style={{ marginLeft: "0.5rem" }}>{c.industry}</span> : null}
                  {c.website ? <a href={c.website} target="_blank" rel="noopener noreferrer" className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>🔗 Website</a> : null}
                </div>
                <div className="tbm-item-actions">
                  <button className="button button-sm" onClick={() => startEdit(c)}>Edit</button>
                  <button className="button button-sm button-danger" onClick={() => handleDelete(c.id)}>Del</button>
                </div>
              </div>
              {c.description ? <p className="tbm-item-desc">{c.description}</p> : null}
            </div>
          ))}
          {!clients.length ? <p className="muted">No clients yet.</p> : null}
        </div>
      )}
    </div>
  );
}

/* ── Project Manager Sub-Component ──────────────────────────────────────── */

function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", clientId: "", description: "", technologies: "", domain: "" });

  async function load() {
    setLoading(true);
    try {
      const [pr, cr] = await Promise.all([
        apiRequest<{ projects: Project[] }>("/admin/projects"),
        apiRequest<{ clients: Client[] }>("/admin/clients"),
      ]);
      setProjects(pr.projects);
      setClients(cr.clients);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    try {
      const body = {
        title: form.title, clientId: form.clientId || undefined,
        description: form.description || undefined, technologies: form.technologies || undefined,
        domain: form.domain || undefined,
      };
      if (editId) {
        await apiRequest(`/admin/projects/${editId}`, "PUT", body);
        setMessage("Project updated.");
      } else {
        await apiRequest("/admin/projects", "POST", body);
        setMessage("Project created.");
      }
      resetForm(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project?")) return;
    try { await apiRequest(`/admin/projects/${id}`, "DELETE"); setMessage("Project deleted."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
  }

  function startEdit(p: Project) {
    setEditId(p.id);
    setForm({ title: p.title, clientId: p.client_id ?? "", description: p.description ?? "", technologies: p.technologies ?? "", domain: p.domain ?? "" });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false); setEditId(null);
    setForm({ title: "", clientId: "", description: "", technologies: "", domain: "" });
  }

  return (
    <div className="stack">
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Projects ({projects.length})</h3>
        <button className="button" onClick={() => { showForm && !editId ? resetForm() : setShowForm(true); setEditId(null); setForm({ title: "", clientId: "", description: "", technologies: "", domain: "" }); }}>
          {showForm && !editId ? "Cancel" : "+ New Project"}
        </button>
      </div>

      {showForm ? (
        <section className="card">
          <header className="card-header"><h3>{editId ? "Edit Project" : "Create Project"}</h3></header>
          <form className="form" onSubmit={handleSubmit}>
            <label>Title <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={300} /></label>
            <label>Client
              <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">— No client —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Domain <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="e.g. E-commerce, FinTech" maxLength={200} /></label>
            <label>Technologies <input value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} placeholder="Python, SQL, Snowflake" maxLength={1000} /></label>
            <label>Description <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} maxLength={5000} /></label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="button">{editId ? "Update" : "Create"}</button>
              {editId ? <button type="button" className="button" onClick={resetForm}>Cancel</button> : null}
            </div>
          </form>
        </section>
      ) : null}

      {loading ? <p className="muted">Loading…</p> : (
        <div className="tbm-list">
          {projects.map((p) => (
            <div className="tbm-item" key={p.id}>
              <div className="tbm-item-header">
                <div>
                  <strong>{p.title}</strong>
                  {p.client_name ? <span className="tbm-badge" style={{ marginLeft: "0.5rem" }}>{p.client_name}</span> : null}
                  {p.domain ? <span className="muted" style={{ marginLeft: "0.5rem" }}>· {p.domain}</span> : null}
                </div>
                <div className="tbm-item-actions">
                  <button className="button button-sm" onClick={() => startEdit(p)}>Edit</button>
                  <button className="button button-sm button-danger" onClick={() => handleDelete(p.id)}>Del</button>
                </div>
              </div>
              {p.technologies ? <p style={{ margin: "0.3rem 0 0", fontSize: "0.82rem", color: "#555" }}>🛠 {p.technologies}</p> : null}
              {p.description ? <p className="tbm-item-desc">{p.description}</p> : null}
            </div>
          ))}
          {!projects.length ? <p className="muted">No projects yet.</p> : null}
        </div>
      )}
    </div>
  );
}

/* ── Student Project Assignment Sub-Component ───────────────────────────── */

function StudentProjectAssignment() {
  const [assignments, setAssignments] = useState<StudentProject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ studentId: "", projectId: "", batchId: "", role: "", startDate: "", endDate: "", description: "" });

  async function load() {
    setLoading(true);
    try {
      const [ar, pr, sr, br] = await Promise.all([
        apiRequest<{ studentProjects: StudentProject[] }>("/admin/student-projects"),
        apiRequest<{ projects: Project[] }>("/admin/projects"),
        apiRequest<{ students: StudentOption[] }>("/admin/students"),
        apiRequest<{ batches: Batch[] }>("/admin/batches"),
      ]);
      setAssignments(ar.studentProjects);
      setProjects(pr.projects);
      setStudents(sr.students);
      setBatches(br.batches);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    try {
      await apiRequest("/admin/student-projects", "POST", {
        studentId: form.studentId, projectId: form.projectId,
        batchId: form.batchId || undefined, role: form.role || undefined,
        startDate: form.startDate || undefined, endDate: form.endDate || undefined,
        description: form.description || undefined,
      });
      setMessage("Project assigned to student.");
      setShowForm(false);
      setForm({ studentId: "", projectId: "", batchId: "", role: "", startDate: "", endDate: "", description: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to assign"); }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this assignment?")) return;
    try { await apiRequest(`/admin/student-projects/${id}`, "DELETE"); setMessage("Removed."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="stack">
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Student Project Assignments ({assignments.length})</h3>
        <button className="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Assign Project"}
        </button>
      </div>

      {showForm ? (
        <section className="card">
          <header className="card-header"><h3>Assign Project to Student</h3></header>
          <form className="form" onSubmit={handleSubmit}>
            <label>Student
              <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required>
                <option value="">— Select Student —</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
              </select>
            </label>
            <label>Project
              <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} required>
                <option value="">— Select Project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}{p.client_name ? ` (${p.client_name})` : ""}</option>)}
              </select>
            </label>
            <label>Batch
              <select value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}>
                <option value="">— No Batch —</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>Role <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Data Analyst, Developer" maxLength={200} /></label>
            <div style={{ display: "flex", gap: "1rem" }}>
              <label style={{ flex: 1 }}>Start Date <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
              <label style={{ flex: 1 }}>End Date <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
            </div>
            <label>Description <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={2000} /></label>
            <button type="submit" className="button">Assign</button>
          </form>
        </section>
      ) : null}

      {loading ? <p className="muted">Loading…</p> : (
        <div className="tbm-list">
          {assignments.map((a) => (
            <div className="tbm-item" key={a.id}>
              <div className="tbm-item-header">
                <div>
                  <strong>{a.student_name || a.student_email}</strong>
                  <span style={{ margin: "0 0.5rem" }}>→</span>
                  <strong>{a.project_title}</strong>
                  {a.client_name ? <span className="tbm-badge" style={{ marginLeft: "0.5rem" }}>{a.client_name}</span> : null}
                </div>
                <div className="tbm-item-actions">
                  <button className="button button-sm button-danger" onClick={() => handleRemove(a.id)}>Remove</button>
                </div>
              </div>
              <p className="muted" style={{ fontSize: "0.82rem", margin: "0.3rem 0 0" }}>
                {a.role ? `Role: ${a.role}` : ""}
                {a.start_date ? ` · ${new Date(a.start_date).toLocaleDateString()} – ${a.end_date ? new Date(a.end_date).toLocaleDateString() : "Present"}` : ""}
                {a.batch_name ? ` · Batch: ${a.batch_name}` : ""}
              </p>
              {a.description ? <p className="tbm-item-desc">{a.description}</p> : null}
            </div>
          ))}
          {!assignments.length ? <p className="muted">No project assignments yet.</p> : null}
        </div>
      )}
    </div>
  );
}

/* ── Main Export ─────────────────────────────────────────────────────────── */

export function BusinessContextManager() {
  const [tab, setTab] = useState<BizTab>("clients");

  return (
    <div className="stack">
      <div className="biz-tabs">
        <button className={`biz-tab ${tab === "clients" ? "active" : ""}`} onClick={() => setTab("clients")}>🏢 Clients</button>
        <button className={`biz-tab ${tab === "projects" ? "active" : ""}`} onClick={() => setTab("projects")}>📂 Projects</button>
        <button className={`biz-tab ${tab === "assignments" ? "active" : ""}`} onClick={() => setTab("assignments")}>🔗 Assign to Students</button>
      </div>
      {tab === "clients" ? <ClientManager /> : null}
      {tab === "projects" ? <ProjectManager /> : null}
      {tab === "assignments" ? <StudentProjectAssignment /> : null}
    </div>
  );
}
