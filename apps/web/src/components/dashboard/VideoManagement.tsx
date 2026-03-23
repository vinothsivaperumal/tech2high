"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";

interface Batch {
  id: string;
  name: string;
  program_id: string | null;
  program_title: string | null;
}

interface Course {
  id: string;
  title: string;
}

interface Topic {
  id: string;
  title: string;
  sort_order: number;
  videos: CourseVideo[];
}

interface CourseVideo {
  id: string;
  topic_id: string;
  title: string;
  youtube_url: string;
  sort_order: number;
}

interface BatchInfo {
  id: string;
  name: string;
  program_id: string | null;
  program_title: string | null;
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

export function VideoManagement() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Cascading dropdown state
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // Video form
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [videoForm, setVideoForm] = useState({ title: "", youtubeUrl: "" });

  // Preview
  const [playingVideo, setPlayingVideo] = useState<CourseVideo | null>(null);

  // Breadcrumb state
  const batchName = batches.find((b) => b.id === selectedBatchId)?.name ?? "";
  const programName = batchInfo?.program_title ?? "";
  const courseName = courses.find((c) => c.id === selectedCourseId)?.title ?? "";
  const topicName = topics.find((t) => t.id === selectedTopicId)?.title ?? "";

  useEffect(() => {
    void loadBatches();
  }, []);

  async function loadBatches() {
    setLoading(true);
    try {
      const res = await apiRequest<{ batches: Batch[] }>("/admin/batches");
      setBatches(res.batches);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load batches");
    } finally {
      setLoading(false);
    }
  }

  async function onBatchSelect(batchId: string) {
    setSelectedBatchId(batchId);
    setSelectedCourseId("");
    setSelectedTopicId("");
    setCourses([]);
    setTopics([]);
    setBatchInfo(null);
    setPlayingVideo(null);
    if (!batchId) return;

    setCoursesLoading(true);
    try {
      const res = await apiRequest<{ courses: Course[]; batch: BatchInfo }>(`/admin/video-hierarchy/batch/${batchId}/courses`);
      setCourses(res.courses);
      setBatchInfo(res.batch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load courses");
    } finally {
      setCoursesLoading(false);
    }
  }

  async function onCourseSelect(courseId: string) {
    setSelectedCourseId(courseId);
    setSelectedTopicId("");
    setTopics([]);
    setPlayingVideo(null);
    if (!courseId) return;

    setTopicsLoading(true);
    try {
      const res = await apiRequest<{ topics: Topic[] }>(`/admin/courses/${courseId}/topics`);
      setTopics(res.topics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load topics");
    } finally {
      setTopicsLoading(false);
    }
  }

  function onTopicSelect(topicId: string) {
    setSelectedTopicId(topicId);
    setPlayingVideo(null);
  }

  const selectedTopic = topics.find((t) => t.id === selectedTopicId);
  const topicVideos = selectedTopic?.videos ?? [];

  async function addVideo(e: FormEvent) {
    e.preventDefault();
    if (!selectedTopicId) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const res = await apiRequest<{ video: CourseVideo }>(`/admin/topics/${selectedTopicId}/videos`, "POST", {
        title: videoForm.title,
        youtubeUrl: videoForm.youtubeUrl,
        sortOrder: topicVideos.length,
      });
      setTopics((prev) =>
        prev.map((t) =>
          t.id === selectedTopicId ? { ...t, videos: [...t.videos, res.video] } : t
        )
      );
      setVideoForm({ title: "", youtubeUrl: "" });
      setShowForm(false);
      setMessage("Video added successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add video");
    } finally {
      setSubmitting(false);
    }
  }

  const embedUrl = playingVideo ? youtubeEmbedUrl(playingVideo.youtube_url) : null;

  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="dt-container">
        <div className="dt-header">
          <h3>Video Management</h3>
          <div className="dt-header-actions">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Batch → Program → Course → Topic → Videos</span>
          </div>
        </div>

        {/* Breadcrumb */}
        {selectedBatchId ? (
          <div className="vm-breadcrumb">
            <button type="button" className="vm-bc-item" onClick={() => onBatchSelect("")}>All Batches</button>
            <span className="vm-bc-sep">›</span>
            <button type="button" className={`vm-bc-item ${!selectedCourseId ? "vm-bc-active" : ""}`} onClick={() => { setSelectedCourseId(""); setSelectedTopicId(""); setTopics([]); }}>{batchName}</button>
            {programName ? <span className="vm-bc-program">({programName})</span> : null}
            {selectedCourseId ? (
              <>
                <span className="vm-bc-sep">›</span>
                <button type="button" className={`vm-bc-item ${!selectedTopicId ? "vm-bc-active" : ""}`} onClick={() => { setSelectedTopicId(""); }}>{courseName}</button>
              </>
            ) : null}
            {selectedTopicId ? (
              <>
                <span className="vm-bc-sep">›</span>
                <span className="vm-bc-item vm-bc-active">{topicName}</span>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Cascading Dropdowns */}
        <div className="vm-dropdowns">
          <label className="vm-dd-label">
            <span>Batch</span>
            <select value={selectedBatchId} onChange={(e) => void onBatchSelect(e.target.value)} className="vm-select">
              <option value="">Select Batch…</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.program_title ? ` (${b.program_title})` : ""}</option>
              ))}
            </select>
          </label>

          <label className="vm-dd-label">
            <span>Program</span>
            <input
              type="text"
              readOnly
              value={batchInfo?.program_title ?? (selectedBatchId ? "No program" : "")}
              className="vm-input-readonly"
              placeholder="Auto-filled from batch"
            />
          </label>

          <label className="vm-dd-label">
            <span>Course</span>
            <select
              value={selectedCourseId}
              onChange={(e) => void onCourseSelect(e.target.value)}
              className="vm-select"
              disabled={!selectedBatchId || coursesLoading}
            >
              <option value="">{coursesLoading ? "Loading…" : courses.length === 0 && selectedBatchId ? "No courses in batch" : "Select Course…"}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </label>

          <label className="vm-dd-label">
            <span>Topic</span>
            <select
              value={selectedTopicId}
              onChange={(e) => onTopicSelect(e.target.value)}
              className="vm-select"
              disabled={!selectedCourseId || topicsLoading}
            >
              <option value="">{topicsLoading ? "Loading…" : topics.length === 0 && selectedCourseId ? "No topics in course" : "Select Topic…"}</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Video player */}
        {playingVideo && embedUrl ? (
          <div className="vm-player-wrap">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{playingVideo.title}</span>
              <button type="button" className="dt-action-btn" onClick={() => setPlayingVideo(null)}>✕ Close</button>
            </div>
            <div className="yt-player-wrap">
              <iframe src={embedUrl} title={playingVideo.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="yt-player" />
            </div>
          </div>
        ) : null}

        {/* Videos list for selected topic */}
        {selectedTopicId ? (
          <div className="vm-videos-section">
            <div className="vm-videos-header">
              <h4>Videos in "{topicName}" ({topicVideos.length})</h4>
              <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>
                {showForm ? "Cancel" : "+ Add Video"}
              </button>
            </div>

            {showForm ? (
              <div className="dt-form-card" style={{ marginBottom: "1rem" }}>
                <form className="form" onSubmit={(e) => void addVideo(e)}>
                  <label>
                    Video Title
                    <input
                      required
                      minLength={2}
                      maxLength={200}
                      value={videoForm.title}
                      onChange={(e) => setVideoForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g., Introduction to SQL Joins"
                    />
                  </label>
                  <label>
                    YouTube URL
                    <input
                      required
                      type="url"
                      value={videoForm.youtubeUrl}
                      onChange={(e) => setVideoForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </label>
                  <div className="row-inline" style={{ gap: "0.5rem" }}>
                    <button type="submit" className="button" disabled={submitting}>
                      {submitting ? "Saving…" : "Save Video"}
                    </button>
                    <button type="button" className="button danger" onClick={() => setShowForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : null}

            {topicVideos.length === 0 && !showForm ? (
              <p className="muted" style={{ fontSize: "0.85rem", padding: "1rem 0" }}>No videos yet. Click "+ Add Video" to add one.</p>
            ) : null}

            {topicVideos.length > 0 ? (
              <div className="dt-table-wrap">
                <table className="dt-table">
                  <thead>
                    <tr>
                      <th style={{ width: "36px" }}>#</th>
                      <th>Title</th>
                      <th>URL</th>
                      <th style={{ width: "80px" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topicVideos.map((v, idx) => (
                      <tr key={v.id} className={playingVideo?.id === v.id ? "expanded" : ""}>
                        <td>{idx + 1}</td>
                        <td><strong>{v.title}</strong></td>
                        <td>
                          <a href={v.youtube_url} target="_blank" rel="noopener noreferrer" className="dt-name-secondary" style={{ fontSize: "0.8rem" }}>
                            {v.youtube_url.length > 50 ? v.youtube_url.slice(0, 50) + "…" : v.youtube_url}
                          </a>
                        </td>
                        <td>
                          <button type="button" className="dt-action-btn" onClick={() => setPlayingVideo(playingVideo?.id === v.id ? null : v)}>
                            {playingVideo?.id === v.id ? "Close" : "▶ Play"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Topic cards when course is selected but no topic yet */}
        {selectedCourseId && !selectedTopicId && !topicsLoading ? (
          <div className="vm-topic-cards">
            <h4 style={{ marginBottom: "0.75rem" }}>Topics in "{courseName}"</h4>
            {topics.length === 0 ? (
              <p className="muted" style={{ fontSize: "0.85rem" }}>No topics found. Add topics from the Courses section.</p>
            ) : (
              <div className="vm-topic-grid">
                {topics.map((t) => (
                  <button key={t.id} type="button" className="vm-topic-card" onClick={() => onTopicSelect(t.id)}>
                    <span className="vm-topic-card-title">{t.title}</span>
                    <span className="vm-topic-card-count">{t.videos.length} video{t.videos.length !== 1 ? "s" : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Course cards when batch is selected but no course yet */}
        {selectedBatchId && !selectedCourseId && !coursesLoading ? (
          <div className="vm-topic-cards">
            <h4 style={{ marginBottom: "0.75rem" }}>Courses in "{batchName}"</h4>
            {courses.length === 0 ? (
              <p className="muted" style={{ fontSize: "0.85rem" }}>No courses assigned to this batch. Assign courses from the Batches section.</p>
            ) : (
              <div className="vm-topic-grid">
                {courses.map((c) => (
                  <button key={c.id} type="button" className="vm-topic-card" onClick={() => void onCourseSelect(c.id)}>
                    <span className="vm-topic-card-title">{c.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Initial state - show all batches as cards */}
        {!selectedBatchId && !loading ? (
          <div className="vm-topic-cards">
            <h4 style={{ marginBottom: "0.75rem" }}>Select a Batch to manage videos</h4>
            {batches.length === 0 ? (
              <p className="muted">No batches found.</p>
            ) : (
              <div className="vm-topic-grid">
                {batches.map((b) => (
                  <button key={b.id} type="button" className="vm-topic-card" onClick={() => void onBatchSelect(b.id)}>
                    <span className="vm-topic-card-title">{b.name}</span>
                    {b.program_title ? <span className="vm-topic-card-count">{b.program_title}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {loading ? <p className="muted" style={{ padding: "1rem" }}>Loading batches…</p> : null}
        {coursesLoading ? <p className="muted" style={{ padding: "1rem" }}>Loading courses…</p> : null}
        {topicsLoading ? <p className="muted" style={{ padding: "1rem" }}>Loading topics…</p> : null}
      </div>
    </>
  );
}
