import { pool } from "../db/client";
import { v4 as uuidv4 } from "uuid";

export async function createEvent({ title, description, startTime, endTime, meetingLink, createdBy }: {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  meetingLink: string;
  createdBy: string;
}): Promise<any> {
  const result = await pool.query(
    `INSERT INTO events (id, title, description, start_time, end_time, meeting_link, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uuidv4(), title, description, startTime, endTime, meetingLink, createdBy]
  );
  return result.rows[0];
}

export async function updateEvent({ eventId, title, description, startTime, endTime, meetingLink }: {
  eventId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  meetingLink: string;
}): Promise<any> {
  const result = await pool.query(
    `UPDATE events SET title = $2, description = $3, start_time = $4, end_time = $5, meeting_link = $6, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [eventId, title, description, startTime, endTime, meetingLink]
  );
  return result.rows[0];
}

export async function deleteEvent(eventId: string): Promise<void> {
  await pool.query(`DELETE FROM events WHERE id = $1`, [eventId]);
}

export async function listEvents(): Promise<any[]> {
  const result = await pool.query(`SELECT * FROM events ORDER BY start_time DESC`);
  return result.rows;
}

export async function getEvent(eventId: string): Promise<any> {
  const result = await pool.query(`SELECT * FROM events WHERE id = $1`, [eventId]);
  return result.rows[0];
}

export async function assignParticipants(eventId: string, userIds: string[], role: string): Promise<void> {
  const values = userIds.map((userId: string) => `('${uuidv4()}', '${eventId}', '${userId}', '${role}')`).join(",");
  await pool.query(
    `INSERT INTO event_participants (id, event_id, user_id, role)
     VALUES ${values}
     ON CONFLICT (event_id, user_id) DO NOTHING`
  );
}

export async function listUserEvents(userId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT e.*, ep.role AS participant_role, ep.status, ep.joined_at
     FROM events e
     INNER JOIN event_participants ep ON ep.event_id = e.id
     WHERE ep.user_id = $1
     ORDER BY e.start_time DESC`,
    [userId]
  );
  return result.rows;
}
