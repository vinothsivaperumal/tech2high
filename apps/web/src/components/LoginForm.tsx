"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { setSession } from "../lib/auth";
import { apiRequest } from "../lib/api";
import { fetchCities, fetchCountries, fetchStates } from "../lib/geo";

const EXPERIENCE_LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "Expert"];

type RoleOption = "student" | "trainer" | "admin";

interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: RoleOption;
    fullName?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    institute?: string | null;
    experienceLevel?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
}

interface RoleConfig {
  icon: string;
  label: string;
  color: string;
}

const ROLE_CONFIG: Record<RoleOption, RoleConfig> = {
  student: { icon: "🎓", label: "Student", color: "#4be2c2" },
  trainer: { icon: "🏫", label: "Trainer", color: "#ffb347" },
  admin:   { icon: "🛡",  label: "Admin",   color: "#6dacff" },
};

function getCaseInsensitiveExactMatch(values: string[], typedValue: string): string | null {
  const normalized = typedValue.trim().toLowerCase();
  if (!normalized) return null;
  return values.find((v) => v.toLowerCase() === normalized) ?? null;
}

interface LoginFormProps {
  role: RoleOption;
}

export function LoginForm({ role }: LoginFormProps) {
  const router = useRouter();
  const cfg = ROLE_CONFIG[role];

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [country, setCountry] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [institute, setInstitute] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [message, setMessage] = useState("");
  const [registrationInfo, setRegistrationInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detectingAddress, setDetectingAddress] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    if (mode !== "register" || countries.length) return;
    void loadCountries();
  }, [mode, countries.length]);

  async function loadCountries() {
    setLoadingCountries(true);
    try {
      setCountries(await fetchCountries());
    } catch {
      setError("Unable to load country list. Please refresh and try again.");
    } finally {
      setLoadingCountries(false);
    }
  }

  async function loadCitiesForState(countryVal: string, stateVal: string, preferredCity?: string) {
    setLoadingCities(true);
    try {
      const fetched = await fetchCities(countryVal, stateVal);
      let next = fetched.length ? fetched : ["Other"];
      if (preferredCity && !next.includes(preferredCity)) next = [preferredCity, ...next];
      setCities(next);
      setCity(preferredCity && next.includes(preferredCity) ? preferredCity : "");
    } catch {
      setCities(["Other"]);
      setCity(preferredCity === "Other" ? "Other" : "");
    } finally {
      setLoadingCities(false);
    }
  }

  async function loadStatesForCountry(countryVal: string, preferredState?: string, preferredCity?: string) {
    setLoadingStates(true);
    try {
      const fetched = await fetchStates(countryVal);
      let next = fetched.length ? fetched : ["Other"];
      if (preferredState && !next.includes(preferredState)) next = [preferredState, ...next];
      setStates(next);
      const nextState = preferredState && next.includes(preferredState) ? preferredState : "";
      setStateName(nextState);
      setCities([]);
      setCity("");
      if (nextState) await loadCitiesForState(countryVal, nextState, preferredCity);
    } catch {
      setStates(["Other"]);
      setStateName(preferredState === "Other" ? "Other" : "");
      setCities([]);
      setCity("");
    } finally {
      setLoadingStates(false);
    }
  }

  async function detectAddressFromIp() {
    setDetectingAddress(true);
    setError("");
    setRegistrationInfo("");
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (!res.ok) throw new Error("Address detection service unavailable");
      const data = (await res.json()) as { city?: string; region?: string; country_name?: string };
      const detectedCountry = data.country_name?.trim();
      const detectedState = data.region?.trim();
      const detectedCity = data.city?.trim();
      if (detectedCountry) {
        setCountries((cur) => (cur.includes(detectedCountry) ? cur : [detectedCountry, ...cur]));
        setCountry(detectedCountry);
        await loadStatesForCountry(detectedCountry, detectedState, detectedCity);
      } else {
        setStateName(detectedState ?? "");
        setCity(detectedCity ?? "");
      }
      setRegistrationInfo("Address detected. Please verify before registering.");
    } catch {
      setError("Could not detect address automatically. Please fill city/state/country manually.");
    } finally {
      setDetectingAddress(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setRegistrationInfo("");
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, role, fullName, phone, city, state: stateName, country, institute, experienceLevel };
      const response = await apiRequest<AuthResponse>(endpoint, "POST", body);
      setSession(response.token, response.user);
      setMessage("Success. Redirecting...");
      router.push(`/${response.user.role}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to authenticate");
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "login" ? `${cfg.label} Login` : `${cfg.label} Registration`;
  const datalistPrefix = `${role}-login`;

  return (
    <div className="page-wrap">
      <div className="aura aura-one" />
      <div className="aura aura-two" />
      <section className="panel" style={{ borderTop: `3px solid ${cfg.color}` }}>
        <Link href="/login" className="back-link">
          ← Back to role selection
        </Link>

        <div className="login-brand" style={{ justifyContent: "center", marginBottom: 14 }}>
          <Image src="/logo.svg" alt="Tech2High" width={180} height={44} priority className="logo-img" />
        </div>

        <div className="login-role-header">
          <span className="login-role-icon" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.icon}</span>
          <div>
            <p className="eyebrow">Tech2High</p>
            <h1>{title}</h1>
          </div>
        </div>

        <form className="form" onSubmit={submit} style={{ marginTop: 14 }}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </label>

          {mode === "register" ? (
            <>
              <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>Fill your profile details</p>
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

              <label>
                Full Name
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} required />
              </label>

              <label>
                Phone
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                    let fmt = "";
                    if (digits.length > 0) fmt = `(${digits.slice(0, 3)}`;
                    if (digits.length >= 4) fmt = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}`;
                    if (digits.length >= 7) fmt = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
                    setPhone(fmt);
                  }}
                  placeholder="(555) 123-4567"
                  maxLength={14}
                />
              </label>

              <label>
                City
                <input
                  list={`${datalistPrefix}-city`}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={loadingCities ? "Loading cities..." : "Type city"}
                  required
                />
                <datalist id={`${datalistPrefix}-city`}>
                  {cities.map((o) => <option key={o} value={o}>{o}</option>)}
                </datalist>
              </label>

              <label>
                State
                <input
                  list={`${datalistPrefix}-state`}
                  value={stateName}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStateName(next);
                    setCity("");
                    setCities([]);
                    const mc = getCaseInsensitiveExactMatch(countries, country);
                    const ms = getCaseInsensitiveExactMatch(states, next);
                    if (mc && ms) void loadCitiesForState(mc, ms);
                  }}
                  placeholder={loadingStates ? "Loading states..." : "Type state"}
                  required
                />
                <datalist id={`${datalistPrefix}-state`}>
                  {states.map((o) => <option key={o} value={o}>{o}</option>)}
                </datalist>
              </label>

              <label>
                Country
                <input
                  list={`${datalistPrefix}-country`}
                  value={country}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCountry(next);
                    setStateName("");
                    setCity("");
                    setStates([]);
                    setCities([]);
                    const mc = getCaseInsensitiveExactMatch(countries, next);
                    if (mc) void loadStatesForCountry(mc);
                  }}
                  placeholder={loadingCountries ? "Loading countries..." : "Type country"}
                  required
                />
                <datalist id={`${datalistPrefix}-country`}>
                  {countries.map((o) => <option key={o} value={o}>{o}</option>)}
                </datalist>
              </label>

              <label>
                Institute / Company
                <input value={institute} onChange={(e) => setInstitute(e.target.value)} />
              </label>

              <label>
                Experience Level
                <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} required>
                  <option value="">Select Experience Level</option>
                  {EXPERIENCE_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            </>
          ) : null}

          {registrationInfo ? <p className="message success">{registrationInfo}</p> : null}
          {error ? <p className="message error">{error}</p> : null}
          {message ? <p className="message success">{message}</p> : null}

          <button
            className="button"
            type="submit"
            disabled={loading}
            style={{ background: `linear-gradient(120deg, ${cfg.color}, ${cfg.color}cc)` }}
          >
            {loading ? "Please wait..." : mode === "login" ? `Login as ${cfg.label}` : `Register as ${cfg.label}`}
          </button>
        </form>

        <button
          className="button secondary"
          style={{ marginTop: 12, width: "100%" }}
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
            setMessage("");
            setRegistrationInfo("");
          }}
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Login"}
        </button>
      </section>

      <footer className="app-footer">
        © 2025 Narpavi Innovation and Technologies Services LLP. All rights reserved.
      </footer>
    </div>
  );
}
