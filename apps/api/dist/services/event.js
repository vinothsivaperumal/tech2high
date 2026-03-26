"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvent = createEvent;
exports.updateEvent = updateEvent;
exports.deleteEvent = deleteEvent;
exports.listEvents = listEvents;
exports.getEvent = getEvent;
exports.assignParticipants = assignParticipants;
exports.listUserEvents = listUserEvents;
const client_1 = require("../db/client");
const uuid_1 = require("uuid");
async function createEvent({ title, description, startTime, endTime, meetingLink, createdBy }) {
    const result = await client_1.pool.query(`INSERT INTO events (id, title, description, start_time, end_time, meeting_link, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`, [(0, uuid_1.v4)(), title, description, startTime, endTime, meetingLink, createdBy]);
    return result.rows[0];
}
async function updateEvent({ eventId, title, description, startTime, endTime, meetingLink }) {
    const result = await client_1.pool.query(`UPDATE events SET title = $2, description = $3, start_time = $4, end_time = $5, meeting_link = $6, updated_at = NOW()
     WHERE id = $1 RETURNING *`, [eventId, title, description, startTime, endTime, meetingLink]);
    return result.rows[0];
}
async function deleteEvent(eventId) {
    await client_1.pool.query(`DELETE FROM events WHERE id = $1`, [eventId]);
}
async function listEvents() {
    const result = await client_1.pool.query(`SELECT * FROM events ORDER BY start_time DESC`);
    return result.rows;
}
async function getEvent(eventId) {
    const result = await client_1.pool.query(`SELECT * FROM events WHERE id = $1`, [eventId]);
    return result.rows[0];
}
async function assignParticipants(eventId, userIds, role) {
    const values = userIds.map((userId) => `('${(0, uuid_1.v4)()}', '${eventId}', '${userId}', '${role}')`).join(",");
    await client_1.pool.query(`INSERT INTO event_participants (id, event_id, user_id, role)
     VALUES ${values}
     ON CONFLICT (event_id, user_id) DO NOTHING`);
}
async function listUserEvents(userId) {
    const result = await client_1.pool.query(`SELECT e.*, ep.role AS participant_role, ep.status, ep.joined_at
     FROM events e
     INNER JOIN event_participants ep ON ep.event_id = e.id
     WHERE ep.user_id = $1
     ORDER BY e.start_time DESC`, [userId]);
    return result.rows;
}
