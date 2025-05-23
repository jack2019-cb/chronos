const request = require("supertest");
const app = require("../server/app");
const assert = require("assert");

describe("GET /calendar", () => {
  it("should return calendar data", async () => {
    const res = await request(app).get("/calendar");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.months);
    assert.ok(Array.isArray(res.body.months));
  });
});
