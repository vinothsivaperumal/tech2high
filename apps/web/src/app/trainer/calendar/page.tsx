import React from "react";
import CalendarEvents from "../../../components/dashboard/CalendarEvents";

const TrainerCalendarPage = () => (
  <div className="max-w-3xl mx-auto mt-8">
    <CalendarEvents fetchUrl="/api/trainer/events" />
  </div>
);

export default TrainerCalendarPage;
