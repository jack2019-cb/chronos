import request from "supertest";
import app from "../server/app";

describe("GET /calendar", () => {
  it("should return calendar data", async () => {
    const res = await request(app).get("/calendar");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("months");
    expect(Array.isArray(res.body.months)).toBe(true);
  });
});
