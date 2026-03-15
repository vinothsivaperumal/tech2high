"use client";

import { FormEvent, useEffect, useState } from "react";

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
  created_at: string;
  updated_at: string;
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
  if (!normalized) {
    return null;
  }

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

  async function loadCountries() {
    setLoadingCountries(true);
    try {
      const values = await fetchCountries();
      setCountries(values);
    } catch {
      setError("Unable to load country list.");
    } finally {
      setLoadingCountries(false);
    }
  }

  async function loadCitiesForState(countryValue: string, stateValue: string, preferredCity?: string) {
    setLoadingCities(true);

    try {
      const fetchedCities = await fetchCities(countryValue, stateValue);
      let nextCities = fetchedCities.length ? fetchedCities : ["Other"];

      if (preferredCity && !nextCities.includes(preferredCity)) {
        nextCities = [preferredCity, ...nextCities];
      }

      setCities(nextCities);
      setEditForm((current) => ({
        ...current,
        city: preferredCity && nextCities.includes(preferredCity) ? preferredCity : ""
      }));
    } catch {
      setCities(["Other"]);
      setEditForm((current) => ({ ...current, city: preferredCity === "Other" ? "Other" : "" }));
    } finally {
      setLoadingCities(false);
    }
  }

  async function loadStatesForCountry(countryValue: string, preferredState?: string, preferredCity?: string) {
    setLoadingStates(true);

    try {
      const fetchedStates = await fetchStates(countryValue);
      let nextStates = fetchedStates.length ? fetchedStates : ["Other"];

      if (preferredState && !nextStates.includes(preferredState)) {
        nextStates = [preferredState, ...nextStates];
      }

      setStates(nextStates);
      const nextState = preferredState && nextStates.includes(preferredState) ? preferredState : "";

      setEditForm((current) => ({
        ...current,
        state: nextState,
        city: ""
      }));

      setCities([]);

      if (nextState) {
        await loadCitiesForState(countryValue, nextState, preferredCity);
      }
    } catch {
      setStates(["Other"]);
      setCities([]);
      setEditForm((current) => ({
        ...current,
        state: preferredState === "Other" ? "Other" : "",
        city: ""
      }));
    } finally {
      setLoadingStates(false);
    }
  }

  async function loadStudents() {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest<{ students: AdminStudent[] }>("/admin/students");
      setStudents(res.students);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  }

  async function openStudent(s: AdminStudent) {
    setDetailLoading(true);
    setMessage("");
    setError("");
    try {
      const res = await apiRequest<{ student: AdminStudent; ipRequests: StudentIpRequest[] }>(`/admin/students/${s.id}`);
      const nextForm: EditForm = {
        fullName: res.student.full_name ?? "",
        phone: res.student.phone ?? "",
        city: res.student.city ?? "",
        state: res.student.state ?? "",
        country: res.student.country ?? "",
        institute: res.student.institute ?? "",
        experienceLevel: res.student.experience_level ?? ""
      };

      setSelected({ ...res.student, ipRequests: res.ipRequests });
      setEditForm(nextForm);

      if (nextForm.country) {
        setCountries((current) => (current.includes(nextForm.country) ? current : [nextForm.country, ...current]));
        await loadStatesForCountry(nextForm.country, nextForm.state, nextForm.city);
      } else {
        setStates([]);
        setCities([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load student detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveStudent(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await apiRequest<{ student: AdminStudent }>(`/admin/students/${selected.id}`, "PATCH", editForm as unknown as Record<string, unknown>);
      setSelected((prev) => (prev ? { ...prev, ...res.student } : null));
      setStudents((prev) => prev.map((s) => (s.id === res.student.id ? { ...s, ...res.student } : s)));
      setMessage("Student profile updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  const filtered = students.filter(
    (s) =>
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.full_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="students-layout">
      {/* ── Left: student list ── */}
      <div className="students-list-pane">
        <section className="card">
          <header className="card-header">
            <h3>Students ({students.length})</h3>
          </header>
          <input
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: "0.75rem" }}
          />
          {loading ? <p className="muted">Loading…</p> : null}
          <ul className="list">
            {filtered.map((s) => (
              <li
                key={s.id}
                className="list-item"
                style={{
                  cursor: "pointer",
                  background: selected?.id === s.id ? "rgba(75,226,194,0.12)" : undefined,
                  borderLeft: selected?.id === s.id ? "3px solid var(--accent)" : "3px solid transparent"
                }}
                onClick={() => void openStudent(s)}
              >
                <strong>{s.full_name ?? s.email}</strong>
                <p className="muted" style={{ fontSize: "0.8rem" }}>{s.email}</p>
                {s.institute ? <p className="muted" style={{ fontSize: "0.75rem" }}>{s.institute}</p> : null}
              </li>
            ))}
            {!filtered.length && !loading ? (
              <li className="list-item muted">No students found.</li>
            ) : null}
          </ul>
        </section>
      </div>

      {/* ── Right: detail pane ── */}
      <div className="students-detail-pane">
        {error ? <p className="message error">{error}</p> : null}
        {message ? <p className="message success">{message}</p> : null}
        {detailLoading ? <p className="muted">Loading student…</p> : null}

        {!detailLoading && selected ? (
          <div className="stack">
            <section className="card">
              <header className="card-header">
                <h3>Profile — {selected.email}</h3>
                <p className="muted">Joined {new Date(selected.created_at).toLocaleDateString()}</p>
              </header>
              <form className="form" onSubmit={(e) => void saveStudent(e)}>
                {PROFILE_FIELDS.map(({ key, label }) => (
                  <label key={key}>
                    {label}
                    <input
                      value={editForm[key]}
                      onChange={(ev) => setEditForm((f) => ({ ...f, [key]: ev.target.value }))}
                    />
                  </label>
                ))}

                <label>
                  Country
                  <input
                    list="admin-student-country-options"
                    value={editForm.country}
                    onChange={(ev) => {
                      const nextCountry = ev.target.value;
                      setEditForm((f) => ({ ...f, country: nextCountry, state: "", city: "" }));
                      setStates([]);
                      setCities([]);

                      const matchedCountry = getCaseInsensitiveExactMatch(countries, nextCountry);
                      if (matchedCountry) {
                        void loadStatesForCountry(matchedCountry);
                      }
                    }}
                    placeholder={loadingCountries ? "Loading countries..." : "Type country"}
                    required
                  />
                  <datalist id="admin-student-country-options">
                    {countries.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </datalist>
                </label>

                <label>
                  State
                  <input
                    list="admin-student-state-options"
                    value={editForm.state}
                    onChange={(ev) => {
                      const nextState = ev.target.value;
                      setEditForm((f) => ({ ...f, state: nextState, city: "" }));
                      setCities([]);

                      const matchedCountry = getCaseInsensitiveExactMatch(countries, editForm.country);
                      const matchedState = getCaseInsensitiveExactMatch(states, nextState);

                      if (matchedCountry && matchedState) {
                        void loadCitiesForState(matchedCountry, matchedState);
                      }
                    }}
                    placeholder={loadingStates ? "Loading states..." : "Type state"}
                    required
                  />
                  <datalist id="admin-student-state-options">
                    {states.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </datalist>
                </label>

                <label>
                  City
                  <input
                    list="admin-student-city-options"
                    value={editForm.city}
                    onChange={(ev) => setEditForm((f) => ({ ...f, city: ev.target.value }))}
                    placeholder={loadingCities ? "Loading cities..." : "Type city"}
                    required
                  />
                  <datalist id="admin-student-city-options">
                    {cities.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </datalist>
                </label>

                <label>
                  Experience Level
                  <select
                    value={editForm.experienceLevel}
                    onChange={(ev) => setEditForm((f) => ({ ...f, experienceLevel: ev.target.value }))}
                    required
                  >
                    <option value="">Select Experience Level</option>
                    {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <button type="submit" className="button" disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </form>
            </section>

            <section className="card">
              <header className="card-header">
                <h3>IP Request History</h3>
              </header>
              <ul className="list">
                {selected.ipRequests.map((r) => (
                  <li className="list-item" key={r.id}>
                    <div className="row-inline">
                      <strong>
                        {r.requested_ip}:{r.port}
                      </strong>
                      <span className={`badge badge-${r.status}`}>{r.status}</span>
                    </div>
                    <p className="muted">
                      {r.protocol.toUpperCase()} · {new Date(r.requested_at).toLocaleString()}
                    </p>
                    {r.reason ? <p className="muted">Reason: {r.reason}</p> : null}
                    {r.review_note ? <p className="muted">Review note: {r.review_note}</p> : null}
                  </li>
                ))}
                {!selected.ipRequests.length ? (
                  <li className="list-item muted">No IP requests yet.</li>
                ) : null}
              </ul>
            </section>
          </div>
        ) : null}

        {!detailLoading && !selected ? (
          <section className="card">
            <p className="muted">Select a student from the list to view and manage their profile.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
