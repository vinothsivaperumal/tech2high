import { Router } from "express";
import * as eventService from "../services/event";
export const studentRouter = Router();
studentRouter.use(requireAuth, requireRole(["student"]));
// Calendar: List events assigned to the student
studentRouter.get("/events", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const events = await eventService.listUserEvents(req.user.id);
  res.json({ events });
});
import multer from "multer";
import { z } from "zod";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TabStopType, TabStopPosition,
} from "docx";


import { requireAuth, requireRole } from "../middleware/auth";
import { createAuditLog } from "../services/audit";
import { pool } from "../db/client";
import { uploadBufferToS3, getPresignedUrl } from "../services/s3";
import { sendNotificationEmail } from "../services/email";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ipRequestSchema = z.object({
  requestedIp: z.string().regex(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/),
  protocol: z.string().default("tcp"),
  port: z.number().int().min(1).max(65535),
  reason: z.string().max(300).optional()
});

const allowedAssignmentExtensions = ["sql", "py", "txt", "xls", "xlsx"];

function hasAllowedExtension(fileName: string): boolean {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? allowedAssignmentExtensions.includes(extension) : false;
}

studentRouter.get("/batches", async (req, res) => {
  let page = parseInt(req.query.page as string) || 1;
  let limit = parseInt(req.query.limit as string) || 20;
  if (page < 1) page = 1;
  if (limit < 1 || limit > 100) limit = 20;
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `SELECT b.id, b.name, b.zoom_link, b.created_at,
            u.full_name AS trainer_name, u.email AS trainer_email
     FROM batches b
     INNER JOIN batch_students bs ON bs.batch_id = b.id
     LEFT JOIN users u ON u.id = b.trainer_id
     WHERE bs.student_id = $1 AND b.is_active = TRUE
     ORDER BY b.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user!.id, limit, offset]
  );
  res.json({ batches: result.rows, page, limit });
});

studentRouter.get("/videos", async (req, res) => {
  let page = parseInt(req.query.page as string) || 1;
  let limit = parseInt(req.query.limit as string) || 20;
  if (page < 1) page = 1;
  if (limit < 1 || limit > 100) limit = 20;
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `
    SELECT v.id, v.title, v.description, v.s3_key, v.created_at, b.name AS batch_name
    FROM videos v
    INNER JOIN batches b ON b.id = v.batch_id
    INNER JOIN batch_students bs ON bs.batch_id = b.id
    WHERE bs.student_id = $1
    ORDER BY v.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [req.user!.id, limit, offset]
  );
  res.json({ videos: result.rows, page, limit });
});

studentRouter.get("/assignments", async (req, res) => {
  let page = parseInt(req.query.page as string) || 1;
  let limit = parseInt(req.query.limit as string) || 20;
  if (page < 1) page = 1;
  if (limit < 1 || limit > 100) limit = 20;
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `
    SELECT a.id, a.title, a.instructions, a.due_at, a.created_at, b.name AS batch_name
    FROM assignments a
    INNER JOIN batches b ON b.id = a.batch_id
    INNER JOIN batch_students bs ON bs.batch_id = b.id
    WHERE bs.student_id = $1
    ORDER BY a.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [req.user!.id, limit, offset]
  );
  res.json({ assignments: result.rows, page, limit });
});

studentRouter.post("/assignments/:assignmentId/submissions", upload.single("file"), async (req, res) => {
  const assignmentId = req.params.assignmentId;

  if (!req.file) {
    res.status(400).json({ message: "Submission file is required." });
    return;
  }

  if (!hasAllowedExtension(req.file.originalname)) {
    res.status(400).json({ message: "Unsupported file type. Allowed: SQL, Python, TXT, XLS, XLSX." });
    return;
  }

  const assignmentCheck = await pool.query("SELECT id FROM assignments WHERE id = $1", [assignmentId]);
  if (!assignmentCheck.rowCount) {
    res.status(404).json({ message: "Assignment not found." });
    return;
  }

  const uploaded = await uploadBufferToS3({
    folder: `submissions/${req.user!.id}`,
    fileName: req.file.originalname,
    contentType: req.file.mimetype || "application/octet-stream",
    data: req.file.buffer
  });

  const inserted = await pool.query(
    `
    INSERT INTO assignment_submissions (assignment_id, student_id, file_name, file_key, file_type)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, assignment_id, student_id, file_name, file_key, file_type, submitted_at
    `,
    [assignmentId, req.user!.id, req.file.originalname, uploaded.key, req.file.mimetype || "unknown"]
  );

  const submission = inserted.rows[0];

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "assignment.submission.create",
    entityType: "assignment_submission",
    entityId: submission.id,
    metadata: {
      assignmentId,
      s3Key: uploaded.key
    }
  });

  res.status(201).json({ submission });
});

studentRouter.post("/ip-requests", async (req, res) => {
  const parsed = ipRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    return;
  }

  const { requestedIp, protocol, port, reason } = parsed.data;

  const inserted = await pool.query(
    `
    INSERT INTO ip_update_requests (student_id, requested_ip, protocol, port, reason)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, student_id, requested_ip, protocol, port, reason, status, requested_at
    `,
    [req.user!.id, requestedIp, protocol, port, reason ?? null]
  );

  const request = inserted.rows[0];

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "ip_request.create",
    entityType: "ip_update_request",
    entityId: request.id,
    metadata: {
      ip: requestedIp,
      port,
      protocol
    }
  });

  res.status(201).json({ request });
});

studentRouter.get("/ip-requests", async (req, res) => {
  const result = await pool.query(
    `
    SELECT id, requested_ip, protocol, port, reason, status, requested_at, reviewed_at, review_note
    FROM ip_update_requests
    WHERE student_id = $1
    ORDER BY requested_at DESC
    `,
    [req.user!.id]
  );

  res.json({ requests: result.rows });
});

studentRouter.get("/courses", async (req, res) => {
  let page = parseInt(req.query.page as string) || 1;
  let limit = parseInt(req.query.limit as string) || 20;
  if (page < 1) page = 1;
  if (limit < 1 || limit > 100) limit = 20;
  const offset = (page - 1) * limit;
  const courses = await pool.query(
    `SELECT DISTINCT c.id, c.title, c.description, c.created_at, bc.sort_order
     FROM courses c
     INNER JOIN batch_courses bc ON bc.course_id = c.id
     INNER JOIN batch_students bs ON bs.batch_id = bc.batch_id
     WHERE bs.student_id = $1 AND c.is_active = TRUE
     ORDER BY bc.sort_order, c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user!.id, limit, offset]
  );
  res.json({ courses: courses.rows, page, limit });
});

studentRouter.get("/courses/:courseId/topics", async (req, res) => {
  const { courseId } = req.params;

  // Verify the student has access to this course through their batch
  const accessCheck = await pool.query(
    `SELECT 1 FROM batch_courses bc
     INNER JOIN batch_students bs ON bs.batch_id = bc.batch_id
     WHERE bc.course_id = $1 AND bs.student_id = $2
     LIMIT 1`,
    [courseId, req.user!.id]
  );
  if (!accessCheck.rowCount) {
    res.status(403).json({ message: "You do not have access to this course" });
    return;
  }

  const topicsResult = await pool.query(
    `SELECT id, title, sort_order FROM course_topics WHERE course_id = $1 ORDER BY sort_order, created_at`,
    [courseId]
  );
  const videosResult = await pool.query(
    `SELECT cv.id, cv.topic_id, cv.title, cv.youtube_url, cv.sort_order
     FROM course_videos cv
     INNER JOIN course_topics ct ON ct.id = cv.topic_id
     WHERE ct.course_id = $1 ORDER BY cv.sort_order, cv.created_at`,
    [courseId]
  );
  const byTopic: Record<string, typeof videosResult.rows> = {};
  for (const v of videosResult.rows) {
    if (!byTopic[v.topic_id]) byTopic[v.topic_id] = [];
    byTopic[v.topic_id].push(v);
  }
  const topics = topicsResult.rows.map((t) => ({ ...t, videos: byTopic[t.id] ?? [] }));
  res.json({ topics });
});

// ── Batch YouTube Videos ─────────────────────────────────────────────────────

studentRouter.get("/program", async (req, res) => {
  const result = await pool.query(
    `SELECT DISTINCT p.id, p.title, p.description
     FROM programs p
     INNER JOIN batches b ON b.program_id = p.id
     INNER JOIN batch_students bs ON bs.batch_id = b.id
     WHERE bs.student_id = $1`,
    [req.user!.id]
  );
  res.json({ programs: result.rows });
});

studentRouter.get("/batch-videos", async (req, res) => {
  const result = await pool.query(
    `SELECT v.id, v.title, v.description, v.youtube_url, v.created_at, b.name AS batch_name, b.id AS batch_id
     FROM videos v
     INNER JOIN batches b ON b.id = v.batch_id
     INNER JOIN batch_students bs ON bs.batch_id = b.id
     WHERE bs.student_id = $1 AND v.youtube_url IS NOT NULL AND v.youtube_url != ''
     ORDER BY b.name, v.created_at DESC`,
    [req.user!.id]
  );
  res.json({ videos: result.rows });
});

// ── Notifications ────────────────────────────────────────────────────────────

const studentNotifSchema = z.object({
  subject: z.string().min(1).max(300),
  message: z.string().min(1).max(5000)
});

studentRouter.get("/notifications", async (req, res) => {
  let page = parseInt(req.query.page as string) || 1;
  let limit = parseInt(req.query.limit as string) || 20;
  if (page < 1) page = 1;
  if (limit < 1 || limit > 100) limit = 20;
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `SELECT n.id, n.from_user_id, n.subject, n.message, n.is_read, n.created_at,
            u.email AS from_email, u.full_name AS from_name
     FROM notifications n
     LEFT JOIN users u ON u.id = n.from_user_id
     WHERE n.to_user_id = $1 OR n.to_role = 'student'
     ORDER BY n.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user!.id, limit, offset]
  );
  res.json({ notifications: result.rows, page, limit });
});

studentRouter.post("/notifications", async (req, res) => {
  const parsed = studentNotifSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const { subject, message } = parsed.data;

  // Students send notifications to admins
  const admins = await pool.query("SELECT id, email FROM users WHERE role = 'admin'");
  const senderResult = await pool.query("SELECT full_name, email FROM users WHERE id = $1", [req.user!.id]);
  const senderName = senderResult.rows[0]?.full_name || senderResult.rows[0]?.email || "Student";

  for (const admin of admins.rows) {
    await pool.query(
      `INSERT INTO notifications (from_user_id, to_user_id, to_role, subject, message) VALUES ($1, $2, 'admin', $3, $4)`,
      [req.user!.id, admin.id, subject, message]
    );
    void sendNotificationEmail({ to: admin.email, subject, message, fromName: senderName }).catch(() => {});
  }

  res.status(201).json({ message: "Notification sent to admin(s)" });
});

studentRouter.patch("/notifications/:notifId/read", async (req, res) => {
  const { notifId } = req.params;
  await pool.query("UPDATE notifications SET is_read = TRUE WHERE id = $1", [notifId]);
  res.json({ message: "Marked as read" });
});

// ── Student Payments ─────────────────────────────────────────────────────────

studentRouter.get("/payments", async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, b.name AS batch_name
     FROM student_payments p
     LEFT JOIN batches b ON b.id = p.batch_id
     WHERE p.student_id = $1
     ORDER BY p.created_at DESC`,
    [req.user!.id]
  );
  res.json({ payments: result.rows });
});

// ── Student Agreements ───────────────────────────────────────────────────────

studentRouter.get("/agreements", async (req, res) => {
  const result = await pool.query(
    `SELECT a.*, b.name AS batch_name
     FROM student_agreements a
     LEFT JOIN batches b ON b.id = a.batch_id
     WHERE a.student_id = $1
     ORDER BY a.created_at DESC`,
    [req.user!.id]
  );
  res.json({ agreements: result.rows });
});

studentRouter.patch("/agreements/:agreementId/sign", async (req, res) => {
  const { agreementId } = req.params;
  const result = await pool.query(
    `UPDATE student_agreements SET status = 'signed', signed_date = NOW(), updated_at = NOW()
     WHERE id = $1 AND student_id = $2 AND status = 'sent' RETURNING *`,
    [agreementId, req.user!.id]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Agreement not found or not signable" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "student.agreement.sign", entityType: "agreement", entityId: agreementId, metadata: {} });
  res.json({ agreement: result.rows[0] });
});

// ── Student Certifications ───────────────────────────────────────────────────

studentRouter.get("/certifications", async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, co.title AS course_title, pr.title AS program_title, b.name AS batch_name
     FROM student_certifications c
     LEFT JOIN courses co ON co.id = c.course_id
     LEFT JOIN programs pr ON pr.id = c.program_id
     LEFT JOIN batches b ON b.id = c.batch_id
     WHERE c.student_id = $1
     ORDER BY c.created_at DESC`,
    [req.user!.id]
  );
  res.json({ certifications: result.rows });
});

// ── Student Resume ───────────────────────────────────────────────────────────

studentRouter.get("/resume", async (req, res) => {
  const profile = await pool.query("SELECT * FROM student_resume_profiles WHERE student_id = $1", [req.user!.id]);
  const education = await pool.query("SELECT * FROM student_resume_education WHERE student_id = $1 ORDER BY end_year DESC NULLS FIRST", [req.user!.id]);
  const experience = await pool.query("SELECT * FROM student_resume_experience WHERE student_id = $1 ORDER BY end_date DESC NULLS FIRST", [req.user!.id]);
  const skills = await pool.query("SELECT * FROM student_resume_skills WHERE student_id = $1", [req.user!.id]);
  const projects = await pool.query("SELECT * FROM student_resume_projects WHERE student_id = $1", [req.user!.id]);
  res.json({ profile: profile.rows[0] ?? null, education: education.rows, experience: experience.rows, skills: skills.rows, projects: projects.rows });
});

studentRouter.put("/resume/profile", async (req, res) => {
  const schema = z.object({
    linkedinUrl: z.string().max(500).optional(),
    githubUrl: z.string().max(500).optional(),
    portfolioUrl: z.string().max(500).optional(),
    preferredRole: z.string().max(200).optional(),
    workAuthorization: z.string().max(200).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }

  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO student_resume_profiles (student_id, linkedin_url, github_url, portfolio_url, preferred_role, work_authorization, status)
     VALUES ($1,$2,$3,$4,$5,$6,'in_progress')
     ON CONFLICT (student_id) DO UPDATE SET
       linkedin_url = COALESCE($2, student_resume_profiles.linkedin_url),
       github_url = COALESCE($3, student_resume_profiles.github_url),
       portfolio_url = COALESCE($4, student_resume_profiles.portfolio_url),
       preferred_role = COALESCE($5, student_resume_profiles.preferred_role),
       work_authorization = COALESCE($6, student_resume_profiles.work_authorization),
       status = CASE WHEN student_resume_profiles.status = 'not_started' THEN 'in_progress' ELSE student_resume_profiles.status END,
       updated_at = NOW()
     RETURNING *`,
    [req.user!.id, d.linkedinUrl ?? null, d.githubUrl ?? null, d.portfolioUrl ?? null, d.preferredRole ?? null, d.workAuthorization ?? null]
  );
  res.json({ profile: result.rows[0] });
});

studentRouter.post("/resume/education", async (req, res) => {
  const schema = z.object({ institution: z.string().max(300), degree: z.string().max(200).optional(), fieldOfStudy: z.string().max(200).optional(), startYear: z.number().int().optional(), endYear: z.number().int().optional(), grade: z.string().max(50).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }
  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO student_resume_education (student_id, institution, degree, field_of_study, start_year, end_year, grade) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user!.id, d.institution, d.degree ?? null, d.fieldOfStudy ?? null, d.startYear ?? null, d.endYear ?? null, d.grade ?? null]
  );
  res.status(201).json({ education: result.rows[0] });
});

studentRouter.delete("/resume/education/:id", async (req, res) => {
  const removed = await pool.query("DELETE FROM student_resume_education WHERE id = $1 AND student_id = $2 RETURNING id", [req.params.id, req.user!.id]);
  if (!removed.rowCount) { res.status(404).json({ message: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

studentRouter.post("/resume/experience", async (req, res) => {
  const schema = z.object({ company: z.string().max(300), title: z.string().max(200).optional(), startDate: z.string().optional(), endDate: z.string().optional(), description: z.string().max(2000).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }
  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO student_resume_experience (student_id, company, title, start_date, end_date, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user!.id, d.company, d.title ?? null, d.startDate ?? null, d.endDate ?? null, d.description ?? null]
  );
  res.status(201).json({ experience: result.rows[0] });
});

studentRouter.delete("/resume/experience/:id", async (req, res) => {
  const removed = await pool.query("DELETE FROM student_resume_experience WHERE id = $1 AND student_id = $2 RETURNING id", [req.params.id, req.user!.id]);
  if (!removed.rowCount) { res.status(404).json({ message: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

studentRouter.post("/resume/skills", async (req, res) => {
  const schema = z.object({ skillName: z.string().max(200), proficiency: z.string().max(50).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }
  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO student_resume_skills (student_id, skill_name, proficiency) VALUES ($1,$2,$3) RETURNING *`,
    [req.user!.id, d.skillName, d.proficiency ?? null]
  );
  res.status(201).json({ skill: result.rows[0] });
});

studentRouter.delete("/resume/skills/:id", async (req, res) => {
  const removed = await pool.query("DELETE FROM student_resume_skills WHERE id = $1 AND student_id = $2 RETURNING id", [req.params.id, req.user!.id]);
  if (!removed.rowCount) { res.status(404).json({ message: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

studentRouter.post("/resume/projects", async (req, res) => {
  const schema = z.object({ title: z.string().max(300), description: z.string().max(2000).optional(), techStack: z.string().max(500).optional(), url: z.string().max(500).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }
  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO student_resume_projects (student_id, title, description, tech_stack, url) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user!.id, d.title, d.description ?? null, d.techStack ?? null, d.url ?? null]
  );
  res.status(201).json({ project: result.rows[0] });
});

studentRouter.delete("/resume/projects/:id", async (req, res) => {
  const removed = await pool.query("DELETE FROM student_resume_projects WHERE id = $1 AND student_id = $2 RETURNING id", [req.params.id, req.user!.id]);
  if (!removed.rowCount) { res.status(404).json({ message: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

studentRouter.post("/resume/submit", async (req, res) => {
  const result = await pool.query(
    `UPDATE student_resume_profiles SET status = 'submitted', updated_at = NOW() WHERE student_id = $1 AND status IN ('in_progress', 'changes_requested') RETURNING *`,
    [req.user!.id]
  );
  if (!result.rowCount) { res.status(400).json({ message: "No resume to submit or already submitted" }); return; }
  res.json({ profile: result.rows[0] });
});

// ── Profile Score ────────────────────────────────────────────────────────────

studentRouter.get("/profile-score", async (req, res) => {
  const uid = req.user!.id;

  const userRow = await pool.query(
    "SELECT full_name, phone, city, state, country, institute, experience_level FROM users WHERE id = $1",
    [uid]
  );
  const u = userRow.rows[0] ?? {};

  const profile = await pool.query("SELECT linkedin_url, github_url, portfolio_url, preferred_role, work_authorization FROM student_resume_profiles WHERE student_id = $1", [uid]);
  const p = profile.rows[0] ?? {};

  const eduCount = await pool.query("SELECT COUNT(*)::int AS c FROM student_resume_education WHERE student_id = $1", [uid]);
  const expCount = await pool.query("SELECT COUNT(*)::int AS c FROM student_resume_experience WHERE student_id = $1", [uid]);
  const skillCount = await pool.query("SELECT COUNT(*)::int AS c FROM student_resume_skills WHERE student_id = $1", [uid]);
  const projCount = await pool.query("SELECT COUNT(*)::int AS c FROM student_resume_projects WHERE student_id = $1", [uid]);

  // Scoring: 12 criteria, each worth points
  const checks = [
    { key: "fullName",        label: "Full Name",          done: !!u.full_name,          weight: 10 },
    { key: "phone",           label: "Phone Number",       done: !!u.phone,              weight: 5  },
    { key: "location",        label: "Location (City/State/Country)", done: !!(u.city || u.state || u.country), weight: 5 },
    { key: "institute",       label: "Institute",          done: !!u.institute,          weight: 5  },
    { key: "experienceLevel", label: "Experience Level",   done: !!u.experience_level,   weight: 5  },
    { key: "preferredRole",   label: "Preferred Role",     done: !!p.preferred_role,     weight: 10 },
    { key: "linkedin",        label: "LinkedIn URL",       done: !!p.linkedin_url,       weight: 5  },
    { key: "github",          label: "GitHub URL",         done: !!p.github_url,         weight: 5  },
    { key: "education",       label: "At least 1 Education", done: eduCount.rows[0].c > 0,  weight: 15 },
    { key: "experience",      label: "At least 1 Experience", done: expCount.rows[0].c > 0, weight: 15 },
    { key: "skills",          label: "At least 3 Skills",  done: skillCount.rows[0].c >= 3, weight: 10 },
    { key: "projects",        label: "At least 1 Project", done: projCount.rows[0].c > 0, weight: 10 },
  ];

  const earned = checks.reduce((s, c) => s + (c.done ? c.weight : 0), 0);
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const score = Math.round((earned / total) * 100);

  res.json({ score, checks, counts: { education: eduCount.rows[0].c, experience: expCount.rows[0].c, skills: skillCount.rows[0].c, projects: projCount.rows[0].c } });
});

// ── Student Credentials (view-only, filtered by batch assignment) ────────────

studentRouter.get("/credentials", async (req, res) => {
  // Get credentials assigned to the student's batches/courses
  const result = await pool.query(
    `SELECT DISTINCT c.id, c.name, c.credential_type, c.environment, c.host, c.port,
            c.database_name, c.username, c.access_url, c.region, c.notes, c.expiry_date,
            ca.batch_id, b.name AS batch_name, ca.course_id, co.title AS course_title
     FROM credentials c
     INNER JOIN credential_assignments ca ON ca.credential_id = c.id
     INNER JOIN batch_students bs ON bs.batch_id = ca.batch_id
     LEFT JOIN batches b ON b.id = ca.batch_id
     LEFT JOIN courses co ON co.id = ca.course_id
     WHERE bs.student_id = $1 AND c.is_active = TRUE AND c.allow_student_view = TRUE
     ORDER BY c.name`,
    [req.user!.id]
  );

  // Log access
  await pool.query(
    `INSERT INTO access_logs (user_id, resource_type, resource_id, action, ip_address) VALUES ($1, 'credential', NULL, 'list_view', $2)`,
    [req.user!.id, req.ip]
  );

  // Passwords are always masked for students
  const rows = result.rows.map((r: Record<string, unknown>) => ({ ...r, password: "••••••••" }));
  res.json({ credentials: rows });
});

studentRouter.post("/credentials/:id/reveal", async (req, res) => {
  const { id } = req.params;
  // Verify student has access to this credential
  const access = await pool.query(
    `SELECT c.password_encrypted FROM credentials c
     INNER JOIN credential_assignments ca ON ca.credential_id = c.id
     INNER JOIN batch_students bs ON bs.batch_id = ca.batch_id
     WHERE c.id = $1 AND bs.student_id = $2 AND c.is_active = TRUE AND c.allow_student_view = TRUE
     LIMIT 1`,
    [id, req.user!.id]
  );
  if (!access.rowCount) { res.status(403).json({ message: "Access denied" }); return; }

  // Log reveal
  await pool.query(
    `INSERT INTO access_logs (user_id, resource_type, resource_id, action, ip_address) VALUES ($1, 'credential', $2, 'reveal_password', $3)`,
    [req.user!.id, id, req.ip]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "student.credential.reveal_password", entityType: "credential", entityId: id, metadata: {} });

  res.json({ password: access.rows[0].password_encrypted });
});

// ── Student Course Materials (view-only) ────────────────────────────────────

studentRouter.get("/materials", async (req, res) => {
  const { courseId, batchId } = req.query;
  let query = `SELECT DISTINCT m.id, m.title, m.material_type, m.description, m.url, m.view_only,
                m.display_order, m.course_id, m.batch_id, m.topic_id, m.created_at,
                c.title AS course_title, ct.title AS topic_title, b.name AS batch_name
               FROM course_materials m
               INNER JOIN batch_students bs ON (bs.batch_id = m.batch_id OR m.batch_id IS NULL)
               LEFT JOIN courses c ON c.id = m.course_id
               LEFT JOIN course_topics ct ON ct.id = m.topic_id
               LEFT JOIN batches b ON b.id = m.batch_id
               WHERE bs.student_id = $1 AND m.is_active = TRUE`;
  const params: unknown[] = [req.user!.id];

  if (courseId && typeof courseId === "string") { params.push(courseId); query += ` AND m.course_id = $${params.length}`; }
  if (batchId && typeof batchId === "string") { params.push(batchId); query += ` AND m.batch_id = $${params.length}`; }

  query += ` ORDER BY m.display_order, m.created_at DESC`;
  const result = await pool.query(query, params);
  res.json({ materials: result.rows });
});

studentRouter.get("/materials/:id/view", async (req, res) => {
  const { id } = req.params;
  // Verify access
  const result = await pool.query(
    `SELECT m.s3_key, m.title, m.material_type, m.view_only FROM course_materials m
     INNER JOIN batch_students bs ON bs.batch_id = m.batch_id
     WHERE m.id = $1 AND bs.student_id = $2 AND m.is_active = TRUE
     LIMIT 1`,
    [id, req.user!.id]
  );
  if (!result.rowCount || !result.rows[0].s3_key) { res.status(404).json({ message: "Material not found" }); return; }

  const url = await getPresignedUrl(result.rows[0].s3_key, 3600);

  await pool.query(
    `INSERT INTO access_logs (user_id, resource_type, resource_id, action, ip_address) VALUES ($1, 'material', $2, 'view', $3)`,
    [req.user!.id, id, req.ip]
  );

  res.json({ url, title: result.rows[0].title, materialType: result.rows[0].material_type, viewOnly: result.rows[0].view_only });
});

// ── Assigned Projects ─────────────────────────────────────────────────────────

studentRouter.get("/assigned-projects", async (req, res) => {
  const result = await pool.query(
    `SELECT sp.id, sp.role, sp.start_date, sp.end_date, sp.description AS assignment_desc,
            p.id AS project_id, p.title, p.description, p.technologies, p.domain,
            c.name AS client_name, c.industry AS client_industry,
            b.name AS batch_name
     FROM student_projects sp
     INNER JOIN projects p ON p.id = sp.project_id AND p.is_active = TRUE
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN batches b ON b.id = sp.batch_id
     WHERE sp.student_id = $1
     ORDER BY sp.start_date DESC NULLS LAST`,
    [req.user!.id]
  );
  res.json({ projects: result.rows });
});

// ── DOCX Resume Generation ────────────────────────────────────────────────────

const resumeTemplateSchema = z.object({
  template: z.enum(["classic", "modern", "minimal", "executive", "creative"]).default("classic"),
  summary: z.string().max(2000).optional(),
});

studentRouter.post("/resume/generate-docx", async (req, res) => {
  const parsed = resumeTemplateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const studentId = req.user!.id;
  const template = parsed.data.template;
  const summary = parsed.data.summary ?? "";

  // Gather all resume data
  const [userR, profileR, eduR, expR, skillsR, projR, assignedR] = await Promise.all([
    pool.query("SELECT full_name, email, phone, city, state, country, institute FROM users WHERE id = $1", [studentId]),
    pool.query("SELECT linkedin_url, github_url, portfolio_url, preferred_role, work_authorization FROM student_resume_profiles WHERE student_id = $1", [studentId]),
    pool.query("SELECT institution, degree, field_of_study, start_year, end_year, grade FROM student_resume_education WHERE student_id = $1 ORDER BY end_year DESC NULLS FIRST", [studentId]),
    pool.query("SELECT company, title, start_date, end_date, description FROM student_resume_experience WHERE student_id = $1 ORDER BY start_date DESC NULLS FIRST", [studentId]),
    pool.query("SELECT skill_name, proficiency FROM student_resume_skills WHERE student_id = $1 ORDER BY skill_name", [studentId]),
    pool.query("SELECT title, description, tech_stack, url FROM student_resume_projects WHERE student_id = $1 ORDER BY created_at DESC", [studentId]),
    pool.query(
      `SELECT p.title, p.technologies, p.domain, c.name AS client_name, sp.role, sp.start_date, sp.end_date, sp.description
       FROM student_projects sp
       INNER JOIN projects p ON p.id = sp.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE sp.student_id = $1
       ORDER BY sp.start_date DESC NULLS LAST`,
      [studentId]
    ),
  ]);

  const user = userR.rows[0];
  if (!user) { res.status(404).json({ message: "User not found" }); return; }
  const prof = profileR.rows[0] ?? {};

  // Build DOCX based on template
  const doc = buildResumeDocument(template, {
    user, profile: prof, summary,
    education: eduR.rows,
    experience: expR.rows,
    skills: skillsR.rows,
    projects: projR.rows,
    assignedProjects: assignedR.rows,
  });

  const buffer = await Packer.toBuffer(doc);

  // Save to generated_resumes table
  const resumeData = {
    user, profile: prof, summary,
    educationCount: eduR.rowCount, experienceCount: expR.rowCount,
    skillCount: skillsR.rowCount, projectCount: projR.rowCount! + assignedR.rowCount!,
  };
  await pool.query(
    "INSERT INTO generated_resumes (student_id, template, resume_data) VALUES ($1, $2, $3)",
    [studentId, template, JSON.stringify(resumeData)]
  );

  await createAuditLog({ actorUserId: studentId, action: "resume.generate_docx", entityType: "resume", entityId: studentId, metadata: { template } });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${(user.full_name || "resume").replace(/[^a-zA-Z0-9]/g, "_")}_resume.docx"`);
  res.send(buffer);
});

/* ── DOCX Template Builders ─────────────────────────────────────────────────── */

interface ResumeData {
  user: { full_name: string; email: string; phone: string | null; city: string | null; state: string | null; country: string | null };
  profile: { linkedin_url?: string; github_url?: string; portfolio_url?: string; preferred_role?: string; work_authorization?: string };
  summary: string;
  education: { institution: string; degree: string | null; field_of_study: string | null; start_year: number | null; end_year: number | null; grade: string | null }[];
  experience: { company: string; title: string | null; start_date: string | null; end_date: string | null; description: string | null }[];
  skills: { skill_name: string; proficiency: string | null }[];
  projects: { title: string; description: string | null; tech_stack: string | null; url: string | null }[];
  assignedProjects: { title: string; technologies: string | null; domain: string | null; client_name: string | null; role: string | null; start_date: string | null; end_date: string | null; description: string | null }[];
}

function fmtDate(d: string | null): string {
  if (!d) return "Present";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function sectionHeader(text: string, template: string): Paragraph {
  const isMinimal = template === "minimal";
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
    border: isMinimal ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 1, color: template === "creative" ? "2980b9" : "333333" } },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: template === "executive" ? 26 : 24,
        font: template === "modern" || template === "creative" ? "Calibri" : "Times New Roman",
        color: template === "creative" ? "2980b9" : template === "modern" ? "1a5276" : "000000",
      }),
    ],
  });
}

function buildResumeDocument(template: string, data: ResumeData): Document {
  const font = template === "modern" || template === "creative" ? "Calibri" : template === "minimal" ? "Arial" : "Times New Roman";
  const nameSize = template === "executive" ? 36 : template === "creative" ? 34 : 32;
  const bodySize = template === "minimal" ? 21 : 22;

  const children: Paragraph[] = [];

  // Header: Name
  children.push(new Paragraph({
    alignment: template === "creative" ? AlignmentType.LEFT : AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [
      new TextRun({ text: data.user.full_name || "Name", bold: true, size: nameSize, font, color: template === "creative" ? "2980b9" : "000000" }),
    ],
  }));

  // Contact line
  const contactParts: string[] = [];
  if (data.user.email) contactParts.push(data.user.email);
  if (data.user.phone) contactParts.push(data.user.phone);
  const loc = [data.user.city, data.user.state, data.user.country].filter(Boolean).join(", ");
  if (loc) contactParts.push(loc);
  if (data.profile.linkedin_url) contactParts.push(data.profile.linkedin_url);
  if (data.profile.github_url) contactParts.push(data.profile.github_url);

  children.push(new Paragraph({
    alignment: template === "creative" ? AlignmentType.LEFT : AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: contactParts.join("  |  "), size: 18, font, color: "555555" })],
  }));

  // Preferred Role
  if (data.profile.preferred_role) {
    children.push(new Paragraph({
      alignment: template === "creative" ? AlignmentType.LEFT : AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: data.profile.preferred_role, bold: true, size: 24, font, color: template === "creative" ? "2980b9" : "333333" })],
    }));
  }

  // Summary
  if (data.summary) {
    children.push(sectionHeader("Professional Summary", template));
    children.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: data.summary, size: bodySize, font })],
    }));
  }

  // Experience
  if (data.experience.length) {
    children.push(sectionHeader("Professional Experience", template));
    for (const exp of data.experience) {
      children.push(new Paragraph({
        spacing: { before: 80 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          new TextRun({ text: exp.title || "Role", bold: true, size: bodySize, font }),
          new TextRun({ text: `  —  ${exp.company}`, size: bodySize, font }),
          new TextRun({ text: `\t${fmtDate(exp.start_date)} – ${fmtDate(exp.end_date)}`, size: 18, font, color: "888888" }),
        ],
      }));
      if (exp.description) {
        for (const line of exp.description.split("\n").filter(Boolean)) {
          children.push(new Paragraph({
            spacing: { before: 20 },
            bullet: { level: 0 },
            children: [new TextRun({ text: line.replace(/^[-•]\s*/, ""), size: bodySize, font })],
          }));
        }
      }
    }
  }

  // Assigned Projects (from business context)
  const allProjects = [
    ...data.assignedProjects.map((p) => ({
      title: p.title + (p.client_name ? ` (${p.client_name})` : ""),
      description: p.description,
      tech_stack: p.technologies,
      period: `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`,
      role: p.role,
    })),
    ...data.projects.map((p) => ({
      title: p.title,
      description: p.description,
      tech_stack: p.tech_stack,
      period: null as string | null,
      role: null as string | null,
    })),
  ];

  if (allProjects.length) {
    children.push(sectionHeader("Projects", template));
    for (const proj of allProjects) {
      const titleParts: TextRun[] = [
        new TextRun({ text: proj.title, bold: true, size: bodySize, font }),
      ];
      if (proj.role) titleParts.push(new TextRun({ text: `  |  ${proj.role}`, size: 18, font, italics: true, color: "666666" }));
      if (proj.period) titleParts.push(new TextRun({ text: `  |  ${proj.period}`, size: 18, font, color: "888888" }));

      children.push(new Paragraph({ spacing: { before: 80 }, children: titleParts }));

      if (proj.tech_stack) {
        children.push(new Paragraph({
          spacing: { before: 20 },
          children: [
            new TextRun({ text: "Technologies: ", bold: true, size: 18, font }),
            new TextRun({ text: proj.tech_stack, size: 18, font, color: "555555" }),
          ],
        }));
      }
      if (proj.description) {
        for (const line of proj.description.split("\n").filter(Boolean)) {
          children.push(new Paragraph({
            spacing: { before: 20 },
            bullet: { level: 0 },
            children: [new TextRun({ text: line.replace(/^[-•]\s*/, ""), size: bodySize, font })],
          }));
        }
      }
    }
  }

  // Education
  if (data.education.length) {
    children.push(sectionHeader("Education", template));
    for (const edu of data.education) {
      children.push(new Paragraph({
        spacing: { before: 80 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          new TextRun({ text: edu.institution, bold: true, size: bodySize, font }),
          new TextRun({ text: `\t${edu.start_year ?? ""} – ${edu.end_year ?? "Present"}`, size: 18, font, color: "888888" }),
        ],
      }));
      const details: string[] = [];
      if (edu.degree) details.push(edu.degree);
      if (edu.field_of_study) details.push(edu.field_of_study);
      if (edu.grade) details.push(`Grade: ${edu.grade}`);
      if (details.length) {
        children.push(new Paragraph({
          spacing: { before: 20 },
          children: [new TextRun({ text: details.join("  |  "), size: bodySize, font, color: "333333" })],
        }));
      }
    }
  }

  // Skills
  if (data.skills.length) {
    children.push(sectionHeader("Skills", template));
    const grouped = data.skills.reduce((acc, s) => {
      const key = s.proficiency || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(s.skill_name);
      return acc;
    }, {} as Record<string, string[]>);

    for (const [prof, names] of Object.entries(grouped)) {
      children.push(new Paragraph({
        spacing: { before: 40 },
        children: [
          new TextRun({ text: `${prof}: `, bold: true, size: bodySize, font }),
          new TextRun({ text: names.join(", "), size: bodySize, font }),
        ],
      }));
    }
  }

  return new Document({
    sections: [{ children }],
  });
}
