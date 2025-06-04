import request from "supertest";
import express from "express";
import calendarRouter from "../routes/calendar";
import { cleanupDatabase, createTestCalendar } from "./helpers/db";
import { prisma } from "../lib/prisma";

const app = express();
app.use(express.json());
app.use("/calendar", calendarRouter);

describe("Calendar API", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await prisma.$disconnect();
  });

  // Success cases
  it("GET /calendar should return months array and empty calendars initially", async () => {
    const response = await request(app).get("/calendar");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("months");
    expect(response.body.months).toHaveLength(12);
    expect(response.body.calendars).toBeInstanceOf(Array);
    expect(response.body.calendars).toHaveLength(0);
  });

  it("POST /calendar should create a new calendar", async () => {
    const calendar = {
      year: 2025,
      selectedMonths: ["January", "February"],
      events: [{ date: "2025-01-01", title: "New Year" }],
      backgroundUrl: "https://example.com/bg.jpg",
    };

    const response = await request(app).post("/calendar").send(calendar);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(calendar);
    expect(response.body).toHaveProperty("id");
    expect(response.body).toHaveProperty("createdAt");
    expect(response.body).toHaveProperty("updatedAt");
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0]).toMatchObject(calendar.events[0]);

    // Verify calendar was saved to database
    const saved = await prisma.calendar.findUnique({
      where: { id: response.body.id },
      include: { events: true },
    });
    expect(saved).toBeTruthy();
    expect(saved?.events).toHaveLength(1);
  });

  it("GET /calendar/:id should return a specific calendar", async () => {
    const testCalendar = await createTestCalendar({
      year: 2025,
      selectedMonths: ["January"],
      events: [{ date: "2025-01-01", title: "Test Event" }],
    });

    const response = await request(app).get(`/calendar?id=${testCalendar.id}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("id", testCalendar.id);
    expect(response.body.year).toBe(2025);
    expect(response.body.selectedMonths).toContain("January");
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0].title).toBe("Test Event");
  });

  it("PUT /calendar/:id should update a calendar", async () => {
    const testCalendar = await createTestCalendar({
      year: 2025,
      selectedMonths: ["January", "February"],
      events: [{ date: "2025-01-01", title: "Original Event" }],
    });

    const update = {
      selectedMonths: ["March", "April"],
      events: [{ date: "2025-03-01", title: "Updated Event" }],
    };

    const response = await request(app)
      .put(`/calendar/${testCalendar.id}`)
      .send(update);

    expect(response.status).toBe(200);
    expect(response.body.selectedMonths).toEqual(update.selectedMonths);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0].title).toBe("Updated Event");
    expect(response.body.year).toBe(2025); // Unchanged field
  });

  it("DELETE /calendar/:id should delete a calendar and its events", async () => {
    const testCalendar = await createTestCalendar({
      year: 2025,
      selectedMonths: ["January"],
      events: [{ date: "2025-01-01", title: "Test Event" }],
    });

    const response = await request(app).delete(`/calendar/${testCalendar.id}`);
    expect(response.status).toBe(204);

    // Verify calendar and events were deleted
    const deleted = await prisma.calendar.findUnique({
      where: { id: testCalendar.id },
      include: { events: true },
    });
    expect(deleted).toBeNull();

    const events = await prisma.event.findMany({
      where: { calendarId: testCalendar.id },
    });
    expect(events).toHaveLength(0);
  });

  // Error cases
  describe("Error handling", () => {
    it("GET /calendar with invalid ID should return 404", async () => {
      const response = await request(app).get("/calendar?id=nonexistent");
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message", "Calendar not found");
    });

    it("POST /calendar without required fields should return 400", async () => {
      const invalidCalendar = {
        year: 2025, // Missing selectedMonths
      };

      const response = await request(app)
        .post("/calendar")
        .send(invalidCalendar);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty(
        "message",
        "At least one month must be selected"
      );
    });

    it("POST /calendar with invalid event date should return 400", async () => {
      const invalidCalendar = {
        year: 2025,
        selectedMonths: ["January"],
        events: [{ date: "invalid-date", title: "Test" }],
      };

      const response = await request(app)
        .post("/calendar")
        .send(invalidCalendar);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Invalid event date format");
    });

    it("PUT /calendar/:id with non-existent ID should return 404", async () => {
      const update = {
        selectedMonths: ["March", "April"],
      };

      const response = await request(app)
        .put("/calendar/nonexistent")
        .send(update);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message", "Calendar not found");
    });

    it("PUT /calendar/:id with invalid months should return 400", async () => {
      const testCalendar = await createTestCalendar({
        year: 2025,
        selectedMonths: ["January"],
      });

      const response = await request(app)
        .put(`/calendar/${testCalendar.id}`)
        .send({
          selectedMonths: ["InvalidMonth"],
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid months provided");
      expect(response.body.details).toHaveProperty("invalidMonths");
    });

    it("DELETE /calendar/:id with non-existent ID should return 404", async () => {
      const response = await request(app).delete("/calendar/nonexistent");
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message", "Calendar not found");
    });
  });
});
