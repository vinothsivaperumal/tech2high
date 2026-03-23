import React from "react";
import CalendarEvents from "../../../components/dashboard/CalendarEvents";

const StudentCalendarPage = () => (
  <div className="max-w-3xl mx-auto mt-8">
    <CalendarEvents fetchUrl="/api/student/events" />
  </div>
);

export default StudentCalendarPage;
