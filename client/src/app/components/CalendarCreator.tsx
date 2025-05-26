"use client";

import React, { useState } from "react";
import Image from "next/image";
import YearlyCalendarGrid from "./YearlyCalendarGrid";
import { exportCalendarToPDF } from "../utils/pdfExport";

const currentYear = new Date().getFullYear();
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function CalendarCreator() {
  const [year, setYear] = useState(currentYear);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([months[0]]);
  const [events, setEvents] = useState<{ date: string; title: string }[]>([]);
  const [eventInput, setEventInput] = useState({ date: "", title: "" });
  const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>();

  const handleMonthToggle = (month: string) => {
    setSelectedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
    );
  };

  const handleEventInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEventInput({ ...eventInput, [e.target.name]: e.target.value });
  };

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (eventInput.date && eventInput.title) {
      setEvents([...events, eventInput]);
      setEventInput({ date: "", title: "" });
    }
  };

  const handleRemoveEvent = (idx: number) => {
    setEvents(events.filter((_, i) => i !== idx));
  };
  const handleReset = () => {
    setYear(currentYear);
    setSelectedMonths([months[0]]);
    setEvents([]);
    setEventInput({ date: "", title: "" });
    setBackgroundUrl(undefined);
  };

  const handleExportPDF = async () => {
    const pdfBytes = await exportCalendarToPDF({
      year,
      selectedMonths,
      events,
      backgroundUrl,
    });
    const safeBytes = new Uint8Array(pdfBytes);
    const blob = new Blob([safeBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${year}-calendar.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h2>Create Your Calendar</h2>
      <hr style={{ margin: "16px 0" }} />
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="calendar-year">
          <strong>Year:</strong>
        </label>
        <input
          id="calendar-year"
          type="number"
          value={year}
          min={currentYear - 5}
          max={currentYear + 5}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ marginLeft: 8, width: 100 }}
        />
        <span style={{ marginLeft: 12, color: "#888", fontSize: 12 }}>
          (Choose a year between {currentYear - 5} and {currentYear + 5})
        </span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <strong>Select Months:</strong>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}
        >
          {months.map((month) => (
            <label key={month} style={{ minWidth: 90 }}>
              <input
                type="checkbox"
                checked={selectedMonths.includes(month)}
                onChange={() => handleMonthToggle(month)}
                aria-checked={selectedMonths.includes(month)}
                aria-label={month}
              />
              {month}
            </label>
          ))}
        </div>
        {selectedMonths.length === 0 && (
          <div style={{ color: "#b00", fontSize: 13, marginTop: 4 }}>
            Please select at least one month.
          </div>
        )}
      </div>
      <hr style={{ margin: "16px 0" }} />
      <div style={{ marginBottom: 16 }}>
        <strong>Add Event:</strong>
        <form
          onSubmit={handleAddEvent}
          style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}
          aria-label="Add calendar event"
        >
          <label htmlFor="event-date" style={{ display: "none" }}>
            Date
          </label>
          <input
            id="event-date"
            type="date"
            name="date"
            value={eventInput.date}
            onChange={handleEventInputChange}
            required
            style={{ minWidth: 140 }}
          />
          <label htmlFor="event-title" style={{ display: "none" }}>
            Title
          </label>
          <input
            id="event-title"
            type="text"
            name="title"
            value={eventInput.title}
            onChange={handleEventInputChange}
            placeholder="Event Title"
            required
            style={{ minWidth: 180 }}
          />
          <button type="submit">Add</button>
          <button type="button" onClick={handleReset} style={{ marginLeft: 8 }}>
            Reset
          </button>
        </form>
        <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
          (Events will appear on the calendar grid and in the list below)
        </div>
      </div>
      <div>
        <strong>Events:</strong>
        {events.length === 0 ? (
          <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
            No events added yet.
          </div>
        ) : (
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {events.map((event, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{event.date}</span>:{" "}
                {event.title}
                <button
                  onClick={() => handleRemoveEvent(idx)}
                  style={{
                    marginLeft: 10,
                    color: "#b00",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                  aria-label={`Remove event ${event.title}`}
                  title="Remove event"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ marginTop: 24 }}>
        <strong>Selected Months:</strong>{" "}
        {selectedMonths.length > 0 ? (
          selectedMonths.join(", ")
        ) : (
          <span style={{ color: "#888" }}>None</span>
        )}
      </div>
      <div style={{ marginTop: 16 }}>
        <strong>Background Image/Art:</strong>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) =>
                setBackgroundUrl(ev.target?.result as string);
              reader.readAsDataURL(file);
            }
          }}
        />
        {backgroundUrl && (
          <div style={{ marginTop: 8 }}>
            <Image
              src={backgroundUrl}
              alt="Background preview"
              width={200}
              height={120}
              style={{
                maxWidth: 200,
                borderRadius: 8,
                height: "auto",
                display: "block",
                marginTop: 8,
              }}
            />
          </div>
        )}
      </div>
      <div style={{ marginTop: 32 }}>
        <button onClick={handleExportPDF} style={{ marginBottom: 16 }}>
          Export as PDF
        </button>
        <YearlyCalendarGrid
          year={year}
          selectedMonths={selectedMonths}
          events={events}
          backgroundUrl={backgroundUrl}
        />
      </div>
    </div>
  );
}
