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

const PAGE_SIZE = 10;

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
  const [editForm, setEditForm] = useState<EditForm>(BLANK_FORM);

  useEffect(() => {
    void loadTrainers();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  async function loadTrainers() {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest<{ trainers: AdminTrainer[] }>("/admin/trainers");
      setTrainers(res.trainers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trainers");
    } finally {
      setLoading(false);
    }
  }

  async function openTrainer(t: AdminTrainer) {
    setDetailLoading(true);
    setMessage("");
    setError("");
    try {
      const res = await apiRequest<{ trainer: AdminTrainer; batches: TrainerBatch[] }>(`/admin/trainers/${t.id}`);
      setSelected({ ...res.trainer, batches: res.batches, batch_count: res.batches.length });
      setEditForm({
        fullName: res.trainer.full_name ?? "",
        phone: res.trainer.phone ?? "",
        city: res.trainer.city ?? "",
        state: res.trainer.state ?? "",
        country: res.trainer.country ?? "",
        institute: res.trainer.institute ?? "",
        experienceLevel: res.trainer.experience_level ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trainer detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveTrainer(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await apiRequest<{ trainer: AdminTrainer }>(`/admin/trainers/${selected.id}`, "PATCH", editForm as unknown as Record<string, unknown>);
      setSelected((prev) => (prev ? { ...prev, ...res.trainer } : null));
      setTrainers((prev) => prev.map((t) => (t.id === res.trainer.id ? { ...t, ...res.trainer } : t)));
      setMessage("Trainer profile updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return trainers;
    const q = search.toLowerCase();
    return trainers.filter(
      (t) =>
        t.email.toLowerCase().includes(q) ||
        (t.full_name ?? "").toLowerCase().includes(q) ||
        (t.institute ?? "").toLowerCase().includes(q)
    );
  }, [trainers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="students-section">
      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="filter-search">
            <span className="filter-search-icon">🔍</span>
            <input
              placeholder="Search name, email, institute…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-search-input"
            />
          </div>
          {search ? (
            <button type="button" className="filter-clear" onClick={() => setSearch("")}>
              ✕ Clear
            </button>
          ) : null}
        </div>
        <div className="filter-bar-right">
          <span className="filter-count">
            {filtered.length} trainer{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="students-layout">
        {/* Left: trainer list */}
        <div className="students-list-pane">
          <section className="card">
            <header className="card-header">
              <h3>Trainers</h3>
              <p className="muted" style={{ fontSize: "0.78rem" }}>
                Page {safePage} of {totalPages}
              </p>
            </header>
            {loading ? <p className="muted">Loading…</p> : null}
            <ul className="list">
              {paginated.map((t) => (
                <li
                  key={t.id}
                  className="list-item student-list-item"
                  style={{
                    cursor: "pointer",
                    background: selected?.id === t.id ? "rgba(75,226,194,0.12)" : undefined,
                    borderLeft: selected?.id === t.id ? "3px solid var(--accent)" : "3px solid transparent",
                  }}
                  onClick={() => void openTrainer(t)}
                >
                  <div className="student-list-row">
                    <div className="student-list-avatar">
                      {(t.full_name ?? t.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="student-list-info">
                      <strong>{t.full_name ?? t.email}</strong>
                      <span className="muted" style={{ fontSize: "0.78rem" }}>{t.email}</span>
                    </div>
                  </div>
                  <div className="student-list-meta">
                    <span className="student-tag">📦 {t.batch_count} batch{t.batch_count !== 1 ? "es" : ""}</span>
                    {t.country ? (
                      <span className="student-tag student-tag-muted">{t.country}</span>
                    ) : null}
                  </div>
                </li>
              ))}
              {!paginated.length && !loading ? (
                <li className="list-item muted">No trainers found.</li>
              ) : null}
            </ul>

            {totalPages > 1 ? (
              <div className="pagination">
                <button type="button" className="pagination-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>««</button>
                <button type="button" className="pagination-btn" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "ellipsis" ? (
                      <span key={`e${idx}`} className="pagination-ellipsis">…</span>
                    ) : (
                      <button key={item} type="button" className={`pagination-btn ${item === safePage ? "active" : ""}`} onClick={() => setPage(item)}>
                        {item}
                      </button>
                    )
                  )}
                <button type="button" className="pagination-btn" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
                <button type="button" className="pagination-btn" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»»</button>
              </div>
            ) : null}
          </section>
        </div>

        {/* Right: detail pane */}
        <div className="students-detail-pane">
          {error ? <p className="message error">{error}</p> : null}
          {message ? <p className="message success">{message}</p> : null}
          {detailLoading ? <p className="muted">Loading trainer…</p> : null}

          {!detailLoading && selected ? (
            <div className="stack">
              <section className="card">
                <header className="card-header">
                  <h3>Profile — {selected.email}</h3>
                  <p className="muted">Joined {new Date(selected.created_at).toLocaleDateString()}</p>
                </header>
                <form className="form" onSubmit={(e) => void saveTrainer(e)}>
                  <label>
                    Full Name
                    <input value={editForm.fullName} onChange={(ev) => setEditForm((f) => ({ ...f, fullName: ev.target.value }))} />
                  </label>
                  <label>
                    Phone
                    <input value={editForm.phone} onChange={(ev) => setEditForm((f) => ({ ...f, phone: ev.target.value }))} />
                  </label>
                  <label>
                    Institute / Company
                    <input value={editForm.institute} onChange={(ev) => setEditForm((f) => ({ ...f, institute: ev.target.value }))} />
                  </label>
                  <label>
                    Country
                    <input value={editForm.country} onChange={(ev) => setEditForm((f) => ({ ...f, country: ev.target.value }))} />
                  </label>
                  <label>
                    State
                    <input value={editForm.state} onChange={(ev) => setEditForm((f) => ({ ...f, state: ev.target.value }))} />
                  </label>
                  <label>
                    City
                    <input value={editForm.city} onChange={(ev) => setEditForm((f) => ({ ...f, city: ev.target.value }))} />
                  </label>
                  <button type="submit" className="button" disabled={saving}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </form>
              </section>

              <section className="card">
                <header className="card-header">
                  <h3>Assigned Batches</h3>
                </header>
                <ul className="list">
                  {selected.batches.map((b) => (
                    <li className="list-item" key={b.id}>
                      <div className="row-inline">
                        <strong>{b.name}</strong>
                        <span className="badge badge-approved">{b.student_count} student{b.student_count !== 1 ? "s" : ""}</span>
                      </div>
                      <p className="muted">Created: {new Date(b.created_at).toLocaleDateString()}</p>
                    </li>
                  ))}
                  {!selected.batches.length ? (
                    <li className="list-item muted">No batches assigned.</li>
                  ) : null}
                </ul>
              </section>
            </div>
          ) : null}

          {!detailLoading && !selected ? (
            <section className="card">
              <p className="muted">Select a trainer from the list to view and manage their profile.</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
