"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

interface Credential {
  id: string;
  name: string;
  credential_type: string;
  environment: string | null;
  host: string | null;
  port: number | null;
  database_name: string | null;
  username: string | null;
  password_encrypted: string | null;
  access_url: string | null;
  region: string | null;
  notes: string | null;
  is_active: boolean;
  expiry_date: string | null;
  allow_trainer_view: boolean;
  allow_student_view: boolean;
  created_by_email: string | null;
  created_at: string;
}

interface CredentialAssignment {
  id: string;
  credential_id: string;
  credential_name: string;
  credential_type: string;
  batch_id: string | null;
  batch_name: string | null;
  course_id: string | null;
  course_title: string | null;
  program_id: string | null;
  program_title: string | null;
}

interface Batch { id: string; name: string; }
interface Course { id: string; title: string; }
interface Program { id: string; title: string; }

const CREDENTIAL_TYPES = ["postgresql", "aws", "snowflake", "mssql", "other"] as const;

const TYPE_ICONS: Record<string, string> = {
  postgresql: "🐘", aws: "☁️", snowflake: "❄️", mssql: "🗄️", other: "🔑"
};

const defaultForm = {
  name: "", credentialType: "postgresql" as string, environment: "", host: "", port: "",
  databaseName: "", username: "", password: "", accessUrl: "", region: "", notes: "",
  isActive: true, expiryDate: "", allowTrainerView: false, allowStudentView: true,
};

export function CredentialManager() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [assignments, setAssignments] = useState<CredentialAssignment[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [typeFilter, setTypeFilter] = useState("all");
  const [tab, setTab] = useState<"credentials" | "assignments">("credentials");

  // Assignment form
  const [assignForm, setAssignForm] = useState({ credentialId: "", batchId: "", courseId: "", programId: "" });

  async function load() {
    setLoading(true);
    try {
      const [creds, assigns, batchRes, courseRes, progRes] = await Promise.all([
        apiRequest<{ credentials: Credential[] }>("/admin/credentials"),
        apiRequest<{ assignments: CredentialAssignment[] }>("/admin/credential-assignments"),
        apiRequest<{ batches: Batch[] }>("/admin/batches"),
        apiRequest<{ courses: Course[] }>("/admin/courses"),
        apiRequest<{ programs: Program[] }>("/admin/programs"),
      ]);
      setCredentials(creds.credentials);
      setAssignments(assigns.assignments);
      setBatches(batchRes.batches);
      setCourses(courseRes.courses);
      setPrograms(progRes.programs);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setForm(defaultForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(c: Credential) {
    setForm({
      name: c.name, credentialType: c.credential_type, environment: c.environment ?? "",
      host: c.host ?? "", port: c.port?.toString() ?? "", databaseName: c.database_name ?? "",
      username: c.username ?? "", password: "", accessUrl: c.access_url ?? "",
      region: c.region ?? "", notes: c.notes ?? "", isActive: c.is_active,
      expiryDate: c.expiry_date?.slice(0, 10) ?? "", allowTrainerView: c.allow_trainer_view,
      allowStudentView: c.allow_student_view,
    });
    setEditingId(c.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(""); setMessage("");
    try {
      const body: Record<string, unknown> = {
        name: form.name, credentialType: form.credentialType, environment: form.environment || undefined,
        host: form.host || undefined, port: form.port ? Number(form.port) : undefined,
        databaseName: form.databaseName || undefined, username: form.username || undefined,
        accessUrl: form.accessUrl || undefined, region: form.region || undefined,
        notes: form.notes || undefined, isActive: form.isActive,
        expiryDate: form.expiryDate || undefined, allowTrainerView: form.allowTrainerView,
        allowStudentView: form.allowStudentView,
      };
      if (form.password) body.password = form.password;

      if (editingId) {
        await apiRequest(`/admin/credentials/${editingId}`, "PUT", body);
        setMessage("Credential updated");
      } else {
        await apiRequest("/admin/credentials", "POST", body);
        setMessage("Credential created");
      }
      setShowForm(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this credential?")) return;
    try {
      await apiRequest(`/admin/credentials/${id}`, "DELETE");
      setMessage("Credential deleted");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
  }

  async function revealPassword(id: string) {
    try {
      const res = await apiRequest<{ password: string }>(`/admin/credentials/${id}/reveal`, "POST");
      setRevealedPasswords((p) => ({ ...p, [id]: res.password }));
      // Auto-hide after 30 seconds
      setTimeout(() => setRevealedPasswords((p) => { const n = { ...p }; delete n[id]; return n; }), 30000);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to reveal password"); }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMessage("");
    try {
      await apiRequest("/admin/credential-assignments", "POST", {
        credentialId: assignForm.credentialId,
        batchId: assignForm.batchId || undefined,
        courseId: assignForm.courseId || undefined,
        programId: assignForm.programId || undefined,
      });
      setMessage("Credential assigned");
      setAssignForm({ credentialId: "", batchId: "", courseId: "", programId: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to assign"); }
  }

  async function removeAssignment(id: string) {
    try {
      await apiRequest(`/admin/credential-assignments/${id}`, "DELETE");
      setMessage("Assignment removed");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to remove"); }
  }

  const filtered = typeFilter === "all" ? credentials : credentials.filter((c) => c.credential_type === typeFilter);

  if (loading) return <p className="muted">Loading credentials…</p>;

  return (
    <div className="stack">
      {error && <p className="message error">{error}</p>}
      {message && <p className="message success">{message}</p>}

      {/* Tabs */}
      <div className="dt-tabs">
        <button className={`dt-tab ${tab === "credentials" ? "active" : ""}`} onClick={() => setTab("credentials")}>Credentials</button>
        <button className={`dt-tab ${tab === "assignments" ? "active" : ""}`} onClick={() => setTab("assignments")}>Batch Assignments</button>
      </div>

      {tab === "credentials" && (
        <>
          {/* Controls */}
          <section className="card">
            <header className="card-header">
              <h3>Credentials</h3>
              <button className="button" onClick={openCreate}>+ Add Credential</button>
            </header>
            <div className="row-inline" style={{ gap: 12, flexWrap: "wrap" }}>
              <label style={{ minWidth: 180 }}>
                Filter by Type
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">All Types</option>
                  {CREDENTIAL_TYPES.map((t) => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                </select>
              </label>
              <p className="muted" style={{ alignSelf: "flex-end" }}>{filtered.length} credential(s)</p>
            </div>
          </section>

          {/* Form */}
          {showForm && (
            <section className="card">
              <header className="card-header">
                <h3>{editingId ? "Edit Credential" : "New Credential"}</h3>
                <button className="button danger" onClick={() => setShowForm(false)}>Cancel</button>
              </header>
              <form onSubmit={(e) => void handleSubmit(e)} className="form-grid">
                <label>Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
                <label>Type *
                  <select value={form.credentialType} onChange={(e) => setForm({ ...form, credentialType: e.target.value })}>
                    {CREDENTIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label>Environment<input value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} placeholder="development / staging / production" /></label>
                <label>Host<input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /></label>
                <label>Port<input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></label>
                <label>Database Name<input value={form.databaseName} onChange={(e) => setForm({ ...form, databaseName: e.target.value })} /></label>
                <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
                <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editingId ? "(leave blank to keep)" : ""} /></label>
                <label>Access URL<input value={form.accessUrl} onChange={(e) => setForm({ ...form, accessUrl: e.target.value })} /></label>
                <label>Region<input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></label>
                <label>Expiry Date<input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></label>
                <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></label>
                <div className="row-inline" style={{ gap: 20 }}>
                  <label className="checkbox-label"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
                  <label className="checkbox-label"><input type="checkbox" checked={form.allowStudentView} onChange={(e) => setForm({ ...form, allowStudentView: e.target.checked })} /> Student Visible</label>
                  <label className="checkbox-label"><input type="checkbox" checked={form.allowTrainerView} onChange={(e) => setForm({ ...form, allowTrainerView: e.target.checked })} /> Trainer Visible</label>
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
                    <th>Type</th><th>Name</th><th>Host</th><th>Database</th><th>Username</th><th>Password</th><th>Status</th><th>Visibility</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td><span className="cred-type-badge" data-type={c.credential_type}>{TYPE_ICONS[c.credential_type] ?? "🔑"} {c.credential_type}</span></td>
                      <td><strong>{c.name}</strong>{c.environment && <span className="muted" style={{ display: "block", fontSize: "0.8rem" }}>{c.environment}</span>}</td>
                      <td className="muted">{c.host ?? "—"}{c.port ? `:${c.port}` : ""}</td>
                      <td className="muted">{c.database_name ?? "—"}</td>
                      <td><code>{c.username ?? "—"}</code></td>
                      <td>
                        {revealedPasswords[c.id] ? (
                          <span className="cred-password-revealed">
                            <code>{revealedPasswords[c.id]}</code>
                            <button className="button-sm" onClick={() => setRevealedPasswords((p) => { const n = { ...p }; delete n[c.id]; return n; })}>Hide</button>
                          </span>
                        ) : (
                          <span className="cred-password-masked">
                            <code>••••••••</code>
                            <button className="button-sm" onClick={() => void revealPassword(c.id)}>👁 Reveal</button>
                          </span>
                        )}
                      </td>
                      <td><span className={`badge badge-${c.is_active ? "approved" : "rejected"}`}>{c.is_active ? "Active" : "Inactive"}</span></td>
                      <td>
                        <span className="muted" style={{ fontSize: "0.8rem" }}>
                          {c.allow_student_view && "👨‍🎓"} {c.allow_trainer_view && "👨‍🏫"}
                        </span>
                      </td>
                      <td>
                        <div className="row-inline" style={{ gap: 4 }}>
                          <button className="button-sm" onClick={() => openEdit(c)}>Edit</button>
                          <button className="button-sm danger" onClick={() => void handleDelete(c.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td colSpan={9} className="muted" style={{ textAlign: "center" }}>No credentials found</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "assignments" && (
        <>
          {/* Assign form */}
          <section className="card">
            <header className="card-header"><h3>Assign Credential to Batch</h3></header>
            <form onSubmit={(e) => void handleAssign(e)} className="row-inline" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ minWidth: 200 }}>
                Credential *
                <select value={assignForm.credentialId} onChange={(e) => setAssignForm({ ...assignForm, credentialId: e.target.value })} required>
                  <option value="">Select…</option>
                  {credentials.map((c) => <option key={c.id} value={c.id}>{TYPE_ICONS[c.credential_type]} {c.name}</option>)}
                </select>
              </label>
              <label style={{ minWidth: 200 }}>
                Batch *
                <select value={assignForm.batchId} onChange={(e) => setAssignForm({ ...assignForm, batchId: e.target.value })} required>
                  <option value="">Select…</option>
                  {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label style={{ minWidth: 200 }}>
                Course
                <select value={assignForm.courseId} onChange={(e) => setAssignForm({ ...assignForm, courseId: e.target.value })}>
                  <option value="">All courses</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
              <label style={{ minWidth: 200 }}>
                Program
                <select value={assignForm.programId} onChange={(e) => setAssignForm({ ...assignForm, programId: e.target.value })}>
                  <option value="">None</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </label>
              <button type="submit" className="button">Assign</button>
            </form>
          </section>

          {/* Assignments table */}
          <section className="card">
            <header className="card-header"><h3>Current Assignments ({assignments.length})</h3></header>
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr><th>Credential</th><th>Type</th><th>Batch</th><th>Course</th><th>Program</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.credential_name}</strong></td>
                      <td>{TYPE_ICONS[a.credential_type]} {a.credential_type}</td>
                      <td>{a.batch_name ?? "—"}</td>
                      <td>{a.course_title ?? "All"}</td>
                      <td>{a.program_title ?? "—"}</td>
                      <td><button className="button-sm danger" onClick={() => void removeAssignment(a.id)}>Remove</button></td>
                    </tr>
                  ))}
                  {!assignments.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center" }}>No assignments</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
