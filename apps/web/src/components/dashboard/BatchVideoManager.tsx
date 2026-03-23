"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";

interface Batch {
  id: string;
  name: string;
  trainer_email: string | null;
  trainer_name: string | null;
  student_count: number;
}

interface BatchVideo {
  id: string;
  batch_id: string;
  batch_name: string;
  title: string;
  description: string | null;
  youtube_url: string;
  created_at: string;
}

function youtubeEmbedUrl(url: string): string | null {
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return `https://www.youtube.com/embed/${embedMatch[1]}`;
  return null;
}

export function BatchVideoManager() {
  const [videos, setVideos] = useState<BatchVideo[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterBatch, setFilterBatch] = useState("all");
  const [previewVideo, setPreviewVideo] = useState<BatchVideo | null>(null);

  const [form, setForm] = useState({
    title: "",
    youtubeUrl: "",
    description: "",
    batchId: "",
  });

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [vRes, bRes] = await Promise.all([
        apiRequest<{ videos: BatchVideo[] }>("/admin/batch-videos"),
        apiRequest<{ batches: Batch[] }>("/admin/batches"),
      ]);
      setVideos(vRes.videos);
      setBatches(bRes.batches);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function addVideo(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const res = await apiRequest<{ video: BatchVideo }>("/admin/batch-videos", "POST", {
        title: form.title,
        youtubeUrl: form.youtubeUrl,
        description: form.description || undefined,
        batchId: form.batchId,
      });
      // Add batch_name from local data
      const batch = batches.find((b) => b.id === form.batchId);
      setVideos((prev) => [{ ...res.video, batch_name: batch?.name ?? "" }, ...prev]);
      setForm({ title: "", youtubeUrl: "", description: "", batchId: "" });
      setShowForm(false);
      setMessage("Video added successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add video");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteVideo(id: string) {
    if (!window.confirm("Delete this video?")) return;
    setError("");
    try {
      await apiRequest(`/admin/batch-videos/${id}`, "DELETE");
      setVideos((prev) => prev.filter((v) => v.id !== id));
      setMessage("Video deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete video");
    }
  }

  const filtered = useMemo(() => {
    if (filterBatch === "all") return videos;
    return videos.filter((v) => v.batch_id === filterBatch);
  }, [videos, filterBatch]);

  const embedUrl = previewVideo ? youtubeEmbedUrl(previewVideo.youtube_url) : null;

  return (
    <div className="stack">
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      {/* Preview player */}
      {previewVideo && embedUrl ? (
        <section className="card">
          <header className="card-header">
            <h3>{previewVideo.title}</h3>
            <button type="button" className="button" style={{ marginLeft: "auto" }} onClick={() => setPreviewVideo(null)}>
              ✕ Close
            </button>
          </header>
          <div className="yt-player-wrap">
            <iframe
              src={embedUrl}
              title={previewVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="yt-player"
            />
          </div>
        </section>
      ) : null}

      {/* Controls */}
      <div className="filter-bar">
        <div className="filter-bar-left">
          <select className="filter-select" value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <span className="filter-count">{filtered.length} video{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="filter-bar-right">
          <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Add Video"}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm ? (
        <section className="card">
          <header className="card-header">
            <h3>Add YouTube Video to Batch</h3>
          </header>
          <form className="form" onSubmit={(e) => void addVideo(e)}>
            <label>
              Batch
              <select required value={form.batchId} onChange={(e) => setForm((f) => ({ ...f, batchId: e.target.value }))}>
                <option value="">Select Batch…</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label>
              Video Title
              <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </label>
            <label>
              YouTube URL
              <input required placeholder="https://youtube.com/watch?v=…" value={form.youtubeUrl} onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))} />
            </label>
            <label>
              Description (optional)
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <button type="submit" className="button" disabled={submitting}>
              {submitting ? "Adding…" : "Add Video"}
            </button>
          </form>
        </section>
      ) : null}

      {/* Video list */}
      <section className="card">
        <header className="card-header">
          <h3>Batch Videos</h3>
        </header>
        {loading ? <p className="muted">Loading…</p> : null}
        <ul className="list">
          {filtered.map((v) => (
            <li className="list-item" key={v.id}>
              <div className="row-inline">
                <div style={{ flex: 1 }}>
                  <strong
                    style={{ cursor: "pointer", color: "var(--accent)" }}
                    onClick={() => { setPreviewVideo(v); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  >
                    ▶ {v.title}
                  </strong>
                  <p className="muted" style={{ fontSize: "0.78rem" }}>
                    📦 {v.batch_name} · {new Date(v.created_at).toLocaleDateString()}
                  </p>
                  {v.description ? <p className="muted" style={{ fontSize: "0.78rem" }}>{v.description}</p> : null}
                </div>
                <button type="button" className="button danger" style={{ fontSize: "0.75rem" }} onClick={() => void deleteVideo(v.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {!filtered.length && !loading ? (
            <li className="list-item muted">No videos found.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
