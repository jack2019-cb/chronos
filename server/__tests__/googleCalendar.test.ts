import request from "supertest";
import app from "../app";
import { MockGoogleCalendarService } from "../services/googleCalendar";

describe("Google Calendar Integration", () => {
  describe("GET /calendar/google/auth", () => {
    it("should redirect to mock auth URL", async () => {
      const response = await request(app)
        .get("/calendar/google/auth")
        .expect(302);

      expect(response.header.location).toBe(
        "http://localhost:5000/calendar/google/callback?mock=true"
      );
    });
  });

  describe("GET /calendar/google/callback", () => {
    it("should handle valid authorization code", async () => {
      const response = await request(app)
        .get("/calendar/google/callback")
        .query({ code: "valid-code" })
        .expect(200);

      expect(response.body).toHaveProperty("token", "mock-access-token");
    });

    it("should handle invalid authorization code", async () => {
      const response = await request(app)
        .get("/calendar/google/callback")
        .query({ code: "invalid" })
        .expect(401);

      expect(response.body).toHaveProperty(
        "error",
        "Invalid authorization code"
      );
    });

    it("should handle missing authorization code", async () => {
      const response = await request(app)
        .get("/calendar/google/callback")
        .expect(400);

      expect(response.body).toHaveProperty(
        "error",
        "Authorization code is required"
      );
    });
  });

  describe("GET /calendar/google/events", () => {
    it("should return mock events with valid token", async () => {
      const response = await request(app)
        .get("/calendar/google/events")
        .set("Authorization", "Bearer mock-access-token")
        .expect(200);

      expect(response.body).toHaveProperty("events");
      expect(response.body.events).toHaveLength(2);
      expect(response.body.events[0]).toHaveProperty("summary", "Team Meeting");
    });

    it("should handle invalid token", async () => {
      const response = await request(app)
        .get("/calendar/google/events")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      expect(response.body).toHaveProperty("error", "Invalid access token");
    });

    it("should handle missing token", async () => {
      const response = await request(app)
        .get("/calendar/google/events")
        .expect(401);

      expect(response.body).toHaveProperty("error", "Access token is required");
    });
  });

  describe("POST /calendar/google/import", () => {
    it("should handle valid import request", async () => {
      const response = await request(app)
        .post("/calendar/google/import")
        .set("Authorization", "Bearer mock-access-token")
        .send({
          events: [
            {
              id: "test-event",
              summary: "Test Event",
              start: { dateTime: "2025-06-10T10:00:00Z" },
              end: { dateTime: "2025-06-10T11:00:00Z" },
            },
          ],
        })
        .expect(200);

      expect(response.body).toHaveProperty("success", true);
    });

    it("should handle invalid token during import", async () => {
      const response = await request(app)
        .post("/calendar/google/import")
        .set("Authorization", "Bearer invalid-token")
        .send({ events: [] })
        .expect(401);

      expect(response.body).toHaveProperty("error", "Invalid access token");
    });

    it("should handle missing events array", async () => {
      const response = await request(app)
        .post("/calendar/google/import")
        .set("Authorization", "Bearer mock-access-token")
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("error", "Events array is required");
    });
  });
});
