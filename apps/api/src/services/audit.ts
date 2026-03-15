import { pool } from "../db/client";

interface AuditLogInput {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(input: AuditLogInput): Promise<void> {
  const { actorUserId, action, entityType, entityId, metadata = {} } = input;

  await pool.query(
    `
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [actorUserId, action, entityType, entityId ?? null, JSON.stringify(metadata)]
  );
}
