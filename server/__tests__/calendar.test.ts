import request from "supertest";
import express from "express";
import calendarRouter from "../routes/calendar";

const app = express();
app.use(express.json());
app.use("/calendar", calendarRouter);

describe("Calendar API", () => {
  // Success cases
  it("GET /calendar should return months array and empty calendars initially", async () => {
    const response = await request(app).get("/calendar");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("months");
    expect(response.body.months).toHaveLength(12);
    expect(response.body.calendars).toBeInstanceOf(Array);
    expect(response.body.calendars).toHaveLength(0);
  });

  let calendarId: string;

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

    calendarId = response.body.id;
  });

  it("GET /calendar/:id should return a specific calendar", async () => {
    const response = await request(app).get(`/calendar?id=${calendarId}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("id", calendarId);
    expect(response.body.year).toBe(2025);
    expect(response.body.selectedMonths).toContain("January");
  });

  it("PUT /calendar/:id should update a calendar", async () => {
    const update = {
      selectedMonths: ["March", "April"],
      events: [{ date: "2025-03-01", title: "Spring" }],
    };

    const response = await request(app)
      .put(`/calendar/${calendarId}`)
      .send(update);

    expect(response.status).toBe(200);
    expect(response.body.selectedMonths).toEqual(update.selectedMonths);
    expect(response.body.events).toEqual(update.events);
    expect(response.body.year).toBe(2025); // Unchanged field
  });

  it("DELETE /calendar/:id should delete a calendar", async () => {
    const response = await request(app).delete(`/calendar/${calendarId}`);

    expect(response.status).toBe(204);

    const getResponse = await request(app).get(`/calendar?id=${calendarId}`);
    expect(getResponse.status).toBe(404);
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
        "Year and selectedMonths are required"
      );
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

    it("DELETE /calendar/:id with non-existent ID should return 404", async () => {
      const response = await request(app).delete("/calendar/nonexistent");

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message", "Calendar not found");
    });
  });
});
