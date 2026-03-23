"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";

interface Notification {
  id: string;
  from_user_id: string | null;
  from_email?: string | null;
  from_name?: string | null;
  to_user_id?: string | null;
  to_email?: string | null;
  to_name?: string | null;
  to_role?: string | null;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationCenterProps {
  role: "student" | "trainer" | "admin";
  /** Admin: send to any user or role. Trainer: send to batch or admin. Student: send to admin. */
  apiBase: string;
  batches?: { id: string; name: string }[];
}

export function NotificationCenter({ role, apiBase, batches }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    subject: "",
    message: "",
    toRole: "" as string,
    toUserId: "" as string,
    batchId: "" as string,
  });

  useEffect(() => {
    void loadNotifications();
  }, []);

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const path = role === "admin" ? `${apiBase}/my-notifications` : `${apiBase}/notifications`;
      const res = await apiRequest<{ notifications: Notification[] }>(path);
      setNotifications(res.notifications);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: string) {
    try {
      await apiRequest(`${apiBase}/${role === "admin" ? "my-" : ""}notifications/${id}/read`, "PATCH");
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {
      // silent
    }
  }

  async function sendNotification(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const body: Record<string, unknown> = {
        subject: form.subject,
        message: form.message,
      };

      if (role === "admin") {
        if (form.toRole) body.toRole = form.toRole;
        if (form.toUserId) body.toUserId = form.toUserId;
      }
      if (role === "trainer" && form.batchId) {
        body.batchId = form.batchId;
      }

      const res = await apiRequest<{ message?: string }>(`${apiBase}/notifications`, "POST", body);
      setMessage(res.message ?? "Notification sent.");
      setForm({ subject: "", message: "", toRole: "", toUserId: "", batchId: "" });
      setShowCompose(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send notification");
    } finally {
      setSubmitting(false);
    }
  }

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  return (
    <div className="stack">
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="filter-bar">
        <div className="filter-bar-left">
          <span className="filter-count">
            {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
            {unreadCount > 0 ? ` (${unreadCount} unread)` : ""}
          </span>
        </div>
        <div className="filter-bar-right">
          <button type="button" className="button" onClick={() => setShowCompose((v) => !v)}>
            {showCompose ? "Cancel" : "✉ Compose"}
          </button>
        </div>
      </div>

      {showCompose ? (
        <section className="card">
          <header className="card-header">
            <h3>Send Notification</h3>
          </header>
          <form className="form" onSubmit={(e) => void sendNotification(e)}>
            {role === "admin" ? (
              <label>
                Send To (Role)
                <select value={form.toRole} onChange={(e) => setForm((f) => ({ ...f, toRole: e.target.value }))}>
                  <option value="">Select role…</option>
                  <option value="student">All Students</option>
                  <option value="trainer">All Trainers</option>
                  <option value="admin">All Admins</option>
                </select>
              </label>
            ) : null}

            {role === "trainer" && batches?.length ? (
              <label>
                Send To Batch (optional — defaults to admin)
                <select value={form.batchId} onChange={(e) => setForm((f) => ({ ...f, batchId: e.target.value }))}>
                  <option value="">Admin (default)</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} (all students)</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              Subject
              <input required value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </label>
            <label>
              Message
              <textarea required rows={4} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
            </label>
            <button type="submit" className="button" disabled={submitting}>
              {submitting ? "Sending…" : "Send Notification + Email"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="card">
        <header className="card-header">
          <h3>Inbox</h3>
        </header>
        {loading ? <p className="muted">Loading…</p> : null}
        <ul className="list">
          {notifications.map((n) => (
            <li
              key={n.id}
              className="list-item"
              style={{
                cursor: "pointer",
                borderLeft: n.is_read ? "3px solid transparent" : "3px solid var(--accent)",
                background: n.is_read ? undefined : "rgba(233,69,96,0.06)",
              }}
              onClick={() => {
                setExpandedId(expandedId === n.id ? null : n.id);
                if (!n.is_read) void markAsRead(n.id);
              }}
            >
              <div className="row-inline">
                <div style={{ flex: 1 }}>
                  <strong style={{ fontWeight: n.is_read ? 400 : 600 }}>
                    {n.is_read ? "" : "● "}{n.subject}
                  </strong>
                  <p className="muted" style={{ fontSize: "0.78rem" }}>
                    From: {n.from_name || n.from_email || "System"} · {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              {expandedId === n.id ? (
                <div style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.88rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>
                  {n.message}
                </div>
              ) : null}
            </li>
          ))}
          {!notifications.length && !loading ? (
            <li className="list-item muted">No notifications yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
