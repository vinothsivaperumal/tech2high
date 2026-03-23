"use client";

import { FormEvent, useEffect, useState } from "react";

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

export function CoursesSection({ manage = false }: { manage?: boolean }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<CourseVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [error, setError] = useState("");

  // manage-mode forms
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm] = useState({ title: "", description: "" });
  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null);
  const [topicForm, setTopicForm] = useState({ title: "", sortOrder: "0" });
  const [addingVideoFor, setAddingVideoFor] = useState<string | null>(null);
  const [videoForm, setVideoForm] = useState({ title: "", youtubeUrl: "", sortOrder: "0" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // Batches assigned to selected course (admin only)
  const [courseBatches, setCourseBatches] = useState<CourseBatch[]>([]);

  useEffect(() => {
    void loadCourses();
  }, []);

  async function loadCourses() {
    setLoading(true);
    setError("");
    try {
      const path = manage ? "/admin/courses" : "/student/courses";
      const res = await apiRequest<{ courses: Course[] }>(path);
      setCourses(res.courses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }

  async function selectCourse(course: Course) {
    setSelectedCourse(course);
    setTopics([]);
    setExpandedTopic(null);
    setPlayingVideo(null);
    setAddingTopicFor(null);
    setAddingVideoFor(null);
    setCourseBatches([]);
    setTopicsLoading(true);
    setError("");
    try {
      const base = manage ? "/admin" : "/student";
      const promises: Promise<unknown>[] = [
        apiRequest<{ topics: CourseTopic[] }>(`${base}/courses/${course.id}/topics`),
      ];
      if (manage) {
        promises.push(apiRequest<{ batches: CourseBatch[] }>(`/admin/courses/${course.id}/batches`));
      }
      const results = await Promise.all(promises);
      setTopics((results[0] as { topics: CourseTopic[] }).topics);
      if (manage && results[1]) {
        setCourseBatches((results[1] as { batches: CourseBatch[] }).batches);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load topics");
    } finally {
      setTopicsLoading(false);
    }
  }

  async function submitCourse(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await apiRequest<{ course: Course }>("/admin/courses", "POST", {
        title: courseForm.title,
        description: courseForm.description || undefined
      });
      setCourses((prev) => [res.course, ...prev]);
      setCourseForm({ title: "", description: "" });
      setShowCourseForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create course");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTopic(e: FormEvent) {
    e.preventDefault();
    if (!addingTopicFor) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await apiRequest<{ topic: CourseTopic }>(`/admin/courses/${addingTopicFor}/topics`, "POST", {
        title: topicForm.title,
        sortOrder: Number(topicForm.sortOrder)
      });
      setTopics((prev) => [...prev, res.topic]);
      setTopicForm({ title: "", sortOrder: "0" });
      setAddingTopicFor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add topic");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitVideo(e: FormEvent) {
    e.preventDefault();
    if (!addingVideoFor) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await apiRequest<{ video: CourseVideo }>(`/admin/topics/${addingVideoFor}/videos`, "POST", {
        title: videoForm.title,
        youtubeUrl: videoForm.youtubeUrl,
        sortOrder: Number(videoForm.sortOrder)
      });
      setTopics((prev) =>
        prev.map((t) => (t.id === addingVideoFor ? { ...t, videos: [...t.videos, res.video] } : t))
      );
      setVideoForm({ title: "", youtubeUrl: "", sortOrder: "0" });
      setAddingVideoFor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add video");
    } finally {
      setSubmitting(false);
    }
  }

  const embedUrl = playingVideo ? youtubeEmbedUrl(playingVideo.youtube_url) : null;

  async function toggleCourseStatus(course: Course) {
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/courses/${course.id}/status`, "PATCH", { isActive: !course.is_active });
      setMessage(`Course ${course.is_active ? "deactivated" : "activated"}.`);
      setCourses((prev) => prev.map((c) => c.id === course.id ? { ...c, is_active: !c.is_active } : c));
      if (selectedCourse?.id === course.id) {
        setSelectedCourse({ ...course, is_active: !course.is_active });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  return (
    <div className="stack">
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      {/* ── YouTube player ── */}
      {playingVideo && embedUrl ? (
        <section className="card">
          <header className="card-header">
            <h3>{playingVideo.title}</h3>
            <button
              type="button"
              className="button"
              style={{ marginLeft: "auto" }}
              onClick={() => setPlayingVideo(null)}
            >
              ✕ Close
            </button>
          </header>
          <div className="yt-player-wrap">
            <iframe
              src={embedUrl}
              title={playingVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="yt-player"
            />
          </div>
        </section>
      ) : null}

      {/* ── Courses + topics ── */}
      <div className="courses-layout">
        {/* Course list */}
        <div className="courses-list-pane">
          <section className="card">
            <header className="card-header">
              <h3>Courses</h3>
              {manage ? (
                <button
                  type="button"
                  className="button"
                  style={{ marginLeft: "auto" }}
                  onClick={() => setShowCourseForm((v) => !v)}
                >
                  {showCourseForm ? "Cancel" : "+ Course"}
                </button>
              ) : null}
            </header>

            {manage && showCourseForm ? (
              <form className="form" onSubmit={(e) => void submitCourse(e)} style={{ marginBottom: "1rem" }}>
                <label>
                  Title
                  <input
                    required
                    value={courseForm.title}
                    onChange={(e) => setCourseForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    value={courseForm.description}
                    onChange={(e) => setCourseForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <button type="submit" className="button" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Course"}
                </button>
              </form>
            ) : null}

            {loading ? <p className="muted">Loading…</p> : null}
            <ul className="list">
              {courses.map((c) => (
                <li
                  key={c.id}
                  className="list-item"
                  style={{
                    cursor: "pointer",
                    background: selectedCourse?.id === c.id ? "rgba(75,226,194,0.12)" : undefined,
                    borderLeft: selectedCourse?.id === c.id ? "3px solid var(--accent)" : "3px solid transparent"
                  }}
                  onClick={() => void selectCourse(c)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{c.title}</strong>
                    {manage ? (
                      <span style={{
                        fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "0.25rem", fontWeight: 600,
                        background: c.is_active ? "rgba(46,204,113,0.15)" : "rgba(231,76,60,0.15)",
                        color: c.is_active ? "#2ecc71" : "#e74c3c"
                      }}>
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    ) : null}
                  </div>
                  {c.description ? (
                    <p className="muted" style={{ fontSize: "0.8rem" }}>
                      {c.description}
                    </p>
                  ) : null}
                  {manage && (c.topic_count !== undefined || c.video_count !== undefined) ? (
                    <p className="muted" style={{ fontSize: "0.72rem" }}>
                      {c.topic_count ?? 0} topic{(c.topic_count ?? 0) !== 1 ? "s" : ""} · {c.video_count ?? 0} video{(c.video_count ?? 0) !== 1 ? "s" : ""}
                    </p>
                  ) : null}
                </li>
              ))}
              {!courses.length && !loading ? (
                <li className="list-item muted">No courses yet.</li>
              ) : null}
            </ul>
          </section>
        </div>

        {/* Topics + videos */}
        <div className="courses-topics-pane">
          {selectedCourse ? (
            <section className="card">
              <header className="card-header">
                <h3>{selectedCourse.title}</h3>
                <div style={{ display: "flex", gap: "0.4rem", marginLeft: "auto" }}>
                  {manage ? (
                    <>
                      <button
                        type="button"
                        className={selectedCourse.is_active ? "button danger" : "button"}
                        style={{ fontSize: "0.75rem" }}
                        onClick={() => void toggleCourseStatus(selectedCourse)}
                      >
                        {selectedCourse.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="button"
                        onClick={() => setAddingTopicFor((v) => (v ? null : selectedCourse.id))}
                      >
                        {addingTopicFor === selectedCourse.id ? "Cancel" : "+ Topic"}
                      </button>
                    </>
                  ) : null}
                </div>
              </header>

              {/* Batches using this course (admin only) */}
              {manage && courseBatches.length > 0 ? (
                <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "rgba(255,255,255,0.03)", borderRadius: "0.5rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.3rem" }}>
                    Assigned to {courseBatches.length} batch{courseBatches.length !== 1 ? "es" : ""}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                    {courseBatches.map((b) => (
                      <span key={b.id} style={{
                        fontSize: "0.7rem", padding: "0.15rem 0.4rem", borderRadius: "0.25rem",
                        background: b.is_active ? "rgba(46,204,113,0.1)" : "rgba(231,76,60,0.1)",
                        color: b.is_active ? "#2ecc71" : "#e74c3c", fontWeight: 500
                      }}>
                        {b.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {manage && addingTopicFor === selectedCourse.id ? (
                <form
                  className="form"
                  onSubmit={(e) => void submitTopic(e)}
                  style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <label>
                    Topic Title
                    <input
                      required
                      value={topicForm.title}
                      onChange={(e) => setTopicForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </label>
                  <label>
                    Sort Order
                    <input
                      type="number"
                      min={0}
                      value={topicForm.sortOrder}
                      onChange={(e) => setTopicForm((f) => ({ ...f, sortOrder: e.target.value }))}
                    />
                  </label>
                  <button type="submit" className="button" disabled={submitting}>
                    {submitting ? "Adding…" : "Add Topic"}
                  </button>
                </form>
              ) : null}

              {topicsLoading ? <p className="muted">Loading topics…</p> : null}

              <div className="stack" style={{ gap: "0.4rem" }}>
                {topics.map((topic) => (
                  <div key={topic.id} className="topic-block">
                    <button
                      type="button"
                      className="topic-toggle"
                      onClick={() => setExpandedTopic((v) => (v === topic.id ? null : topic.id))}
                    >
                      <span>
                        {expandedTopic === topic.id ? "▾" : "▸"} {topic.title}
                      </span>
                      <span className="muted" style={{ fontSize: "0.8rem" }}>
                        {topic.videos.length} video{topic.videos.length !== 1 ? "s" : ""}
                      </span>
                    </button>

                    {expandedTopic === topic.id ? (
                      <div className="topic-videos">
                        {manage ? (
                          <div style={{ marginBottom: "0.5rem" }}>
                            {addingVideoFor === topic.id ? (
                              <form className="form" onSubmit={(e) => void submitVideo(e)} style={{ marginBottom: "0.5rem" }}>
                                <label>
                                  Video Title
                                  <input
                                    required
                                    value={videoForm.title}
                                    onChange={(e) => setVideoForm((f) => ({ ...f, title: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  YouTube URL
                                  <input
                                    required
                                    placeholder="https://youtube.com/watch?v=…"
                                    value={videoForm.youtubeUrl}
                                    onChange={(e) => setVideoForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Sort Order
                                  <input
                                    type="number"
                                    min={0}
                                    value={videoForm.sortOrder}
                                    onChange={(e) => setVideoForm((f) => ({ ...f, sortOrder: e.target.value }))}
                                  />
                                </label>
                                <div className="row-inline">
                                  <button type="submit" className="button" disabled={submitting}>
                                    {submitting ? "Adding…" : "Add Video"}
                                  </button>
                                  <button
                                    type="button"
                                    className="button"
                                    onClick={() => setAddingVideoFor(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <button
                                type="button"
                                className="button"
                                onClick={() => {
                                  setAddingVideoFor(topic.id);
                                  setVideoForm({ title: "", youtubeUrl: "", sortOrder: "0" });
                                }}
                              >
                                + Add Video
                              </button>
                            )}
                          </div>
                        ) : null}

                        <ul className="list">
                          {topic.videos.map((v) => (
                            <li
                              key={v.id}
                              className="list-item video-row"
                              onClick={() => {
                                setPlayingVideo(v);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              style={{ cursor: "pointer" }}
                            >
                              <div className="row-inline">
                                <span className="yt-icon">▶</span>
                                <span>{v.title}</span>
                              </div>
                            </li>
                          ))}
                          {!topic.videos.length ? (
                            <li className="list-item muted">No videos in this topic yet.</li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))}
                {!topics.length && !topicsLoading ? (
                  <p className="muted">No topics yet.{manage ? " Add the first topic above." : ""}</p>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="card">
              <p className="muted">Select a course from the list to see its topics and videos.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
