"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../lib/api";

/* ══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════ */

interface UserInfo {
  fullName: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  institute: string | null;
  experienceLevel: string | null;
}

interface ResumeProfile {
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  preferred_role: string | null;
  work_authorization: string | null;
  status: string;
  admin_notes: string | null;
}

interface Education {
  id: string;
  institution: string;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  grade: string | null;
}

interface Experience {
  id: string;
  company: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

interface Skill {
  id: string;
  skill_name: string;
  proficiency: string | null;
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  tech_stack: string | null;
  url: string | null;
}

interface AssignedProject {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  technologies: string | null;
  domain: string | null;
  client_name: string | null;
  client_industry: string | null;
  batch_name: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  assignment_desc: string | null;
}

type DocxTemplate = "classic" | "modern" | "minimal" | "executive" | "creative";

const TEMPLATE_INFO: Record<DocxTemplate, { label: string; desc: string }> = {
  classic: { label: "Classic", desc: "Traditional format — Times New Roman, centered header" },
  modern: { label: "Modern", desc: "Clean Calibri font with navy accents" },
  minimal: { label: "Minimal", desc: "Simple Arial layout, no borders" },
  executive: { label: "Executive", desc: "Bold serif design for senior roles" },
  creative: { label: "Creative", desc: "Left-aligned with blue accents" },
};

interface ScoreCheck {
  key: string;
  label: string;
  done: boolean;
  weight: number;
}

interface ProfileScore {
  score: number;
  checks: ScoreCheck[];
  counts: { education: number; experience: number; skills: number; projects: number };
}

/* Summary field stored only in local state (not DB) */
interface ResumeForm {
  summary: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  preferredRole: string;
  workAuthorization: string;
}

type ActiveTab = "editor" | "preview" | "download";

/* ══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════ */

export function ATSResumeBuilder() {
  /* ── State ────────────────────────────────────────── */
  const [tab, setTab] = useState<ActiveTab>("editor");
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [education, setEducation] = useState<Education[]>([]);
  const [experience, setExperience] = useState<Experience[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<AssignedProject[]>([]);
  const [score, setScore] = useState<ProfileScore | null>(null);
  const [docxTemplate, setDocxTemplate] = useState<DocxTemplate>("classic");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");

  const [form, setForm] = useState<ResumeForm>({
    summary: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    preferredRole: "",
    workAuthorization: "",
  });

  /* ── Add-item modals ──────────────────────────────── */
  const [showAddEdu, setShowAddEdu] = useState(false);
  const [showAddExp, setShowAddExp] = useState(false);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [showAddProj, setShowAddProj] = useState(false);

  const [eduForm, setEduForm] = useState({ institution: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "", grade: "" });
  const [expForm, setExpForm] = useState({ company: "", title: "", startDate: "", endDate: "", description: "" });
  const [skillForm, setSkillForm] = useState({ skillName: "", proficiency: "intermediate" });
  const [projForm, setProjForm] = useState({ title: "", description: "", techStack: "", url: "" });

  const previewRef = useRef<HTMLDivElement>(null);

  /* ── Data loading ─────────────────────────────────── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, resumeRes, scoreRes, apRes] = await Promise.all([
        apiRequest<{ user: UserInfo }>("/auth/me"),
        apiRequest<{ profile: ResumeProfile | null; education: Education[]; experience: Experience[]; skills: Skill[]; projects: Project[] }>("/student/resume"),
        apiRequest<ProfileScore>("/student/profile-score"),
        apiRequest<{ projects: AssignedProject[] }>("/student/assigned-projects").catch(() => ({ projects: [] as AssignedProject[] })),
      ]);
      setUserInfo(meRes.user);
      setProfile(resumeRes.profile);
      setEducation(resumeRes.education);
      setExperience(resumeRes.experience);
      setSkills(resumeRes.skills);
      setProjects(resumeRes.projects);
      setAssignedProjects(apRes.projects);
      setScore(scoreRes);

      if (resumeRes.profile) {
        setForm(prev => ({
          ...prev,
          linkedinUrl: resumeRes.profile!.linkedin_url ?? "",
          githubUrl: resumeRes.profile!.github_url ?? "",
          portfolioUrl: resumeRes.profile!.portfolio_url ?? "",
          preferredRole: resumeRes.profile!.preferred_role ?? "",
          workAuthorization: resumeRes.profile!.work_authorization ?? "",
        }));
      }

      // Load summary from localStorage
      const saved = localStorage.getItem("ats_resume_summary");
      if (saved) setForm(prev => ({ ...prev, summary: saved }));
    } catch {
      flash("Failed to load resume data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  function flash(msg: string, type: "success" | "error" = "success") {
    setMessage(msg);
    setMsgType(type);
    setTimeout(() => setMessage(""), 4000);
  }

  /* ── Save profile ─────────────────────────────────── */
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("/student/resume/profile", "PUT", {
        linkedinUrl: form.linkedinUrl || undefined,
        githubUrl: form.githubUrl || undefined,
        portfolioUrl: form.portfolioUrl || undefined,
        preferredRole: form.preferredRole || undefined,
        workAuthorization: form.workAuthorization || undefined,
      });
      localStorage.setItem("ats_resume_summary", form.summary);
      flash("Profile saved!");
      await loadAll();
    } catch { flash("Save failed", "error"); }
  }

  /* ── Add handlers ─────────────────────────────────── */
  async function addEducation(e: FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("/student/resume/education", "POST", {
        institution: eduForm.institution,
        degree: eduForm.degree || undefined,
        fieldOfStudy: eduForm.fieldOfStudy || undefined,
        startYear: eduForm.startYear ? Number(eduForm.startYear) : undefined,
        endYear: eduForm.endYear ? Number(eduForm.endYear) : undefined,
        grade: eduForm.grade || undefined,
      });
      setEduForm({ institution: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "", grade: "" });
      setShowAddEdu(false);
      flash("Education added!");
      await loadAll();
    } catch { flash("Failed to add education", "error"); }
  }

  async function addExperience(e: FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("/student/resume/experience", "POST", {
        company: expForm.company,
        title: expForm.title || undefined,
        startDate: expForm.startDate || undefined,
        endDate: expForm.endDate || undefined,
        description: expForm.description || undefined,
      });
      setExpForm({ company: "", title: "", startDate: "", endDate: "", description: "" });
      setShowAddExp(false);
      flash("Experience added!");
      await loadAll();
    } catch { flash("Failed to add experience", "error"); }
  }

  async function addSkill(e: FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("/student/resume/skills", "POST", {
        skillName: skillForm.skillName,
        proficiency: skillForm.proficiency || undefined,
      });
      setSkillForm({ skillName: "", proficiency: "intermediate" });
      setShowAddSkill(false);
      flash("Skill added!");
      await loadAll();
    } catch { flash("Failed to add skill", "error"); }
  }

  async function addProject(e: FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("/student/resume/projects", "POST", {
        title: projForm.title,
        description: projForm.description || undefined,
        techStack: projForm.techStack || undefined,
        url: projForm.url || undefined,
      });
      setProjForm({ title: "", description: "", techStack: "", url: "" });
      setShowAddProj(false);
      flash("Project added!");
      await loadAll();
    } catch { flash("Failed to add project", "error"); }
  }

  /* ── Delete handlers ──────────────────────────────── */
  async function deleteItem(section: string, id: string) {
    try {
      await apiRequest(`/student/resume/${section}/${id}`, "DELETE");
      flash("Deleted!");
      await loadAll();
    } catch { flash("Delete failed", "error"); }
  }

  /* ── Submit for review ────────────────────────────── */
  async function submitResume() {
    try {
      await apiRequest("/student/resume/submit", "POST");
      flash("Resume submitted for review!");
      await loadAll();
    } catch { flash("Submit failed", "error"); }
  }

  /* ── Print / PDF ──────────────────────────────────── */
  function printResume() {
    const el = previewRef.current;
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>${userInfo?.fullName ?? "Resume"} - ATS Resume</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5;padding:40px 48px;max-width:800px;margin:0 auto}
h1{font-size:22px;font-weight:700;margin-bottom:2px}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #333;padding-bottom:3px;margin:16px 0 8px;color:#333}
h3{font-size:14px;font-weight:600;margin-bottom:1px}
p,li,span{font-size:12.5px}
.contact{font-size:12px;color:#555;margin-bottom:4px}
.contact a{color:#555;text-decoration:none}
.summary{margin:8px 0 0;font-size:12.5px;color:#333}
.entry{margin-bottom:10px}
.entry-header{display:flex;justify-content:space-between;align-items:baseline}
.entry-header .right{font-size:11.5px;color:#666;white-space:nowrap}
.desc{font-size:12px;color:#444;margin-top:2px}
.skills-list{display:flex;flex-wrap:wrap;gap:6px 16px}
.skill-item{font-size:12.5px}
.prof{font-size:11px;color:#777}
.projects .tech{font-size:11px;color:#666;margin-top:1px}
@media print{body{padding:24px 32px}@page{margin:0.5in}}
</style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  }

  /* ── Score Color ──────────────────────────────────── */
  const scoreColor = useMemo(() => {
    if (!score) return "var(--muted)";
    if (score.score >= 80) return "var(--success)";
    if (score.score >= 50) return "var(--accent-2)";
    return "var(--danger)";
  }, [score]);

  /* ── Location string ──────────────────────────────── */
  const location = useMemo(() => {
    if (!userInfo) return "";
    return [userInfo.city, userInfo.state, userInfo.country].filter(Boolean).join(", ");
  }, [userInfo]);

  /* ══════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════ */

  if (loading) return <p className="muted">Loading ATS Resume Builder…</p>;

  return (
    <div className="ats-builder">
      {/* ── Header ────────────────────────────────── */}
      <div className="ats-header">
        <div>
          <h2 style={{ margin: 0 }}>ATS Resume Builder</h2>
          <p className="muted" style={{ fontSize: "0.82rem" }}>Build an ATS-optimized, professional resume</p>
        </div>
        <div className="ats-header-actions">
          {profile && (profile.status === "in_progress" || profile.status === "changes_requested") && (
            <button className="button" onClick={submitResume}>Submit for Review</button>
          )}
          <button className="button secondary" onClick={printResume}>📄 Export PDF</button>
          <button className="button" onClick={() => setTab("download")} style={{ background: "#27ae60" }}>📥 Download DOCX</button>
        </div>
      </div>

      {message && <p className={`message ${msgType}`}>{message}</p>}

      {profile?.admin_notes && (
        <div className="message warning" style={{ marginBottom: 12 }}>
          <strong>Admin Feedback:</strong> {profile.admin_notes}
        </div>
      )}

      {/* ── Profile Score Card ────────────────────── */}
      {score && (
        <div className="ats-score-card">
          <div className="ats-score-ring">
            <svg viewBox="0 0 100 100" width="90" height="90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="8"
                strokeDasharray={`${score.score * 2.64} 264`} strokeLinecap="round"
                transform="rotate(-90 50 50)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
              <text x="50" y="54" textAnchor="middle" fill={scoreColor} fontSize="20" fontWeight="700">{score.score}%</text>
            </svg>
          </div>
          <div className="ats-score-details">
            <h4 style={{ margin: "0 0 6px" }}>Profile Completion</h4>
            <div className="ats-checklist">
              {score.checks.map(c => (
                <div key={c.key} className={`ats-check-item ${c.done ? "done" : ""}`}>
                  <span className="ats-check-icon">{c.done ? "✅" : "⬜"}</span>
                  <span>{c.label}</span>
                  <span className="ats-check-weight">{c.weight}pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────── */}
      <div className="ats-tabs">
        <button className={`ats-tab ${tab === "editor" ? "active" : ""}`} onClick={() => setTab("editor")}>✏️ Editor</button>
        <button className={`ats-tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>👁 Preview</button>
        <button className={`ats-tab ${tab === "download" ? "active" : ""}`} onClick={() => setTab("download")}>📥 DOCX</button>
        {profile && (
          <span className={`badge badge-${profile.status === "approved" ? "approved" : profile.status === "changes_requested" ? "rejected" : "pending"}`} style={{ marginLeft: "auto" }}>
            {profile.status.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* ══════════════════════════════════════════════
         EDITOR TAB
         ═════════════════════════════════════════════ */}
      {tab === "editor" && (
        <div className="ats-editor">
          {/* ── Profile & Summary ──────────────────── */}
          <form className="card ats-section" onSubmit={saveProfile}>
            <div className="ats-section-head">
              <h3>👤 Profile & Summary</h3>
            </div>
            <div className="form-grid-2">
              <label>Preferred Role / Title<input value={form.preferredRole} onChange={e => setForm({...form, preferredRole: e.target.value})} placeholder="e.g. Full Stack Developer" /></label>
              <label>Work Authorization<input value={form.workAuthorization} onChange={e => setForm({...form, workAuthorization: e.target.value})} placeholder="e.g. H-1B, Citizen, etc." /></label>
              <label>LinkedIn URL<input value={form.linkedinUrl} onChange={e => setForm({...form, linkedinUrl: e.target.value})} placeholder="https://linkedin.com/in/..." /></label>
              <label>GitHub URL<input value={form.githubUrl} onChange={e => setForm({...form, githubUrl: e.target.value})} placeholder="https://github.com/..." /></label>
              <label>Portfolio URL<input value={form.portfolioUrl} onChange={e => setForm({...form, portfolioUrl: e.target.value})} placeholder="https://yoursite.com" /></label>
            </div>
            <label style={{ marginTop: 12 }}>
              Professional Summary
              <textarea value={form.summary} onChange={e => { setForm({...form, summary: e.target.value}); localStorage.setItem("ats_resume_summary", e.target.value); }}
                rows={4} placeholder="Write a 2-3 sentence professional summary highlighting your key skills and career objectives…" style={{ width: "100%", resize: "vertical" }} />
            </label>
            <button className="button" type="submit" style={{ marginTop: 10 }}>💾 Save Profile</button>
          </form>

          {/* ── Education ──────────────────────────── */}
          <div className="card ats-section">
            <div className="ats-section-head">
              <h3>🎓 Education ({education.length})</h3>
              <button className="button small" type="button" onClick={() => setShowAddEdu(!showAddEdu)}>
                {showAddEdu ? "Cancel" : "+ Add"}
              </button>
            </div>
            {showAddEdu && (
              <form className="ats-add-form" onSubmit={addEducation}>
                <div className="form-grid-2">
                  <label>Institution *<input required value={eduForm.institution} onChange={e => setEduForm({...eduForm, institution: e.target.value})} /></label>
                  <label>Degree<input value={eduForm.degree} onChange={e => setEduForm({...eduForm, degree: e.target.value})} placeholder="e.g. B.Tech, M.S." /></label>
                  <label>Field of Study<input value={eduForm.fieldOfStudy} onChange={e => setEduForm({...eduForm, fieldOfStudy: e.target.value})} placeholder="e.g. Computer Science" /></label>
                  <label>Grade / GPA<input value={eduForm.grade} onChange={e => setEduForm({...eduForm, grade: e.target.value})} placeholder="e.g. 3.8/4.0" /></label>
                  <label>Start Year<input type="number" value={eduForm.startYear} onChange={e => setEduForm({...eduForm, startYear: e.target.value})} min="1980" max="2030" /></label>
                  <label>End Year<input type="number" value={eduForm.endYear} onChange={e => setEduForm({...eduForm, endYear: e.target.value})} min="1980" max="2035" /></label>
                </div>
                <button className="button" type="submit" style={{ marginTop: 8 }}>Add Education</button>
              </form>
            )}
            {education.length === 0 && !showAddEdu && <p className="muted" style={{ fontSize: "0.82rem" }}>No education entries yet. Add at least one.</p>}
            {education.map(e => (
              <div key={e.id} className="ats-entry">
                <div className="ats-entry-main">
                  <div>
                    <strong>{e.institution}</strong>
                    {e.degree || e.field_of_study ? <span className="muted"> — {[e.degree, e.field_of_study].filter(Boolean).join(", ")}</span> : null}
                  </div>
                  <span className="muted">{e.start_year ?? "?"} – {e.end_year ?? "Present"}{e.grade ? ` · GPA: ${e.grade}` : ""}</span>
                </div>
                <button className="ats-del-btn" type="button" onClick={() => deleteItem("education", e.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>

          {/* ── Experience ─────────────────────────── */}
          <div className="card ats-section">
            <div className="ats-section-head">
              <h3>💼 Experience ({experience.length})</h3>
              <button className="button small" type="button" onClick={() => setShowAddExp(!showAddExp)}>
                {showAddExp ? "Cancel" : "+ Add"}
              </button>
            </div>
            {showAddExp && (
              <form className="ats-add-form" onSubmit={addExperience}>
                <div className="form-grid-2">
                  <label>Company *<input required value={expForm.company} onChange={e => setExpForm({...expForm, company: e.target.value})} /></label>
                  <label>Title / Role<input value={expForm.title} onChange={e => setExpForm({...expForm, title: e.target.value})} placeholder="e.g. Software Engineer" /></label>
                  <label>Start Date<input type="date" value={expForm.startDate} onChange={e => setExpForm({...expForm, startDate: e.target.value})} /></label>
                  <label>End Date<input type="date" value={expForm.endDate} onChange={e => setExpForm({...expForm, endDate: e.target.value})} /></label>
                </div>
                <label style={{ marginTop: 6 }}>
                  Description
                  <textarea value={expForm.description} onChange={e => setExpForm({...expForm, description: e.target.value})} rows={3} placeholder="Key responsibilities and achievements…" style={{ width: "100%", resize: "vertical" }} />
                </label>
                <button className="button" type="submit" style={{ marginTop: 8 }}>Add Experience</button>
              </form>
            )}
            {experience.length === 0 && !showAddExp && <p className="muted" style={{ fontSize: "0.82rem" }}>No experience entries yet. Add your work history.</p>}
            {experience.map(e => (
              <div key={e.id} className="ats-entry">
                <div className="ats-entry-main">
                  <div>
                    <strong>{e.title ?? e.company}</strong>
                    {e.title ? <span className="muted"> at {e.company}</span> : null}
                  </div>
                  <span className="muted">
                    {e.start_date ? new Date(e.start_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "?"}
                    {" – "}
                    {e.end_date ? new Date(e.end_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Present"}
                  </span>
                  {e.description && <p className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>{e.description}</p>}
                </div>
                <button className="ats-del-btn" type="button" onClick={() => deleteItem("experience", e.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>

          {/* ── Skills ─────────────────────────────── */}
          <div className="card ats-section">
            <div className="ats-section-head">
              <h3>🛠 Skills ({skills.length})</h3>
              <button className="button small" type="button" onClick={() => setShowAddSkill(!showAddSkill)}>
                {showAddSkill ? "Cancel" : "+ Add"}
              </button>
            </div>
            {showAddSkill && (
              <form className="ats-add-form" onSubmit={addSkill} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 180px" }}>Skill Name *<input required value={skillForm.skillName} onChange={e => setSkillForm({...skillForm, skillName: e.target.value})} placeholder="e.g. React, Python, AWS" /></label>
                <label style={{ flex: "0 0 160px" }}>Proficiency
                  <select value={skillForm.proficiency} onChange={e => setSkillForm({...skillForm, proficiency: e.target.value})}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                  </select>
                </label>
                <button className="button" type="submit">Add</button>
              </form>
            )}
            {skills.length === 0 && !showAddSkill && <p className="muted" style={{ fontSize: "0.82rem" }}>Add at least 3 skills for a strong resume.</p>}
            <div className="ats-skill-tags">
              {skills.map(s => (
                <span key={s.id} className="ats-skill-tag">
                  {s.skill_name}
                  {s.proficiency && <span className="ats-prof-badge">{s.proficiency}</span>}
                  <button type="button" className="ats-tag-del" onClick={() => deleteItem("skills", s.id)}>✕</button>
                </span>
              ))}
            </div>
          </div>

          {/* ── Projects ───────────────────────────── */}
          <div className="card ats-section">
            <div className="ats-section-head">
              <h3>🚀 Projects ({projects.length})</h3>
              <button className="button small" type="button" onClick={() => setShowAddProj(!showAddProj)}>
                {showAddProj ? "Cancel" : "+ Add"}
              </button>
            </div>
            {showAddProj && (
              <form className="ats-add-form" onSubmit={addProject}>
                <div className="form-grid-2">
                  <label>Project Title *<input required value={projForm.title} onChange={e => setProjForm({...projForm, title: e.target.value})} /></label>
                  <label>URL<input value={projForm.url} onChange={e => setProjForm({...projForm, url: e.target.value})} placeholder="https://..." /></label>
                </div>
                <label style={{ marginTop: 6 }}>Tech Stack<input value={projForm.techStack} onChange={e => setProjForm({...projForm, techStack: e.target.value})} placeholder="e.g. React, Node.js, PostgreSQL" /></label>
                <label style={{ marginTop: 6 }}>Description
                  <textarea value={projForm.description} onChange={e => setProjForm({...projForm, description: e.target.value})} rows={3} placeholder="What the project does and your role…" style={{ width: "100%", resize: "vertical" }} />
                </label>
                <button className="button" type="submit" style={{ marginTop: 8 }}>Add Project</button>
              </form>
            )}
            {projects.length === 0 && !showAddProj && <p className="muted" style={{ fontSize: "0.82rem" }}>Showcase your best projects.</p>}
            {projects.map(p => (
              <div key={p.id} className="ats-entry">
                <div className="ats-entry-main">
                  <div>
                    <strong>{p.title}</strong>
                    {p.tech_stack && <span className="ats-tech-badge">{p.tech_stack}</span>}
                  </div>
                  {p.description && <p className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>{p.description}</p>}
                  {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: "0.75rem" }}>{p.url}</a>}
                </div>
                <button className="ats-del-btn" type="button" onClick={() => deleteItem("projects", p.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>

          {/* ── Assigned Projects (from Business Context) ─ */}
          {assignedProjects.length > 0 && (
            <div className="card ats-section">
              <div className="ats-section-head">
                <h3>🏢 Assigned Projects ({assignedProjects.length})</h3>
                <span className="tbm-badge">Auto-included in resume</span>
              </div>
              <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.5rem" }}>These projects were assigned to you and will be automatically included in your generated resume.</p>
              {assignedProjects.map(ap => (
                <div key={ap.id} className="ats-entry" style={{ borderLeft: "3px solid var(--accent)" }}>
                  <div className="ats-entry-main">
                    <div>
                      <strong>{ap.title}</strong>
                      {ap.client_name ? <span className="tbm-badge" style={{ marginLeft: "0.5rem" }}>{ap.client_name}</span> : null}
                      {ap.role ? <span className="muted" style={{ marginLeft: "0.5rem" }}>· {ap.role}</span> : null}
                    </div>
                    <span className="muted">
                      {ap.start_date ? new Date(ap.start_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""}
                      {ap.start_date ? " – " : ""}
                      {ap.end_date ? new Date(ap.end_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ap.start_date ? "Present" : ""}
                    </span>
                    {ap.technologies ? <p style={{ fontSize: "0.78rem", color: "#555", marginTop: 2 }}>🛠 {ap.technologies}</p> : null}
                    {(ap.assignment_desc || ap.description) && <p className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>{ap.assignment_desc || ap.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
         PREVIEW TAB — ATS-friendly clean resume layout
         ═════════════════════════════════════════════ */}
      {tab === "preview" && (
        <div className="ats-preview-wrapper">
          <div className="ats-preview" ref={previewRef}>
            {/* Name & Contact */}
            <h1>{userInfo?.fullName || "Your Name"}</h1>
            {form.preferredRole && <p style={{ fontSize: "14px", fontWeight: 500, color: "#444", marginTop: 2 }}>{form.preferredRole}</p>}
            <p className="contact">
              {[userInfo?.email, userInfo?.phone, location].filter(Boolean).join(" | ")}
            </p>
            <p className="contact">
              {[
                form.linkedinUrl && <a key="li" href={form.linkedinUrl}>LinkedIn</a>,
                form.githubUrl && <a key="gh" href={form.githubUrl}>GitHub</a>,
                form.portfolioUrl && <a key="pf" href={form.portfolioUrl}>Portfolio</a>,
              ].filter(Boolean).reduce<React.ReactNode[]>((acc, el, i) => {
                if (i > 0) acc.push(" | ");
                acc.push(el);
                return acc;
              }, [])}
            </p>

            {/* Summary */}
            {form.summary && (
              <>
                <h2>PROFESSIONAL SUMMARY</h2>
                <p className="summary">{form.summary}</p>
              </>
            )}

            {/* Experience */}
            {experience.length > 0 && (
              <>
                <h2>EXPERIENCE</h2>
                {experience.map(e => (
                  <div key={e.id} className="entry">
                    <div className="entry-header">
                      <h3>{e.title ?? "Role"} — {e.company}</h3>
                      <span className="right">
                        {e.start_date ? new Date(e.start_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""}
                        {e.start_date && " – "}
                        {e.end_date ? new Date(e.end_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : e.start_date ? "Present" : ""}
                      </span>
                    </div>
                    {e.description && <p className="desc">{e.description}</p>}
                  </div>
                ))}
              </>
            )}

            {/* Education */}
            {education.length > 0 && (
              <>
                <h2>EDUCATION</h2>
                {education.map(e => (
                  <div key={e.id} className="entry">
                    <div className="entry-header">
                      <h3>{e.institution}</h3>
                      <span className="right">{e.start_year ?? ""}{e.start_year ? " – " : ""}{e.end_year ?? (e.start_year ? "Present" : "")}</span>
                    </div>
                    <p className="desc">{[e.degree, e.field_of_study].filter(Boolean).join(", ")}{e.grade ? ` — GPA: ${e.grade}` : ""}</p>
                  </div>
                ))}
              </>
            )}

            {/* Skills */}
            {skills.length > 0 && (
              <>
                <h2>SKILLS</h2>
                <div className="skills-list">
                  {skills.map(s => (
                    <span key={s.id} className="skill-item">
                      {s.skill_name}{s.proficiency ? <span className="prof"> ({s.proficiency})</span> : ""}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Projects */}
            {(projects.length > 0 || assignedProjects.length > 0) && (
              <>
                <h2>PROJECTS</h2>
                <div className="projects">
                  {assignedProjects.map(ap => (
                    <div key={ap.id} className="entry">
                      <div className="entry-header">
                        <h3>{ap.title}{ap.client_name ? ` (${ap.client_name})` : ""}{ap.role ? ` — ${ap.role}` : ""}</h3>
                        {ap.start_date && (
                          <span className="right">
                            {new Date(ap.start_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                            {" – "}
                            {ap.end_date ? new Date(ap.end_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Present"}
                          </span>
                        )}
                      </div>
                      {(ap.assignment_desc || ap.description) && <p className="desc">{ap.assignment_desc || ap.description}</p>}
                      {ap.technologies && <p className="tech">Tech: {ap.technologies}</p>}
                    </div>
                  ))}
                  {projects.map(p => (
                    <div key={p.id} className="entry">
                      <h3>{p.title}{p.url ? <> — <a href={p.url} style={{ fontWeight: 400, fontSize: "12px" }}>{p.url}</a></> : ""}</h3>
                      {p.description && <p className="desc">{p.description}</p>}
                      {p.tech_stack && <p className="tech">Tech: {p.tech_stack}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
         DOWNLOAD TAB — DOCX Templates
         ═════════════════════════════════════════════ */}
      {tab === "download" && (
        <div className="ats-download-section">
          <h3 style={{ marginBottom: "1rem" }}>Choose a Resume Template</h3>
          <p className="muted" style={{ marginBottom: "1rem" }}>Select one of 5 professionally designed templates and download your ATS-friendly resume as a DOCX file.</p>

          <div className="ats-template-grid">
            {(Object.entries(TEMPLATE_INFO) as [DocxTemplate, { label: string; desc: string }][]).map(([key, info]) => (
              <div
                key={key}
                className={`ats-template-card ${docxTemplate === key ? "selected" : ""}`}
                onClick={() => setDocxTemplate(key)}
              >
                <div className="ats-template-icon">{key === "classic" ? "📜" : key === "modern" ? "🔷" : key === "minimal" ? "◻️" : key === "executive" ? "🏛" : "🎨"}</div>
                <h4>{info.label}</h4>
                <p className="muted">{info.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <strong>Summary (included in DOCX):</strong>
            </label>
            <textarea
              value={form.summary}
              onChange={(e) => { setForm({ ...form, summary: e.target.value }); localStorage.setItem("ats_resume_summary", e.target.value); }}
              rows={3}
              placeholder="Professional summary for your generated resume…"
              style={{ width: "100%", resize: "vertical", padding: "0.5rem", border: "1px solid var(--card-border)", borderRadius: "0.5rem" }}
            />
          </div>

          <div className="ats-download-info" style={{ marginTop: "1rem" }}>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Your DOCX will include: profile info, summary, experience ({experience.length}), education ({education.length}),
              skills ({skills.length}), projects ({projects.length + assignedProjects.length} — including {assignedProjects.length} assigned)
            </p>
          </div>

          <button
            className="button"
            style={{ marginTop: "1rem", padding: "0.75rem 2rem", fontSize: "1rem", background: "#27ae60" }}
            disabled={generating}
            onClick={async () => {
              setGenerating(true);
              try {
                const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"}/student/resume/generate-docx`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
                  },
                  body: JSON.stringify({ template: docxTemplate, summary: form.summary }),
                });
                if (!resp.ok) throw new Error("Failed to generate");
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `resume_${docxTemplate}.docx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                flash("Resume downloaded!");
              } catch { flash("Download failed", "error"); }
              finally { setGenerating(false); }
            }}
          >
            {generating ? "Generating…" : `📥 Download ${TEMPLATE_INFO[docxTemplate].label} DOCX`}
          </button>
        </div>
      )}
    </div>
  );
}
