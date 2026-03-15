import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { requireAuth, requireRole } from "../middleware/auth";
import { createAuditLog } from "../services/audit";
import { pool } from "../db/client";
import { uploadBufferToS3 } from "../services/s3";

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

studentRouter.get("/courses", async (_req, res) => {
  const courses = await pool.query(
    `SELECT id, title, description, created_at FROM courses ORDER BY created_at DESC`
  );
  res.json({ courses: courses.rows });
});

studentRouter.get("/courses/:courseId/topics", async (req, res) => {
  const { courseId } = req.params;
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
