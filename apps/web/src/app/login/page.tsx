"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { setSession } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { fetchCities, fetchCountries, fetchStates } from "../../lib/geo";

const EXPERIENCE_LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "Expert"];

interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: "student" | "trainer" | "admin";
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

function getCaseInsensitiveExactMatch(values: string[], typedValue: string): string | null {
  const normalized = typedValue.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return values.find((value) => value.toLowerCase() === normalized) ?? null;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "trainer" | "admin">("student");
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
  const [message, setMessage] = useState<string>("");
  const [registrationInfo, setRegistrationInfo] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [detectingAddress, setDetectingAddress] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  const title = useMemo(() => (mode === "login" ? "Portal Login" : "Create Account"), [mode]);

  useEffect(() => {
    if (mode !== "register" || countries.length) {
      return;
    }

    void loadCountries();
  }, [mode, countries.length]);

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
      setCity(preferredCity && nextCities.includes(preferredCity) ? preferredCity : "");
    } catch {
      setCities(["Other"]);
      setCity(preferredCity === "Other" ? "Other" : "");
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
      setStateName(nextState);
      setCities([]);
      setCity("");

      if (nextState) {
        await loadCitiesForState(countryValue, nextState, preferredCity);
      }
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
          : {
              email,
              password,
              role,
              fullName,
              phone,
              city,
              state: stateName,
              country,
              institute,
              experienceLevel
            };
      const response = await apiRequest<AuthResponse>(endpoint, "POST", body);

      setSession(response.token, response.user);
      setMessage("Success. Redirecting...");
      router.push(`/${response.user.role}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to authenticate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrap">
      <div className="aura aura-one" />
      <div className="aura aura-two" />
      <section className="panel">
        <p className="eyebrow">Tech2High</p>
        <h1>{title}</h1>
        <p className="muted">Student, trainer, and admin access for portal.tech2high.com</p>

        <form className="form" onSubmit={submit} style={{ marginTop: 14 }}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>

          {mode === "register" ? (
            <>
              <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
                  Fill your profile details
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

              <label>
                Full Name
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} required />
              </label>

              <label>
                Role
                <select value={role} onChange={(event) => setRole(event.target.value as typeof role)} required>
                  <option value="student">Student</option>
                  <option value="trainer">Trainer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label>
                Phone
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 9876543210" />
              </label>

              <label>
                City
                <input
                  list="login-city-options"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder={loadingCities ? "Loading cities..." : "Type city"}
                  required
                />
                <datalist id="login-city-options">
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
                  list="login-state-options"
                  value={stateName}
                  onChange={(event) => {
                    const nextState = event.target.value;
                    setStateName(nextState);
                    setCity("");
                    setCities([]);

                    const matchedCountry = getCaseInsensitiveExactMatch(countries, country);
                    const matchedState = getCaseInsensitiveExactMatch(states, nextState);

                    if (matchedCountry && matchedState) {
                      void loadCitiesForState(matchedCountry, matchedState);
                    }
                  }}
                  placeholder={loadingStates ? "Loading states..." : "Type state"}
                  required
                />
                <datalist id="login-state-options">
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
                  list="login-country-options"
                  value={country}
                  onChange={(event) => {
                    const nextCountry = event.target.value;
                    setCountry(nextCountry);
                    setStateName("");
                    setCity("");
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
                <datalist id="login-country-options">
                  {countries.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </datalist>
              </label>

              <label>
                Institute / Company
                <input value={institute} onChange={(event) => setInstitute(event.target.value)} />
              </label>

              <label>
                Experience Level
                <select
                  value={experienceLevel}
                  onChange={(event) => setExperienceLevel(event.target.value)}
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
            </>
          ) : null}

          {registrationInfo ? <p className="message success">{registrationInfo}</p> : null}
          {error ? <p className="message error">{error}</p> : null}
          {message ? <p className="message success">{message}</p> : null}

          <button className="button" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Register"}
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
    </div>
  );
}
