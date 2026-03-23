"use client";
import React, { useEffect, useState } from "react";
import CalendarIcon from "../CalendarIcon";

export interface EventItem {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  meeting_link?: string;
  participant_role?: string;
  status?: string;
}

interface Props {
  fetchUrl: string;
  canManage?: boolean;
  onEdit?: (event: EventItem) => void;
  onDelete?: (eventId: string) => void;
}

const CalendarEvents: React.FC<Props> = ({ fetchUrl, canManage, onEdit, onDelete }) => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(fetchUrl, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setEvents(data.events || []))
      .finally(() => setLoading(false));
  }, [fetchUrl]);

  return (
    <div className="p-4">
      <h2 className="flex items-center gap-2 text-xl font-bold mb-4">
        <CalendarIcon /> Calendar & Events
      </h2>
      {loading ? (
        <div>Loading events...</div>
      ) : events.length === 0 ? (
        <div>No events found.</div>
      ) : (
        <ul className="space-y-4">
          {events.map((ev) => (
            <li key={ev.id} className="border rounded p-4 flex flex-col md:flex-row md:items-center md:justify-between bg-white shadow-sm">
              <div>
                <div className="font-semibold text-lg">{ev.title}</div>
                <div className="text-gray-600 text-sm mb-1">{new Date(ev.start_time).toLocaleString()} - {new Date(ev.end_time).toLocaleString()}</div>
                {ev.description && <div className="text-gray-700 mb-1">{ev.description}</div>}
                {ev.meeting_link && (
                  <a href={ev.meeting_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Join Meeting</a>
                )}
                {ev.participant_role && <div className="text-xs text-gray-500 mt-1">Role: {ev.participant_role}</div>}
              </div>
              {canManage && (
                <div className="flex gap-2 mt-2 md:mt-0">
                  <button className="px-3 py-1 bg-yellow-200 rounded" onClick={() => onEdit?.(ev)}>Edit</button>
                  <button className="px-3 py-1 bg-red-200 rounded" onClick={() => onDelete?.(ev.id)}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CalendarEvents;
