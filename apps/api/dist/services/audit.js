"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = createAuditLog;
const client_1 = require("../db/client");
async function createAuditLog(input) {
    const { actorUserId, action, entityType, entityId, metadata = {} } = input;
    await client_1.pool.query(`
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1, $2, $3, $4, $5)
    `, [actorUserId, action, entityType, entityId ?? null, JSON.stringify(metadata)]);
}
