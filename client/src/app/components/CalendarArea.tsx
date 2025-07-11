"use client";

import React from "react";
import { useCustomization } from "./CustomizationContext";
import { useCalendarView } from "./CalendarViewContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import YearView from "./views/YearView";
import { ThemeSwitcher } from "./views/ThemeSwitcher";
import {
  DEFAULT_YEAR,
  DEFAULT_HOLIDAYS,
  PLACEHOLDER_EVENTS,
} from "./calendarDefaults";

const CalendarArea: React.FC = () => {
  const { view } = useCalendarView();
  const { themeId, fontId, backgroundId } = useCustomization();

  // Example: map theme/font/background to styles
  const themeStyles: Record<string, React.CSSProperties> = {
    light: { background: "#fff", color: "#222" },
    dark: { background: "#222", color: "#fff" },
  };
  const fontStyles: Record<string, React.CSSProperties> = {
    sans: { fontFamily: "Geist, Arial, sans-serif" },
    mono: { fontFamily: "Geist Mono, monospace" },
  };
  const backgroundStyles: Record<string, React.CSSProperties> = {
    bg1: { backgroundImage: "url(/public/next.svg)", backgroundSize: "cover" },
    bg2: {
      backgroundImage: "url(/public/vercel.svg)",
      backgroundSize: "cover",
    },
  };

  const style: React.CSSProperties = {
    ...themeStyles[themeId],
    ...fontStyles[fontId],
    ...backgroundStyles[backgroundId],
  };

  return (
    <ThemeProvider>
      <main
        className="calendar-plus-area"
        style={{ display: "flex", gap: "2rem" }}
      >
        <section style={{ flex: 2, ...style }}>
          <ThemeSwitcher />
          {view === "year" && (
            <YearView
              year={DEFAULT_YEAR}
              events={PLACEHOLDER_EVENTS.map((e) => ({
                ...e,
                id: e.id || `${e.date}-${e.title}`,
              }))}
              holidays={DEFAULT_HOLIDAYS.map((h) => ({
                ...h,
                type: h.type as "national" | "religious" | "observance",
              }))}
              onDayClick={(date) => {
                console.log("Day clicked:", date);
                // TODO: Implement day click handler
              }}
            />
          )}
          {view === "month" && (
            <div>Month View (Grid, Drag/Drop, Live Preview)</div>
          )}
          {view === "week" && (
            <div>Week View (Grid, Drag/Drop, Live Preview)</div>
          )}
          {view === "day" && (
            <div>Day View (Grid, Drag/Drop, Live Preview)</div>
          )}
        </section>
        <aside
          style={{
            flex: 1,
            background: "#f4f1de",
            borderRadius: 8,
            padding: "1rem",
            minWidth: 220,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Live Preview</h3>
          <div>
            Current View: <b>{view.charAt(0).toUpperCase() + view.slice(1)}</b>
          </div>
          <div style={{ marginTop: 8, color: "#555" }}>
            <div>
              Year: <b>{DEFAULT_YEAR}</b>
            </div>
            <div style={{ marginTop: 8 }}>Holidays:</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {DEFAULT_HOLIDAYS.map((h) => (
                <li key={h.date}>
                  {h.name} <span style={{ color: "#888" }}>({h.date})</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 8 }}>Events:</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {PLACEHOLDER_EVENTS.map((e) => (
                <li key={e.date + e.title}>
                  {e.title} <span style={{ color: "#888" }}>({e.date})</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </ThemeProvider>
  );
};

export default CalendarArea;
