"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

interface AccessLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  resource_type: string;
  resource_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

const ACTION_ICONS: Record<string, string> = {
  reveal_password: "🔓",
  list_view: "👁",
  view: "📄",
};

export function AccessLogsViewer() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [limitFilter, setLimitFilter] = useState("200");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (resourceFilter) params.set("resourceType", resourceFilter);
      params.set("limit", limitFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await apiRequest<{ logs: AccessLog[] }>(`/admin/access-logs${qs}`);
      setLogs(res.logs);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [resourceFilter, limitFilter]);

  if (loading) return <p className="muted">Loading access logs…</p>;

  return (
    <div className="stack">
      {error && <p className="message error">{error}</p>}

      <section className="card">
        <header className="card-header">
          <h3>Access Logs</h3>
          <p className="muted">{logs.length} entries</p>
        </header>
        <div className="row-inline" style={{ gap: 12, flexWrap: "wrap" }}>
          <label style={{ minWidth: 180 }}>
            Resource Type
            <select value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)}>
              <option value="">All</option>
              <option value="credential">Credentials</option>
              <option value="material">Materials</option>
            </select>
          </label>
          <label style={{ minWidth: 120 }}>
            Limit
            <select value={limitFilter} onChange={(e) => setLimitFilter(e.target.value)}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th><th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td><strong>{l.user_name ?? l.user_email ?? "—"}</strong>{l.user_email && l.user_name && <span className="muted" style={{ display: "block", fontSize: "0.8rem" }}>{l.user_email}</span>}</td>
                  <td><span className="access-action-badge">{ACTION_ICONS[l.action] ?? "📋"} {l.action}</span></td>
                  <td>{l.resource_type}{l.resource_id && <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>{l.resource_id.slice(0, 8)}…</span>}</td>
                  <td className="muted">{l.ip_address ?? "—"}</td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center" }}>No access logs found</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
