import { Router } from "express";
import { z } from "zod";

import { requireAuth, requireRole } from "../middleware/auth";
import { createAuditLog } from "../services/audit";
import { pool } from "../db/client";
import { allowIngressForStudentIp } from "../services/securityGroup";
import { sendNotificationEmail } from "../services/email";

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

  let ingressResult: { alreadyExists: boolean } | null = null;
  let awsError: string | null = null;
  try {
    ingressResult = await allowIngressForStudentIp({
      ipAddress: ipRequest.requested_ip,
      protocol: ipRequest.protocol,
      port: ipRequest.port
    });
  } catch (err) {
    console.error("AWS Security Group update failed:", err);
    awsError = err instanceof Error ? err.message : "AWS security group update failed";
  }

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
      alreadyExists: ingressResult?.alreadyExists ?? false,
      awsError: awsError ?? undefined
    }
  });

  res.json({ request: updated.rows[0], aws: ingressResult, awsError });
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
    `SELECT u.id, u.email, u.full_name, u.phone, u.city, u.state, u.country, u.institute, u.experience_level, u.is_active, u.created_at, u.updated_at
     FROM users u WHERE u.role = 'student' AND u.deleted_at IS NULL ORDER BY u.created_at DESC`
  );

  // Get batch + program assignments for all students
  const batchResult = await pool.query(
    `SELECT bs.student_id, b.id AS batch_id, b.name AS batch_name, p.id AS program_id, p.title AS program_title
     FROM batch_students bs
     INNER JOIN batches b ON b.id = bs.batch_id
     LEFT JOIN programs p ON p.id = b.program_id`
  );
  const batchMap: Record<string, { batch_id: string; batch_name: string; program_id: string | null; program_title: string | null }[]> = {};
  for (const r of batchResult.rows) {
    if (!batchMap[r.student_id]) batchMap[r.student_id] = [];
    batchMap[r.student_id].push({ batch_id: r.batch_id, batch_name: r.batch_name, program_id: r.program_id, program_title: r.program_title });
  }

  // Get latest approved IP for each student
  const ipResult = await pool.query(
    `SELECT DISTINCT ON (student_id) student_id, requested_ip
     FROM ip_update_requests WHERE status = 'approved'
     ORDER BY student_id, reviewed_at DESC`
  );
  const ipMap: Record<string, string> = {};
  for (const r of ipResult.rows) {
    ipMap[r.student_id] = r.requested_ip;
  }

  const students = result.rows.map((s: Record<string, unknown>) => ({
    ...s,
    batches: batchMap[s.id as string] ?? [],
    current_ip: ipMap[s.id as string] ?? null
  }));

  res.json({ students });
});

adminRouter.get("/students/:studentId", async (req, res) => {
  const { studentId } = req.params;
  const userResult = await pool.query(
    `SELECT id, email, full_name, phone, city, state, country, institute, experience_level, is_active, created_at, updated_at
     FROM users WHERE id = $1 AND role = 'student' AND deleted_at IS NULL`,
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
      b.program_id,
      b.created_at,
      u.email AS trainer_email,
      u.full_name AS trainer_name,
      p.title AS program_title
    FROM batch_students bs
    INNER JOIN batches b ON b.id = bs.batch_id
    LEFT JOIN users u ON u.id = b.trainer_id
    LEFT JOIN programs p ON p.id = b.program_id
    WHERE bs.student_id = $1
    ORDER BY b.created_at DESC
    `,
    [studentId]
  );

  res.json({ student: userResult.rows[0], ipRequests: ipResult.rows, batches: batchResult.rows });
});

adminRouter.patch("/students/:studentId/status", async (req, res) => {
  const { studentId } = req.params;
  const schema = z.object({ isActive: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }

  const result = await pool.query(
    `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND role = 'student' AND deleted_at IS NULL RETURNING id, is_active`,
    [parsed.data.isActive, studentId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Student not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: parsed.data.isActive ? "admin.student.activate" : "admin.student.deactivate", entityType: "user", entityId: studentId, metadata: {} });
  res.json({ message: `Student ${parsed.data.isActive ? "activated" : "deactivated"}`, isActive: parsed.data.isActive });
});

adminRouter.delete("/students/:studentId", async (req, res) => {
  const { studentId } = req.params;
  const result = await pool.query(
    `UPDATE users SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1 AND role = 'student' AND deleted_at IS NULL RETURNING id`,
    [studentId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Student not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.student.delete", entityType: "user", entityId: studentId, metadata: {} });
  res.json({ message: "Student deleted" });
});

adminRouter.get("/batches", async (_req, res) => {
  const result = await pool.query(
    `
    SELECT
      b.id,
      b.name,
      b.trainer_id,
      b.program_id,
      b.is_active,
      b.created_at,
      u.email AS trainer_email,
      u.full_name AS trainer_name,
      p.title AS program_title,
      COUNT(bs.student_id)::int AS student_count
    FROM batches b
    LEFT JOIN users u ON u.id = b.trainer_id
    LEFT JOIN batch_students bs ON bs.batch_id = b.id
    LEFT JOIN programs p ON p.id = b.program_id
    GROUP BY b.id, u.email, u.full_name, p.title
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

// ── Programs ──────────────────────────────────────────────────────────────────

const programSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional()
});

const programCourseSchema = z.object({
  courseId: z.string().uuid(),
  sortOrder: z.number().int().min(0).default(0)
});

adminRouter.get("/programs", async (_req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.title, p.description, p.is_active, p.created_at,
            COUNT(pc.id)::int AS course_count
     FROM programs p
     LEFT JOIN program_courses pc ON pc.program_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC`
  );
  res.json({ programs: result.rows });
});

adminRouter.post("/programs", async (req, res) => {
  const parsed = programSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `INSERT INTO programs (title, description, created_by) VALUES ($1, $2, $3)
     RETURNING id, title, description, created_at`,
    [parsed.data.title, parsed.data.description ?? null, req.user!.id]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.program.create", entityType: "program", entityId: result.rows[0].id, metadata: { title: parsed.data.title } });
  res.status(201).json({ program: result.rows[0] });
});

adminRouter.delete("/programs/:programId", async (req, res) => {
  const { programId } = req.params;
  const removed = await pool.query("DELETE FROM programs WHERE id = $1 RETURNING id", [programId]);
  if (!removed.rowCount) { res.status(404).json({ message: "Program not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.program.delete", entityType: "program", entityId: programId, metadata: {} });
  res.json({ message: "Program deleted" });
});

adminRouter.get("/programs/:programId/courses", async (req, res) => {
  const { programId } = req.params;
  const result = await pool.query(
    `SELECT c.id, c.title, c.description, c.created_at, pc.sort_order
     FROM program_courses pc
     INNER JOIN courses c ON c.id = pc.course_id
     WHERE pc.program_id = $1
     ORDER BY pc.sort_order, c.title`,
    [programId]
  );
  res.json({ courses: result.rows });
});

adminRouter.post("/programs/:programId/courses", async (req, res) => {
  const { programId } = req.params;
  const parsed = programCourseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const progCheck = await pool.query("SELECT id FROM programs WHERE id = $1", [programId]);
  if (!progCheck.rowCount) { res.status(404).json({ message: "Program not found" }); return; }

  const courseCheck = await pool.query("SELECT id FROM courses WHERE id = $1", [parsed.data.courseId]);
  if (!courseCheck.rowCount) { res.status(404).json({ message: "Course not found" }); return; }

  const insertResult = await pool.query(
    `INSERT INTO program_courses (program_id, course_id, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT(program_id, course_id) DO NOTHING
     RETURNING id`,
    [programId, parsed.data.courseId, parsed.data.sortOrder]
  );

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.program.course.assign", entityType: "program", entityId: programId, metadata: { courseId: parsed.data.courseId } });
  res.status(201).json({ message: insertResult.rowCount ? "Course added to program" : "Course already in program" });
});

adminRouter.delete("/programs/:programId/courses/:courseId", async (req, res) => {
  const { programId, courseId } = req.params;
  const removed = await pool.query(
    "DELETE FROM program_courses WHERE program_id = $1 AND course_id = $2 RETURNING id",
    [programId, courseId]
  );
  if (!removed.rowCount) { res.status(404).json({ message: "Course not found in program" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.program.course.unassign", entityType: "program", entityId: programId, metadata: { courseId } });
  res.json({ message: "Course removed from program" });
});

adminRouter.patch("/programs/:programId/status", async (req, res) => {
  const { programId } = req.params;
  const schema = z.object({ isActive: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }

  const result = await pool.query(
    `UPDATE programs SET is_active = $1 WHERE id = $2 RETURNING id, is_active`,
    [parsed.data.isActive, programId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Program not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: parsed.data.isActive ? "admin.program.activate" : "admin.program.deactivate", entityType: "program", entityId: programId, metadata: {} });
  res.json({ message: `Program ${parsed.data.isActive ? "activated" : "deactivated"}`, isActive: parsed.data.isActive });
});

adminRouter.get("/programs/:programId/batches", async (req, res) => {
  const { programId } = req.params;
  const result = await pool.query(
    `SELECT b.id, b.name, b.is_active, b.created_at,
            u.full_name AS trainer_name, u.email AS trainer_email,
            COUNT(bs.student_id)::int AS student_count
     FROM batches b
     LEFT JOIN users u ON u.id = b.trainer_id
     LEFT JOIN batch_students bs ON bs.batch_id = b.id
     WHERE b.program_id = $1
     GROUP BY b.id, u.full_name, u.email
     ORDER BY b.created_at DESC`,
    [programId]
  );
  res.json({ batches: result.rows });
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
  const result = await pool.query(
    `SELECT c.id, c.title, c.description, c.is_active, c.created_at,
            (SELECT COUNT(*)::int FROM course_topics ct WHERE ct.course_id = c.id) AS topic_count,
            (SELECT COUNT(*)::int FROM course_videos cv INNER JOIN course_topics ct2 ON ct2.id = cv.topic_id WHERE ct2.course_id = c.id) AS video_count
     FROM courses c ORDER BY c.created_at DESC`
  );
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
adminRouter.patch("/courses/:courseId/status", async (req, res) => {
  const { courseId } = req.params;
  const schema = z.object({ isActive: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }

  const result = await pool.query(
    `UPDATE courses SET is_active = $1 WHERE id = $2 RETURNING id, is_active`,
    [parsed.data.isActive, courseId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Course not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: parsed.data.isActive ? "admin.course.activate" : "admin.course.deactivate", entityType: "course", entityId: courseId, metadata: {} });
  res.json({ message: `Course ${parsed.data.isActive ? "activated" : "deactivated"}`, isActive: parsed.data.isActive });
});

adminRouter.get("/courses/:courseId/batches", async (req, res) => {
  const { courseId } = req.params;
  const result = await pool.query(
    `SELECT b.id, b.name, b.is_active, b.created_at, p.title AS program_title
     FROM batch_courses bc
     INNER JOIN batches b ON b.id = bc.batch_id
     LEFT JOIN programs p ON p.id = b.program_id
     WHERE bc.course_id = $1
     ORDER BY b.name`,
    [courseId]
  );
  res.json({ batches: result.rows });
});
// ── Trainers ──────────────────────────────────────────────────────────────────

adminRouter.get("/trainers", async (_req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.city, u.state, u.country, u.institute, u.experience_level, u.created_at, u.updated_at,
            COUNT(b.id)::int AS batch_count
     FROM users u
     LEFT JOIN batches b ON b.trainer_id = u.id
     WHERE u.role = 'trainer'
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  );
  res.json({ trainers: result.rows });
});

adminRouter.get("/trainers/:trainerId", async (req, res) => {
  const { trainerId } = req.params;
  const userResult = await pool.query(
    `SELECT id, email, full_name, phone, city, state, country, institute, experience_level, created_at, updated_at
     FROM users WHERE id = $1 AND role = 'trainer'`,
    [trainerId]
  );
  if (!userResult.rowCount) { res.status(404).json({ message: "Trainer not found" }); return; }

  const batchResult = await pool.query(
    `SELECT b.id, b.name, b.created_at, COUNT(bs.student_id)::int AS student_count
     FROM batches b LEFT JOIN batch_students bs ON bs.batch_id = b.id
     WHERE b.trainer_id = $1 GROUP BY b.id ORDER BY b.created_at DESC`,
    [trainerId]
  );

  res.json({ trainer: userResult.rows[0], batches: batchResult.rows });
});

const trainerUpdateSchema = z.object({
  fullName: z.string().max(150).optional(),
  phone: z.string().max(30).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  institute: z.string().max(200).optional(),
  experienceLevel: z.string().max(100).optional()
});

adminRouter.patch("/trainers/:trainerId", async (req, res) => {
  const { trainerId } = req.params;
  const parsed = trainerUpdateSchema.safeParse(req.body);
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
  values.push(trainerId);

  const result = await pool.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${i} AND role = 'trainer'
     RETURNING id, email, full_name, phone, city, state, country, institute, experience_level, updated_at`,
    values
  );
  if (!result.rowCount) { res.status(404).json({ message: "Trainer not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.trainer.update", entityType: "user", entityId: trainerId, metadata: fields });
  res.json({ trainer: result.rows[0] });
});

// ── Batch Videos (YouTube) ───────────────────────────────────────────────────

const batchVideoSchema = z.object({
  title: z.string().min(1).max(300),
  youtubeUrl: z.string().url().max(500),
  description: z.string().max(1000).optional(),
  batchId: z.string().uuid()
});

adminRouter.get("/batch-videos", async (_req, res) => {
  const result = await pool.query(
    `SELECT v.id, v.batch_id, v.title, v.description, v.youtube_url, v.created_at,
            b.name AS batch_name
     FROM videos v
     INNER JOIN batches b ON b.id = v.batch_id
     WHERE v.youtube_url IS NOT NULL
     ORDER BY v.created_at DESC`
  );
  res.json({ videos: result.rows });
});

adminRouter.post("/batch-videos", async (req, res) => {
  const parsed = batchVideoSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `INSERT INTO videos (batch_id, title, description, youtube_url, s3_key, uploaded_by)
     VALUES ($1, $2, $3, $4, '', $5)
     RETURNING id, batch_id, title, description, youtube_url, created_at`,
    [parsed.data.batchId, parsed.data.title, parsed.data.description ?? null, parsed.data.youtubeUrl, req.user!.id]
  );

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch_video.create", entityType: "video", entityId: result.rows[0].id, metadata: { batchId: parsed.data.batchId } });
  res.status(201).json({ video: result.rows[0] });
});

adminRouter.delete("/batch-videos/:videoId", async (req, res) => {
  const { videoId } = req.params;
  const removed = await pool.query(`DELETE FROM videos WHERE id = $1 RETURNING id`, [videoId]);
  if (!removed.rowCount) { res.status(404).json({ message: "Video not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch_video.delete", entityType: "video", entityId: videoId, metadata: {} });
  res.json({ message: "Video deleted" });
});

// ── Batch Management ─────────────────────────────────────────────────────────

const batchCreateSchema = z.object({
  name: z.string().min(1).max(200),
  trainerId: z.string().uuid(),
  programId: z.string().uuid().optional()
});

adminRouter.post("/batches", async (req, res) => {
  const parsed = batchCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const trainerCheck = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'trainer'", [parsed.data.trainerId]);
  if (!trainerCheck.rowCount) { res.status(404).json({ message: "Trainer not found" }); return; }

  if (parsed.data.programId) {
    const progCheck = await pool.query("SELECT id FROM programs WHERE id = $1", [parsed.data.programId]);
    if (!progCheck.rowCount) { res.status(404).json({ message: "Program not found" }); return; }
  }

  const result = await pool.query(
    `INSERT INTO batches (name, trainer_id, program_id) VALUES ($1, $2, $3) RETURNING id, name, trainer_id, program_id, created_at`,
    [parsed.data.name, parsed.data.trainerId, parsed.data.programId ?? null]
  );

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch.create", entityType: "batch", entityId: result.rows[0].id, metadata: { name: parsed.data.name } });
  res.status(201).json({ batch: result.rows[0] });
});

adminRouter.delete("/batches/:batchId", async (req, res) => {
  const { batchId } = req.params;
  const removed = await pool.query("DELETE FROM batches WHERE id = $1 RETURNING id", [batchId]);
  if (!removed.rowCount) { res.status(404).json({ message: "Batch not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch.delete", entityType: "batch", entityId: batchId, metadata: {} });
  res.json({ message: "Batch deleted" });
});

adminRouter.get("/batches/:batchId/students", async (req, res) => {
  const { batchId } = req.params;
  const result = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.experience_level, u.is_active
     FROM users u
     INNER JOIN batch_students bs ON bs.student_id = u.id
     WHERE bs.batch_id = $1 AND u.deleted_at IS NULL
     ORDER BY u.full_name, u.email`,
    [batchId]
  );
  res.json({ students: result.rows });
});

adminRouter.patch("/batches/:batchId/status", async (req, res) => {
  const { batchId } = req.params;
  const schema = z.object({ isActive: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }

  const result = await pool.query(
    `UPDATE batches SET is_active = $1 WHERE id = $2 RETURNING id, is_active`,
    [parsed.data.isActive, batchId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Batch not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: parsed.data.isActive ? "admin.batch.activate" : "admin.batch.deactivate", entityType: "batch", entityId: batchId, metadata: {} });
  res.json({ message: `Batch ${parsed.data.isActive ? "activated" : "deactivated"}`, isActive: parsed.data.isActive });
});

// ── Batch Courses ─────────────────────────────────────────────────────────────

adminRouter.get("/batches/:batchId/courses", async (req, res) => {
  const { batchId } = req.params;
  const result = await pool.query(
    `SELECT c.id, c.title, c.description, c.is_active, bc.sort_order
     FROM batch_courses bc
     INNER JOIN courses c ON c.id = bc.course_id
     WHERE bc.batch_id = $1
     ORDER BY bc.sort_order, c.title`,
    [batchId]
  );
  res.json({ courses: result.rows });
});

adminRouter.post("/batches/:batchId/courses", async (req, res) => {
  const { batchId } = req.params;
  const schema = z.object({ courseId: z.string().uuid(), sortOrder: z.number().int().min(0).default(0) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const batchCheck = await pool.query("SELECT id FROM batches WHERE id = $1", [batchId]);
  if (!batchCheck.rowCount) { res.status(404).json({ message: "Batch not found" }); return; }

  const courseCheck = await pool.query("SELECT id FROM courses WHERE id = $1", [parsed.data.courseId]);
  if (!courseCheck.rowCount) { res.status(404).json({ message: "Course not found" }); return; }

  const insertResult = await pool.query(
    `INSERT INTO batch_courses (batch_id, course_id, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT(batch_id, course_id) DO NOTHING
     RETURNING id`,
    [batchId, parsed.data.courseId, parsed.data.sortOrder]
  );

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch.course.assign", entityType: "batch", entityId: batchId, metadata: { courseId: parsed.data.courseId } });
  res.status(201).json({ message: insertResult.rowCount ? "Course added to batch" : "Course already in batch" });
});

adminRouter.delete("/batches/:batchId/courses/:courseId", async (req, res) => {
  const { batchId, courseId } = req.params;
  const removed = await pool.query(
    "DELETE FROM batch_courses WHERE batch_id = $1 AND course_id = $2 RETURNING id",
    [batchId, courseId]
  );
  if (!removed.rowCount) { res.status(404).json({ message: "Course not found in batch" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch.course.unassign", entityType: "batch", entityId: batchId, metadata: { courseId } });
  res.json({ message: "Course removed from batch" });
});

adminRouter.post("/batches/:batchId/sync-program-courses", async (req, res) => {
  const { batchId } = req.params;
  const batch = await pool.query("SELECT id, program_id FROM batches WHERE id = $1", [batchId]);
  if (!batch.rowCount) { res.status(404).json({ message: "Batch not found" }); return; }
  if (!batch.rows[0].program_id) { res.status(400).json({ message: "Batch has no program assigned" }); return; }

  const result = await pool.query(
    `INSERT INTO batch_courses (batch_id, course_id, sort_order)
     SELECT $1, pc.course_id, pc.sort_order
     FROM program_courses pc WHERE pc.program_id = $2
     ON CONFLICT(batch_id, course_id) DO NOTHING`,
    [batchId, batch.rows[0].program_id]
  );

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch.sync_program_courses", entityType: "batch", entityId: batchId, metadata: { programId: batch.rows[0].program_id, synced: result.rowCount } });
  res.json({ message: `Synced ${result.rowCount} course(s) from program` });
});

// ── Notifications ────────────────────────────────────────────────────────────

const notificationSchema = z.object({
  toUserId: z.string().uuid().optional(),
  toRole: z.enum(["student", "trainer", "admin"]).optional(),
  subject: z.string().min(1).max(300),
  message: z.string().min(1).max(5000)
});

adminRouter.get("/notifications", async (req, res) => {
  const result = await pool.query(
    `SELECT n.id, n.from_user_id, n.to_user_id, n.to_role, n.subject, n.message, n.is_read, n.created_at,
            fu.email AS from_email, fu.full_name AS from_name,
            tu.email AS to_email, tu.full_name AS to_name
     FROM notifications n
     LEFT JOIN users fu ON fu.id = n.from_user_id
     LEFT JOIN users tu ON tu.id = n.to_user_id
     ORDER BY n.created_at DESC
     LIMIT 200`
  );
  res.json({ notifications: result.rows });
});

adminRouter.post("/notifications", async (req, res) => {
  const parsed = notificationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const { toUserId, toRole, subject, message } = parsed.data;
  if (!toUserId && !toRole) { res.status(400).json({ message: "Provide toUserId or toRole" }); return; }

  const senderResult = await pool.query("SELECT full_name, email FROM users WHERE id = $1", [req.user!.id]);
  const senderName = senderResult.rows[0]?.full_name || senderResult.rows[0]?.email || "Admin";

  // If sending to a role, insert one notification per user of that role
  if (toRole && !toUserId) {
    const users = await pool.query("SELECT id, email FROM users WHERE role = $1", [toRole]);
    for (const u of users.rows) {
      await pool.query(
        `INSERT INTO notifications (from_user_id, to_user_id, to_role, subject, message) VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, u.id, toRole, subject, message]
      );
      void sendNotificationEmail({ to: u.email, subject, message, fromName: senderName }).catch(() => {});
    }
    res.status(201).json({ message: `Notification sent to ${users.rowCount} ${toRole}(s)` });
    return;
  }

  // Single user
  const targetUser = await pool.query("SELECT id, email FROM users WHERE id = $1", [toUserId]);
  if (!targetUser.rowCount) { res.status(404).json({ message: "User not found" }); return; }

  const result = await pool.query(
    `INSERT INTO notifications (from_user_id, to_user_id, to_role, subject, message) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, from_user_id, to_user_id, to_role, subject, message, is_read, created_at`,
    [req.user!.id, toUserId, toRole ?? null, subject, message]
  );

  void sendNotificationEmail({ to: targetUser.rows[0].email, subject, message, fromName: senderName }).catch(() => {});
  res.status(201).json({ notification: result.rows[0] });
});

// ── My Notifications (for admin user) ─────────────────────────────────────────

adminRouter.get("/my-notifications", async (req, res) => {
  const result = await pool.query(
    `SELECT n.id, n.from_user_id, n.subject, n.message, n.is_read, n.created_at,
            u.email AS from_email, u.full_name AS from_name
     FROM notifications n
     LEFT JOIN users u ON u.id = n.from_user_id
     WHERE n.to_user_id = $1 OR n.to_role = 'admin'
     ORDER BY n.created_at DESC
     LIMIT 100`,
    [req.user!.id]
  );
  res.json({ notifications: result.rows });
});

adminRouter.patch("/my-notifications/:notifId/read", async (req, res) => {
  const { notifId } = req.params;
  await pool.query("UPDATE notifications SET is_read = TRUE WHERE id = $1", [notifId]);
  res.json({ message: "Marked as read" });
});
