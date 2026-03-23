"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../lib/api";
import { setSession } from "../lib/auth";
import { fetchCities, fetchCountries, fetchStates } from "../lib/geo";

const EXPERIENCE_LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "Expert"];

interface ProfileUser {
  id: string;
  email: string;
  role: "student" | "trainer" | "admin";
  fullName: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  institute: string | null;
  experienceLevel: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProfileResponse {
  user: ProfileUser;
}

interface UpdateProfileResponse {
  user: ProfileUser;
  token: string;
}

interface ProfileFormState {
  email: string;
  fullName: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  institute: string;
  experienceLevel: string;
}

function buildFormState(user: ProfileUser): ProfileFormState {
  return {
    email: user.email,
    fullName: user.fullName ?? "",
    phone: user.phone ?? "",
    city: user.city ?? "",
    state: user.state ?? "",
    country: user.country ?? "",
    institute: user.institute ?? "",
    experienceLevel: user.experienceLevel ?? ""
  };
}

function getCaseInsensitiveExactMatch(values: string[], typedValue: string): string | null {
  const normalized = typedValue.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return values.find((value) => value.toLowerCase() === normalized) ?? null;
}

export function ProfileManager() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [form, setForm] = useState<ProfileFormState>({
    email: "",
    fullName: "",
    phone: "",
    city: "",
    state: "",
    country: "",
    institute: "",
    experienceLevel: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingAddress, setDetectingAddress] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError("");

      try {
        const response = await apiRequest<ProfileResponse>("/auth/me");
        const nextForm = buildFormState(response.user);

        setUser(response.user);
        setForm(nextForm);

        if (nextForm.country) {
          setCountries((current) => (current.includes(nextForm.country) ? current : [nextForm.country, ...current]));
          await loadStatesForCountry(nextForm.country, nextForm.state, nextForm.city);
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, []);

  useEffect(() => {
    if (countries.length) {
      return;
    }

    void loadCountries();
  }, [countries.length]);

  async function loadCountries() {
    setLoadingCountries(true);
    try {
      const values = await fetchCountries();
      setCountries(values);
    } catch {
      setError("Unable to load country list. Please refresh and try again.");
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
      setForm((current) => ({
        ...current,
        city: preferredCity && nextCities.includes(preferredCity) ? preferredCity : ""
      }));
    } catch {
      setCities(["Other"]);
      setForm((current) => ({ ...current, city: preferredCity === "Other" ? "Other" : "" }));
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

      setForm((current) => ({
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
      setForm((current) => ({
        ...current,
        state: preferredState === "Other" ? "Other" : "",
        city: ""
      }));
    } finally {
      setLoadingStates(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    setInfoMessage("");

    try {
      const response = await apiRequest<UpdateProfileResponse>("/auth/me", "PATCH", {
        email: form.email,
        fullName: form.fullName,
        phone: form.phone,
        city: form.city,
        state: form.state,
        country: form.country,
        institute: form.institute,
        experienceLevel: form.experienceLevel
      });

      setUser(response.user);
      setForm(buildFormState(response.user));
      setSession(response.token, response.user);
      setMessage("Profile updated successfully.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  async function detectAddressFromIp() {
    setDetectingAddress(true);
    setError("");
    setMessage("");
    setInfoMessage("");

    try {
      const response = await fetch("https://ipapi.co/json/");
      if (!response.ok) {
        throw new Error("Address detection service unavailable");
      }

      const data = (await response.json()) as {
        city?: string;
        region?: string;
        country_name?: string;
      };

      const detectedCountry = data.country_name?.trim();
      const detectedState = data.region?.trim();
      const detectedCity = data.city?.trim();

      if (detectedCountry) {
        setCountries((current) => (current.includes(detectedCountry) ? current : [detectedCountry, ...current]));
        setForm((current) => ({ ...current, country: detectedCountry, state: "", city: "" }));
        await loadStatesForCountry(detectedCountry, detectedState, detectedCity);
      } else {
        setForm((current) => ({
          ...current,
          state: detectedState || current.state,
          city: detectedCity || current.city
        }));
      }

      setInfoMessage("Address detected from public IP. Please verify before saving.");
    } catch {
      setError("Could not detect address automatically. Please enter city/state/country manually.");
    } finally {
      setDetectingAddress(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading profile...</p>;
  }

  if (!user) {
    return <p className="message error">Unable to load user profile.</p>;
  }

  return (
    <div className="grid">
      <section className="card span-8">
        <header className="card-header">
          <h3>Registration Information</h3>
          <p className="muted">Get all user details and update them here.</p>
        </header>

        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
            Use auto-detect to fill address quickly
          </p>
          <button
            type="button"
            className="button secondary"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => void detectAddressFromIp()}
            disabled={detectingAddress}
          >
            {detectingAddress ? "Detecting..." : "Detect Address"}
          </button>
        </div>

        <form className="form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </label>

          <label>
            Full Name
            <input
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              minLength={2}
              required
            />
          </label>

          <label>
            Phone
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
                let formatted = "";
                if (digits.length > 0) formatted = `(${digits.slice(0, 3)}`;
                if (digits.length >= 4) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}`;
                if (digits.length >= 7) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
                setForm((current) => ({ ...current, phone: formatted }));
              }}
              placeholder="(555) 123-4567"
              maxLength={14}
            />
          </label>

          <label>
            City
            <input
              list="profile-city-options"
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              placeholder={loadingCities ? "Loading cities..." : "Type city"}
              required
            />
            <datalist id="profile-city-options">
              {cities.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </datalist>
          </label>

          <label>
            State
            <input
              list="profile-state-options"
              value={form.state}
              onChange={(event) => {
                const nextState = event.target.value;
                setForm((current) => ({ ...current, state: nextState, city: "" }));
                setCities([]);

                const matchedCountry = getCaseInsensitiveExactMatch(countries, form.country);
                const matchedState = getCaseInsensitiveExactMatch(states, nextState);

                if (matchedCountry && matchedState) {
                  void loadCitiesForState(matchedCountry, matchedState);
                }
              }}
              placeholder={loadingStates ? "Loading states..." : "Type state"}
              required
            />
            <datalist id="profile-state-options">
              {states.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </datalist>
          </label>

          <label>
            Country
            <input
              list="profile-country-options"
              value={form.country}
              onChange={(event) => {
                const nextCountry = event.target.value;
                setForm((current) => ({
                  ...current,
                  country: nextCountry,
                  state: "",
                  city: ""
                }));
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
            <datalist id="profile-country-options">
              {countries.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </datalist>
          </label>

          <label>
            Institute / Company
            <input
              value={form.institute}
              onChange={(event) => setForm((current) => ({ ...current, institute: event.target.value }))}
            />
          </label>

          <label>
            Experience Level
            <select
              value={form.experienceLevel}
              onChange={(event) => setForm((current) => ({ ...current, experienceLevel: event.target.value }))}
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

          {infoMessage ? <p className="message success">{infoMessage}</p> : null}
          {error ? <p className="message error">{error}</p> : null}
          {message ? <p className="message success">{message}</p> : null}

          <button type="submit" className="button" disabled={saving}>
            {saving ? "Saving..." : "Update Information"}
          </button>
        </form>
      </section>

      <section className="card span-4">
        <header className="card-header">
          <h3>Account Snapshot</h3>
        </header>
        <ul className="list">
          <li className="list-item">
            <strong>Role</strong>
            <p className="muted">{user.role}</p>
          </li>
          <li className="list-item">
            <strong>Created</strong>
            <p className="muted">{new Date(user.createdAt).toLocaleString()}</p>
          </li>
          <li className="list-item">
            <strong>Last Updated</strong>
            <p className="muted">{new Date(user.updatedAt).toLocaleString()}</p>
          </li>
        </ul>
      </section>
    </div>
  );
}
