import express, { Request, Response, Router } from "express";
import { prisma } from "../lib/prisma";
import { handleDatabaseError, CalendarError } from "../lib/errors";
import { Prisma } from "@prisma/client";
import {
  exportCalendarToPDF,
  type CalendarEvent,
} from "@shared/utils/pdfExport";

const router: Router = express.Router();

// Validate calendar input
function validateCalendarInput(body: any): void {
  const { year, selectedMonths } = body;

  if (!year || typeof year !== "number") {
    throw new CalendarError("Year is required and must be a number", 400);
  }

  if (
    !selectedMonths ||
    !Array.isArray(selectedMonths) ||
    selectedMonths.length === 0
  ) {
    throw new CalendarError("At least one month must be selected", 400);
  }

  const validMonths = [
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

  const invalidMonths = selectedMonths.filter(
    (month) => !validMonths.includes(month)
  );
  if (invalidMonths.length > 0) {
    throw new CalendarError("Invalid months provided", 400, { invalidMonths });
  }
}

// GET /calendar - Get all calendars or specific calendar
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.query;
  try {
    if (id && typeof id === "string") {
      const calendar = await prisma.calendar.findUnique({
        where: { id },
        include: { events: true },
      });

      if (!calendar) {
        throw new CalendarError("Calendar not found", 404);
      }

      res.json(calendar);
      return;
    }

    const calendars = await prisma.calendar.findMany({
      include: { events: true },
    });

    res.json({
      calendars: calendars.map((cal) => ({
        ...cal,
        events: cal.events || [],
      })),
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
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

// POST /calendar - Create a new calendar
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    validateCalendarInput(req.body);

    const { year, selectedMonths, events = [], backgroundUrl } = req.body;

    // Validate event dates
    events.forEach((event: { date: string; title: string }) => {
      if (!event.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        throw new CalendarError(
          "Invalid event date format. Use YYYY-MM-DD",
          400,
          { date: event.date }
        );
      }
      if (!event.title || typeof event.title !== "string") {
        throw new CalendarError(
          "Event title is required and must be a string",
          400
        );
      }
    });

    const newCalendar = await prisma.calendar.create({
      data: {
        name: `Calendar ${year}`, // Default name based on year
        year,
        selectedMonths,
        backgroundUrl,
        events: {
          create: events.map((event: { date: string; title: string }) => ({
            date: event.date,
            title: event.title,
          })),
        },
      },
      include: {
        events: true,
      },
    });

    res.status(201).json(newCalendar);
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

// PUT /calendar/:id - Update an existing calendar
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    // Check if calendar exists first
    const existingCalendar = await prisma.calendar.findUnique({
      where: { id },
    });

    if (!existingCalendar) {
      throw new CalendarError("Calendar not found", 404);
    }

    if (req.body.selectedMonths || req.body.year) {
      validateCalendarInput({
        year: req.body.year || existingCalendar.year,
        selectedMonths:
          req.body.selectedMonths || existingCalendar.selectedMonths,
      });
    }

    const { year, selectedMonths, events, backgroundUrl } = req.body;

    if (events) {
      events.forEach((event: { date: string; title: string }) => {
        if (!event.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          throw new CalendarError(
            "Invalid event date format. Use YYYY-MM-DD",
            400,
            { date: event.date }
          );
        }
        if (!event.title || typeof event.title !== "string") {
          throw new CalendarError(
            "Event title is required and must be a string",
            400
          );
        }
      });
    }

    // Update calendar and its events
    const updatedCalendar = await prisma.calendar.update({
      where: { id },
      data: {
        year: year !== undefined ? year : undefined,
        selectedMonths:
          selectedMonths !== undefined ? selectedMonths : undefined,
        backgroundUrl: backgroundUrl !== undefined ? backgroundUrl : undefined,
        events: events
          ? {
              deleteMany: {},
              create: events.map((event: { date: string; title: string }) => ({
                date: event.date,
                title: event.title,
              })),
            }
          : undefined,
      },
      include: {
        events: true,
      },
    });

    res.json(updatedCalendar);
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

// DELETE /calendar/:id - Delete a calendar
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const calendar = await prisma.calendar.findUnique({
      where: { id },
      include: { events: true },
    });

    if (!calendar) {
      throw new CalendarError("Calendar not found", 404);
    }

    // Delete calendar and events in a transaction with retry logic
    try {
      await prisma.$transaction(
        async (tx) => {
          // Delete events first
          await tx.event.deleteMany({
            where: { calendarId: id },
          });

          // Then delete the calendar
          await tx.calendar.delete({
            where: { id },
          });
        },
        {
          maxWait: 5000, // Maximum time to wait for each retry
          timeout: 10000, // Maximum time to wait for the transaction
          isolationLevel: "Serializable", // Ensure consistency
        }
      );

      res.status(204).send();
    } catch (txError) {
      // Check if transaction error was due to deadlock
      if (
        txError instanceof Error &&
        txError.message.includes("deadlock detected")
      ) {
        throw new CalendarError("Database conflict, please try again", 409);
      }
      throw new CalendarError(
        "Transaction failed while deleting calendar",
        500,
        { error: txError instanceof Error ? txError.message : "Unknown error" }
      );
    }
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

// GET /calendar/:id/pdf - Export calendar to PDF
router.get("/:id/pdf", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const calendar = await prisma.calendar.findUnique({
      where: { id },
      include: { events: true },
    });

    if (!calendar) {
      throw new CalendarError("Calendar not found", 404);
    }

    try {
      const pdfBytes = await exportCalendarToPDF({
        year: calendar.year,
        selectedMonths: calendar.selectedMonths,
        events: calendar.events || [],
        backgroundUrl: calendar.backgroundUrl || undefined,
      });

      // Clear any previous headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${calendar.year}-calendar.pdf"`
      );
      res.setHeader("Cache-Control", "no-cache");
      res.status(200);
      res.send(Buffer.from(pdfBytes));
    } catch (pdfError) {
      // If PDF generation fails, try without background
      const pdfBytes = await exportCalendarToPDF({
        year: calendar.year,
        selectedMonths: calendar.selectedMonths,
        events: calendar.events || [],
        backgroundUrl: undefined,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${calendar.year}-calendar.pdf"`
      );
      res.setHeader("Cache-Control", "no-cache");
      res.status(200);
      res.send(Buffer.from(pdfBytes));
    }
  } catch (error) {
    if (error instanceof CalendarError) {
      if (error.statusCode === 404) {
        res.status(404).json({ message: error.message });
      } else {
        res.status(error.statusCode).json({
          error: error.message,
          details: error.details,
        });
      }
    } else {
      res.status(500).json({
        error: "Internal server error while generating PDF",
      });
    }
  }
});

export default router;
