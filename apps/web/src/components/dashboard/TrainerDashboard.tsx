"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api";
import { DashboardMenu } from "../DashboardMenu";
import { ProfileManager } from "../ProfileManager";
import { NotificationCenter } from "./NotificationCenter";

type TrainerSection = "overview" | "batches" | "notifications" | "profile";

interface Batch {
  id: string;
  name: string;
  created_at: string;
}

export function TrainerDashboard() {
  const [section, setSection] = useState<TrainerSection>("overview");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newBatchName, setNewBatchName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadBatches() {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest<{ batches: Batch[] }>("/trainer/batches");
      setBatches(response.batches);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load trainer dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBatches();
  }, []);

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      await apiRequest("/trainer/batches", "POST", { name: newBatchName });
      setMessage("Batch created successfully.");
      setNewBatchName("");
      await loadBatches();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create batch");
    } finally {
      setSubmitting(false);
    }
  }

  function renderContent() {
    if (loading) return <p className="muted">Loading dashboard…</p>;

    switch (section) {
      case "overview":
        return (
          <>
            {error ? <p className="message error">{error}</p> : null}
            {message ? <p className="message success">{message}</p> : null}
            <div className="grid">
              <section className="card span-4">
                <header className="card-header">
                  <h3>Total Batches</h3>
                </header>
                <p className="muted" style={{ fontSize: "1.3rem" }}>
                  {batches.length}
                </p>
              </section>

              <section className="card span-8">
                <header className="card-header">
                  <h3>Recent Batches</h3>
                </header>
                <ul className="list">
                  {batches.slice(0, 6).map((batch) => (
                    <li className="list-item" key={batch.id}>
                      <strong>{batch.name}</strong>
                      <p className="muted">Created: {new Date(batch.created_at).toLocaleString()}</p>
                    </li>
                  ))}
                  {!batches.length ? <li className="list-item muted">No batches created yet.</li> : null}
                </ul>
              </section>
            </div>
          </>
        );

      case "batches":
        return (
          <div className="stack">
            {error ? <p className="message error">{error}</p> : null}
            {message ? <p className="message success">{message}</p> : null}
            <section className="card">
              <header className="card-header">
                <h3>Create New Batch</h3>
              </header>
              <form className="form" onSubmit={createBatch}>
                <label>
                  Batch Name
                  <input
                    value={newBatchName}
                    onChange={(event) => setNewBatchName(event.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <button type="submit" className="button" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Batch"}
                </button>
              </form>
            </section>

            <section className="card">
              <header className="card-header">
                <h3>Your Batches</h3>
              </header>
              <ul className="list">
                {batches.map((batch) => (
                  <li className="list-item" key={batch.id}>
                    <strong>{batch.name}</strong>
                    <p className="muted">ID: {batch.id}</p>
                    <p className="muted">Created: {new Date(batch.created_at).toLocaleString()}</p>
                  </li>
                ))}
                {!batches.length ? <li className="list-item muted">No batches to show.</li> : null}
              </ul>
            </section>
          </div>
        );

      case "profile":
        return <ProfileManager />;

      case "notifications":
        return (
          <NotificationCenter
            role="trainer"
            apiBase="/trainer"
            batches={batches.map((b) => ({ id: b.id, name: b.name }))}
          />
        );

      default:
        return null;
    }
  }

  return (
    <DashboardMenu
      sections={[
        {
          title: "TRAINING",
          items: [
            { key: "overview" as TrainerSection, label: "Overview", icon: "📊" },
            { key: "batches" as TrainerSection, label: "Batch Manager", icon: "📦" },
            { key: "notifications" as TrainerSection, label: "Notifications", icon: "🔔" },
          ],
        },
        {
          title: "ACCOUNT",
          items: [
            { key: "profile" as TrainerSection, label: "Registration Info", icon: "👤" },
          ],
        },
      ]}
      active={section}
      onChange={setSection}
      mainContent={renderContent()}
    />
  );
}
