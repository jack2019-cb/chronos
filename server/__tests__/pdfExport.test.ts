import request from "supertest";
import express, { NextFunction, Request, Response } from "express";
import calendarRouter from "../routes/calendar";
import { cleanupDatabase, createTestCalendar } from "./helpers/db";
import { prisma } from "../lib/prisma";
import { CalendarError } from "../lib/errors";
import { PDFDocument } from "pdf-lib";

const app = express();
app.use(express.json());
app.use("/calendar", calendarRouter);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  if (err instanceof CalendarError) {
    const status = (err as any).statusCode || 400;
    res.status(status).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

describe("PDF Export API", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await prisma.$disconnect();
  });

  it("GET /calendar/:id/pdf should return PDF for existing calendar", async () => {
    // Create a sample PDF
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage();
    const pdfBytes = await pdfDoc.save();

    // Create test calendar with no background (most reliable for testing)
    const testCalendar = await createTestCalendar({
      year: 2025,
      selectedMonths: ["January", "February"],
      events: [
        { date: "2025-01-01", title: "New Year" },
        { date: "2025-02-14", title: "Valentine's Day" },
      ],
    });

    const response = await request(app)
      .get(`/calendar/${testCalendar.id}/pdf`)
      .expect("Content-Type", "application/pdf")
      .expect("Content-Disposition", 'attachment; filename="2025-calendar.pdf"')
      .expect(200);

    // Verify response is a PDF (starts with %PDF-)
    const pdfHeader = response.body.slice(0, 5).toString();
    expect(pdfHeader).toBe("%PDF-");
  });

  it("GET /calendar/:id/pdf should handle database errors", async () => {
    jest
      .spyOn(prisma.calendar, "findUnique")
      .mockRejectedValueOnce(new Error("Database connection failed"));

    const response = await request(app)
      .get(`/calendar/some-id/pdf`)
      .expect("Content-Type", /json/)
      .expect(500);

    expect(response.body).toHaveProperty(
      "error",
      "Internal server error while generating PDF"
    );
  });
});
