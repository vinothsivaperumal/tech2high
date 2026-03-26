import { Router } from "express";
import multer from "multer";
import { z } from "zod";


import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, UserRole } from "../types/roles";
import { createAuditLog } from "../services/audit";
import { pool } from "../db/client";
import { allowIngressForStudentIp } from "../services/securityGroup";
import { sendNotificationEmail } from "../services/email";
import { uploadBufferToS3, getPresignedUrl } from "../services/s3";
import * as eventService from "../services/event";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(["admin"]));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const statusSchema = z.enum(["pending", "approved", "rejected"]);

const reviewSchema = z.object({
  reviewNote: z.string().max(500).optional()
});


const eventSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  meetingLink: z.string().url(),
});

const assignParticipantsSchema = z.object({
  eventId: z.string().uuid(),
  userIds: z.array(z.string().uuid()),
  role: z.enum(ROLES)
});

// Event Management
adminRouter.post("/events", async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid event data", errors: parsed.error.flatten() });
    return;
  }
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const event = await eventService.createEvent({ ...parsed.data, createdBy: req.user.id });
  res.status(201).json({ event });
});

adminRouter.put("/events/:eventId", async (req, res) => {
  const eventId = req.params.eventId;
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid event data", errors: parsed.error.flatten() });
    return;
  }
  const event = await eventService.updateEvent({ eventId, ...parsed.data });
  res.json({ event });
});

adminRouter.delete("/events/:eventId", async (req, res) => {
  const eventId = req.params.eventId;
  await eventService.deleteEvent(eventId);
  res.status(204).send();
});

adminRouter.get("/events", async (req, res) => {
  const events = await eventService.listEvents();
  res.json({ events });
});

adminRouter.post("/events/:eventId/assign", async (req, res) => {
  const eventId = req.params.eventId;
  const parsed = assignParticipantsSchema.safeParse({ eventId, ...req.body });
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid assignment data", errors: parsed.error.flatten() });
    return;
  }
  await eventService.assignParticipants(eventId, parsed.data.userIds, parsed.data.role);
  res.status(200).json({ message: "Participants assigned" });
});



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

adminRouter.get("/audit-logs", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const action = (req.query.action as string)?.trim() || null;
  const entityType = (req.query.entityType as string)?.trim() || null;
  const search = (req.query.search as string)?.trim() || null;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (action) {
    conditions.push(`a.action = $${paramIndex++}`);
    params.push(action);
  }
  if (entityType) {
    conditions.push(`a.entity_type = $${paramIndex++}`);
    params.push(entityType);
  }
  if (search) {
    conditions.push(`(u.full_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR a.action ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const result = await pool.query(
    `SELECT a.id, a.actor_user_id, u.full_name AS actor_name, u.email AS actor_email,
            a.action, a.entity_type, a.entity_id, a.metadata, a.created_at
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  // Get distinct actions and entity types for filter dropdowns
  const filtersResult = await pool.query(
    `SELECT DISTINCT action FROM audit_logs ORDER BY action`
  );
  const entityTypesResult = await pool.query(
    `SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type`
  );

  res.json({
    logs: result.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    filters: {
      actions: filtersResult.rows.map((r: { action: string }) => r.action),
      entityTypes: entityTypesResult.rows.map((r: { entity_type: string }) => r.entity_type),
    },
  });
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
      b.zoom_link,
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
  const assignBatchSchema = z.object({ batchId: z.string().uuid() });
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
  programId: z.string().uuid().optional(),
  zoomLink: z.string().url().max(500).optional()
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
    `INSERT INTO batches (name, trainer_id, program_id, zoom_link) VALUES ($1, $2, $3, $4) RETURNING id, name, trainer_id, program_id, zoom_link, created_at`,
    [parsed.data.name, parsed.data.trainerId, parsed.data.programId ?? null, parsed.data.zoomLink ?? null]
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

adminRouter.patch("/batches/:batchId/zoom-link", async (req, res) => {
  const { batchId } = req.params;
  const schema = z.object({ zoomLink: z.string().url().max(500).nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `UPDATE batches SET zoom_link = $1 WHERE id = $2 RETURNING id, zoom_link`,
    [parsed.data.zoomLink, batchId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Batch not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch.zoom_link.update", entityType: "batch", entityId: batchId, metadata: { zoomLink: parsed.data.zoomLink } });
  res.json({ message: "Zoom link updated", zoomLink: parsed.data.zoomLink });
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
  toRole: z.enum(ROLES).optional(),
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

// ── Payments ──────────────────────────────────────────────────────────────────

adminRouter.get("/payments", async (_req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.student_id, p.batch_id, p.amount, p.paid_amount, p.due_date, p.paid_date,
            p.status, p.method, p.remarks, p.created_at, p.updated_at,
            u.full_name AS student_name, u.email AS student_email,
            b.name AS batch_name, pr.title AS program_title
     FROM student_payments p
     INNER JOIN users u ON u.id = p.student_id
     LEFT JOIN batches b ON b.id = p.batch_id
     LEFT JOIN programs pr ON pr.id = b.program_id
     ORDER BY p.created_at DESC`
  );
  res.json({ payments: result.rows });
});

adminRouter.get("/payments/:paymentId", async (req, res) => {
  const { paymentId } = req.params;
  const result = await pool.query(
    `SELECT p.*, u.full_name AS student_name, u.email AS student_email,
            b.name AS batch_name, pr.title AS program_title
     FROM student_payments p
     INNER JOIN users u ON u.id = p.student_id
     LEFT JOIN batches b ON b.id = p.batch_id
     LEFT JOIN programs pr ON pr.id = b.program_id
     WHERE p.id = $1`,
    [paymentId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Payment not found" }); return; }
  res.json({ payment: result.rows[0] });
});

const paymentSchema = z.object({
  studentId: z.string().uuid(),
  batchId: z.string().uuid().optional(),
  amount: z.number().min(0),
  paidAmount: z.number().min(0).default(0),
  dueDate: z.string().optional(),
  paidDate: z.string().optional(),
  status: z.enum(["pending", "partial", "paid", "overdue"]).default("pending"),
  method: z.string().max(100).optional(),
  remarks: z.string().max(1000).optional()
});

adminRouter.post("/payments", async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO student_payments (student_id, batch_id, amount, paid_amount, due_date, paid_date, status, method, remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [d.studentId, d.batchId ?? null, d.amount, d.paidAmount, d.dueDate ?? null, d.paidDate ?? null, d.status, d.method ?? null, d.remarks ?? null]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.payment.create", entityType: "payment", entityId: result.rows[0].id, metadata: { studentId: d.studentId } });
  res.status(201).json({ payment: result.rows[0] });
});

adminRouter.patch("/payments/:paymentId", async (req, res) => {
  const { paymentId } = req.params;
  const parsed = paymentSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.amount !== undefined) { sets.push(`amount = $${i++}`); vals.push(d.amount); }
  if (d.paidAmount !== undefined) { sets.push(`paid_amount = $${i++}`); vals.push(d.paidAmount); }
  if (d.dueDate !== undefined) { sets.push(`due_date = $${i++}`); vals.push(d.dueDate || null); }
  if (d.paidDate !== undefined) { sets.push(`paid_date = $${i++}`); vals.push(d.paidDate || null); }
  if (d.status !== undefined) { sets.push(`status = $${i++}`); vals.push(d.status); }
  if (d.method !== undefined) { sets.push(`method = $${i++}`); vals.push(d.method || null); }
  if (d.remarks !== undefined) { sets.push(`remarks = $${i++}`); vals.push(d.remarks || null); }
  if (!sets.length) { res.status(400).json({ message: "No fields" }); return; }
  sets.push(`updated_at = NOW()`);
  vals.push(paymentId);
  const result = await pool.query(`UPDATE student_payments SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
  if (!result.rowCount) { res.status(404).json({ message: "Payment not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.payment.update", entityType: "payment", entityId: paymentId, metadata: d });
  res.json({ payment: result.rows[0] });
});

adminRouter.delete("/payments/:paymentId", async (req, res) => {
  const { paymentId } = req.params;
  const removed = await pool.query("DELETE FROM student_payments WHERE id = $1 RETURNING id", [paymentId]);
  if (!removed.rowCount) { res.status(404).json({ message: "Payment not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.payment.delete", entityType: "payment", entityId: paymentId, metadata: {} });
  res.json({ message: "Payment deleted" });
});

// ── Agreements ────────────────────────────────────────────────────────────────

adminRouter.get("/agreements", async (_req, res) => {
  const result = await pool.query(
    `SELECT a.*, u.full_name AS student_name, u.email AS student_email,
            b.name AS batch_name, pr.title AS program_title
     FROM student_agreements a
     INNER JOIN users u ON u.id = a.student_id
     LEFT JOIN batches b ON b.id = a.batch_id
     LEFT JOIN programs pr ON pr.id = b.program_id
     ORDER BY a.created_at DESC`
  );
  res.json({ agreements: result.rows });
});

adminRouter.get("/agreements/:agreementId", async (req, res) => {
  const { agreementId } = req.params;
  const result = await pool.query(
    `SELECT a.*, u.full_name AS student_name, u.email AS student_email,
            b.name AS batch_name, pr.title AS program_title
     FROM student_agreements a
     INNER JOIN users u ON u.id = a.student_id
     LEFT JOIN batches b ON b.id = a.batch_id
     LEFT JOIN programs pr ON pr.id = b.program_id
     WHERE a.id = $1`,
    [agreementId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Agreement not found" }); return; }
  res.json({ agreement: result.rows[0] });
});

const agreementSchema = z.object({
  studentId: z.string().uuid(),
  batchId: z.string().uuid().optional(),
  agreementType: z.string().max(100).default("training"),
  status: z.enum(["not_sent", "sent", "signed", "rejected", "expired"]).default("not_sent"),
  sentDate: z.string().optional(),
  signedDate: z.string().optional(),
  expiryDate: z.string().optional()
});

adminRouter.post("/agreements", async (req, res) => {
  const parsed = agreementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO student_agreements (student_id, batch_id, agreement_type, status, sent_date, signed_date, expiry_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.studentId, d.batchId ?? null, d.agreementType, d.status, d.sentDate ?? null, d.signedDate ?? null, d.expiryDate ?? null]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.agreement.create", entityType: "agreement", entityId: result.rows[0].id, metadata: { studentId: d.studentId } });
  res.status(201).json({ agreement: result.rows[0] });
});

adminRouter.patch("/agreements/:agreementId", async (req, res) => {
  const { agreementId } = req.params;
  const parsed = agreementSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.agreementType !== undefined) { sets.push(`agreement_type = $${i++}`); vals.push(d.agreementType); }
  if (d.status !== undefined) { sets.push(`status = $${i++}`); vals.push(d.status); }
  if (d.sentDate !== undefined) { sets.push(`sent_date = $${i++}`); vals.push(d.sentDate || null); }
  if (d.signedDate !== undefined) { sets.push(`signed_date = $${i++}`); vals.push(d.signedDate || null); }
  if (d.expiryDate !== undefined) { sets.push(`expiry_date = $${i++}`); vals.push(d.expiryDate || null); }
  if (!sets.length) { res.status(400).json({ message: "No fields" }); return; }
  sets.push(`updated_at = NOW()`);
  vals.push(agreementId);
  const result = await pool.query(`UPDATE student_agreements SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
  if (!result.rowCount) { res.status(404).json({ message: "Agreement not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.agreement.update", entityType: "agreement", entityId: agreementId, metadata: d });
  res.json({ agreement: result.rows[0] });
});

// ── Certifications ────────────────────────────────────────────────────────────

adminRouter.get("/certifications", async (_req, res) => {
  const result = await pool.query(
    `SELECT c.*, u.full_name AS student_name, u.email AS student_email,
            b.name AS batch_name, co.title AS course_title, pr.title AS program_title
     FROM student_certifications c
     INNER JOIN users u ON u.id = c.student_id
     LEFT JOIN batches b ON b.id = c.batch_id
     LEFT JOIN courses co ON co.id = c.course_id
     LEFT JOIN programs pr ON pr.id = c.program_id
     ORDER BY c.created_at DESC`
  );
  res.json({ certifications: result.rows });
});

adminRouter.get("/certifications/:certId", async (req, res) => {
  const { certId } = req.params;
  const result = await pool.query(
    `SELECT c.*, u.full_name AS student_name, u.email AS student_email,
            b.name AS batch_name, co.title AS course_title, pr.title AS program_title
     FROM student_certifications c
     INNER JOIN users u ON u.id = c.student_id
     LEFT JOIN batches b ON b.id = c.batch_id
     LEFT JOIN courses co ON co.id = c.course_id
     LEFT JOIN programs pr ON pr.id = c.program_id
     WHERE c.id = $1`,
    [certId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Certification not found" }); return; }
  res.json({ certification: result.rows[0] });
});

const certSchema = z.object({
  studentId: z.string().uuid(),
  batchId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  completionPct: z.number().int().min(0).max(100).default(0),
  status: z.enum(["not_eligible", "eligible", "issued", "revoked"]).default("not_eligible"),
  issueDate: z.string().optional()
});

adminRouter.post("/certifications", async (req, res) => {
  const parsed = certSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO student_certifications (student_id, batch_id, course_id, program_id, completion_pct, status, issue_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.studentId, d.batchId ?? null, d.courseId ?? null, d.programId ?? null, d.completionPct, d.status, d.issueDate ?? null]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.certification.create", entityType: "certification", entityId: result.rows[0].id, metadata: { studentId: d.studentId } });
  res.status(201).json({ certification: result.rows[0] });
});

adminRouter.patch("/certifications/:certId", async (req, res) => {
  const { certId } = req.params;
  const parsed = certSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.completionPct !== undefined) { sets.push(`completion_pct = $${i++}`); vals.push(d.completionPct); }
  if (d.status !== undefined) { sets.push(`status = $${i++}`); vals.push(d.status); }
  if (d.issueDate !== undefined) { sets.push(`issue_date = $${i++}`); vals.push(d.issueDate || null); }
  if (!sets.length) { res.status(400).json({ message: "No fields" }); return; }
  sets.push(`updated_at = NOW()`);
  vals.push(certId);
  const result = await pool.query(`UPDATE student_certifications SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
  if (!result.rowCount) { res.status(404).json({ message: "Certification not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.certification.update", entityType: "certification", entityId: certId, metadata: d });
  res.json({ certification: result.rows[0] });
});

// ── Resume Collection ─────────────────────────────────────────────────────────

adminRouter.get("/resumes", async (_req, res) => {
  const result = await pool.query(
    `SELECT r.*, u.full_name AS student_name, u.email AS student_email
     FROM student_resume_profiles r
     INNER JOIN users u ON u.id = r.student_id
     ORDER BY r.updated_at DESC`
  );
  // Get sub-counts
  for (const row of result.rows) {
    const eduCount = await pool.query("SELECT COUNT(*)::int AS c FROM student_resume_education WHERE student_id = $1", [row.student_id]);
    const expCount = await pool.query("SELECT COUNT(*)::int AS c FROM student_resume_experience WHERE student_id = $1", [row.student_id]);
    const skillCount = await pool.query("SELECT COUNT(*)::int AS c FROM student_resume_skills WHERE student_id = $1", [row.student_id]);
    const projCount = await pool.query("SELECT COUNT(*)::int AS c FROM student_resume_projects WHERE student_id = $1", [row.student_id]);
    row.education_count = eduCount.rows[0].c;
    row.experience_count = expCount.rows[0].c;
    row.skills_count = skillCount.rows[0].c;
    row.projects_count = projCount.rows[0].c;
  }
  res.json({ resumes: result.rows });
});

adminRouter.get("/resumes/:studentId", async (req, res) => {
  const { studentId } = req.params;
  const profile = await pool.query(
    `SELECT r.*, u.full_name AS student_name, u.email AS student_email
     FROM student_resume_profiles r
     INNER JOIN users u ON u.id = r.student_id
     WHERE r.student_id = $1`,
    [studentId]
  );
  const education = await pool.query("SELECT * FROM student_resume_education WHERE student_id = $1 ORDER BY end_year DESC NULLS FIRST", [studentId]);
  const experience = await pool.query("SELECT * FROM student_resume_experience WHERE student_id = $1 ORDER BY end_date DESC NULLS FIRST", [studentId]);
  const skills = await pool.query("SELECT * FROM student_resume_skills WHERE student_id = $1", [studentId]);
  const projects = await pool.query("SELECT * FROM student_resume_projects WHERE student_id = $1", [studentId]);

  res.json({
    profile: profile.rows[0] ?? null,
    education: education.rows,
    experience: experience.rows,
    skills: skills.rows,
    projects: projects.rows
  });
});

adminRouter.patch("/resumes/:studentId/status", async (req, res) => {
  const { studentId } = req.params;
  const schema = z.object({ status: z.enum(["not_started", "in_progress", "submitted", "approved", "changes_requested"]), adminNotes: z.string().max(2000).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }

  const result = await pool.query(
    `UPDATE student_resume_profiles SET status = $1, admin_notes = COALESCE($2, admin_notes), updated_at = NOW() WHERE student_id = $3 RETURNING *`,
    [parsed.data.status, parsed.data.adminNotes ?? null, studentId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Resume profile not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.resume.status", entityType: "resume", entityId: studentId, metadata: parsed.data });
  res.json({ profile: result.rows[0] });
});

// ── Dashboard Stats ──────────────────────────────────────────────────────────

adminRouter.get("/dashboard-stats", async (_req, res) => {
  const [programs, batches, courses, students, trainers, activeStudents, inactiveStudents, pendingIp, totalVideos, pendingAgreements, issuedCerts, pendingPayments] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS c FROM programs"),
    pool.query("SELECT COUNT(*)::int AS c FROM batches"),
    pool.query("SELECT COUNT(*)::int AS c FROM courses"),
    pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'student' AND deleted_at IS NULL"),
    pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'trainer'"),
    pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'student' AND is_active = TRUE AND deleted_at IS NULL"),
    pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'student' AND is_active = FALSE AND deleted_at IS NULL"),
    pool.query("SELECT COUNT(*)::int AS c FROM ip_update_requests WHERE status = 'pending'"),
    pool.query("SELECT COUNT(*)::int AS c FROM videos"),
    pool.query("SELECT COUNT(*)::int AS c FROM student_agreements WHERE status IN ('not_sent', 'sent')"),
    pool.query("SELECT COUNT(*)::int AS c FROM student_certifications WHERE status = 'issued'"),
    pool.query("SELECT COUNT(*)::int AS c FROM student_payments WHERE status IN ('pending', 'overdue')")
  ]);
  res.json({
    totalPrograms: programs.rows[0].c,
    totalBatches: batches.rows[0].c,
    totalCourses: courses.rows[0].c,
    totalStudents: students.rows[0].c,
    totalTrainers: trainers.rows[0].c,
    activeStudents: activeStudents.rows[0].c,
    inactiveStudents: inactiveStudents.rows[0].c,
    pendingIpApprovals: pendingIp.rows[0].c,
    totalVideos: totalVideos.rows[0].c,
    pendingAgreements: pendingAgreements.rows[0].c,
    issuedCertifications: issuedCerts.rows[0].c,
    pendingPayments: pendingPayments.rows[0].c
  });
});

// ── Program update ──────────────────────────────────────────────────────────

const programUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  programCode: z.string().max(50).optional(),
  duration: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

adminRouter.patch("/programs/:programId", async (req, res) => {
  const { programId } = req.params;
  const parsed = programUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.title !== undefined) { sets.push(`title = $${i++}`); vals.push(d.title); }
  if (d.description !== undefined) { sets.push(`description = $${i++}`); vals.push(d.description || null); }
  if (d.programCode !== undefined) { sets.push(`program_code = $${i++}`); vals.push(d.programCode || null); }
  if (d.duration !== undefined) { sets.push(`duration = $${i++}`); vals.push(d.duration || null); }
  if (d.category !== undefined) { sets.push(`category = $${i++}`); vals.push(d.category || null); }
  if (d.startDate !== undefined) { sets.push(`start_date = $${i++}`); vals.push(d.startDate || null); }
  if (d.endDate !== undefined) { sets.push(`end_date = $${i++}`); vals.push(d.endDate || null); }
  if (!sets.length) { res.status(400).json({ message: "No fields" }); return; }
  vals.push(programId);
  const result = await pool.query(`UPDATE programs SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
  if (!result.rowCount) { res.status(404).json({ message: "Program not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.program.update", entityType: "program", entityId: programId, metadata: d });
  res.json({ program: result.rows[0] });
});

adminRouter.get("/programs/:programId", async (req, res) => {
  const { programId } = req.params;
  const result = await pool.query(
    `SELECT p.*, COUNT(pc.id)::int AS course_count
     FROM programs p LEFT JOIN program_courses pc ON pc.program_id = p.id
     WHERE p.id = $1 GROUP BY p.id`,
    [programId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Program not found" }); return; }

  const batchCount = await pool.query("SELECT COUNT(*)::int AS c FROM batches WHERE program_id = $1", [programId]);
  const studentCount = await pool.query(
    "SELECT COUNT(DISTINCT bs.student_id)::int AS c FROM batch_students bs INNER JOIN batches b ON b.id = bs.batch_id WHERE b.program_id = $1",
    [programId]
  );
  res.json({ program: { ...result.rows[0], batch_count: batchCount.rows[0].c, student_count: studentCount.rows[0].c } });
});

// ── Batch update ─────────────────────────────────────────────────────────────

const batchUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  batchCode: z.string().max(50).optional(),
  trainerId: z.string().uuid().optional(),
  programId: z.string().uuid().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  capacity: z.number().int().min(0).optional(),
  mode: z.string().max(50).optional(),
  remarks: z.string().max(1000).optional()
});

adminRouter.patch("/batches/:batchId", async (req, res) => {
  const { batchId } = req.params;
  const parsed = batchUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.name !== undefined) { sets.push(`name = $${i++}`); vals.push(d.name); }
  if (d.batchCode !== undefined) { sets.push(`batch_code = $${i++}`); vals.push(d.batchCode || null); }
  if (d.trainerId !== undefined) { sets.push(`trainer_id = $${i++}`); vals.push(d.trainerId); }
  if (d.programId !== undefined) { sets.push(`program_id = $${i++}`); vals.push(d.programId); }
  if (d.startDate !== undefined) { sets.push(`start_date = $${i++}`); vals.push(d.startDate || null); }
  if (d.endDate !== undefined) { sets.push(`end_date = $${i++}`); vals.push(d.endDate || null); }
  if (d.capacity !== undefined) { sets.push(`capacity = $${i++}`); vals.push(d.capacity); }
  if (d.mode !== undefined) { sets.push(`mode = $${i++}`); vals.push(d.mode); }
  if (d.remarks !== undefined) { sets.push(`remarks = $${i++}`); vals.push(d.remarks || null); }
  if (!sets.length) { res.status(400).json({ message: "No fields" }); return; }
  vals.push(batchId);
  const result = await pool.query(`UPDATE batches SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
  if (!result.rowCount) { res.status(404).json({ message: "Batch not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch.update", entityType: "batch", entityId: batchId, metadata: d });
  res.json({ batch: result.rows[0] });
});

adminRouter.get("/batches/:batchId", async (req, res) => {
  const { batchId } = req.params;
  const result = await pool.query(
    `SELECT b.*, u.full_name AS trainer_name, u.email AS trainer_email, p.title AS program_title,
            COUNT(bs.student_id)::int AS student_count
     FROM batches b
     LEFT JOIN users u ON u.id = b.trainer_id
     LEFT JOIN programs p ON p.id = b.program_id
     LEFT JOIN batch_students bs ON bs.batch_id = b.id
     WHERE b.id = $1
     GROUP BY b.id, u.full_name, u.email, p.title`,
    [batchId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Batch not found" }); return; }
  res.json({ batch: result.rows[0] });
});

// ── Course update ─────────────────────────────────────────────────────────────

const courseUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  courseCode: z.string().max(50).optional(),
  duration: z.string().max(100).optional(),
  level: z.string().max(50).optional()
});

adminRouter.patch("/courses/:courseId", async (req, res) => {
  const { courseId } = req.params;
  const parsed = courseUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.title !== undefined) { sets.push(`title = $${i++}`); vals.push(d.title); }
  if (d.description !== undefined) { sets.push(`description = $${i++}`); vals.push(d.description || null); }
  if (d.courseCode !== undefined) { sets.push(`course_code = $${i++}`); vals.push(d.courseCode || null); }
  if (d.duration !== undefined) { sets.push(`duration = $${i++}`); vals.push(d.duration || null); }
  if (d.level !== undefined) { sets.push(`level = $${i++}`); vals.push(d.level || null); }
  if (!sets.length) { res.status(400).json({ message: "No fields" }); return; }
  vals.push(courseId);
  const result = await pool.query(`UPDATE courses SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
  if (!result.rowCount) { res.status(404).json({ message: "Course not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.course.update", entityType: "course", entityId: courseId, metadata: d });
  res.json({ course: result.rows[0] });
});

adminRouter.get("/courses/:courseId", async (req, res) => {
  const { courseId } = req.params;
  const result = await pool.query(
    `SELECT c.*,
       (SELECT COUNT(*)::int FROM course_topics ct WHERE ct.course_id = c.id) AS topic_count,
       (SELECT COUNT(*)::int FROM course_videos cv INNER JOIN course_topics ct2 ON ct2.id = cv.topic_id WHERE ct2.course_id = c.id) AS video_count
     FROM courses c WHERE c.id = $1`,
    [courseId]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Course not found" }); return; }

  const programs = await pool.query(
    `SELECT p.id, p.title FROM program_courses pc INNER JOIN programs p ON p.id = pc.program_id WHERE pc.course_id = $1`,
    [courseId]
  );
  res.json({ course: { ...result.rows[0], programs: programs.rows } });
});

// ── Batch Trainers ────────────────────────────────────────────────────────────

adminRouter.get("/batches/:batchId/trainers", async (req, res) => {
  const { batchId } = req.params;
  const result = await pool.query(
    `SELECT u.id, u.email, u.full_name, bt.created_at AS assigned_at
     FROM batch_trainers bt
     INNER JOIN users u ON u.id = bt.trainer_id
     WHERE bt.batch_id = $1
     ORDER BY u.full_name`,
    [batchId]
  );
  res.json({ trainers: result.rows });
});

adminRouter.post("/batches/:batchId/trainers", async (req, res) => {
  const { batchId } = req.params;
  const schema = z.object({ trainerId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body" }); return; }

  const result = await pool.query(
    `INSERT INTO batch_trainers (batch_id, trainer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id`,
    [batchId, parsed.data.trainerId]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch.trainer.assign", entityType: "batch", entityId: batchId, metadata: { trainerId: parsed.data.trainerId } });
  res.status(201).json({ message: result.rowCount ? "Trainer assigned" : "Already assigned" });
});

adminRouter.delete("/batches/:batchId/trainers/:trainerId", async (req, res) => {
  const { batchId, trainerId } = req.params;
  const removed = await pool.query("DELETE FROM batch_trainers WHERE batch_id = $1 AND trainer_id = $2 RETURNING id", [batchId, trainerId]);
  if (!removed.rowCount) { res.status(404).json({ message: "Not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.batch.trainer.unassign", entityType: "batch", entityId: batchId, metadata: { trainerId } });
  res.json({ message: "Trainer removed from batch" });
});

// ── Trainer Assignments (Batch + Course) ─────────────────────────────────────

adminRouter.get("/trainer-assignments", async (_req, res) => {
  const result = await pool.query(
    `SELECT bt.id, bt.batch_id, bt.trainer_id, bt.course_id, bt.created_at,
            u.full_name AS trainer_name, u.email AS trainer_email,
            b.name AS batch_name, b.program_id,
            p.title AS program_title,
            c.title AS course_title
     FROM batch_trainers bt
     INNER JOIN users u ON u.id = bt.trainer_id
     INNER JOIN batches b ON b.id = bt.batch_id
     LEFT JOIN programs p ON p.id = b.program_id
     LEFT JOIN courses c ON c.id = bt.course_id
     ORDER BY bt.created_at DESC`
  );
  res.json({ assignments: result.rows });
});

adminRouter.post("/trainer-assignments", async (req, res) => {
  const schema = z.object({
    trainerId: z.string().uuid(),
    batchId: z.string().uuid(),
    courseId: z.string().uuid().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const trainerCheck = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'trainer'", [parsed.data.trainerId]);
  if (!trainerCheck.rowCount) { res.status(404).json({ message: "Trainer not found" }); return; }

  const batchCheck = await pool.query("SELECT id FROM batches WHERE id = $1", [parsed.data.batchId]);
  if (!batchCheck.rowCount) { res.status(404).json({ message: "Batch not found" }); return; }

  if (parsed.data.courseId) {
    const courseCheck = await pool.query("SELECT id FROM courses WHERE id = $1", [parsed.data.courseId]);
    if (!courseCheck.rowCount) { res.status(404).json({ message: "Course not found" }); return; }
  }

  // Check for duplicates
  const existing = await pool.query(
    parsed.data.courseId
      ? `SELECT id FROM batch_trainers WHERE batch_id = $1 AND trainer_id = $2 AND course_id = $3`
      : `SELECT id FROM batch_trainers WHERE batch_id = $1 AND trainer_id = $2 AND course_id IS NULL`,
    parsed.data.courseId
      ? [parsed.data.batchId, parsed.data.trainerId, parsed.data.courseId]
      : [parsed.data.batchId, parsed.data.trainerId]
  );
  if (existing.rowCount) { res.status(409).json({ message: "This trainer assignment already exists" }); return; }

  const result = await pool.query(
    `INSERT INTO batch_trainers (batch_id, trainer_id, course_id) VALUES ($1, $2, $3) RETURNING id`,
    [parsed.data.batchId, parsed.data.trainerId, parsed.data.courseId ?? null]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.trainer.assignment.create", entityType: "batch_trainer", entityId: result.rows[0].id, metadata: parsed.data });
  res.status(201).json({ message: "Trainer assigned successfully", id: result.rows[0].id });
});

adminRouter.delete("/trainer-assignments/:id", async (req, res) => {
  const { id } = req.params;
  const removed = await pool.query("DELETE FROM batch_trainers WHERE id = $1 RETURNING id, batch_id, trainer_id, course_id", [id]);
  if (!removed.rowCount) { res.status(404).json({ message: "Assignment not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.trainer.assignment.delete", entityType: "batch_trainer", entityId: id, metadata: removed.rows[0] });
  res.json({ message: "Trainer assignment removed" });
});

// ── Video Hierarchy (Batch → Program → Course → Topic → Videos) ─────────────

adminRouter.get("/video-hierarchy/batch/:batchId/courses", async (req, res) => {
  const { batchId } = req.params;
  // Get courses assigned to this batch
  const result = await pool.query(
    `SELECT c.id, c.title FROM batch_courses bc
     INNER JOIN courses c ON c.id = bc.course_id
     WHERE bc.batch_id = $1 ORDER BY bc.sort_order, c.title`,
    [batchId]
  );
  // Also get batch info with program
  const batchResult = await pool.query(
    `SELECT b.id, b.name, b.program_id, p.title AS program_title
     FROM batches b LEFT JOIN programs p ON p.id = b.program_id WHERE b.id = $1`,
    [batchId]
  );
  res.json({ courses: result.rows, batch: batchResult.rows[0] ?? null });
});

// ── Credentials CRUD ────────────────────────────────────────────────────────

const credentialSchema = z.object({
  name: z.string().min(1).max(200),
  credentialType: z.enum(["postgresql", "aws", "snowflake", "mssql", "other"]),
  environment: z.string().max(100).optional(),
  host: z.string().max(500).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  databaseName: z.string().max(200).optional(),
  username: z.string().max(200).optional(),
  password: z.string().max(500).optional(),
  accessUrl: z.string().max(1000).optional(),
  region: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  expiryDate: z.string().optional(),
  allowTrainerView: z.boolean().optional(),
  allowStudentView: z.boolean().optional(),
});

adminRouter.get("/credentials", async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, u.email AS created_by_email
     FROM credentials c
     LEFT JOIN users u ON u.id = c.created_by
     ORDER BY c.created_at DESC`
  );
  // Mask passwords in response
  const rows = result.rows.map((r: Record<string, unknown>) => ({
    ...r,
    password_encrypted: r.password_encrypted ? "••••••••" : null
  }));
  res.json({ credentials: rows });
});

adminRouter.get("/credentials/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `SELECT c.*, u.email AS created_by_email FROM credentials c LEFT JOIN users u ON u.id = c.created_by WHERE c.id = $1`,
    [id]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Credential not found" }); return; }
  const row = result.rows[0];
  row.password_encrypted = row.password_encrypted ? "••••••••" : null;
  res.json({ credential: row });
});

adminRouter.post("/credentials", async (req, res) => {
  const parsed = credentialSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const result = await pool.query(
    `INSERT INTO credentials (name, credential_type, environment, host, port, database_name, username, password_encrypted, access_url, region, notes, is_active, expiry_date, allow_trainer_view, allow_student_view, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [d.name, d.credentialType, d.environment ?? null, d.host ?? null, d.port ?? null, d.databaseName ?? null,
     d.username ?? null, d.password ?? null, d.accessUrl ?? null, d.region ?? null, d.notes ?? null,
     d.isActive ?? true, d.expiryDate ?? null, d.allowTrainerView ?? false, d.allowStudentView ?? true, req.user!.id]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.credential.create", entityType: "credential", entityId: result.rows[0].id, metadata: { name: d.name, type: d.credentialType } });
  res.status(201).json({ message: "Credential created", id: result.rows[0].id });
});

adminRouter.put("/credentials/:id", async (req, res) => {
  const { id } = req.params;
  const parsed = credentialSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const existing = await pool.query("SELECT id FROM credentials WHERE id = $1", [id]);
  if (!existing.rowCount) { res.status(404).json({ message: "Credential not found" }); return; }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  const fieldMap: Record<string, string> = {
    name: "name", credentialType: "credential_type", environment: "environment", host: "host",
    port: "port", databaseName: "database_name", username: "username", password: "password_encrypted",
    accessUrl: "access_url", region: "region", notes: "notes", isActive: "is_active",
    expiryDate: "expiry_date", allowTrainerView: "allow_trainer_view", allowStudentView: "allow_student_view",
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if ((d as Record<string, unknown>)[key] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push((d as Record<string, unknown>)[key]);
    }
  }

  if (!sets.length) { res.status(400).json({ message: "No fields to update" }); return; }
  sets.push(`updated_at = NOW()`);
  vals.push(id);

  await pool.query(`UPDATE credentials SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.credential.update", entityType: "credential", entityId: id, metadata: d });
  res.json({ message: "Credential updated" });
});

adminRouter.delete("/credentials/:id", async (req, res) => {
  const { id } = req.params;
  const removed = await pool.query("DELETE FROM credentials WHERE id = $1 RETURNING id, name", [id]);
  if (!removed.rowCount) { res.status(404).json({ message: "Credential not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.credential.delete", entityType: "credential", entityId: id, metadata: { name: removed.rows[0].name } });
  res.json({ message: "Credential deleted" });
});

// Reveal password (audit-logged)
adminRouter.post("/credentials/:id/reveal", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query("SELECT password_encrypted FROM credentials WHERE id = $1", [id]);
  if (!result.rowCount) { res.status(404).json({ message: "Credential not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "admin.credential.reveal_password", entityType: "credential", entityId: id, metadata: {} });

  // Log to access_logs
  await pool.query(
    `INSERT INTO access_logs (user_id, resource_type, resource_id, action, ip_address) VALUES ($1, 'credential', $2, 'reveal_password', $3)`,
    [req.user!.id, id, req.ip]
  );

  res.json({ password: result.rows[0].password_encrypted });
});

// ── Credential Assignments ──────────────────────────────────────────────────

const credentialAssignSchema = z.object({
  credentialId: z.string().uuid(),
  batchId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
});

adminRouter.get("/credential-assignments", async (req, res) => {
  const result = await pool.query(
    `SELECT ca.*, c.name AS credential_name, c.credential_type,
            b.name AS batch_name, co.title AS course_title, p.title AS program_title
     FROM credential_assignments ca
     INNER JOIN credentials c ON c.id = ca.credential_id
     LEFT JOIN batches b ON b.id = ca.batch_id
     LEFT JOIN courses co ON co.id = ca.course_id
     LEFT JOIN programs p ON p.id = ca.program_id
     ORDER BY ca.created_at DESC`
  );
  res.json({ assignments: result.rows });
});

adminRouter.post("/credential-assignments", async (req, res) => {
  const parsed = credentialAssignSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const result = await pool.query(
    `INSERT INTO credential_assignments (credential_id, batch_id, course_id, program_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [d.credentialId, d.batchId ?? null, d.courseId ?? null, d.programId ?? null]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.credential.assign", entityType: "credential_assignment", entityId: result.rows[0].id, metadata: d });
  res.status(201).json({ message: "Credential assigned", id: result.rows[0].id });
});

adminRouter.delete("/credential-assignments/:id", async (req, res) => {
  const { id } = req.params;
  const removed = await pool.query("DELETE FROM credential_assignments WHERE id = $1 RETURNING *", [id]);
  if (!removed.rowCount) { res.status(404).json({ message: "Assignment not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.credential.unassign", entityType: "credential_assignment", entityId: id, metadata: removed.rows[0] });
  res.json({ message: "Credential assignment removed" });
});

// ── Course Materials CRUD ───────────────────────────────────────────────────

const materialSchema = z.object({
  title: z.string().min(1).max(300),
  materialType: z.enum(["pdf", "doc", "link", "sql", "zip", "other"]),
  programId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  url: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  displayOrder: z.number().int().optional(),
  viewOnly: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

adminRouter.get("/materials", async (req, res) => {
  const { batchId, courseId, programId } = req.query;
  let query = `SELECT m.*, u.email AS created_by_email,
                c.title AS course_title, p.title AS program_title, b.name AS batch_name, ct.title AS topic_title
               FROM course_materials m
               LEFT JOIN users u ON u.id = m.created_by
               LEFT JOIN courses c ON c.id = m.course_id
               LEFT JOIN programs p ON p.id = m.program_id
               LEFT JOIN batches b ON b.id = m.batch_id
               LEFT JOIN course_topics ct ON ct.id = m.topic_id`;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (batchId && typeof batchId === "string") { params.push(batchId); conditions.push(`m.batch_id = $${params.length}`); }
  if (courseId && typeof courseId === "string") { params.push(courseId); conditions.push(`m.course_id = $${params.length}`); }
  if (programId && typeof programId === "string") { params.push(programId); conditions.push(`m.program_id = $${params.length}`); }

  if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
  query += ` ORDER BY m.display_order, m.created_at DESC`;

  const result = await pool.query(query, params);
  res.json({ materials: result.rows });
});

adminRouter.get("/materials/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query("SELECT * FROM course_materials WHERE id = $1", [id]);
  if (!result.rowCount) { res.status(404).json({ message: "Material not found" }); return; }
  res.json({ material: result.rows[0] });
});

adminRouter.post("/materials", upload.single("file"), async (req, res) => {
  // Parse body fields from multipart form
  const body = {
    ...req.body,
    displayOrder: req.body.displayOrder ? Number(req.body.displayOrder) : undefined,
    viewOnly: req.body.viewOnly === "true" || req.body.viewOnly === true,
    isActive: req.body.isActive === undefined ? true : (req.body.isActive === "true" || req.body.isActive === true),
  };
  const parsed = materialSchema.safeParse(body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }
  const d = parsed.data;

  let s3Key: string | null = null;
  if (req.file) {
    const uploaded = await uploadBufferToS3({
      folder: "materials",
      fileName: req.file.originalname,
      contentType: req.file.mimetype || "application/octet-stream",
      data: req.file.buffer,
    });
    s3Key = uploaded.key;
  }

  const result = await pool.query(
    `INSERT INTO course_materials (title, material_type, program_id, batch_id, course_id, topic_id, s3_key, url, description, display_order, view_only, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [d.title, d.materialType, d.programId ?? null, d.batchId ?? null, d.courseId ?? null, d.topicId ?? null,
     s3Key, d.url ?? null, d.description ?? null, d.displayOrder ?? 0, d.viewOnly ?? true, d.isActive ?? true, req.user!.id]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.material.create", entityType: "course_material", entityId: result.rows[0].id, metadata: { title: d.title, type: d.materialType } });
  res.status(201).json({ message: "Material created", id: result.rows[0].id });
});

adminRouter.put("/materials/:id", upload.single("file"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await pool.query("SELECT id FROM course_materials WHERE id = $1", [id]);
  if (!existing.rowCount) { res.status(404).json({ message: "Material not found" }); return; }

  const body = {
    ...req.body,
    displayOrder: req.body.displayOrder ? Number(req.body.displayOrder) : undefined,
    viewOnly: req.body.viewOnly === undefined ? undefined : (req.body.viewOnly === "true" || req.body.viewOnly === true),
    isActive: req.body.isActive === undefined ? undefined : (req.body.isActive === "true" || req.body.isActive === true),
  };
  const parsed = materialSchema.partial().safeParse(body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }
  const d = parsed.data;

  let s3Key: string | undefined;
  if (req.file) {
    const uploaded = await uploadBufferToS3({
      folder: "materials",
      fileName: req.file.originalname,
      contentType: req.file.mimetype || "application/octet-stream",
      data: req.file.buffer,
    });
    s3Key = uploaded.key;
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  const fieldMap: Record<string, string> = {
    title: "title", materialType: "material_type", programId: "program_id", batchId: "batch_id",
    courseId: "course_id", topicId: "topic_id", url: "url", description: "description",
    displayOrder: "display_order", viewOnly: "view_only", isActive: "is_active",
  };
  for (const [key, col] of Object.entries(fieldMap)) {
    if ((d as Record<string, unknown>)[key] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push((d as Record<string, unknown>)[key]);
    }
  }
  if (s3Key) { sets.push(`s3_key = $${idx++}`); vals.push(s3Key); }
  if (!sets.length) { res.status(400).json({ message: "No fields to update" }); return; }
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  await pool.query(`UPDATE course_materials SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.material.update", entityType: "course_material", entityId: id, metadata: d });
  res.json({ message: "Material updated" });
});

adminRouter.delete("/materials/:id", async (req, res) => {
  const { id } = req.params;
  const removed = await pool.query("DELETE FROM course_materials WHERE id = $1 RETURNING id, title", [id]);
  if (!removed.rowCount) { res.status(404).json({ message: "Material not found" }); return; }
  await createAuditLog({ actorUserId: req.user!.id, action: "admin.material.delete", entityType: "course_material", entityId: id, metadata: { title: removed.rows[0].title } });
  res.json({ message: "Material deleted" });
});

// Serve material file (presigned URL for view-only / download)
adminRouter.get("/materials/:id/view", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query("SELECT s3_key, title, material_type FROM course_materials WHERE id = $1", [id]);
  if (!result.rowCount || !result.rows[0].s3_key) { res.status(404).json({ message: "Material file not found" }); return; }

  const url = await getPresignedUrl(result.rows[0].s3_key, 3600);

  await pool.query(
    `INSERT INTO access_logs (user_id, resource_type, resource_id, action, ip_address) VALUES ($1, 'material', $2, 'view', $3)`,
    [req.user!.id, id, req.ip]
  );

  res.json({ url, title: result.rows[0].title, materialType: result.rows[0].material_type });
});

// ── Access Logs ─────────────────────────────────────────────────────────────

adminRouter.get("/access-logs", async (req, res) => {
  const { resourceType, userId, limit: limitParam } = req.query;
  const queryLimit = Math.min(Number(limitParam) || 200, 1000);

  let query = `SELECT al.*, u.email AS user_email, u.full_name AS user_name
               FROM access_logs al
               LEFT JOIN users u ON u.id = al.user_id`;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (resourceType && typeof resourceType === "string") { params.push(resourceType); conditions.push(`al.resource_type = $${params.length}`); }
  if (userId && typeof userId === "string") { params.push(userId); conditions.push(`al.user_id = $${params.length}`); }

  if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
  params.push(queryLimit);
  query += ` ORDER BY al.created_at DESC LIMIT $${params.length}`;

  const result = await pool.query(query, params);
  res.json({ logs: result.rows });
});

// ── Clients CRUD ──────────────────────────────────────────────────────────────

const clientSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().max(500).optional(),
  website: z.string().url().max(500).optional(),
});

adminRouter.get("/clients", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM clients WHERE is_active = TRUE ORDER BY name"
  );
  res.json({ clients: result.rows });
});

adminRouter.post("/clients", async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `INSERT INTO clients (name, industry, description, logo_url, website, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [parsed.data.name, parsed.data.industry ?? null, parsed.data.description ?? null, parsed.data.logoUrl ?? null, parsed.data.website ?? null, req.user!.id]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "client.create", entityType: "client", entityId: result.rows[0].id });
  res.status(201).json({ client: result.rows[0] });
});

adminRouter.put("/clients/:id", async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `UPDATE clients SET name = $1, industry = $2, description = $3, logo_url = $4, website = $5, updated_at = NOW()
     WHERE id = $6 AND is_active = TRUE RETURNING *`,
    [parsed.data.name, parsed.data.industry ?? null, parsed.data.description ?? null, parsed.data.logoUrl ?? null, parsed.data.website ?? null, req.params.id]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Client not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "client.update", entityType: "client", entityId: req.params.id });
  res.json({ client: result.rows[0] });
});

adminRouter.delete("/clients/:id", async (req, res) => {
  const removed = await pool.query(
    "UPDATE clients SET is_active = FALSE WHERE id = $1 RETURNING id",
    [req.params.id]
  );
  if (!removed.rowCount) { res.status(404).json({ message: "Client not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "client.delete", entityType: "client", entityId: req.params.id });
  res.json({ message: "Client deleted" });
});

// ── Projects CRUD ─────────────────────────────────────────────────────────────

const projectSchema = z.object({
  title: z.string().min(1).max(300),
  clientId: z.string().uuid().optional(),
  description: z.string().max(5000).optional(),
  technologies: z.string().max(1000).optional(),
  domain: z.string().max(200).optional(),
});

adminRouter.get("/projects", async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, c.name AS client_name
     FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.is_active = TRUE
     ORDER BY p.created_at DESC`
  );
  res.json({ projects: result.rows });
});

adminRouter.post("/projects", async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `INSERT INTO projects (title, client_id, description, technologies, domain, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [parsed.data.title, parsed.data.clientId ?? null, parsed.data.description ?? null, parsed.data.technologies ?? null, parsed.data.domain ?? null, req.user!.id]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "project.create", entityType: "project", entityId: result.rows[0].id });
  res.status(201).json({ project: result.rows[0] });
});

adminRouter.put("/projects/:id", async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `UPDATE projects SET title = $1, client_id = $2, description = $3, technologies = $4, domain = $5, updated_at = NOW()
     WHERE id = $6 AND is_active = TRUE RETURNING *`,
    [parsed.data.title, parsed.data.clientId ?? null, parsed.data.description ?? null, parsed.data.technologies ?? null, parsed.data.domain ?? null, req.params.id]
  );
  if (!result.rowCount) { res.status(404).json({ message: "Project not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "project.update", entityType: "project", entityId: req.params.id });
  res.json({ project: result.rows[0] });
});

adminRouter.delete("/projects/:id", async (req, res) => {
  const removed = await pool.query(
    "UPDATE projects SET is_active = FALSE WHERE id = $1 RETURNING id",
    [req.params.id]
  );
  if (!removed.rowCount) { res.status(404).json({ message: "Project not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "project.delete", entityType: "project", entityId: req.params.id });
  res.json({ message: "Project deleted" });
});

// ── Student Project Assignment ────────────────────────────────────────────────

const assignProjectSchema = z.object({
  studentId: z.string().uuid(),
  projectId: z.string().uuid(),
  batchId: z.string().uuid().optional(),
  role: z.string().max(200).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().max(2000).optional(),
});

adminRouter.get("/student-projects", async (req, res) => {
  const result = await pool.query(
    `SELECT sp.*, u.full_name AS student_name, u.email AS student_email,
            p.title AS project_title, c.name AS client_name, b.name AS batch_name
     FROM student_projects sp
     INNER JOIN users u ON u.id = sp.student_id
     INNER JOIN projects p ON p.id = sp.project_id
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN batches b ON b.id = sp.batch_id
     ORDER BY sp.created_at DESC`
  );
  res.json({ studentProjects: result.rows });
});

adminRouter.post("/student-projects", async (req, res) => {
  const parsed = assignProjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const result = await pool.query(
    `INSERT INTO student_projects (student_id, project_id, batch_id, role, start_date, end_date, description, assigned_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (student_id, project_id) DO UPDATE
     SET role = EXCLUDED.role, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, description = EXCLUDED.description, batch_id = EXCLUDED.batch_id
     RETURNING *`,
    [
      parsed.data.studentId, parsed.data.projectId, parsed.data.batchId ?? null,
      parsed.data.role ?? null,
      parsed.data.startDate ? new Date(parsed.data.startDate).toISOString() : null,
      parsed.data.endDate ? new Date(parsed.data.endDate).toISOString() : null,
      parsed.data.description ?? null, req.user!.id,
    ]
  );
  await createAuditLog({ actorUserId: req.user!.id, action: "student_project.assign", entityType: "student_project", entityId: result.rows[0].id });
  res.status(201).json({ studentProject: result.rows[0] });
});

adminRouter.delete("/student-projects/:id", async (req, res) => {
  const removed = await pool.query("DELETE FROM student_projects WHERE id = $1 RETURNING id", [req.params.id]);
  if (!removed.rowCount) { res.status(404).json({ message: "Assignment not found" }); return; }

  await createAuditLog({ actorUserId: req.user!.id, action: "student_project.remove", entityType: "student_project", entityId: req.params.id });
  res.json({ message: "Project assignment removed" });
});

// ── Company / Site Settings ─────────────────────────────────────────────────

adminRouter.get("/company-settings", async (_req, res) => {
  const result = await pool.query("SELECT * FROM company_settings WHERE id = 1");
  res.json({ settings: result.rows[0] ?? null });
});

const companySettingsSchema = z.object({
  companyName: z.string().max(300).optional(),
  tagline: z.string().max(500).optional(),
  logoUrl: z.string().max(2000).optional(),
  faviconUrl: z.string().max(2000).optional(),
  addressLine1: z.string().max(500).optional(),
  addressLine2: z.string().max(500).optional(),
  city: z.string().max(200).optional(),
  state: z.string().max(200).optional(),
  country: z.string().max(200).optional(),
  zipCode: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(300).optional(),
  website: z.string().max(500).optional(),
  gstNumber: z.string().max(50).optional(),
  panNumber: z.string().max(30).optional(),
  supportEmail: z.string().max(300).optional(),
  socialLinkedin: z.string().max(500).optional(),
  socialTwitter: z.string().max(500).optional(),
  socialYoutube: z.string().max(500).optional(),
  socialInstagram: z.string().max(500).optional(),
  socialFacebook: z.string().max(500).optional(),
  footerText: z.string().max(1000).optional(),
  termsUrl: z.string().max(2000).optional(),
  privacyUrl: z.string().max(2000).optional(),
});

adminRouter.put("/company-settings", async (req, res) => {
  const parsed = companySettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const fieldMap: Record<string, string> = {
    companyName: "company_name", tagline: "tagline", logoUrl: "logo_url", faviconUrl: "favicon_url",
    addressLine1: "address_line1", addressLine2: "address_line2", city: "city", state: "state",
    country: "country", zipCode: "zip_code", phone: "phone", email: "email", website: "website",
    gstNumber: "gst_number", panNumber: "pan_number", supportEmail: "support_email",
    socialLinkedin: "social_linkedin", socialTwitter: "social_twitter", socialYoutube: "social_youtube",
    socialInstagram: "social_instagram", socialFacebook: "social_facebook",
    footerText: "footer_text", termsUrl: "terms_url", privacyUrl: "privacy_url",
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  for (const [key, col] of Object.entries(fieldMap)) {
    if ((d as Record<string, unknown>)[key] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push((d as Record<string, unknown>)[key]);
    }
  }

  if (!sets.length) { res.status(400).json({ message: "No fields to update" }); return; }

  sets.push(`updated_at = NOW()`);
  sets.push(`updated_by = $${idx++}`);
  vals.push(req.user!.id);

  await pool.query(`UPDATE company_settings SET ${sets.join(", ")} WHERE id = 1`, vals);

  await createAuditLog({ actorUserId: req.user!.id, action: "company_settings.update", entityType: "company_settings", metadata: d });

  const updated = await pool.query("SELECT * FROM company_settings WHERE id = 1");
  res.json({ settings: updated.rows[0] });
});
