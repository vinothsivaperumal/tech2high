import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { requireAuth, requireRole } from "../middleware/auth";
import { createAuditLog } from "../services/audit";
import { pool } from "../db/client";
import { uploadBufferToS3 } from "../services/s3";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const batchSchema = z.object({
  name: z.string().min(2).max(120)
});

const assignmentSchema = z.object({
  title: z.string().min(2).max(120),
  instructions: z.string().max(5000).optional(),
  dueAt: z.string().datetime().optional()
});

export const trainerRouter = Router();

trainerRouter.use(requireAuth, requireRole(["trainer"]));

async function assertTrainerOwnsBatch(batchId: string, trainerId: string): Promise<boolean> {
  const result = await pool.query("SELECT id FROM batches WHERE id = $1 AND trainer_id = $2", [batchId, trainerId]);
  return Boolean(result.rowCount);
}

trainerRouter.get("/batches", async (req, res) => {
  const result = await pool.query(
    `
    SELECT id, name, created_at
    FROM batches
    WHERE trainer_id = $1
    ORDER BY created_at DESC
    `,
    [req.user!.id]
  );

  res.json({ batches: result.rows });
});

trainerRouter.post("/batches", async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    return;
  }

  const inserted = await pool.query(
    `
    INSERT INTO batches (name, trainer_id)
    VALUES ($1, $2)
    RETURNING id, name, trainer_id, created_at
    `,
    [parsed.data.name, req.user!.id]
  );

  const batch = inserted.rows[0];

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "batch.create",
    entityType: "batch",
    entityId: batch.id,
    metadata: { name: batch.name }
  });

  res.status(201).json({ batch });
});

trainerRouter.post("/batches/:batchId/students", async (req, res) => {
  const batchId = req.params.batchId;
  const bodySchema = z.object({ studentId: z.string().uuid() });
  const parsed = bodySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    return;
  }

  const owns = await assertTrainerOwnsBatch(batchId, req.user!.id);
  if (!owns) {
    res.status(404).json({ message: "Batch not found for trainer" });
    return;
  }

  const studentCheck = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'student'", [parsed.data.studentId]);
  if (!studentCheck.rowCount) {
    res.status(404).json({ message: "Student not found" });
    return;
  }

  await pool.query(
    `
    INSERT INTO batch_students (batch_id, student_id)
    VALUES ($1, $2)
    ON CONFLICT(batch_id, student_id) DO NOTHING
    `,
    [batchId, parsed.data.studentId]
  );

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "batch.student.add",
    entityType: "batch",
    entityId: batchId,
    metadata: { studentId: parsed.data.studentId }
  });

  res.status(201).json({ message: "Student assigned to batch" });
});

trainerRouter.post("/batches/:batchId/videos", upload.single("video"), async (req, res) => {
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

  const owns = await assertTrainerOwnsBatch(batchId, req.user!.id);
  if (!owns) {
    res.status(404).json({ message: "Batch not found for trainer" });
    return;
  }

  const uploaded = await uploadBufferToS3({
    folder: `videos/${batchId}`,
    fileName: req.file.originalname,
    contentType: req.file.mimetype || "video/mp4",
    data: req.file.buffer
  });

  const inserted = await pool.query(
    `
    INSERT INTO videos (batch_id, title, description, s3_key, uploaded_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, batch_id, title, description, s3_key, created_at
    `,
    [batchId, title, description || null, uploaded.key, req.user!.id]
  );

  const video = inserted.rows[0];

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "video.create",
    entityType: "video",
    entityId: video.id,
    metadata: { batchId, s3Key: uploaded.key }
  });

  res.status(201).json({ video });
});

trainerRouter.post("/batches/:batchId/assignments", async (req, res) => {
  const batchId = req.params.batchId;
  const parsed = assignmentSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    return;
  }

  const owns = await assertTrainerOwnsBatch(batchId, req.user!.id);
  if (!owns) {
    res.status(404).json({ message: "Batch not found for trainer" });
    return;
  }

  const inserted = await pool.query(
    `
    INSERT INTO assignments (batch_id, title, instructions, due_at, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, batch_id, title, instructions, due_at, created_at
    `,
    [
      batchId,
      parsed.data.title,
      parsed.data.instructions ?? null,
      parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null,
      req.user!.id
    ]
  );

  const assignment = inserted.rows[0];

  await createAuditLog({
    actorUserId: req.user!.id,
    action: "assignment.create",
    entityType: "assignment",
    entityId: assignment.id,
    metadata: { batchId }
  });

  res.status(201).json({ assignment });
});

trainerRouter.get("/batches/:batchId/submissions", async (req, res) => {
  const batchId = req.params.batchId;

  const owns = await assertTrainerOwnsBatch(batchId, req.user!.id);
  if (!owns) {
    res.status(404).json({ message: "Batch not found for trainer" });
    return;
  }

  const result = await pool.query(
    `
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
    `,
    [batchId]
  );

  res.json({ submissions: result.rows });
});
