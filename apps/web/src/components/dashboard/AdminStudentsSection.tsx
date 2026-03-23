"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";
import { fetchCities, fetchCountries, fetchStates } from "../../lib/geo";

interface AdminStudent {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  institute: string | null;
  experience_level: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  batches: { batch_id: string; batch_name: string; program_id: string | null; program_title: string | null }[];
  current_ip: string | null;
}

interface StudentIpRequest {
  id: string;
  requested_ip: string;
  protocol: string;
  port: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
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

const EXPERIENCE_LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "Expert"];
const ROWS_OPTIONS = [5, 10, 25, 50];

const PROFILE_FIELDS: { key: Exclude<keyof EditForm, "country" | "state" | "city" | "experienceLevel">; label: string }[] = [
  { key: "fullName", label: "Full Name" },
  { key: "phone", label: "Phone" },
  { key: "institute", label: "Institute / Company" }
];

const BLANK_FORM: EditForm = {
  fullName: "",
  phone: "",
  city: "",
  state: "",
  country: "",
  institute: "",
  experienceLevel: ""
};

function getCaseInsensitiveExactMatch(values: string[], typedValue: string): string | null {
  const normalized = typedValue.trim().toLowerCase();
  if (!normalized) return null;
  return values.find((value) => value.toLowerCase() === normalized) ?? null;
}

interface SelectedStudent extends AdminStudent {
  ipRequests: StudentIpRequest[];
}

export function AdminStudentsSection() {
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [selected, setSelected] = useState<SelectedStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [filterExp, setFilterExp] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterBatch, setFilterBatch] = useState<string>("all");
  const [filterProgram, setFilterProgram] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const [editForm, setEditForm] = useState<EditForm>(BLANK_FORM);
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    void loadStudents();
    void loadCountries();
  }, []);

  useEffect(() => { setPage(1); }, [search, filterExp, filterCountry, filterBatch, filterProgram, filterStatus, pageSize]);

  async function loadCountries() {
    setLoadingCountries(true);
    try { setCountries(await fetchCountries()); } catch { setError("Unable to load country list."); } finally { setLoadingCountries(false); }
  }

  async function loadCitiesForState(countryValue: string, stateValue: string, preferredCity?: string) {
    setLoadingCities(true);
    try {
      const fetchedCities = await fetchCities(countryValue, stateValue);
      let nextCities = fetchedCities.length ? fetchedCities : ["Other"];
      if (preferredCity && !nextCities.includes(preferredCity)) nextCities = [preferredCity, ...nextCities];
      setCities(nextCities);
      setEditForm((c) => ({ ...c, city: preferredCity && nextCities.includes(preferredCity) ? preferredCity : "" }));
    } catch {
      setCities(["Other"]);
      setEditForm((c) => ({ ...c, city: preferredCity === "Other" ? "Other" : "" }));
    } finally { setLoadingCities(false); }
  }

  async function loadStatesForCountry(countryValue: string, preferredState?: string, preferredCity?: string) {
    setLoadingStates(true);
    try {
      const fetchedStates = await fetchStates(countryValue);
      let nextStates = fetchedStates.length ? fetchedStates : ["Other"];
      if (preferredState && !nextStates.includes(preferredState)) nextStates = [preferredState, ...nextStates];
      setStates(nextStates);
      const nextState = preferredState && nextStates.includes(preferredState) ? preferredState : "";
      setEditForm((c) => ({ ...c, state: nextState, city: "" }));
      setCities([]);
      if (nextState) await loadCitiesForState(countryValue, nextState, preferredCity);
    } catch {
      setStates(["Other"]); setCities([]);
      setEditForm((c) => ({ ...c, state: preferredState === "Other" ? "Other" : "", city: "" }));
    } finally { setLoadingStates(false); }
  }

  async function loadStudents() {
    setLoading(true); setError("");
    try { setStudents((await apiRequest<{ students: AdminStudent[] }>("/admin/students")).students); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load students"); }
    finally { setLoading(false); }
  }

  async function openStudent(s: AdminStudent) {
    setDetailLoading(true); setMessage(""); setError("");
    try {
      const res = await apiRequest<{ student: AdminStudent; ipRequests: StudentIpRequest[] }>(`/admin/students/${s.id}`);
      const nf: EditForm = { fullName: res.student.full_name ?? "", phone: res.student.phone ?? "", city: res.student.city ?? "", state: res.student.state ?? "", country: res.student.country ?? "", institute: res.student.institute ?? "", experienceLevel: res.student.experience_level ?? "" };
      setSelected({ ...res.student, ipRequests: res.ipRequests }); setEditForm(nf);
      if (nf.country) { setCountries((c) => c.includes(nf.country) ? c : [nf.country, ...c]); await loadStatesForCountry(nf.country, nf.state, nf.city); }
      else { setStates([]); setCities([]); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load student detail"); }
    finally { setDetailLoading(false); }
  }

  async function saveStudent(e: FormEvent) {
    e.preventDefault(); if (!selected) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const res = await apiRequest<{ student: AdminStudent }>(`/admin/students/${selected.id}`, "PATCH", editForm as unknown as Record<string, unknown>);
      setSelected((p) => p ? { ...p, ...res.student } : null);
      setStudents((p) => p.map((s) => s.id === res.student.id ? { ...s, ...res.student } : s));
      setMessage("Student profile updated.");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save changes"); }
    finally { setSaving(false); }
  }

  async function toggleStudentStatus(studentId: string, isActive: boolean) {
    setError(""); setMessage("");
    try {
      await apiRequest(`/admin/students/${studentId}/status`, "PATCH", { isActive });
      setSelected((p) => p ? { ...p, is_active: isActive } : null);
      setStudents((p) => p.map((s) => s.id === studentId ? { ...s, is_active: isActive } : s));
      setMessage(`Student ${isActive ? "activated" : "deactivated"}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to update status"); }
  }

  async function deleteStudent(studentId: string) {
    if (!window.confirm("Delete this student? This action uses soft delete.")) return;
    setError(""); setMessage("");
    try {
      await apiRequest(`/admin/students/${studentId}`, "DELETE");
      setStudents((p) => p.filter((s) => s.id !== studentId));
      if (selected?.id === studentId) setSelected(null);
      setMessage("Student deleted.");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete student"); }
  }

  const uniqueCountries = useMemo(() => Array.from(new Set(students.map((s) => s.country).filter(Boolean) as string[])).sort(), [students]);
  const uniqueExpLevels = useMemo(() => Array.from(new Set(students.map((s) => s.experience_level).filter(Boolean) as string[])).sort(), [students]);
  const uniqueBatches = useMemo(() => { const m = new Map<string, string>(); students.forEach((s) => s.batches?.forEach((b) => m.set(b.batch_id, b.batch_name))); return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1])); }, [students]);
  const uniquePrograms = useMemo(() => { const m = new Map<string, string>(); students.forEach((s) => s.batches?.forEach((b) => { if (b.program_id && b.program_title) m.set(b.program_id, b.program_title); })); return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1])); }, [students]);

  const filtered = useMemo(() => {
    let list = students;
    if (search) { const q = search.toLowerCase(); list = list.filter((s) => s.email.toLowerCase().includes(q) || (s.full_name ?? "").toLowerCase().includes(q) || (s.institute ?? "").toLowerCase().includes(q) || (s.city ?? "").toLowerCase().includes(q)); }
    if (filterExp !== "all") list = list.filter((s) => s.experience_level === filterExp);
    if (filterCountry !== "all") list = list.filter((s) => s.country === filterCountry);
    if (filterBatch !== "all") list = list.filter((s) => s.batches?.some((b) => b.batch_id === filterBatch));
    if (filterProgram !== "all") list = list.filter((s) => s.batches?.some((b) => b.program_id === filterProgram));
    if (filterStatus !== "all") list = list.filter((s) => filterStatus === "active" ? s.is_active : !s.is_active);
    return list;
  }, [students, search, filterExp, filterCountry, filterBatch, filterProgram, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startRow = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(safePage * pageSize, filtered.length);

  function clearFilters() { setSearch(""); setFilterExp("all"); setFilterCountry("all"); setFilterBatch("all"); setFilterProgram("all"); setFilterStatus("all"); setPage(1); }
  const hasActiveFilters = search !== "" || filterExp !== "all" || filterCountry !== "all" || filterBatch !== "all" || filterProgram !== "all" || filterStatus !== "all";

  const allChecked = paginated.length > 0 && paginated.every((s) => checkedIds.has(s.id));
  function toggleAll() { setCheckedIds((prev) => { const next = new Set(prev); if (allChecked) { paginated.forEach((s) => next.delete(s.id)); } else { paginated.forEach((s) => next.add(s.id)); } return next; }); }
  function toggleOne(id: string) { setCheckedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  const filterTags: { label: string; onClear: () => void }[] = [];
  if (search) filterTags.push({ label: `Search: ${search}`, onClear: () => setSearch("") });
  if (filterExp !== "all") filterTags.push({ label: `Level: ${filterExp}`, onClear: () => setFilterExp("all") });
  if (filterCountry !== "all") filterTags.push({ label: `Country: ${filterCountry}`, onClear: () => setFilterCountry("all") });
  if (filterBatch !== "all") { const name = uniqueBatches.find(([id]) => id === filterBatch)?.[1] ?? filterBatch; filterTags.push({ label: `Batch: ${name}`, onClear: () => setFilterBatch("all") }); }
  if (filterProgram !== "all") { const name = uniquePrograms.find(([id]) => id === filterProgram)?.[1] ?? filterProgram; filterTags.push({ label: `Program: ${name}`, onClear: () => setFilterProgram("all") }); }
  if (filterStatus !== "all") filterTags.push({ label: `Status: ${filterStatus}`, onClear: () => setFilterStatus("all") });

  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="dt-container">
        {/* Header */}
        <div className="dt-header">
          <h3>Students Management</h3>
          <div className="dt-header-actions">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{students.length} total</span>
          </div>
        </div>

        {/* Filters */}
        <div className="dt-filters">
          <div className="dt-search">
            <span className="dt-search-icon">🔍</span>
            <input placeholder="Search name, email, institute, city…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="dt-select" value={filterExp} onChange={(e) => setFilterExp(e.target.value)}>
            <option value="all">All Levels</option>
            {uniqueExpLevels.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
          </select>
          <select className="dt-select" value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
            <option value="all">All Countries</option>
            {uniqueCountries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="dt-select" value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
            <option value="all">All Batches</option>
            {uniqueBatches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="dt-select" value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)}>
            <option value="all">All Programs</option>
            {uniquePrograms.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
          <select className="dt-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {hasActiveFilters ? <button type="button" className="dt-clear-btn" onClick={clearFilters}>✕ Reset</button> : null}
        </div>

        {/* Filter tags */}
        {filterTags.length > 0 ? (
          <div className="dt-filter-tags">
            {filterTags.map((t) => (
              <span className="dt-filter-tag" key={t.label}>{t.label} <button type="button" onClick={t.onClear}>✕</button></span>
            ))}
          </div>
        ) : null}

        {/* Info bar */}
        <div className="dt-info">
          <span>Showing {startRow}–{endRow} of {filtered.length} student{filtered.length !== 1 ? "s" : ""}</span>
          {checkedIds.size > 0 ? <span style={{ color: "var(--accent)" }}>{checkedIds.size} selected</span> : null}
        </div>

        {/* Table */}
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th className="dt-check"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th>Name</th>
                <th>Email</th>
                <th>Batch</th>
                <th>Level</th>
                <th>Country</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="dt-loading">Loading…</td></tr>
              ) : !paginated.length ? (
                <tr className="dt-empty"><td colSpan={8}>No students found.</td></tr>
              ) : paginated.map((s) => (
                <tr key={s.id}>
                  <td className="dt-check"><input type="checkbox" checked={checkedIds.has(s.id)} onChange={() => toggleOne(s.id)} /></td>
                  <td>
                    <div className="dt-name-cell">
                      <div className="dt-avatar">{(s.full_name ?? s.email).charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="dt-name-primary">{s.full_name ?? "—"}</div>
                        {s.institute ? <div className="dt-name-secondary">{s.institute}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td><span className="dt-name-secondary">{s.email}</span></td>
                  <td>
                    {s.batches?.length ? s.batches.map((b) => (
                      <span key={b.batch_id} className="dt-cell-tag" title={b.program_title ? `Program: ${b.program_title}` : undefined}>{b.batch_name}</span>
                    )) : <span className="dt-name-secondary">—</span>}
                  </td>
                  <td>{s.experience_level ? <span className="dt-cell-tag">{s.experience_level}</span> : <span className="dt-name-secondary">—</span>}</td>
                  <td><span className="dt-name-secondary">{s.country ?? "—"}</span></td>
                  <td><span className={`dt-badge ${s.is_active ? "dt-badge-active" : "dt-badge-inactive"}`}>{s.is_active ? "Active" : "Inactive"}</span></td>
                  <td>
                    <div className="dt-actions">
                      <button type="button" className="dt-action-btn" onClick={() => void openStudent(s)}>View</button>
                      <button type="button" className="dt-action-btn" onClick={() => void toggleStudentStatus(s.id, !s.is_active)}>{s.is_active ? "Deactivate" : "Activate"}</button>
                      <button type="button" className="dt-action-btn danger" onClick={() => void deleteStudent(s.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
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

            {detailLoading ? <p className="muted">Loading student details…</p> : null}

            {!detailLoading && selected ? (
              <div className="stack">
                {/* Status & Actions */}
                <section className="card">
                  <header className="card-header">
                    <h3>
                      {selected.email}
                      <span className={`dt-badge ${selected.is_active ? "dt-badge-active" : "dt-badge-inactive"}`} style={{ marginLeft: "0.5rem" }}>
                        {selected.is_active ? "Active" : "Inactive"}
                      </span>
                    </h3>
                    <div className="row-inline" style={{ gap: "0.4rem" }}>
                      <button type="button" className={selected.is_active ? "button danger" : "button"} style={{ fontSize: "0.75rem" }} onClick={() => void toggleStudentStatus(selected.id, !selected.is_active)}>
                        {selected.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button type="button" className="button danger" style={{ fontSize: "0.75rem" }} onClick={() => void deleteStudent(selected.id)}>Delete</button>
                    </div>
                  </header>
                  {selected.batches?.length ? (
                    <div style={{ padding: "0.5rem 0" }}>
                      {selected.batches.map((b) => (
                        <div key={b.batch_id} className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                          📦 <strong>{b.batch_name}</strong>{b.program_title ? ` · 📋 ${b.program_title}` : ""}
                        </div>
                      ))}
                    </div>
                  ) : <p className="muted" style={{ fontSize: "0.8rem" }}>No batch assigned</p>}
                </section>

                {/* Profile form */}
                <section className="card">
                  <header className="card-header">
                    <h3>Profile</h3>
                    <p className="muted">Joined {new Date(selected.created_at).toLocaleDateString()}</p>
                  </header>
                  <form className="form" onSubmit={(e) => void saveStudent(e)}>
                    {PROFILE_FIELDS.map(({ key, label }) => (
                      <label key={key}>{label}<input value={editForm[key]} onChange={(ev) => setEditForm((f) => ({ ...f, [key]: ev.target.value }))} /></label>
                    ))}
                    <label>Country
                      <input list="admin-student-country-options" value={editForm.country} onChange={(ev) => { const v = ev.target.value; setEditForm((f) => ({ ...f, country: v, state: "", city: "" })); setStates([]); setCities([]); const m = getCaseInsensitiveExactMatch(countries, v); if (m) void loadStatesForCountry(m); }} placeholder={loadingCountries ? "Loading…" : "Type country"} required />
                      <datalist id="admin-student-country-options">{countries.map((o) => <option key={o} value={o}>{o}</option>)}</datalist>
                    </label>
                    <label>State
                      <input list="admin-student-state-options" value={editForm.state} onChange={(ev) => { const v = ev.target.value; setEditForm((f) => ({ ...f, state: v, city: "" })); setCities([]); const mc = getCaseInsensitiveExactMatch(countries, editForm.country); const ms = getCaseInsensitiveExactMatch(states, v); if (mc && ms) void loadCitiesForState(mc, ms); }} placeholder={loadingStates ? "Loading…" : "Type state"} required />
                      <datalist id="admin-student-state-options">{states.map((o) => <option key={o} value={o}>{o}</option>)}</datalist>
                    </label>
                    <label>City
                      <input list="admin-student-city-options" value={editForm.city} onChange={(ev) => setEditForm((f) => ({ ...f, city: ev.target.value }))} placeholder={loadingCities ? "Loading…" : "Type city"} required />
                      <datalist id="admin-student-city-options">{cities.map((o) => <option key={o} value={o}>{o}</option>)}</datalist>
                    </label>
                    <label>Experience Level
                      <select value={editForm.experienceLevel} onChange={(ev) => setEditForm((f) => ({ ...f, experienceLevel: ev.target.value }))} required>
                        <option value="">Select Level</option>
                        {EXPERIENCE_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </label>
                    <button type="submit" className="button" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
                  </form>
                </section>

                {/* IP Request History */}
                <section className="card">
                  <header className="card-header"><h3>IP Request History</h3></header>
                  <ul className="list">
                    {(selected.ipRequests ?? []).map((r) => (
                      <li className="list-item" key={r.id}>
                        <div className="row-inline"><strong>{r.requested_ip}:{r.port}</strong><span className={`badge badge-${r.status}`}>{r.status}</span></div>
                        <p className="muted">{r.protocol.toUpperCase()} · {new Date(r.requested_at).toLocaleString()}</p>
                        {r.reason ? <p className="muted">Reason: {r.reason}</p> : null}
                        {r.review_note ? <p className="muted">Review note: {r.review_note}</p> : null}
                      </li>
                    ))}
                    {!selected.ipRequests?.length ? <li className="list-item muted">No IP requests yet.</li> : null}
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
