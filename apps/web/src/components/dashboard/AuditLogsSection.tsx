"use client";

import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api";

interface AuditLog {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: {
    actions: string[];
    entityTypes: string[];
  };
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEntityType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ActionBadge({ action }: { action: string }) {
  let bg = "rgba(33,150,243,0.1)";
  let color = "var(--info)";

  if (action.includes("create") || action.includes("register")) {
    bg = "rgba(76,175,80,0.12)";
    color = "var(--success)";
  } else if (action.includes("delete") || action.includes("reject") || action.includes("deactivate")) {
    bg = "rgba(244,67,54,0.12)";
    color = "var(--danger)";
  } else if (action.includes("update") || action.includes("approve") || action.includes("activate")) {
    bg = "rgba(255,152,0,0.12)";
    color = "var(--warning)";
  } else if (action.includes("login")) {
    bg = "rgba(233,69,96,0.1)";
    color = "var(--accent)";
  }

  return (
    <span className="dt-badge" style={{ background: bg, color }}>
      {formatAction(action)}
    </span>
  );
}

function MetadataSummary({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );
  if (!entries.length) return <span className="muted">—</span>;

  return (
    <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
      {entries.slice(0, 3).map(([k, v], i) => (
        <span key={k}>
          {i > 0 ? " · " : ""}
          <strong>{k}:</strong> {String(v)}
        </span>
      ))}
      {entries.length > 3 ? ` (+${entries.length - 3} more)` : ""}
    </span>
  );
}

export function AuditLogsSection() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");

  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableEntityTypes, setAvailableEntityTypes] = useState<string[]>([]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("search", search);
      if (actionFilter) params.set("action", actionFilter);
      if (entityTypeFilter) params.set("entityType", entityTypeFilter);

      const res = await apiRequest<AuditLogsResponse>(`/admin/audit-logs?${params}`);
      setLogs(res.logs);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      if (res.filters.actions.length) setAvailableActions(res.filters.actions);
      if (res.filters.entityTypes.length) setAvailableEntityTypes(res.filters.entityTypes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, actionFilter, entityTypeFilter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function handleSearchSubmit() {
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setActionFilter("");
    setEntityTypeFilter("");
    setPage(1);
  }

  const hasFilters = !!search || !!actionFilter || !!entityTypeFilter;

  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  function renderPagination() {
    const pages: (number | "...")[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== "...") {
        pages.push("...");
      }
    }

    return (
      <div className="dt-pagination">
        <button
          className="dt-page-btn"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e${i}`} className="dt-page-ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`dt-page-btn${p === page ? " active" : ""}`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          )
        )}
        <button
          className="dt-page-btn"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          ›
        </button>
      </div>
    );
  }

  return (
    <div className="dt-container">
      {/* Header */}
      <div className="dt-header">
        <h3>📋 Audit Logs</h3>
        <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
          {total} total entries
        </span>
      </div>

      {/* Filters */}
      <div className="dt-filters">
        <div className="dt-search">
          <span className="dt-search-icon">🔍</span>
          <input
            placeholder="Search by name, email, or action..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearchSubmit(); }}
          />
        </div>

        <select
          className="dt-select"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Actions</option>
          {availableActions.map((a) => (
            <option key={a} value={a}>{formatAction(a)}</option>
          ))}
        </select>

        <select
          className="dt-select"
          value={entityTypeFilter}
          onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Entity Types</option>
          {availableEntityTypes.map((t) => (
            <option key={t} value={t}>{formatEntityType(t)}</option>
          ))}
        </select>

        {hasFilters && (
          <button className="dt-clear-btn" onClick={clearFilters}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Active filter tags */}
      {hasFilters && (
        <div className="dt-filter-tags">
          {search && (
            <span className="dt-filter-tag">
              Search: {search}
              <button onClick={() => { setSearch(""); setPage(1); }}>×</button>
            </span>
          )}
          {actionFilter && (
            <span className="dt-filter-tag">
              Action: {formatAction(actionFilter)}
              <button onClick={() => { setActionFilter(""); setPage(1); }}>×</button>
            </span>
          )}
          {entityTypeFilter && (
            <span className="dt-filter-tag">
              Entity: {formatEntityType(entityTypeFilter)}
              <button onClick={() => { setEntityTypeFilter(""); setPage(1); }}>×</button>
            </span>
          )}
        </div>
      )}

      {/* Info bar */}
      <div className="dt-info">
        <span>
          {total > 0
            ? `Showing ${startItem}–${endItem} of ${total}`
            : "No records found"}
        </span>
      </div>

      {/* Error */}
      {error && <p className="message error" style={{ margin: "0.75rem 1.25rem" }}>{error}</p>}

      {/* Table */}
      <div className="dt-table-wrap">
        <table className="dt-table">
          <thead>
            <tr>
              <th style={{ width: 180 }}>Date &amp; Time</th>
              <th style={{ width: 200 }}>User</th>
              <th style={{ width: 180 }}>Action</th>
              <th style={{ width: 140 }}>Entity Type</th>
              <th>Details</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="dt-loading">Loading audit logs...</td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr className="dt-empty">
                <td colSpan={6}>No audit logs found</td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className={expandedId === log.id ? "expanded" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      setExpandedId(expandedId === log.id ? null : log.id)
                    }
                  >
                    <td>
                      <div style={{ fontSize: "0.82rem" }}>
                        {new Date(log.created_at).toLocaleDateString()}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        {new Date(log.created_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td>
                      <div className="dt-name-cell">
                        <div
                          className="dt-avatar"
                          style={{
                            background: log.actor_name
                              ? "var(--accent)"
                              : "var(--muted)",
                          }}
                        >
                          {log.actor_name
                            ? log.actor_name
                                .split(" ")
                                .map((w) => w[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()
                            : "SYS"}
                        </div>
                        <div>
                          <div className="dt-name-primary">
                            {log.actor_name || "System"}
                          </div>
                          <div className="dt-name-secondary">
                            {log.actor_email || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <ActionBadge action={log.action} />
                    </td>
                    <td>
                      <span
                        className="dt-badge dt-badge-info"
                        style={{ textTransform: "capitalize" }}
                      >
                        {formatEntityType(log.entity_type)}
                      </span>
                    </td>
                    <td>
                      <MetadataSummary metadata={log.metadata} />
                    </td>
                    <td style={{ textAlign: "center", fontSize: "0.8rem" }}>
                      {expandedId === log.id ? "▲" : "▼"}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`${log.id}-detail`} className="dt-expand-row">
                      <td colSpan={6}>
                        <div className="dt-expand-content">
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "0.6rem 2rem",
                              fontSize: "0.82rem",
                            }}
                          >
                            <div>
                              <strong>Log ID:</strong>{" "}
                              <span className="muted">{log.id}</span>
                            </div>
                            <div>
                              <strong>Actor ID:</strong>{" "}
                              <span className="muted">
                                {log.actor_user_id || "—"}
                              </span>
                            </div>
                            <div>
                              <strong>Entity ID:</strong>{" "}
                              <span className="muted">
                                {log.entity_id || "—"}
                              </span>
                            </div>
                            <div>
                              <strong>Timestamp:</strong>{" "}
                              <span className="muted">
                                {new Date(log.created_at).toISOString()}
                              </span>
                            </div>
                            {Object.entries(log.metadata).length > 0 && (
                              <div style={{ gridColumn: "1 / -1" }}>
                                <strong>Metadata:</strong>
                                <pre
                                  style={{
                                    marginTop: 4,
                                    padding: "0.5rem 0.75rem",
                                    background: "var(--bg-2)",
                                    borderRadius: "0.4rem",
                                    fontSize: "0.78rem",
                                    overflow: "auto",
                                    maxHeight: 200,
                                    color: "var(--text)",
                                  }}
                                >
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="dt-footer">
        <div className="dt-rows-per-page">
          Rows per page:
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {renderPagination()}
      </div>
    </div>
  );
}
