"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainerRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../services/audit");
const client_1 = require("../db/client");
const s3_1 = require("../services/s3");
const email_1 = require("../services/email");
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const batchSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(120),
    zoomLink: zod_1.z.string().url().max(500).optional()
});
const assignmentSchema = zod_1.z.object({
    title: zod_1.z.string().min(2).max(120),
    instructions: zod_1.z.string().max(5000).optional(),
    dueAt: zod_1.z.string().datetime().optional()
});
exports.trainerRouter = (0, express_1.Router)();
exports.trainerRouter.use(auth_1.requireAuth, (0, auth_1.requireRole)(["trainer"]));
async function assertTrainerOwnsBatch(batchId, trainerId) {
    const result = await client_1.pool.query("SELECT id FROM batches WHERE id = $1 AND trainer_id = $2", [batchId, trainerId]);
    return Boolean(result.rowCount);
}
exports.trainerRouter.get("/batches", async (req, res) => {
    const result = await client_1.pool.query(`
    SELECT id, name, zoom_link, created_at
    FROM batches
    WHERE trainer_id = $1
    ORDER BY created_at DESC
    `, [req.user.id]);
    res.json({ batches: result.rows });
});
exports.trainerRouter.post("/batches", async (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const inserted = await client_1.pool.query(`
    INSERT INTO batches (name, trainer_id, zoom_link)
    VALUES ($1, $2, $3)
    RETURNING id, name, trainer_id, zoom_link, created_at
    `, [parsed.data.name, req.user.id, parsed.data.zoomLink ?? null]);
    const batch = inserted.rows[0];
    await (0, audit_1.createAuditLog)({
        actorUserId: req.user.id,
        action: "batch.create",
        entityType: "batch",
        entityId: batch.id,
        metadata: { name: batch.name }
    });
    res.status(201).json({ batch });
});
exports.trainerRouter.patch("/batches/:batchId/zoom-link", async (req, res) => {
    const { batchId } = req.params;
    const schema = zod_1.z.object({ zoomLink: zod_1.z.string().url().max(500).nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        return;
    }
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const result = await client_1.pool.query(`UPDATE batches SET zoom_link = $1 WHERE id = $2 RETURNING id, zoom_link`, [parsed.data.zoomLink, batchId]);
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "batch.zoom_link.update", entityType: "batch", entityId: batchId, metadata: { zoomLink: parsed.data.zoomLink } });
    res.json({ message: "Zoom link updated", zoomLink: result.rows[0].zoom_link });
});
exports.trainerRouter.post("/batches/:batchId/students", async (req, res) => {
    const batchId = req.params.batchId;
    const bodySchema = zod_1.z.object({ studentId: zod_1.z.string().uuid() });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const studentCheck = await client_1.pool.query("SELECT id FROM users WHERE id = $1 AND role = 'student'", [parsed.data.studentId]);
    if (!studentCheck.rowCount) {
        res.status(404).json({ message: "Student not found" });
        return;
    }
    await client_1.pool.query(`
    INSERT INTO batch_students (batch_id, student_id)
    VALUES ($1, $2)
    ON CONFLICT(batch_id, student_id) DO NOTHING
    `, [batchId, parsed.data.studentId]);
    await (0, audit_1.createAuditLog)({
        actorUserId: req.user.id,
        action: "batch.student.add",
        entityType: "batch",
        entityId: batchId,
        metadata: { studentId: parsed.data.studentId }
    });
    res.status(201).json({ message: "Student assigned to batch" });
});
exports.trainerRouter.post("/batches/:batchId/videos", upload.single("video"), async (req, res) => {
    const batchId = String(req.params.batchId);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    if (!title) {
        res.status(400).json({ message: "Video title is required" });
        return;
    }
    if (!req.file) {
        res.status(400).json({ message: "Video file is required" });
        return;
    }
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const uploaded = await (0, s3_1.uploadBufferToS3)({
        folder: `videos/${batchId}`,
        fileName: req.file.originalname,
        contentType: req.file.mimetype || "video/mp4",
        data: req.file.buffer
    });
    const inserted = await client_1.pool.query(`
    INSERT INTO videos (batch_id, title, description, s3_key, uploaded_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, batch_id, title, description, s3_key, created_at
    `, [batchId, title, description || null, uploaded.key, req.user.id]);
    const video = inserted.rows[0];
    await (0, audit_1.createAuditLog)({
        actorUserId: req.user.id,
        action: "video.create",
        entityType: "video",
        entityId: video.id,
        metadata: { batchId, s3Key: uploaded.key }
    });
    res.status(201).json({ video });
});
exports.trainerRouter.post("/batches/:batchId/assignments", async (req, res) => {
    const batchId = req.params.batchId;
    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const inserted = await client_1.pool.query(`
    INSERT INTO assignments (batch_id, title, instructions, due_at, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, batch_id, title, instructions, due_at, created_at
    `, [
        batchId,
        parsed.data.title,
        parsed.data.instructions ?? null,
        parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null,
        req.user.id
    ]);
    const assignment = inserted.rows[0];
    await (0, audit_1.createAuditLog)({
        actorUserId: req.user.id,
        action: "assignment.create",
        entityType: "assignment",
        entityId: assignment.id,
        metadata: { batchId }
    });
    res.status(201).json({ assignment });
});
exports.trainerRouter.get("/batches/:batchId/submissions", async (req, res) => {
    const batchId = req.params.batchId;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const result = await client_1.pool.query(`
    SELECT
      s.id,
      s.assignment_id,
      a.title AS assignment_title,
      s.student_id,
      u.email AS student_email,
      s.file_name,
      s.file_key,
      s.file_type,
      s.submitted_at
    FROM assignment_submissions s
    INNER JOIN assignments a ON a.id = s.assignment_id
    INNER JOIN users u ON u.id = s.student_id
    WHERE a.batch_id = $1
    ORDER BY s.submitted_at DESC
    `, [batchId]);
    res.json({ submissions: result.rows });
});
// ── Trainer Batch Insights ───────────────────────────────────────────────────
exports.trainerRouter.get("/batches/:batchId/insights", async (req, res) => {
    const { batchId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const [studentsR, assignmentsR, videosR, materialsR, submissionsR] = await Promise.all([
        client_1.pool.query("SELECT COUNT(*)::int AS c FROM batch_students WHERE batch_id = $1", [batchId]),
        client_1.pool.query("SELECT COUNT(*)::int AS c FROM assignments WHERE batch_id = $1", [batchId]),
        client_1.pool.query("SELECT COUNT(*)::int AS c FROM videos WHERE batch_id = $1", [batchId]),
        client_1.pool.query("SELECT COUNT(*)::int AS c FROM course_materials WHERE batch_id = $1 AND is_active = TRUE", [batchId]),
        client_1.pool.query(`SELECT COUNT(*)::int AS c FROM assignment_submissions s
       INNER JOIN assignments a ON a.id = s.assignment_id WHERE a.batch_id = $1`, [batchId]),
    ]);
    res.json({
        students: studentsR.rows[0].c,
        assignments: assignmentsR.rows[0].c,
        videos: videosR.rows[0].c,
        materials: materialsR.rows[0].c,
        submissions: submissionsR.rows[0].c,
    });
});
// ── Trainer Assignment Management ───────────────────────────────────────────
exports.trainerRouter.get("/batches/:batchId/assignments", async (req, res) => {
    const { batchId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const result = await client_1.pool.query(`SELECT a.id, a.title, a.instructions, a.due_at, a.created_at,
            (SELECT COUNT(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count
     FROM assignments a WHERE a.batch_id = $1 ORDER BY a.created_at DESC`, [batchId]);
    res.json({ assignments: result.rows });
});
exports.trainerRouter.put("/batches/:batchId/assignments/:assignmentId", async (req, res) => {
    const { batchId, assignmentId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        return;
    }
    const result = await client_1.pool.query(`UPDATE assignments SET title = $1, instructions = $2, due_at = $3
     WHERE id = $4 AND batch_id = $5
     RETURNING id, title, instructions, due_at, created_at`, [parsed.data.title, parsed.data.instructions ?? null, parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null, assignmentId, batchId]);
    if (!result.rowCount) {
        res.status(404).json({ message: "Assignment not found" });
        return;
    }
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "assignment.update", entityType: "assignment", entityId: assignmentId, metadata: { batchId } });
    res.json({ assignment: result.rows[0] });
});
exports.trainerRouter.delete("/batches/:batchId/assignments/:assignmentId", async (req, res) => {
    const { batchId, assignmentId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const removed = await client_1.pool.query("DELETE FROM assignments WHERE id = $1 AND batch_id = $2 RETURNING id", [assignmentId, batchId]);
    if (!removed.rowCount) {
        res.status(404).json({ message: "Assignment not found" });
        return;
    }
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "assignment.delete", entityType: "assignment", entityId: assignmentId, metadata: { batchId } });
    res.json({ message: "Assignment deleted" });
});
// ── Trainer Batch Video Management (YouTube) ────────────────────────────────
exports.trainerRouter.get("/batches/:batchId/batch-videos", async (req, res) => {
    const { batchId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const result = await client_1.pool.query(`SELECT id, title, description, youtube_url, created_at
     FROM videos WHERE batch_id = $1 AND youtube_url IS NOT NULL AND youtube_url != ''
     ORDER BY created_at DESC`, [batchId]);
    res.json({ videos: result.rows });
});
const batchVideoSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(300),
    youtubeUrl: zod_1.z.string().url().max(500),
    description: zod_1.z.string().max(1000).optional(),
});
exports.trainerRouter.post("/batches/:batchId/batch-videos", async (req, res) => {
    const { batchId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const parsed = batchVideoSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        return;
    }
    const result = await client_1.pool.query(`INSERT INTO videos (batch_id, title, description, youtube_url, s3_key, uploaded_by)
     VALUES ($1, $2, $3, $4, '', $5)
     RETURNING id, title, description, youtube_url, created_at`, [batchId, parsed.data.title, parsed.data.description ?? null, parsed.data.youtubeUrl, req.user.id]);
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "batch_video.create", entityType: "video", entityId: result.rows[0].id, metadata: { batchId } });
    res.status(201).json({ video: result.rows[0] });
});
exports.trainerRouter.put("/batches/:batchId/batch-videos/:videoId", async (req, res) => {
    const { batchId, videoId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const parsed = batchVideoSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        return;
    }
    const result = await client_1.pool.query(`UPDATE videos SET title = $1, description = $2, youtube_url = $3
     WHERE id = $4 AND batch_id = $5
     RETURNING id, title, description, youtube_url, created_at`, [parsed.data.title, parsed.data.description ?? null, parsed.data.youtubeUrl, videoId, batchId]);
    if (!result.rowCount) {
        res.status(404).json({ message: "Video not found" });
        return;
    }
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "batch_video.update", entityType: "video", entityId: videoId, metadata: { batchId } });
    res.json({ video: result.rows[0] });
});
exports.trainerRouter.delete("/batches/:batchId/batch-videos/:videoId", async (req, res) => {
    const { batchId, videoId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const removed = await client_1.pool.query("DELETE FROM videos WHERE id = $1 AND batch_id = $2 RETURNING id", [videoId, batchId]);
    if (!removed.rowCount) {
        res.status(404).json({ message: "Video not found" });
        return;
    }
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "batch_video.delete", entityType: "video", entityId: videoId, metadata: { batchId } });
    res.json({ message: "Video deleted" });
});
// ── Trainer Batch Materials Management ──────────────────────────────────────
exports.trainerRouter.get("/batches/:batchId/materials", async (req, res) => {
    const { batchId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const result = await client_1.pool.query(`SELECT m.id, m.title, m.material_type, m.description, m.url, m.s3_key, m.view_only,
            m.display_order, m.course_id, m.topic_id, m.is_active,
            c.title AS course_title, ct.title AS topic_title
     FROM course_materials m
     LEFT JOIN courses c ON c.id = m.course_id
     LEFT JOIN course_topics ct ON ct.id = m.topic_id
     WHERE m.batch_id = $1 AND m.is_active = TRUE
     ORDER BY m.display_order, m.created_at DESC`, [batchId]);
    res.json({ materials: result.rows });
});
const trainerMaterialSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(300),
    materialType: zod_1.z.enum(["pdf", "doc", "link", "sql", "zip", "other"]),
    courseId: zod_1.z.string().uuid().optional(),
    topicId: zod_1.z.string().uuid().optional(),
    description: zod_1.z.string().max(1000).optional(),
    url: zod_1.z.string().url().max(500).optional(),
    displayOrder: zod_1.z.number().int().min(0).default(0),
    viewOnly: zod_1.z.boolean().default(true),
});
exports.trainerRouter.post("/batches/:batchId/materials", upload.single("file"), async (req, res) => {
    const batchId = req.params.batchId;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const parsed = trainerMaterialSchema.safeParse({
        ...req.body,
        displayOrder: req.body.displayOrder ? Number(req.body.displayOrder) : 0,
        viewOnly: req.body.viewOnly === "true" || req.body.viewOnly === true,
    });
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        return;
    }
    let s3Key = null;
    if (req.file) {
        const uploaded = await (0, s3_1.uploadBufferToS3)({
            folder: `materials/${batchId}`,
            fileName: req.file.originalname,
            contentType: req.file.mimetype,
            data: req.file.buffer,
        });
        s3Key = uploaded.key;
    }
    const result = await client_1.pool.query(`INSERT INTO course_materials (title, batch_id, course_id, topic_id, material_type, s3_key, url, description, display_order, view_only, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, title, material_type, description, url, s3_key, display_order, view_only, course_id, topic_id, created_at`, [
        parsed.data.title, batchId,
        parsed.data.courseId ?? null, parsed.data.topicId ?? null,
        parsed.data.materialType, s3Key, parsed.data.url ?? null,
        parsed.data.description ?? null, parsed.data.displayOrder,
        parsed.data.viewOnly, req.user.id,
    ]);
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "batch_material.create", entityType: "material", entityId: result.rows[0].id, metadata: { batchId } });
    res.status(201).json({ material: result.rows[0] });
});
exports.trainerRouter.put("/batches/:batchId/materials/:materialId", async (req, res) => {
    const { batchId, materialId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const parsed = trainerMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        return;
    }
    const result = await client_1.pool.query(`UPDATE course_materials SET title = $1, material_type = $2, course_id = $3, topic_id = $4,
     description = $5, url = $6, display_order = $7, view_only = $8, updated_at = NOW()
     WHERE id = $9 AND batch_id = $10
     RETURNING id, title, material_type, description, url, s3_key, display_order, view_only, course_id, topic_id, created_at`, [
        parsed.data.title, parsed.data.materialType,
        parsed.data.courseId ?? null, parsed.data.topicId ?? null,
        parsed.data.description ?? null, parsed.data.url ?? null,
        parsed.data.displayOrder, parsed.data.viewOnly,
        materialId, batchId,
    ]);
    if (!result.rowCount) {
        res.status(404).json({ message: "Material not found" });
        return;
    }
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "batch_material.update", entityType: "material", entityId: materialId, metadata: { batchId } });
    res.json({ material: result.rows[0] });
});
exports.trainerRouter.delete("/batches/:batchId/materials/:materialId", async (req, res) => {
    const { batchId, materialId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const removed = await client_1.pool.query("UPDATE course_materials SET is_active = FALSE WHERE id = $1 AND batch_id = $2 RETURNING id", [materialId, batchId]);
    if (!removed.rowCount) {
        res.status(404).json({ message: "Material not found" });
        return;
    }
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "batch_material.delete", entityType: "material", entityId: materialId, metadata: { batchId } });
    res.json({ message: "Material deleted" });
});
// ── Trainer Batch Courses ───────────────────────────────────────────────────
exports.trainerRouter.get("/batches/:batchId/courses", async (req, res) => {
    const { batchId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const result = await client_1.pool.query(`SELECT c.id, c.title, c.description, bc.sort_order
     FROM batch_courses bc
     INNER JOIN courses c ON c.id = bc.course_id
     WHERE bc.batch_id = $1 AND c.is_active = TRUE
     ORDER BY bc.sort_order, c.title`, [batchId]);
    res.json({ courses: result.rows });
});
// ── Notifications ────────────────────────────────────────────────────────────
const trainerNotifSchema = zod_1.z.object({
    subject: zod_1.z.string().min(1).max(300),
    message: zod_1.z.string().min(1).max(5000),
    batchId: zod_1.z.string().uuid().optional()
});
exports.trainerRouter.get("/notifications", async (req, res) => {
    const result = await client_1.pool.query(`SELECT n.id, n.from_user_id, n.subject, n.message, n.is_read, n.created_at,
            u.email AS from_email, u.full_name AS from_name
     FROM notifications n
     LEFT JOIN users u ON u.id = n.from_user_id
     WHERE n.to_user_id = $1 OR n.to_role = 'trainer'
     ORDER BY n.created_at DESC
     LIMIT 100`, [req.user.id]);
    res.json({ notifications: result.rows });
});
exports.trainerRouter.post("/notifications", async (req, res) => {
    const parsed = trainerNotifSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        return;
    }
    const { subject, message, batchId } = parsed.data;
    const senderResult = await client_1.pool.query("SELECT full_name, email FROM users WHERE id = $1", [req.user.id]);
    const senderName = senderResult.rows[0]?.full_name || senderResult.rows[0]?.email || "Trainer";
    if (batchId) {
        // Send to all students in the batch
        const students = await client_1.pool.query(`SELECT u.id, u.email FROM users u INNER JOIN batch_students bs ON bs.student_id = u.id WHERE bs.batch_id = $1`, [batchId]);
        for (const s of students.rows) {
            await client_1.pool.query(`INSERT INTO notifications (from_user_id, to_user_id, to_role, subject, message) VALUES ($1, $2, 'student', $3, $4)`, [req.user.id, s.id, subject, message]);
            void (0, email_1.sendNotificationEmail)({ to: s.email, subject, message, fromName: senderName }).catch(() => { });
        }
        res.status(201).json({ message: `Notification sent to ${students.rowCount} student(s) in batch` });
    }
    else {
        // Send to admins
        const admins = await client_1.pool.query("SELECT id, email FROM users WHERE role = 'admin'");
        for (const admin of admins.rows) {
            await client_1.pool.query(`INSERT INTO notifications (from_user_id, to_user_id, to_role, subject, message) VALUES ($1, $2, 'admin', $3, $4)`, [req.user.id, admin.id, subject, message]);
            void (0, email_1.sendNotificationEmail)({ to: admin.email, subject, message, fromName: senderName }).catch(() => { });
        }
        res.status(201).json({ message: "Notification sent to admin(s)" });
    }
});
exports.trainerRouter.patch("/notifications/:notifId/read", async (req, res) => {
    const { notifId } = req.params;
    await client_1.pool.query("UPDATE notifications SET is_read = TRUE WHERE id = $1", [notifId]);
    res.json({ message: "Marked as read" });
});
// ── Batch Students List (trainer view) ─────────────────────────────────────
exports.trainerRouter.get("/batches/:batchId/students", async (req, res) => {
    const { batchId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const result = await client_1.pool.query(`SELECT u.id, u.email, u.full_name, u.phone, u.is_active, bs.created_at AS enrolled_at
     FROM users u
     INNER JOIN batch_students bs ON bs.student_id = u.id
     WHERE bs.batch_id = $1 AND u.deleted_at IS NULL
     ORDER BY u.full_name`, [batchId]);
    res.json({ students: result.rows });
});
// ── Trainer's Courses ─────────────────────────────────────────────────────
exports.trainerRouter.get("/courses", async (req, res) => {
    const result = await client_1.pool.query(`SELECT DISTINCT c.id, c.title, c.description, c.course_code, c.duration, c.level, c.is_active
     FROM courses c
     INNER JOIN batch_courses bc ON bc.course_id = c.id
     INNER JOIN batches b ON b.id = bc.batch_id
     WHERE b.trainer_id = $1 AND c.is_active = TRUE
     ORDER BY c.title`, [req.user.id]);
    res.json({ courses: result.rows });
});
exports.trainerRouter.get("/courses/:courseId/topics", async (req, res) => {
    const { courseId } = req.params;
    const topicsResult = await client_1.pool.query("SELECT id, title, sort_order FROM course_topics WHERE course_id = $1 ORDER BY sort_order, created_at", [courseId]);
    const videosResult = await client_1.pool.query(`SELECT cv.id, cv.topic_id, cv.title, cv.youtube_url, cv.sort_order
     FROM course_videos cv
     INNER JOIN course_topics ct ON ct.id = cv.topic_id
     WHERE ct.course_id = $1 ORDER BY cv.sort_order, cv.created_at`, [courseId]);
    const byTopic = {};
    for (const v of videosResult.rows) {
        if (!byTopic[v.topic_id])
            byTopic[v.topic_id] = [];
        byTopic[v.topic_id].push(v);
    }
    const topics = topicsResult.rows.map((t) => ({ ...t, videos: byTopic[t.id] ?? [] }));
    res.json({ topics });
});
// ── Trainer Dashboard Stats ─────────────────────────────────────────────────
exports.trainerRouter.get("/dashboard-stats", async (req, res) => {
    const [batches, students, courses] = await Promise.all([
        client_1.pool.query("SELECT COUNT(*)::int AS c FROM batches WHERE trainer_id = $1", [req.user.id]),
        client_1.pool.query(`SELECT COUNT(DISTINCT bs.student_id)::int AS c FROM batch_students bs INNER JOIN batches b ON b.id = bs.batch_id WHERE b.trainer_id = $1`, [req.user.id]),
        client_1.pool.query(`SELECT COUNT(DISTINCT bc.course_id)::int AS c FROM batch_courses bc INNER JOIN batches b ON b.id = bc.batch_id WHERE b.trainer_id = $1`, [req.user.id])
    ]);
    res.json({ totalBatches: batches.rows[0].c, totalStudents: students.rows[0].c, totalCourses: courses.rows[0].c });
});
// ── Trainer Credentials (view-only, filtered by assigned batches) ───────────
exports.trainerRouter.get("/credentials", async (req, res) => {
    const result = await client_1.pool.query(`SELECT DISTINCT c.id, c.name, c.credential_type, c.environment, c.host, c.port,
            c.database_name, c.username, c.access_url, c.region, c.notes, c.expiry_date,
            ca.batch_id, b.name AS batch_name, ca.course_id, co.title AS course_title
     FROM credentials c
     INNER JOIN credential_assignments ca ON ca.credential_id = c.id
     INNER JOIN batch_trainers bt ON bt.batch_id = ca.batch_id
     LEFT JOIN batches b ON b.id = ca.batch_id
     LEFT JOIN courses co ON co.id = ca.course_id
     WHERE bt.trainer_id = $1 AND c.is_active = TRUE AND c.allow_trainer_view = TRUE
     ORDER BY c.name`, [req.user.id]);
    await client_1.pool.query(`INSERT INTO access_logs (user_id, resource_type, resource_id, action, ip_address) VALUES ($1, 'credential', NULL, 'list_view', $2)`, [req.user.id, req.ip]);
    const rows = result.rows.map((r) => ({ ...r, password: "••••••••" }));
    res.json({ credentials: rows });
});
exports.trainerRouter.post("/credentials/:id/reveal", async (req, res) => {
    const { id } = req.params;
    const access = await client_1.pool.query(`SELECT c.password_encrypted FROM credentials c
     INNER JOIN credential_assignments ca ON ca.credential_id = c.id
     INNER JOIN batch_trainers bt ON bt.batch_id = ca.batch_id
     WHERE c.id = $1 AND bt.trainer_id = $2 AND c.is_active = TRUE AND c.allow_trainer_view = TRUE
     LIMIT 1`, [id, req.user.id]);
    if (!access.rowCount) {
        res.status(403).json({ message: "Access denied" });
        return;
    }
    await client_1.pool.query(`INSERT INTO access_logs (user_id, resource_type, resource_id, action, ip_address) VALUES ($1, 'credential', $2, 'reveal_password', $3)`, [req.user.id, id, req.ip]);
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "trainer.credential.reveal_password", entityType: "credential", entityId: id, metadata: {} });
    res.json({ password: access.rows[0].password_encrypted });
});
// ── Trainer Course Materials ────────────────────────────────────────────────
exports.trainerRouter.get("/materials", async (req, res) => {
    const { courseId, batchId } = req.query;
    let query = `SELECT DISTINCT m.id, m.title, m.material_type, m.description, m.url, m.view_only,
                m.display_order, m.course_id, m.batch_id, m.topic_id,
                c.title AS course_title, ct.title AS topic_title, b.name AS batch_name
               FROM course_materials m
               INNER JOIN batch_trainers bt ON bt.batch_id = m.batch_id
               LEFT JOIN courses c ON c.id = m.course_id
               LEFT JOIN course_topics ct ON ct.id = m.topic_id
               LEFT JOIN batches b ON b.id = m.batch_id
               WHERE bt.trainer_id = $1 AND m.is_active = TRUE`;
    const params = [req.user.id];
    if (courseId && typeof courseId === "string") {
        params.push(courseId);
        query += ` AND m.course_id = $${params.length}`;
    }
    if (batchId && typeof batchId === "string") {
        params.push(batchId);
        query += ` AND m.batch_id = $${params.length}`;
    }
    query += ` ORDER BY m.display_order, m.created_at DESC`;
    const result = await client_1.pool.query(query, params);
    res.json({ materials: result.rows });
});
exports.trainerRouter.get("/materials/:id/view", async (req, res) => {
    const { id } = req.params;
    const result = await client_1.pool.query(`SELECT m.s3_key, m.title, m.material_type, m.view_only FROM course_materials m
     INNER JOIN batch_trainers bt ON bt.batch_id = m.batch_id
     WHERE m.id = $1 AND bt.trainer_id = $2 AND m.is_active = TRUE
     LIMIT 1`, [id, req.user.id]);
    if (!result.rowCount || !result.rows[0].s3_key) {
        res.status(404).json({ message: "Material not found" });
        return;
    }
    const url = await (0, s3_1.getPresignedUrl)(result.rows[0].s3_key, 3600);
    await client_1.pool.query(`INSERT INTO access_logs (user_id, resource_type, resource_id, action, ip_address) VALUES ($1, 'material', $2, 'view', $3)`, [req.user.id, id, req.ip]);
    res.json({ url, title: result.rows[0].title, materialType: result.rows[0].material_type, viewOnly: result.rows[0].view_only });
});
// ── Trainer Project Assignment ──────────────────────────────────────────────
exports.trainerRouter.get("/projects", async (_req, res) => {
    const result = await client_1.pool.query(`SELECT p.id, p.title, p.description, p.technologies, p.domain, c.name AS client_name
     FROM projects p LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.is_active = TRUE ORDER BY p.title`);
    res.json({ projects: result.rows });
});
exports.trainerRouter.get("/batches/:batchId/student-projects", async (req, res) => {
    const { batchId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const result = await client_1.pool.query(`SELECT sp.*, u.full_name AS student_name, u.email AS student_email,
            p.title AS project_title, p.technologies, c.name AS client_name
     FROM student_projects sp
     INNER JOIN users u ON u.id = sp.student_id
     INNER JOIN projects p ON p.id = sp.project_id
     LEFT JOIN clients c ON c.id = p.client_id
     WHERE sp.batch_id = $1
     ORDER BY sp.created_at DESC`, [batchId]);
    res.json({ studentProjects: result.rows });
});
const trainerAssignProjectSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(),
    projectId: zod_1.z.string().uuid(),
    role: zod_1.z.string().max(200).optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    description: zod_1.z.string().max(2000).optional(),
});
exports.trainerRouter.post("/batches/:batchId/student-projects", async (req, res) => {
    const { batchId } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const parsed = trainerAssignProjectSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        return;
    }
    // Verify student is in this batch
    const inBatch = await client_1.pool.query("SELECT 1 FROM batch_students WHERE batch_id = $1 AND student_id = $2", [batchId, parsed.data.studentId]);
    if (!inBatch.rowCount) {
        res.status(400).json({ message: "Student not in this batch" });
        return;
    }
    const result = await client_1.pool.query(`INSERT INTO student_projects (student_id, project_id, batch_id, role, start_date, end_date, description, assigned_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (student_id, project_id) DO UPDATE
     SET role = EXCLUDED.role, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, description = EXCLUDED.description
     RETURNING *`, [
        parsed.data.studentId, parsed.data.projectId, batchId,
        parsed.data.role ?? null,
        parsed.data.startDate ? new Date(parsed.data.startDate).toISOString() : null,
        parsed.data.endDate ? new Date(parsed.data.endDate).toISOString() : null,
        parsed.data.description ?? null, req.user.id,
    ]);
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "student_project.assign", entityType: "student_project", entityId: result.rows[0].id, metadata: { batchId } });
    res.status(201).json({ studentProject: result.rows[0] });
});
exports.trainerRouter.delete("/batches/:batchId/student-projects/:id", async (req, res) => {
    const { batchId, id } = req.params;
    const owns = await assertTrainerOwnsBatch(batchId, req.user.id);
    if (!owns) {
        res.status(404).json({ message: "Batch not found for trainer" });
        return;
    }
    const removed = await client_1.pool.query("DELETE FROM student_projects WHERE id = $1 AND batch_id = $2 RETURNING id", [id, batchId]);
    if (!removed.rowCount) {
        res.status(404).json({ message: "Assignment not found" });
        return;
    }
    await (0, audit_1.createAuditLog)({ actorUserId: req.user.id, action: "student_project.remove", entityType: "student_project", entityId: id, metadata: { batchId } });
    res.json({ message: "Project assignment removed" });
});
