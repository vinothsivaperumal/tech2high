"use client";
import React, { useState, useMemo } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import CalendarEvents, { EventItem } from "../../../components/dashboard/CalendarEvents";

const AdminCalendarPage = () => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);

  // Handler for clicking a day on the calendar
  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setEditingEvent(null);
    setModalOpen(true);
  };

  // Handler for editing an event
  const handleEditEvent = (event: EventItem) => {
    setEditingEvent(event);
    setSelectedDate(new Date(event.start_time));
    setModalOpen(true);
  };

  // Handler for closing the modal
  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingEvent(null);
    setSelectedDate(null);
  };

  // Handler for deleting an event (to be implemented)
  const handleDeleteEvent = (eventId: string) => {
    // TODO: Implement delete logic
    alert("Delete event: " + eventId);
  };

  // Handler for saving an event (to be implemented)
  const handleSaveEvent = (event: Partial<EventItem>) => {
    // TODO: Implement add/edit logic
    alert("Save event: " + JSON.stringify(event));
    handleCloseModal();
  };

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <h2 className="text-2xl font-bold mb-4">Admin Calendar & Events</h2>
      <div className="flex flex-col md:flex-row gap-8">
        <div className="bg-white rounded shadow p-4 w-full md:w-1/2">
          <Calendar
            onClickDay={handleDayClick}
            value={selectedDate || new Date()}
            calendarType="iso8601"
          />
        </div>
        <div className="w-full md:w-1/2">
          <CalendarEvents
            fetchUrl="/api/admin/events"
            canManage
            onEdit={handleEditEvent}
            onDelete={handleDeleteEvent}
          />
        </div>
      </div>

      {/* Modal for add/edit event */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-500" onClick={handleCloseModal}>&times;</button>
            <h3 className="text-lg font-bold mb-2">{editingEvent ? "Edit Event" : "Add Event"}</h3>
            {/* Simple form for event details */}
            <form
              onSubmit={e => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const formData = new FormData(form);
                handleSaveEvent({
                  id: editingEvent?.id,
                  title: formData.get("title") as string,
                  description: formData.get("description") as string,
                  start_time: selectedDate ? selectedDate.toISOString() : new Date().toISOString(),
                  end_time: formData.get("end_time") as string,
                  meeting_link: formData.get("meeting_link") as string,
                });
              }}
            >
              <div className="mb-2">
                <label className="block font-medium">Title</label>
                <input name="title" defaultValue={editingEvent?.title || ""} required className="border rounded px-2 py-1 w-full" />
              </div>
              <div className="mb-2">
                <label className="block font-medium">Description</label>
                <textarea name="description" defaultValue={editingEvent?.description || ""} className="border rounded px-2 py-1 w-full" />
              </div>
              <div className="mb-2">
                <label className="block font-medium">Start Time</label>
                <input name="start_time" type="datetime-local" defaultValue={editingEvent ? editingEvent.start_time.slice(0, 16) : selectedDate ? selectedDate.toISOString().slice(0, 16) : ""} required className="border rounded px-2 py-1 w-full" />
              </div>
              <div className="mb-2">
                <label className="block font-medium">End Time</label>
                <input name="end_time" type="datetime-local" defaultValue={editingEvent ? editingEvent.end_time.slice(0, 16) : ""} required className="border rounded px-2 py-1 w-full" />
              </div>
              <div className="mb-2">
                <label className="block font-medium">Meeting Link</label>
                <input name="meeting_link" defaultValue={editingEvent?.meeting_link || ""} className="border rounded px-2 py-1 w-full" />
              </div>
              <div className="flex gap-2 mt-4">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">{editingEvent ? "Save Changes" : "Add Event"}</button>
                {editingEvent && (
                  <button type="button" className="bg-red-500 text-white px-4 py-2 rounded" onClick={() => handleDeleteEvent(editingEvent.id)}>Delete</button>
                )}
                <button type="button" className="bg-gray-300 px-4 py-2 rounded" onClick={handleCloseModal}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCalendarPage;
