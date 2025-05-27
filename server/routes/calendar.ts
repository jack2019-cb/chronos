import express, { Request, Response, Router } from "express";
const router: Router = express.Router();

interface CalendarEvent {
  date: string;
  title: string;
}

interface Calendar {
  id: string;
  year: number;
  selectedMonths: string[];
  events: CalendarEvent[];
  backgroundUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory storage for calendars (temporary until database integration)
let calendars: Calendar[] = [];

// GET /calendar - Get all calendars or specific calendar
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.query;
  if (id && typeof id === "string") {
    const calendar = calendars.find((c) => c.id === id);
    if (!calendar) {
      res.status(404).json({ message: "Calendar not found" });
      return;
    }
    res.json(calendar);
    return;
  }
  res.json({
    calendars,
    months: [
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
    ],
  });
});

// POST /calendar - Create a new calendar
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { year, selectedMonths, events, backgroundUrl } = req.body;

  if (!year || !selectedMonths) {
    res.status(400).json({ message: "Year and selectedMonths are required" });
    return;
  }

  const newCalendar: Calendar = {
    id: Date.now().toString(),
    year,
    selectedMonths,
    events: events || [],
    backgroundUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  calendars.push(newCalendar);
  res.status(201).json(newCalendar);
});

// PUT /calendar/:id - Update an existing calendar
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { year, selectedMonths, events, backgroundUrl } = req.body;

  const calendarIndex = calendars.findIndex((c) => c.id === id);
  if (calendarIndex === -1) {
    res.status(404).json({ message: "Calendar not found" });
    return;
  }

  calendars[calendarIndex] = {
    ...calendars[calendarIndex],
    year: year || calendars[calendarIndex].year,
    selectedMonths: selectedMonths || calendars[calendarIndex].selectedMonths,
    events: events || calendars[calendarIndex].events,
    backgroundUrl: backgroundUrl || calendars[calendarIndex].backgroundUrl,
    updatedAt: new Date().toISOString(),
  };

  res.json(calendars[calendarIndex]);
});

// DELETE /calendar/:id - Delete a calendar
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const calendarIndex = calendars.findIndex((c) => c.id === id);

  if (calendarIndex === -1) {
    res.status(404).json({ message: "Calendar not found" });
    return;
  }

  calendars.splice(calendarIndex, 1);
  res.status(204).send();
});

export default router;
