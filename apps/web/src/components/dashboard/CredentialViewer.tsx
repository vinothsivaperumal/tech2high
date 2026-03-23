"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

interface StudentCredential {
  id: string;
  name: string;
  credential_type: string;
  environment: string | null;
  host: string | null;
  port: number | null;
  database_name: string | null;
  username: string | null;
  password: string;
  access_url: string | null;
  region: string | null;
  notes: string | null;
  expiry_date: string | null;
  batch_name: string | null;
  course_title: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  postgresql: "🐘", aws: "☁️", snowflake: "❄️", mssql: "🗄️", other: "🔑"
};

export function CredentialViewer({ apiBase }: { apiBase: string }) {
  const [credentials, setCredentials] = useState<StudentCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [typeFilter, setTypeFilter] = useState("all");

  async function load() {
    setLoading(true);
    try {
      const res = await apiRequest<{ credentials: StudentCredential[] }>(`${apiBase}/credentials`);
      setCredentials(res.credentials);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function revealPassword(id: string) {
    try {
      const res = await apiRequest<{ password: string }>(`${apiBase}/credentials/${id}/reveal`, "POST");
      setRevealedPasswords((p) => ({ ...p, [id]: res.password }));
      setTimeout(() => setRevealedPasswords((p) => { const n = { ...p }; delete n[id]; return n; }), 30000);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to reveal"); }
  }

  const filtered = typeFilter === "all" ? credentials : credentials.filter((c) => c.credential_type === typeFilter);
  const types = [...new Set(credentials.map((c) => c.credential_type))];

  if (loading) return <p className="muted">Loading credentials…</p>;

  return (
    <div className="stack">
      {error && <p className="message error">{error}</p>}

      <section className="card">
        <header className="card-header">
          <h3>My Credentials</h3>
          <p className="muted">{filtered.length} credential(s) available</p>
        </header>
        {types.length > 1 && (
          <div className="row-inline" style={{ gap: 8, marginBottom: 12 }}>
            <button className={`cred-filter-btn ${typeFilter === "all" ? "active" : ""}`} onClick={() => setTypeFilter("all")}>All</button>
            {types.map((t) => (
              <button key={t} className={`cred-filter-btn ${typeFilter === t ? "active" : ""}`} onClick={() => setTypeFilter(t)}>
                {TYPE_ICONS[t]} {t}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="cred-cards-grid">
        {filtered.map((c) => (
          <div key={c.id} className="cred-card" data-type={c.credential_type}>
            <div className="cred-card-header">
              <span className="cred-card-icon">{TYPE_ICONS[c.credential_type] ?? "🔑"}</span>
              <div>
                <h4>{c.name}</h4>
                <span className="cred-card-type">{c.credential_type}{c.environment && ` · ${c.environment}`}</span>
              </div>
            </div>
            <div className="cred-card-body">
              {c.host && <div className="cred-card-field"><span className="cred-label">Host</span><code>{c.host}{c.port ? `:${c.port}` : ""}</code></div>}
              {c.database_name && <div className="cred-card-field"><span className="cred-label">Database</span><code>{c.database_name}</code></div>}
              {c.username && <div className="cred-card-field"><span className="cred-label">Username</span><code>{c.username}</code></div>}
              <div className="cred-card-field">
                <span className="cred-label">Password</span>
                {revealedPasswords[c.id] ? (
                  <span className="cred-password-revealed">
                    <code>{revealedPasswords[c.id]}</code>
                    <button className="button-sm" onClick={() => setRevealedPasswords((p) => { const n = { ...p }; delete n[c.id]; return n; })}>Hide</button>
                  </span>
                ) : (
                  <span className="cred-password-masked">
                    <code>••••••••</code>
                    <button className="button-sm" onClick={() => void revealPassword(c.id)}>👁 Reveal</button>
                  </span>
                )}
              </div>
              {c.access_url && <div className="cred-card-field"><span className="cred-label">URL</span><a href={c.access_url} target="_blank" rel="noopener noreferrer">{c.access_url.slice(0, 40)}…</a></div>}
              {c.region && <div className="cred-card-field"><span className="cred-label">Region</span><span>{c.region}</span></div>}
              {c.notes && <div className="cred-card-field"><span className="cred-label">Notes</span><span className="muted">{c.notes}</span></div>}
            </div>
            <div className="cred-card-footer">
              {c.batch_name && <span className="badge badge-approved">{c.batch_name}</span>}
              {c.course_title && <span className="badge badge-pending">{c.course_title}</span>}
              {c.expiry_date && <span className="muted" style={{ fontSize: "0.75rem" }}>Expires: {new Date(c.expiry_date).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
        {!filtered.length && <p className="muted">No credentials assigned to your batches.</p>}
      </div>
    </div>
  );
}
