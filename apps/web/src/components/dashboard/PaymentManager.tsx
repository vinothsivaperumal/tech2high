"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";

interface Payment {
  id: string;
  student_id: string;
  batch_id: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  paid_date: string | null;
  status: "pending" | "partial" | "paid" | "overdue";
  method: string | null;
  remarks: string | null;
  student_name: string;
  student_email: string;
  batch_name: string | null;
  program_title: string | null;
  created_at: string;
}

interface Student { id: string; full_name: string; email: string; }
interface Batch { id: string; name: string; }

const ROWS_OPTIONS = [5, 10, 25, 50];
const STATUS_COLORS: Record<string, string> = { pending: "badge-pending", partial: "badge-warning", paid: "badge-approved", overdue: "badge-rejected" };

export function PaymentManager() {
  const [payments, setPayments] = useState<Payment[]>([]);
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

  const initForm = { studentId: "", batchId: "", amount: "", paidAmount: "", dueDate: "", paidDate: "", status: "pending", method: "", remarks: "" };
  const [form, setForm] = useState(initForm);

  useEffect(() => { void loadData(); }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, pageSize]);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [pRes, sRes, bRes] = await Promise.all([
        apiRequest<{ payments: Payment[] }>("/admin/payments"),
        apiRequest<{ students: Student[] }>("/admin/students"),
        apiRequest<{ batches: Batch[] }>("/admin/batches")
      ]);
      setPayments(pRes.payments); setStudents(sRes.students); setBatches(bRes.batches);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  const filtered = useMemo(() => {
    let list = payments;
    if (filterStatus !== "all") list = list.filter(p => p.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.student_name?.toLowerCase().includes(q) || p.student_email?.toLowerCase().includes(q) || p.batch_name?.toLowerCase().includes(q));
    }
    return list;
  }, [payments, search, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  function openEdit(p: Payment) {
    setEditId(p.id);
    setForm({ studentId: p.student_id, batchId: p.batch_id || "", amount: String(p.amount), paidAmount: String(p.paid_amount), dueDate: p.due_date?.split("T")[0] || "", paidDate: p.paid_date?.split("T")[0] || "", status: p.status, method: p.method || "", remarks: p.remarks || "" });
    setShowForm(true);
  }

  function openNew() {
    setEditId(null); setForm(initForm); setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSubmitting(true); setError(""); setMessage("");
    try {
      const body: Record<string, unknown> = {
        studentId: form.studentId,
        batchId: form.batchId || undefined,
        amount: Number(form.amount),
        paidAmount: Number(form.paidAmount || 0),
        dueDate: form.dueDate || undefined,
        paidDate: form.paidDate || undefined,
        status: form.status,
        method: form.method || undefined,
        remarks: form.remarks || undefined
      };
      if (editId) {
        await apiRequest(`/admin/payments/${editId}`, "PATCH", body);
        setMessage("Payment updated.");
      } else {
        await apiRequest("/admin/payments", "POST", body);
        setMessage("Payment created.");
      }
      setShowForm(false); await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this payment record?")) return;
    try { await apiRequest(`/admin/payments/${id}`, "DELETE"); setMessage("Payment deleted."); await loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  if (showForm) {
    return (
      <div className="stack">
        <div className="dt-header">
          <h3>{editId ? "Edit Payment" : "Add Payment"}</h3>
          <div className="dt-header-actions">
            <button className="button secondary" onClick={() => setShowForm(false)}>← Back</button>
          </div>
        </div>
        <form className="card" onSubmit={handleSubmit}>
          {error && <p className="message error">{error}</p>}
          <div className="form-grid-2">
            <label>Student *
              <select value={form.studentId} onChange={e => setForm({...form, studentId: e.target.value})} required>
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
            <label>Amount *<input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required /></label>
            <label>Paid Amount<input type="number" step="0.01" value={form.paidAmount} onChange={e => setForm({...form, paidAmount: e.target.value})} /></label>
            <label>Due Date<input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} /></label>
            <label>Paid Date<input type="date" value={form.paidDate} onChange={e => setForm({...form, paidDate: e.target.value})} /></label>
            <label>Status
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </label>
            <label>Method<input value={form.method} onChange={e => setForm({...form, method: e.target.value})} placeholder="e.g. UPI, Bank Transfer" /></label>
          </div>
          <label>Remarks<textarea value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} rows={2} /></label>
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
        <h3>Payments ({filtered.length})</h3>
        <div className="dt-header-actions">
          <button className="button" onClick={openNew}>+ Add Payment</button>
        </div>
      </div>
      {error && <p className="message error">{error}</p>}
      {message && <p className="message success">{message}</p>}

      <div className="dt-filters">
        <input className="dt-search" placeholder="Search student or batch..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
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
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.student_name}</strong><br /><span className="muted">{p.student_email}</span></td>
                    <td>{p.batch_name || "—"}</td>
                    <td>₹{Number(p.amount).toLocaleString()}</td>
                    <td>₹{Number(p.paid_amount).toLocaleString()}</td>
                    <td>{p.due_date ? new Date(p.due_date).toLocaleDateString() : "—"}</td>
                    <td><span className={`badge ${STATUS_COLORS[p.status] || ""}`}>{p.status}</span></td>
                    <td>{p.method || "—"}</td>
                    <td>
                      <div className="dt-actions">
                        <button className="dt-action-btn" title="Edit" onClick={() => openEdit(p)}>✏️</button>
                        <button className="dt-action-btn" title="Delete" onClick={() => handleDelete(p.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!paged.length && <tr><td colSpan={8} className="muted" style={{ textAlign: "center" }}>No payments found</td></tr>}
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
