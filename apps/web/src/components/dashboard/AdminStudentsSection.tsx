"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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

const BLANK_FORM: EditForm = {
  fullName: "", phone: "", city: "", state: "", country: "", institute: "", experienceLevel: ""
};

function getCaseInsensitiveExactMatch(values: string[], typedValue: string): string | null {
  const normalized = typedValue.trim().toLowerCase();
  if (!normalized) return null;
  return values.find((value) => value.toLowerCase() === normalized) ?? null;
}

interface SelectedStudent extends AdminStudent {
  ipRequests: StudentIpRequest[];
}

type SortKey = "full_name" | "email" | "is_active" | "experience_level" | "country";
type SortDir = "asc" | "desc";
type DetailTab = "profile" | "ip_requests" | "activity";

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
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [editForm, setEditForm] = useState<EditForm>(BLANK_FORM);
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  const [detailTab, setDetailTab] = useState<DetailTab>("profile");

  // View mode: "list" or "detail"
  const viewMode = selected || detailLoading ? "detail" : "list";

  useEffect(() => { void loadStudents(); void loadCountries(); }, []);
  useEffect(() => { setPage(1); }, [search, filterExp, filterCountry, filterStatus, pageSize]);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
    setDetailLoading(true); setMessage(""); setError(""); setDetailTab("profile");
    try {
      const res = await apiRequest<{ student: AdminStudent; ipRequests: StudentIpRequest[] }>(`/admin/students/${s.id}`);
      const nf: EditForm = { fullName: res.student.full_name ?? "", phone: res.student.phone ?? "", city: res.student.city ?? "", state: res.student.state ?? "", country: res.student.country ?? "", institute: res.student.institute ?? "", experienceLevel: res.student.experience_level ?? "" };
      setSelected({ ...res.student, ipRequests: res.ipRequests }); setEditForm(nf);
      if (nf.country) { setCountries((c) => c.includes(nf.country) ? c : [nf.country, ...c]); await loadStatesForCountry(nf.country, nf.state, nf.city); }
      else { setStates([]); setCities([]); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load student detail"); }
    finally { setDetailLoading(false); }
  }

  function backToList() { setSelected(null); setMessage(""); setError(""); }

  function resetForm() {
    if (!selected) return;
    setEditForm({ fullName: selected.full_name ?? "", phone: selected.phone ?? "", city: selected.city ?? "", state: selected.state ?? "", country: selected.country ?? "", institute: selected.institute ?? "", experienceLevel: selected.experience_level ?? "" });
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

  function handleSort(key: SortKey) {
    if (sortKey === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); }
    else { setSortKey(key); setSortDir("asc"); }
  }

  function exportCSV() {
    const rows = filtered.map((s) => [s.full_name ?? "", s.email, s.is_active ? "Active" : "Inactive", s.batches?.map((b) => b.batch_name).join("; ") ?? "", s.experience_level ?? "", s.country ?? ""].map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
    const csv = ["Name,Email,Status,Course,Level,Country", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "students.csv"; a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  }

  const uniqueCountries = useMemo(() => Array.from(new Set(students.map((s) => s.country).filter(Boolean) as string[])).sort(), [students]);
  const uniqueExpLevels = useMemo(() => Array.from(new Set(students.map((s) => s.experience_level).filter(Boolean) as string[])).sort(), [students]);

  const filtered = useMemo(() => {
    let list = students;
    if (search) { const q = search.toLowerCase(); list = list.filter((s) => s.email.toLowerCase().includes(q) || (s.full_name ?? "").toLowerCase().includes(q) || (s.institute ?? "").toLowerCase().includes(q) || (s.city ?? "").toLowerCase().includes(q)); }
    if (filterExp !== "all") list = list.filter((s) => s.experience_level === filterExp);
    if (filterCountry !== "all") list = list.filter((s) => s.country === filterCountry);
    if (filterStatus !== "all") list = list.filter((s) => filterStatus === "active" ? s.is_active : !s.is_active);
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = (a[sortKey] ?? "").toString().toLowerCase();
        const bv = (b[sortKey] ?? "").toString().toLowerCase();
        const cmp = av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [students, search, filterExp, filterCountry, filterStatus, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startRow = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(safePage * pageSize, filtered.length);

  function clearFilters() { setSearch(""); setFilterExp("all"); setFilterCountry("all"); setFilterStatus("all"); setPage(1); }
  const hasActiveFilters = search !== "" || filterExp !== "all" || filterCountry !== "all" || filterStatus !== "all";

  const allChecked = paginated.length > 0 && paginated.every((s) => checkedIds.has(s.id));
  function toggleAll() { setCheckedIds((prev) => { const next = new Set(prev); if (allChecked) { paginated.forEach((s) => next.delete(s.id)); } else { paginated.forEach((s) => next.add(s.id)); } return next; }); }
  function toggleOne(id: string) { setCheckedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  function SortHeader({ label, sKey }: { label: string; sKey: SortKey }) {
    const active = sortKey === sKey;
    return (
      <span className={`dt-th-sort${active ? " active" : ""}`} onClick={() => handleSort(sKey)}>
        {label} <span className="dt-sort-icon">{active ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}</span>
      </span>
    );
  }

  // ─── DETAIL VIEW ───
  if (viewMode === "detail") {
    return (
      <div className="detail-page">
        {error ? <p className="message error">{error}</p> : null}
        {message ? <p className="message success">{message}</p> : null}

        <div className="detail-page-header">
          <div>
            <h2>Student Details</h2>
            <p>Manage student information and permissions</p>
          </div>
          <button type="button" className="detail-back-btn" onClick={backToList}>← Back to List</button>
        </div>

        {detailLoading ? <p className="muted">Loading student details…</p> : null}

        {!detailLoading && selected ? (
          <>
            {/* Profile hero */}
            <div className="detail-profile-hero">
              <div className="detail-avatar-large">
                {(selected.full_name ?? selected.email).charAt(0).toUpperCase()}
              </div>
              <div className="detail-hero-info">
                <h3>{selected.full_name || selected.email}</h3>
                <div className="detail-hero-email">{selected.email}</div>
                <div className="detail-hero-meta">
                  <span className={`dt-badge ${selected.is_active ? "dt-badge-active" : "dt-badge-inactive"}`}>
                    {selected.is_active ? "Active" : "Inactive"}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                    Joined: {new Date(selected.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="detail-hero-actions">
                <button type="button" className="btn-danger" onClick={() => void toggleStudentStatus(selected.id, !selected.is_active)}>
                  ⊘ {selected.is_active ? "Deactivate" : "Activate"}
                </button>
                <button type="button" className="btn-danger" onClick={() => void deleteStudent(selected.id)}>
                  🗑 Delete
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="detail-tabs">
              <button type="button" className={`detail-tab${detailTab === "profile" ? " active" : ""}`} onClick={() => setDetailTab("profile")}>Profile</button>
              <button type="button" className={`detail-tab${detailTab === "ip_requests" ? " active" : ""}`} onClick={() => setDetailTab("ip_requests")}>IP Requests</button>
              <button type="button" className={`detail-tab${detailTab === "activity" ? " active" : ""}`} onClick={() => setDetailTab("activity")}>Activity</button>
            </div>

            <div className="detail-layout">
              {/* Main content */}
              <div>
                {detailTab === "profile" ? (
                  <div className="dt-form-card">
                    <form onSubmit={(e) => void saveStudent(e)}>
                      <div className="detail-form-grid">
                        <label>Full Name
                          <input value={editForm.fullName} onChange={(ev) => setEditForm((f) => ({ ...f, fullName: ev.target.value }))} />
                        </label>
                        <label>Email
                          <input value={selected.email} disabled style={{ opacity: 0.6 }} />
                        </label>
                        <label>Phone
                          <input value={editForm.phone} onChange={(ev) => setEditForm((f) => ({ ...f, phone: ev.target.value }))} />
                        </label>
                        <label>Institution
                          <input value={editForm.institute} onChange={(ev) => setEditForm((f) => ({ ...f, institute: ev.target.value }))} />
                        </label>
                        <div className="triple-col">
                          <label>Country
                            <input list="admin-student-country-options" value={editForm.country} onChange={(ev) => { const v = ev.target.value; setEditForm((f) => ({ ...f, country: v, state: "", city: "" })); setStates([]); setCities([]); const m = getCaseInsensitiveExactMatch(countries, v); if (m) void loadStatesForCountry(m); }} placeholder={loadingCountries ? "Loading…" : "Type country"} />
                            <datalist id="admin-student-country-options">{countries.map((o) => <option key={o} value={o}>{o}</option>)}</datalist>
                          </label>
                          <label>State
                            <input list="admin-student-state-options" value={editForm.state} onChange={(ev) => { const v = ev.target.value; setEditForm((f) => ({ ...f, state: v, city: "" })); setCities([]); const mc = getCaseInsensitiveExactMatch(countries, editForm.country); const ms = getCaseInsensitiveExactMatch(states, v); if (mc && ms) void loadCitiesForState(mc, ms); }} placeholder={loadingStates ? "Loading…" : "Type state"} />
                            <datalist id="admin-student-state-options">{states.map((o) => <option key={o} value={o}>{o}</option>)}</datalist>
                          </label>
                          <label>City
                            <input list="admin-student-city-options" value={editForm.city} onChange={(ev) => setEditForm((f) => ({ ...f, city: ev.target.value }))} placeholder={loadingCities ? "Loading…" : "Type city"} />
                            <datalist id="admin-student-city-options">{cities.map((o) => <option key={o} value={o}>{o}</option>)}</datalist>
                          </label>
                        </div>
                        <label>Experience Level
                          <select value={editForm.experienceLevel} onChange={(ev) => setEditForm((f) => ({ ...f, experienceLevel: ev.target.value }))}>
                            <option value="">Select Level</option>
                            {EXPERIENCE_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </label>
                        <label>Course
                          <input value={selected.batches?.map((b) => `${b.program_title ? b.program_title + " - " : ""}${b.batch_name}`).join(", ") || "—"} disabled style={{ opacity: 0.6 }} />
                        </label>
                        <div className="detail-form-actions">
                          <button type="button" className="btn-reset" onClick={resetForm}>↻ Reset</button>
                          <button type="submit" className="btn-save" disabled={saving}>{saving ? "Saving…" : "✓ Save Changes"}</button>
                        </div>
                      </div>
                    </form>
                  </div>
                ) : null}

                {detailTab === "ip_requests" ? (
                  <div className="dt-form-card">
                    <h4>IP Request History</h4>
                    {(selected.ipRequests ?? []).length === 0 ? (
                      <p className="muted" style={{ fontSize: "0.82rem" }}>No IP requests yet.</p>
                    ) : (
                      <ul className="detail-ip-list">
                        {(selected.ipRequests ?? []).map((r) => (
                          <li key={r.id} className="detail-ip-item">
                            <div>
                              <strong>{r.requested_ip}:{r.port}</strong>
                              <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>
                                {r.protocol.toUpperCase()} · {new Date(r.requested_at).toLocaleString()}
                              </span>
                              {r.reason ? <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.15rem" }}>Reason: {r.reason}</div> : null}
                              {r.review_note ? <div className="muted" style={{ fontSize: "0.75rem" }}>Review note: {r.review_note}</div> : null}
                            </div>
                            <span className={`dt-badge ${r.status === "approved" ? "dt-badge-active" : r.status === "rejected" ? "dt-badge-inactive" : "dt-badge-info"}`}>
                              {r.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}

                {detailTab === "activity" ? (
                  <div className="dt-form-card">
                    <h4>Activity Log</h4>
                    <div className="detail-ip-list">
                      <div className="detail-ip-item">
                        <div>
                          <strong>Last updated</strong>
                          <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>
                            {new Date(selected.updated_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="detail-ip-item">
                        <div>
                          <strong>Account created</strong>
                          <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>
                            {new Date(selected.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {selected.current_ip ? (
                        <div className="detail-ip-item">
                          <div>
                            <strong>Current IP</strong>
                            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>{selected.current_ip}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Right sidebar */}
              <div>
                <div className="detail-sidebar-card">
                  <h4>Quick Stats</h4>
                  <div className="detail-stat-row">
                    <span className="detail-stat-label">Batches Enrolled</span>
                    <span className="detail-stat-value">{selected.batches?.length ?? 0}</span>
                  </div>
                  <div className="detail-stat-row">
                    <span className="detail-stat-label">Experience Level</span>
                    <span className="detail-stat-value">{selected.experience_level ?? "—"}</span>
                  </div>
                  <div className="detail-stat-row">
                    <span className="detail-stat-label">Last Login</span>
                    <span className="detail-stat-value">{new Date(selected.updated_at).toLocaleDateString() === new Date().toLocaleDateString() ? "Today" : new Date(selected.updated_at).toLocaleDateString()}</span>
                  </div>
                  <div className="detail-stat-row">
                    <span className="detail-stat-label">Active IP Addresses</span>
                    <span className="detail-stat-value">{selected.ipRequests?.filter((r) => r.status === "approved").length ?? 0}</span>
                  </div>
                </div>

                {/* Batch info card */}
                {selected.batches?.length ? (
                  <div className="detail-sidebar-card">
                    <h4>Enrolled Batches</h4>
                    {selected.batches.map((b) => (
                      <div key={b.batch_id} className="detail-stat-row">
                        <span className="detail-stat-label">{b.batch_name}</span>
                        <span className="dt-cell-tag">{b.program_title ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // ─── LIST VIEW ───
  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="dt-container">
        <div className="dt-header">
          <h3>Student Management</h3>
          <div className="dt-header-actions">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{students.length} total</span>
          </div>
        </div>

        <div className="dt-filters">
          <div className="dt-search">
            <span className="dt-search-icon">🔍</span>
            <input placeholder="Search students…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="dt-select" value={filterExp} onChange={(e) => setFilterExp(e.target.value)}>
            <option value="all">All Levels</option>
            {uniqueExpLevels.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
          </select>
          <select className="dt-select" value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
            <option value="all">All Countries</option>
            {uniqueCountries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="dt-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {hasActiveFilters ? <button type="button" className="dt-clear-btn" onClick={clearFilters}>↻ Reset Filters</button> : null}
        </div>

        <div className="dt-info">
          <span>Showing <strong style={{ color: "var(--accent)" }}>{filtered.length}</strong> of <strong style={{ color: "var(--accent)" }}>{students.length}</strong> students</span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {checkedIds.size > 0 ? <span style={{ color: "var(--accent)", fontSize: "0.78rem" }}>{checkedIds.size} selected</span> : null}
            <div className="dt-export-wrap" ref={exportRef}>
              <button type="button" className="dt-export-btn" onClick={() => setShowExport((v) => !v)}>↓ Export ▾</button>
              {showExport ? (
                <div className="dt-export-menu">
                  <button onClick={exportCSV}>Export as CSV</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th className="dt-check"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th><SortHeader label="Name" sKey="full_name" /></th>
                <th><SortHeader label="Email" sKey="email" /></th>
                <th><SortHeader label="Status" sKey="is_active" /></th>
                <th>Course</th>
                <th><SortHeader label="Level" sKey="experience_level" /></th>
                <th><SortHeader label="Country" sKey="country" /></th>
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
                  <td><span className="dt-name-primary">{s.full_name ?? "—"}</span></td>
                  <td><span className="dt-name-secondary">{s.email}</span></td>
                  <td><span className={`dt-badge ${s.is_active ? "dt-badge-active" : "dt-badge-inactive"}`}>{s.is_active ? "Active" : "Inactive"}</span></td>
                  <td>
                    {s.batches?.length ? s.batches.map((b) => (
                      <span key={b.batch_id} style={{ fontSize: "0.8rem" }}>
                        {b.program_title ? `${b.program_title} - ` : ""}{b.batch_name}
                      </span>
                    )) : <span className="dt-name-secondary">—</span>}
                  </td>
                  <td>{s.experience_level ?? <span className="dt-name-secondary">—</span>}</td>
                  <td>{s.country ?? <span className="dt-name-secondary">—</span>}</td>
                  <td>
                    <div className="dt-actions">
                      <button type="button" className="dt-action-btn" onClick={() => void openStudent(s)}>View</button>
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
            <button type="button" className="dt-page-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>«</button>
            <button type="button" className="dt-page-btn" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => { if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis"); acc.push(p); return acc; }, [])
              .map((item, idx) =>
                item === "ellipsis" ? <span key={`e${idx}`} className="dt-page-ellipsis">…</span> : <button key={item} type="button" className={`dt-page-btn ${item === safePage ? "active" : ""}`} onClick={() => setPage(item)}>{item}</button>
              )}
            <button type="button" className="dt-page-btn" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
            <button type="button" className="dt-page-btn" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      </div>
    </>
  );
}
