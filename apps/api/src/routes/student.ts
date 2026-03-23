import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { requireAuth, requireRole } from "../middleware/auth";
import { createAuditLog } from "../services/audit";
import { pool } from "../db/client";
import { uploadBufferToS3 } from "../services/s3";
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

export const studentRouter = Router();

studentRouter.use(requireAuth, requireRole(["student"]));

studentRouter.get("/videos", async (req, res) => {
  const result = await pool.query(
    `
    SELECT v.id, v.title, v.description, v.s3_key, v.created_at, b.name AS batch_name
    FROM videos v
    INNER JOIN batches b ON b.id = v.batch_id
    INNER JOIN batch_students bs ON bs.batch_id = b.id
    WHERE bs.student_id = $1
    ORDER BY v.created_at DESC
    `,
    [req.user!.id]
  );

  res.json({ videos: result.rows });
});

studentRouter.get("/assignments", async (req, res) => {
  const result = await pool.query(
    `
    SELECT a.id, a.title, a.instructions, a.due_at, a.created_at, b.name AS batch_name
    FROM assignments a
    INNER JOIN batches b ON b.id = a.batch_id
    INNER JOIN batch_students bs ON bs.batch_id = b.id
    WHERE bs.student_id = $1
    ORDER BY a.created_at DESC
    `,
    [req.user!.id]
  );

  res.json({ assignments: result.rows });
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
  // Return courses assigned to the student's batch(es)
  const courses = await pool.query(
    `SELECT DISTINCT c.id, c.title, c.description, c.created_at, bc.sort_order
     FROM courses c
     INNER JOIN batch_courses bc ON bc.course_id = c.id
     INNER JOIN batch_students bs ON bs.batch_id = bc.batch_id
     WHERE bs.student_id = $1 AND c.is_active = TRUE
     ORDER BY bc.sort_order, c.created_at DESC`,
    [req.user!.id]
  );
  res.json({ courses: courses.rows });
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
  const result = await pool.query(
    `SELECT n.id, n.from_user_id, n.subject, n.message, n.is_read, n.created_at,
            u.email AS from_email, u.full_name AS from_name
     FROM notifications n
     LEFT JOIN users u ON u.id = n.from_user_id
     WHERE n.to_user_id = $1 OR n.to_role = 'student'
     ORDER BY n.created_at DESC
     LIMIT 100`,
    [req.user!.id]
  );
  res.json({ notifications: result.rows });
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
