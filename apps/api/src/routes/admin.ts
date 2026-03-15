import { Router } from "express";
import { z } from "zod";

import { requireAuth, requireRole } from "../middleware/auth";
import { createAuditLog } from "../services/audit";
import { pool } from "../db/client";
import { allowIngressForStudentIp } from "../services/securityGroup";

const statusSchema = z.enum(["pending", "approved", "rejected"]);

const reviewSchema = z.object({
  reviewNote: z.string().max(500).optional()
});

const assignBatchSchema = z.object({
  batchId: z.string().uuid()
});

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(["admin"]));

adminRouter.get("/ip-requests", async (req, res) => {
  const parsed = statusSchema.optional().safeParse(req.query.status);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid status filter" });
    return;
  }

  const status = parsed.data;
  const query = status
    ? `
      SELECT r.id, r.student_id, u.email AS student_email, r.requested_ip, r.protocol, r.port, r.reason,
             r.status, r.requested_at, r.reviewed_at, r.review_note
      FROM ip_update_requests r
      INNER JOIN users u ON u.id = r.student_id
      WHERE r.status = $1
      ORDER BY r.requested_at DESC
    `
    : `
      SELECT r.id, r.student_id, u.email AS student_email, r.requested_ip, r.protocol, r.port, r.reason,
             r.status, r.requested_at, r.reviewed_at, r.review_note
      FROM ip_update_requests r
      INNER JOIN users u ON u.id = r.student_id
      ORDER BY r.requested_at DESC
    `;

  const result = status ? await pool.query(query, [status]) : await pool.query(query);
  res.json({ requests: result.rows });
});

adminRouter.post("/ip-requests/:requestId/approve", async (req, res) => {
  const requestId = req.params.requestId;
  const parsed = reviewSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    return;
  }

  const requestResult = await pool.query(
    `
    SELECT id, student_id, requested_ip, protocol, port, status
    FROM ip_update_requests
    WHERE id = $1
    `,
    [requestId]
  );

  if (!requestResult.rowCount) {
    res.status(404).json({ message: "IP request not found" });
    return;
  }

  const ipRequest = requestResult.rows[0];
  if (ipRequest.status !== "pending") {
    res.status(409).json({ message: "Only pending requests can be approved" });
    return;
  }

  const ingressResult = await allowIngressForStudentIp({
    ipAddress: ipRequest.requested_ip,
    protocol: ipRequest.protocol,
    port: ipRequest.port
  });

  const updated = await pool.query(
    `
    UPDATE ip_update_requests
    SET status = 'approved',
        reviewed_at = NOW(),
        reviewed_by = $2,
        review_note = $3
    WHERE id = $1
    RETURNING id, student_id, requested_ip, protocol, port, status, requested_at, reviewed_at, review_note
    `,
    [requestId, req.user!.id, parsed.data.reviewNote ?? null]
  );

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "ip_request.approve",
    entityType: "ip_update_request",
    entityId: requestId,
    metadata: {
      requestedIp: ipRequest.requested_ip,
      protocol: ipRequest.protocol,
      port: ipRequest.port,
      alreadyExists: ingressResult.alreadyExists
    }
  });

  res.json({ request: updated.rows[0], aws: ingressResult });
});

adminRouter.post("/ip-requests/:requestId/reject", async (req, res) => {
  const requestId = req.params.requestId;
  const parsed = reviewSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    return;
  }

  const updated = await pool.query(
    `
    UPDATE ip_update_requests
    SET status = 'rejected',
        reviewed_at = NOW(),
        reviewed_by = $2,
        review_note = $3
    WHERE id = $1 AND status = 'pending'
    RETURNING id, student_id, requested_ip, protocol, port, status, requested_at, reviewed_at, review_note
    `,
    [requestId, req.user!.id, parsed.data.reviewNote ?? null]
  );

  if (!updated.rowCount) {
    res.status(404).json({ message: "Pending IP request not found" });
    return;
  }

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "ip_request.reject",
    entityType: "ip_update_request",
    entityId: requestId,
    metadata: {}
  });

  res.json({ request: updated.rows[0] });
});

adminRouter.get("/audit-logs", async (_req, res) => {
  const result = await pool.query(
    `
    SELECT id, actor_user_id, action, entity_type, entity_id, metadata, created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT 200
    `
  );

  res.json({ logs: result.rows });
});

// ── Students ─────────────────────────────────────────────────────────────────

adminRouter.get("/students", async (_req, res) => {
  const result = await pool.query(
    `SELECT id, email, full_name, phone, city, state, country, institute, experience_level, created_at, updated_at
     FROM users WHERE role = 'student' ORDER BY created_at DESC`
  );
  res.json({ students: result.rows });
});

adminRouter.get("/students/:studentId", async (req, res) => {
  const { studentId } = req.params;
  const userResult = await pool.query(
    `SELECT id, email, full_name, phone, city, state, country, institute, experience_level, created_at, updated_at
     FROM users WHERE id = $1 AND role = 'student'`,
    [studentId]
  );
  if (!userResult.rowCount) { res.status(404).json({ message: "Student not found" }); return; }

  const ipResult = await pool.query(
    `SELECT id, requested_ip, protocol, port, reason, status, requested_at, reviewed_at, review_note
     FROM ip_update_requests WHERE student_id = $1 ORDER BY requested_at DESC`,
    [studentId]
  );

  const batchResult = await pool.query(
    `
    SELECT
      b.id,
      b.name,
      b.trainer_id,
      b.created_at,
      u.email AS trainer_email,
      u.full_name AS trainer_name
    FROM batch_students bs
    INNER JOIN batches b ON b.id = bs.batch_id
    LEFT JOIN users u ON u.id = b.trainer_id
    WHERE bs.student_id = $1
    ORDER BY b.created_at DESC
    `,
    [studentId]
  );

  res.json({ student: userResult.rows[0], ipRequests: ipResult.rows, batches: batchResult.rows });
});

adminRouter.get("/batches", async (_req, res) => {
  const result = await pool.query(
    `
    SELECT
      b.id,
      b.name,
      b.trainer_id,
      b.created_at,
      u.email AS trainer_email,
      u.full_name AS trainer_name,
      COUNT(bs.student_id)::int AS student_count
    FROM batches b
    LEFT JOIN users u ON u.id = b.trainer_id
    LEFT JOIN batch_students bs ON bs.batch_id = b.id
    GROUP BY b.id, u.email, u.full_name
    ORDER BY b.created_at DESC
    `
  );

  res.json({ batches: result.rows });
});

adminRouter.post("/students/:studentId/batches", async (req, res) => {
  const { studentId } = req.params;
  const parsed = assignBatchSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    return;
  }

  const studentCheck = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'student'", [studentId]);
  if (!studentCheck.rowCount) {
    res.status(404).json({ message: "Student not found" });
    return;
  }

  const batchCheck = await pool.query("SELECT id FROM batches WHERE id = $1", [parsed.data.batchId]);
  if (!batchCheck.rowCount) {
    res.status(404).json({ message: "Batch not found" });
    return;
  }

  const insertResult = await pool.query(
    `
    INSERT INTO batch_students (batch_id, student_id)
    VALUES ($1, $2)
    ON CONFLICT(batch_id, student_id) DO NOTHING
    RETURNING id
    `,
    [parsed.data.batchId, studentId]
  );

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "admin.batch.student.assign",
    entityType: "batch",
    entityId: parsed.data.batchId,
    metadata: { studentId, created: Boolean(insertResult.rowCount) }
  });

  res.status(201).json({
    message: insertResult.rowCount ? "Student assigned to batch" : "Student already assigned to this batch"
  });
});

adminRouter.delete("/students/:studentId/batches/:batchId", async (req, res) => {
  const { studentId, batchId } = req.params;

  const removed = await pool.query(
    `
    DELETE FROM batch_students
    WHERE student_id = $1 AND batch_id = $2
    RETURNING id
    `,
    [studentId, batchId]
  );

  if (!removed.rowCount) {
    res.status(404).json({ message: "Batch assignment not found" });
    return;
  }

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "admin.batch.student.unassign",
    entityType: "batch",
    entityId: batchId,
    metadata: { studentId }
  });

  res.json({ message: "Student removed from batch" });
});

const studentUpdateSchema = z.object({
  fullName: z.string().max(150).optional(),
  phone: z.string().max(30).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  institute: z.string().max(200).optional(),
  experienceLevel: z.string().max(100).optional()
});

adminRouter.patch("/students/:studentId", async (req, res) => {
  const { studentId } = req.params;
  const parsed = studentUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const fields = parsed.data;
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (fields.fullName !== undefined) { sets.push(`full_name = $${i++}`); values.push(fields.fullName || null); }
  if (fields.phone !== undefined) { sets.push(`phone = $${i++}`); values.push(fields.phone || null); }
  if (fields.city !== undefined) { sets.push(`city = $${i++}`); values.push(fields.city || null); }
  if (fields.state !== undefined) { sets.push(`state = $${i++}`); values.push(fields.state || null); }
  if (fields.country !== undefined) { sets.push(`country = $${i++}`); values.push(fields.country || null); }
  if (fields.institute !== undefined) { sets.push(`institute = $${i++}`); values.push(fields.institute || null); }
  if (fields.experienceLevel !== undefined) { sets.push(`experience_level = $${i++}`); values.push(fields.experienceLevel || null); }

  if (!sets.length) { res.status(400).json({ message: "No fields to update" }); return; }
  sets.push(`updated_at = NOW()`);
  values.push(studentId);

  const result = await pool.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${i} AND role = 'student'
     RETURNING id, email, full_name, phone, city, state, country, institute, experience_level, updated_at`,
    values
  );
  if (!result.rowCount) { res.status(404).json({ message: "Student not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.student.update", entityType: "user", entityId: studentId, metadata: fields });
  res.json({ student: result.rows[0] });
});

// ── Courses ───────────────────────────────────────────────────────────────────

const courseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional()
});

const topicSchema = z.object({
  title: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0).default(0)
});

const courseVideoSchema = z.object({
  title: z.string().min(1).max(200),
  youtubeUrl: z.string().url().max(500),
  sortOrder: z.number().int().min(0).default(0)
});

adminRouter.get("/courses", async (_req, res) => {
  const result = await pool.query(`SELECT id, title, description, created_at FROM courses ORDER BY created_at DESC`);
  res.json({ courses: result.rows });
});

adminRouter.post("/courses", async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `INSERT INTO courses (title, description, created_by) VALUES ($1, $2, $3)
     RETURNING id, title, description, created_at`,
    [parsed.data.title, parsed.data.description ?? null, req.user!.id]
  );
  res.status(201).json({ course: result.rows[0] });
});

adminRouter.get("/courses/:courseId/topics", async (req, res) => {
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

adminRouter.post("/courses/:courseId/topics", async (req, res) => {
  const { courseId } = req.params;
  const parsed = topicSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `INSERT INTO course_topics (course_id, title, sort_order) VALUES ($1, $2, $3)
     RETURNING id, course_id, title, sort_order, created_at`,
    [courseId, parsed.data.title, parsed.data.sortOrder]
  );
  res.status(201).json({ topic: { ...result.rows[0], videos: [] } });
});

adminRouter.post("/topics/:topicId/videos", async (req, res) => {
  const { topicId } = req.params;
  const parsed = courseVideoSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `INSERT INTO course_videos (topic_id, title, youtube_url, sort_order) VALUES ($1, $2, $3, $4)
     RETURNING id, topic_id, title, youtube_url, sort_order, created_at`,
    [topicId, parsed.data.title, parsed.data.youtubeUrl, parsed.data.sortOrder]
  );
  res.status(201).json({ video: result.rows[0] });
});
