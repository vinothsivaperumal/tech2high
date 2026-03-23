"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";

interface AdminTrainer {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  institute: string | null;
  experience_level: string | null;
  created_at: string;
  updated_at: string;
  batch_count: number;
}

interface TrainerBatch {
  id: string;
  name: string;
  created_at: string;
  student_count: number;
}

interface EditForm {
  fullName: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  institute: string;
  experienceLevel: string;
}

const BLANK_FORM: EditForm = {
  fullName: "",
  phone: "",
  city: "",
  state: "",
  country: "",
  institute: "",
  experienceLevel: "",
};

const ROWS_OPTIONS = [5, 10, 25, 50];

interface SelectedTrainer extends AdminTrainer {
  batches: TrainerBatch[];
}

export function AdminTrainersSection() {
  const [trainers, setTrainers] = useState<AdminTrainer[]>([]);
  const [selected, setSelected] = useState<SelectedTrainer | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editForm, setEditForm] = useState<EditForm>(BLANK_FORM);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  useEffect(() => { void loadTrainers(); }, []);
  useEffect(() => { setPage(1); }, [search, pageSize]);

  async function loadTrainers() {
    setLoading(true); setError("");
    try { setTrainers((await apiRequest<{ trainers: AdminTrainer[] }>("/admin/trainers")).trainers); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load trainers"); }
    finally { setLoading(false); }
  }

  async function openTrainer(t: AdminTrainer) {
    setDetailLoading(true); setMessage(""); setError("");
    try {
      const res = await apiRequest<{ trainer: AdminTrainer; batches: TrainerBatch[] }>(`/admin/trainers/${t.id}`);
      setSelected({ ...res.trainer, batches: res.batches, batch_count: res.batches.length });
      setEditForm({ fullName: res.trainer.full_name ?? "", phone: res.trainer.phone ?? "", city: res.trainer.city ?? "", state: res.trainer.state ?? "", country: res.trainer.country ?? "", institute: res.trainer.institute ?? "", experienceLevel: res.trainer.experience_level ?? "" });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load trainer detail"); }
    finally { setDetailLoading(false); }
  }

  async function saveTrainer(e: FormEvent) {
    e.preventDefault(); if (!selected) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const res = await apiRequest<{ trainer: AdminTrainer }>(`/admin/trainers/${selected.id}`, "PATCH", editForm as unknown as Record<string, unknown>);
      setSelected((p) => p ? { ...p, ...res.trainer } : null);
      setTrainers((p) => p.map((t) => t.id === res.trainer.id ? { ...t, ...res.trainer } : t));
      setMessage("Trainer profile updated.");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save changes"); }
    finally { setSaving(false); }
  }

  const filtered = useMemo(() => {
    if (!search) return trainers;
    const q = search.toLowerCase();
    return trainers.filter((t) => t.email.toLowerCase().includes(q) || (t.full_name ?? "").toLowerCase().includes(q) || (t.institute ?? "").toLowerCase().includes(q));
  }, [trainers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startRow = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(safePage * pageSize, filtered.length);

  const allChecked = paginated.length > 0 && paginated.every((t) => checkedIds.has(t.id));
  function toggleAll() { setCheckedIds((prev) => { const next = new Set(prev); if (allChecked) { paginated.forEach((t) => next.delete(t.id)); } else { paginated.forEach((t) => next.add(t.id)); } return next; }); }
  function toggleOne(id: string) { setCheckedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  const filterTags: { label: string; onClear: () => void }[] = [];
  if (search) filterTags.push({ label: `Search: ${search}`, onClear: () => setSearch("") });

  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="dt-container">
        <div className="dt-header">
          <h3>Trainers Management</h3>
          <div className="dt-header-actions">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{trainers.length} total</span>
          </div>
        </div>

        <div className="dt-filters">
          <div className="dt-search">
            <span className="dt-search-icon">🔍</span>
            <input placeholder="Search name, email, institute…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {search ? <button type="button" className="dt-clear-btn" onClick={() => setSearch("")}>✕ Reset</button> : null}
        </div>

        {filterTags.length > 0 ? (
          <div className="dt-filter-tags">
            {filterTags.map((t) => <span className="dt-filter-tag" key={t.label}>{t.label} <button type="button" onClick={t.onClear}>✕</button></span>)}
          </div>
        ) : null}

        <div className="dt-info">
          <span>Showing {startRow}–{endRow} of {filtered.length} trainer{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th className="dt-check"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th>Name</th>
                <th>Email</th>
                <th>Institute</th>
                <th>Batches</th>
                <th>Country</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="dt-loading">Loading…</td></tr>
              ) : !paginated.length ? (
                <tr className="dt-empty"><td colSpan={7}>No trainers found.</td></tr>
              ) : paginated.map((t) => (
                <tr key={t.id}>
                  <td className="dt-check"><input type="checkbox" checked={checkedIds.has(t.id)} onChange={() => toggleOne(t.id)} /></td>
                  <td>
                    <div className="dt-name-cell">
                      <div className="dt-avatar">{(t.full_name ?? t.email).charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="dt-name-primary">{t.full_name ?? "—"}</div>
                        {t.phone ? <div className="dt-name-secondary">{t.phone}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td><span className="dt-name-secondary">{t.email}</span></td>
                  <td><span className="dt-name-secondary">{t.institute ?? "—"}</span></td>
                  <td><span className="dt-cell-tag">{t.batch_count} batch{t.batch_count !== 1 ? "es" : ""}</span></td>
                  <td><span className="dt-name-secondary">{t.country ?? "—"}</span></td>
                  <td>
                    <div className="dt-actions">
                      <button type="button" className="dt-action-btn" onClick={() => void openTrainer(t)}>View</button>
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Detail Drawer */}
      {(selected || detailLoading) ? (
        <>
          <div className="dt-drawer-overlay" onClick={() => { if (!detailLoading) setSelected(null); }} />
          <div className="dt-drawer">
            <div className="dt-drawer-header">
              <h3>{detailLoading ? "Loading…" : selected ? (selected.full_name || selected.email) : ""}</h3>
              <button type="button" className="dt-drawer-close" onClick={() => setSelected(null)}>✕ Close</button>
            </div>
            {detailLoading ? <p className="muted">Loading trainer details…</p> : null}
            {!detailLoading && selected ? (
              <div className="stack">
                <section className="card">
                  <header className="card-header"><h3>Profile — {selected.email}</h3><p className="muted">Joined {new Date(selected.created_at).toLocaleDateString()}</p></header>
                  <form className="form" onSubmit={(e) => void saveTrainer(e)}>
                    <label>Full Name<input value={editForm.fullName} onChange={(ev) => setEditForm((f) => ({ ...f, fullName: ev.target.value }))} /></label>
                    <label>Phone<input value={editForm.phone} onChange={(ev) => setEditForm((f) => ({ ...f, phone: ev.target.value }))} /></label>
                    <label>Institute / Company<input value={editForm.institute} onChange={(ev) => setEditForm((f) => ({ ...f, institute: ev.target.value }))} /></label>
                    <label>Country<input value={editForm.country} onChange={(ev) => setEditForm((f) => ({ ...f, country: ev.target.value }))} /></label>
                    <label>State<input value={editForm.state} onChange={(ev) => setEditForm((f) => ({ ...f, state: ev.target.value }))} /></label>
                    <label>City<input value={editForm.city} onChange={(ev) => setEditForm((f) => ({ ...f, city: ev.target.value }))} /></label>
                    <button type="submit" className="button" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
                  </form>
                </section>
                <section className="card">
                  <header className="card-header"><h3>Assigned Batches</h3></header>
                  <ul className="list">
                    {selected.batches.map((b) => (
                      <li className="list-item" key={b.id}>
                        <div className="row-inline"><strong>{b.name}</strong><span className="dt-badge dt-badge-info">{b.student_count} student{b.student_count !== 1 ? "s" : ""}</span></div>
                        <p className="muted">Created: {new Date(b.created_at).toLocaleDateString()}</p>
                      </li>
                    ))}
                    {!selected.batches.length ? <li className="list-item muted">No batches assigned.</li> : null}
                  </ul>
                </section>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
