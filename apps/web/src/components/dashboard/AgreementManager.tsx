"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";

interface Agreement {
  id: string;
  student_id: string;
  batch_id: string | null;
  agreement_type: string;
  sent_date: string | null;
  signed_date: string | null;
  expiry_date: string | null;
  status: string;
  student_name: string;
  student_email: string;
  batch_name: string | null;
  program_title: string | null;
  created_at: string;
}

interface Student { id: string; full_name: string; email: string; }
interface Batch { id: string; name: string; }

const ROWS_OPTIONS = [5, 10, 25, 50];
const STATUS_COLORS: Record<string, string> = { not_sent: "badge-pending", sent: "badge-warning", signed: "badge-approved", rejected: "badge-rejected", expired: "badge-inactive" };

export function AgreementManager() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
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

  const initForm = { studentId: "", batchId: "", agreementType: "training", status: "not_sent", sentDate: "", signedDate: "", expiryDate: "" };
  const [form, setForm] = useState(initForm);

  useEffect(() => { void loadData(); }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, pageSize]);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [aRes, sRes, bRes] = await Promise.all([
        apiRequest<{ agreements: Agreement[] }>("/admin/agreements"),
        apiRequest<{ students: Student[] }>("/admin/students"),
        apiRequest<{ batches: Batch[] }>("/admin/batches")
      ]);
      setAgreements(aRes.agreements); setStudents(sRes.students); setBatches(bRes.batches);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  const filtered = useMemo(() => {
    let list = agreements;
    if (filterStatus !== "all") list = list.filter(a => a.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.student_name?.toLowerCase().includes(q) || a.student_email?.toLowerCase().includes(q));
    }
    return list;
  }, [agreements, search, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  function openEdit(a: Agreement) {
    setEditId(a.id);
    setForm({ studentId: a.student_id, batchId: a.batch_id || "", agreementType: a.agreement_type, status: a.status, sentDate: a.sent_date?.split("T")[0] || "", signedDate: a.signed_date?.split("T")[0] || "", expiryDate: a.expiry_date?.split("T")[0] || "" });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSubmitting(true); setError(""); setMessage("");
    try {
      const body: Record<string, unknown> = {
        studentId: form.studentId,
        batchId: form.batchId || undefined,
        agreementType: form.agreementType,
        status: form.status,
        sentDate: form.sentDate || undefined,
        signedDate: form.signedDate || undefined,
        expiryDate: form.expiryDate || undefined
      };
      if (editId) {
        await apiRequest(`/admin/agreements/${editId}`, "PATCH", body);
        setMessage("Agreement updated.");
      } else {
        await apiRequest("/admin/agreements", "POST", body);
        setMessage("Agreement created.");
      }
      setShowForm(false); await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSubmitting(false); }
  }

  if (showForm) {
    return (
      <div className="stack">
        <div className="dt-header">
          <h3>{editId ? "Edit Agreement" : "Add Agreement"}</h3>
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
            <label>Batch
              <select value={form.batchId} onChange={e => setForm({...form, batchId: e.target.value})}>
                <option value="">Select Batch</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>Agreement Type<input value={form.agreementType} onChange={e => setForm({...form, agreementType: e.target.value})} /></label>
            <label>Status
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="not_sent">Not Sent</option>
                <option value="sent">Sent</option>
                <option value="signed">Signed</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
              </select>
            </label>
            <label>Sent Date<input type="date" value={form.sentDate} onChange={e => setForm({...form, sentDate: e.target.value})} /></label>
            <label>Signed Date<input type="date" value={form.signedDate} onChange={e => setForm({...form, signedDate: e.target.value})} /></label>
            <label>Expiry Date<input type="date" value={form.expiryDate} onChange={e => setForm({...form, expiryDate: e.target.value})} /></label>
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
        <h3>Agreements ({filtered.length})</h3>
        <div className="dt-header-actions">
          <button className="button" onClick={() => { setEditId(null); setForm(initForm); setShowForm(true); }}>+ Add Agreement</button>
        </div>
      </div>
      {error && <p className="message error">{error}</p>}
      {message && <p className="message success">{message}</p>}

      <div className="dt-filters">
        <input className="dt-search" placeholder="Search student..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="not_sent">Not Sent</option>
          <option value="sent">Sent</option>
          <option value="signed">Signed</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {loading ? <p className="muted">Loading...</p> : (
        <>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Batch</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Signed</th>
                  <th>Expiry</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.student_name}</strong><br /><span className="muted">{a.student_email}</span></td>
                    <td>{a.batch_name || "—"}</td>
                    <td>{a.agreement_type}</td>
                    <td><span className={`badge ${STATUS_COLORS[a.status] || ""}`}>{a.status.replace(/_/g, " ")}</span></td>
                    <td>{a.sent_date ? new Date(a.sent_date).toLocaleDateString() : "—"}</td>
                    <td>{a.signed_date ? new Date(a.signed_date).toLocaleDateString() : "—"}</td>
                    <td>{a.expiry_date ? new Date(a.expiry_date).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className="dt-actions">
                        <button className="dt-action-btn" title="Edit" onClick={() => openEdit(a)}>✏️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!paged.length && <tr><td colSpan={8} className="muted" style={{ textAlign: "center" }}>No agreements found</td></tr>}
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
