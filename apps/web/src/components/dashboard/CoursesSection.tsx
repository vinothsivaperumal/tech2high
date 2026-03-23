"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";

interface Course {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  topic_count?: number;
  video_count?: number;
  created_at: string;
}

interface CourseBatch {
  id: string;
  name: string;
  is_active: boolean;
}

interface CourseVideo {
  id: string;
  topic_id: string;
  title: string;
  youtube_url: string;
  sort_order: number;
}

interface CourseTopic {
  id: string;
  title: string;
  sort_order: number;
  videos: CourseVideo[];
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

const ROWS_OPTIONS = [5, 10, 25, 50];

export function CoursesSection({ manage = false, apiBase = "/admin" }: { manage?: boolean; apiBase?: string }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<CourseVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [error, setError] = useState("");

  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm] = useState({ title: "", description: "" });
  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null);
  const [topicForm, setTopicForm] = useState({ title: "", sortOrder: "0" });
  const [addingVideoFor, setAddingVideoFor] = useState<string | null>(null);
  const [videoForm, setVideoForm] = useState({ title: "", youtubeUrl: "", sortOrder: "0" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [courseBatches, setCourseBatches] = useState<CourseBatch[]>([]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { void loadCourses(); }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, pageSize]);

  async function loadCourses() {
    setLoading(true); setError("");
    try {
      const path = manage ? `${apiBase}/courses` : "/student/courses";
      const res = await apiRequest<{ courses: Course[] }>(path);
      setCourses(res.courses);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load courses"); }
    finally { setLoading(false); }
  }

  async function selectCourse(course: Course) {
    setSelectedCourse(course); setTopics([]); setExpandedTopic(null); setPlayingVideo(null);
    setAddingTopicFor(null); setAddingVideoFor(null); setCourseBatches([]); setTopicsLoading(true); setError("");
    try {
      const base = manage ? "/admin" : "/student";
      const promises: Promise<unknown>[] = [apiRequest<{ topics: CourseTopic[] }>(`${base}/courses/${course.id}/topics`)];
      if (manage) promises.push(apiRequest<{ batches: CourseBatch[] }>(`/admin/courses/${course.id}/batches`));
      const results = await Promise.all(promises);
      setTopics((results[0] as { topics: CourseTopic[] }).topics);
      if (manage && results[1]) setCourseBatches((results[1] as { batches: CourseBatch[] }).batches);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load topics"); }
    finally { setTopicsLoading(false); }
  }

  function closeDrawer() { setSelectedCourse(null); setTopics([]); setExpandedTopic(null); setPlayingVideo(null); setAddingTopicFor(null); setAddingVideoFor(null); setCourseBatches([]); }

  async function submitCourse(e: FormEvent) {
    e.preventDefault(); setSubmitting(true); setError("");
    try { const res = await apiRequest<{ course: Course }>(`${apiBase}/courses`, "POST", { title: courseForm.title, description: courseForm.description || undefined }); setCourses((prev) => [res.course, ...prev]); setCourseForm({ title: "", description: "" }); setShowCourseForm(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to create course"); }
    finally { setSubmitting(false); }
  }

  async function submitTopic(e: FormEvent) {
    e.preventDefault(); if (!addingTopicFor) return; setSubmitting(true); setError("");
    try { const res = await apiRequest<{ topic: CourseTopic }>(`/admin/courses/${addingTopicFor}/topics`, "POST", { title: topicForm.title, sortOrder: Number(topicForm.sortOrder) }); setTopics((prev) => [...prev, res.topic]); setTopicForm({ title: "", sortOrder: "0" }); setAddingTopicFor(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to add topic"); }
    finally { setSubmitting(false); }
  }

  async function submitVideo(e: FormEvent) {
    e.preventDefault(); if (!addingVideoFor) return; setSubmitting(true); setError("");
    try { const res = await apiRequest<{ video: CourseVideo }>(`/admin/topics/${addingVideoFor}/videos`, "POST", { title: videoForm.title, youtubeUrl: videoForm.youtubeUrl, sortOrder: Number(videoForm.sortOrder) }); setTopics((prev) => prev.map((t) => (t.id === addingVideoFor ? { ...t, videos: [...t.videos, res.video] } : t))); setVideoForm({ title: "", youtubeUrl: "", sortOrder: "0" }); setAddingVideoFor(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to add video"); }
    finally { setSubmitting(false); }
  }

  async function toggleCourseStatus(course: Course) {
    setError(""); setMessage("");
    try { await apiRequest(`/admin/courses/${course.id}/status`, "PATCH", { isActive: !course.is_active }); setMessage(`Course ${course.is_active ? "deactivated" : "activated"}.`); setCourses((prev) => prev.map((c) => c.id === course.id ? { ...c, is_active: !c.is_active } : c)); if (selectedCourse?.id === course.id) setSelectedCourse({ ...course, is_active: !course.is_active }); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to update status"); }
  }

  const embedUrl = playingVideo ? youtubeEmbedUrl(playingVideo.youtube_url) : null;

  const filtered = useMemo(() => {
    let list = courses;
    if (search) { const q = search.toLowerCase(); list = list.filter((c) => c.title.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q)); }
    if (manage && filterStatus !== "all") list = list.filter((c) => filterStatus === "active" ? c.is_active : !c.is_active);
    return list;
  }, [courses, search, filterStatus, manage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startRow = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(safePage * pageSize, filtered.length);

  const hasActiveFilters = search !== "" || (manage && filterStatus !== "all");
  const filterTags: { label: string; onClear: () => void }[] = [];
  if (search) filterTags.push({ label: `Search: ${search}`, onClear: () => setSearch("") });
  if (manage && filterStatus !== "all") filterTags.push({ label: `Status: ${filterStatus}`, onClear: () => setFilterStatus("all") });

  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      {manage && showCourseForm ? (
        <div className="dt-form-card">
          <h4>New Course</h4>
          <form className="form" onSubmit={(e) => void submitCourse(e)}>
            <label>Title<input required value={courseForm.title} onChange={(e) => setCourseForm((f) => ({ ...f, title: e.target.value }))} /></label>
            <label>Description<textarea value={courseForm.description} onChange={(e) => setCourseForm((f) => ({ ...f, description: e.target.value }))} /></label>
            <div className="row-inline" style={{ gap: "0.5rem" }}>
              <button type="submit" className="button" disabled={submitting}>{submitting ? "Creating…" : "Create Course"}</button>
              <button type="button" className="button danger" onClick={() => setShowCourseForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="dt-container">
        <div className="dt-header">
          <h3>{manage ? "Courses Management" : "My Courses"}</h3>
          <div className="dt-header-actions">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{courses.length} total</span>
            {manage ? <button type="button" className="button" onClick={() => setShowCourseForm((v) => !v)}>{showCourseForm ? "Cancel" : "+ Create Course"}</button> : null}
          </div>
        </div>

        <div className="dt-filters">
          <div className="dt-search">
            <span className="dt-search-icon">🔍</span>
            <input placeholder="Search courses…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {manage ? (
            <select className="dt-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          ) : null}
          {hasActiveFilters ? <button type="button" className="dt-clear-btn" onClick={() => { setSearch(""); setFilterStatus("all"); }}>✕ Reset</button> : null}
        </div>

        {filterTags.length > 0 ? (
          <div className="dt-filter-tags">
            {filterTags.map((t) => <span className="dt-filter-tag" key={t.label}>{t.label} <button type="button" onClick={t.onClear}>✕</button></span>)}
          </div>
        ) : null}

        <div className="dt-info">
          <span>Showing {startRow}–{endRow} of {filtered.length} course{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Description</th>
                {manage ? <th>Topics</th> : null}
                {manage ? <th>Videos</th> : null}
                {manage ? <th>Status</th> : null}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={manage ? 6 : 3} className="dt-loading">Loading…</td></tr>
              ) : !paginated.length ? (
                <tr className="dt-empty"><td colSpan={manage ? 6 : 3}>No courses found.</td></tr>
              ) : paginated.map((c) => (
                <tr key={c.id} className={selectedCourse?.id === c.id ? "expanded" : ""}>
                  <td><strong>{c.title}</strong></td>
                  <td><span className="dt-name-secondary" style={{ maxWidth: "220px", display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description || "—"}</span></td>
                  {manage ? <td><span className="dt-cell-tag">{c.topic_count ?? 0}</span></td> : null}
                  {manage ? <td><span className="dt-cell-tag">{c.video_count ?? 0}</span></td> : null}
                  {manage ? <td><span className={`dt-badge ${c.is_active ? "dt-badge-active" : "dt-badge-inactive"}`}>{c.is_active ? "Active" : "Inactive"}</span></td> : null}
                  <td>
                    <div className="dt-actions">
                      <button type="button" className="dt-action-btn" onClick={() => void selectCourse(c)}>View</button>
                      {manage ? <button type="button" className="dt-action-btn" onClick={() => void toggleCourseStatus(c)}>{c.is_active ? "Deactivate" : "Activate"}</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="dt-footer">
          <div className="dt-rows-per-page">
            <span>Rows per page:</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {ROWS_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="dt-pagination">
            <button type="button" className="dt-page-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>««</button>
            <button type="button" className="dt-page-btn" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => { if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis"); acc.push(p); return acc; }, [])
              .map((item, idx) =>
                item === "ellipsis" ? <span key={`e${idx}`} className="dt-page-ellipsis">…</span> : <button key={item} type="button" className={`dt-page-btn ${item === safePage ? "active" : ""}`} onClick={() => setPage(item)}>{item}</button>
              )}
            <button type="button" className="dt-page-btn" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
            <button type="button" className="dt-page-btn" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»»</button>
          </div>
        </div>
      </div>

      {/* ── Drawer for course detail (topics + videos) ── */}
      {selectedCourse ? (
        <>
          <div className="dt-drawer-overlay" onClick={closeDrawer} />
          <aside className="dt-drawer" style={{ width: "min(580px, 90vw)" }}>
            <div className="dt-drawer-header">
              <h3>{selectedCourse.title}</h3>
              <button type="button" className="dt-drawer-close" onClick={closeDrawer}>✕</button>
            </div>

            {/* YouTube player */}
            {playingVideo && embedUrl ? (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{playingVideo.title}</span>
                  <button type="button" className="dt-action-btn" onClick={() => setPlayingVideo(null)}>✕ Close</button>
                </div>
                <div className="yt-player-wrap">
                  <iframe src={embedUrl} title={playingVideo.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="yt-player" />
                </div>
              </div>
            ) : null}

            {/* Batches using this course */}
            {manage && courseBatches.length > 0 ? (
              <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "rgba(255,255,255,0.03)", borderRadius: "0.5rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.3rem" }}>
                  Assigned to {courseBatches.length} batch{courseBatches.length !== 1 ? "es" : ""}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {courseBatches.map((b) => <span key={b.id} className={`dt-badge ${b.is_active ? "dt-badge-active" : "dt-badge-inactive"}`}>{b.name}</span>)}
                </div>
              </div>
            ) : null}

            {/* Admin actions */}
            {manage ? (
              <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                <button type="button" className="dt-action-btn" onClick={() => void toggleCourseStatus(selectedCourse)}>{selectedCourse.is_active ? "Deactivate" : "Activate"}</button>
                <button type="button" className="dt-action-btn" onClick={() => setAddingTopicFor((v) => (v ? null : selectedCourse.id))}>{addingTopicFor === selectedCourse.id ? "Cancel" : "+ Add Topic"}</button>
              </div>
            ) : null}

            {/* Add topic form */}
            {manage && addingTopicFor === selectedCourse.id ? (
              <div className="dt-form-card" style={{ marginBottom: "0.75rem" }}>
                <form className="form" onSubmit={(e) => void submitTopic(e)}>
                  <label>Topic Title<input required value={topicForm.title} onChange={(e) => setTopicForm((f) => ({ ...f, title: e.target.value }))} /></label>
                  <label>Sort Order<input type="number" min={0} value={topicForm.sortOrder} onChange={(e) => setTopicForm((f) => ({ ...f, sortOrder: e.target.value }))} /></label>
                  <button type="submit" className="button" disabled={submitting}>{submitting ? "Adding…" : "Add Topic"}</button>
                </form>
              </div>
            ) : null}

            {topicsLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>Loading topics…</p> : null}

            {/* Topics list */}
            <div className="stack" style={{ gap: "0.4rem" }}>
              {topics.map((topic) => (
                <div key={topic.id} className="topic-block">
                  <button type="button" className="topic-toggle" onClick={() => setExpandedTopic((v) => (v === topic.id ? null : topic.id))}>
                    <span>{expandedTopic === topic.id ? "▾" : "▸"} {topic.title}</span>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>{topic.videos.length} video{topic.videos.length !== 1 ? "s" : ""}</span>
                  </button>
                  {expandedTopic === topic.id ? (
                    <div className="topic-videos">
                      {manage ? (
                        <div style={{ marginBottom: "0.5rem" }}>
                          {addingVideoFor === topic.id ? (
                            <form className="form" onSubmit={(e) => void submitVideo(e)} style={{ marginBottom: "0.5rem" }}>
                              <label>Video Title<input required value={videoForm.title} onChange={(e) => setVideoForm((f) => ({ ...f, title: e.target.value }))} /></label>
                              <label>YouTube URL<input required placeholder="https://youtube.com/watch?v=…" value={videoForm.youtubeUrl} onChange={(e) => setVideoForm((f) => ({ ...f, youtubeUrl: e.target.value }))} /></label>
                              <label>Sort Order<input type="number" min={0} value={videoForm.sortOrder} onChange={(e) => setVideoForm((f) => ({ ...f, sortOrder: e.target.value }))} /></label>
                              <div className="row-inline" style={{ gap: "0.4rem" }}>
                                <button type="submit" className="button" disabled={submitting}>{submitting ? "Adding…" : "Add Video"}</button>
                                <button type="button" className="button danger" onClick={() => setAddingVideoFor(null)}>Cancel</button>
                              </div>
                            </form>
                          ) : (
                            <button type="button" className="dt-action-btn" onClick={() => { setAddingVideoFor(topic.id); setVideoForm({ title: "", youtubeUrl: "", sortOrder: "0" }); }}>+ Add Video</button>
                          )}
                        </div>
                      ) : null}
                      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {topic.videos.map((v) => (
                          <li key={v.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", fontSize: "0.82rem" }} onClick={() => setPlayingVideo(v)}>
                            <span style={{ color: "var(--danger)", fontSize: "0.75rem" }}>▶</span>
                            <span>{v.title}</span>
                          </li>
                        ))}
                        {!topic.videos.length ? <li style={{ padding: "0.4rem 0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>No videos in this topic yet.</li> : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
              {!topics.length && !topicsLoading ? <p className="muted" style={{ fontSize: "0.8rem" }}>No topics yet.{manage ? " Add the first topic above." : ""}</p> : null}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
