const quotaTracker = require("../utils/quotaTracker");

describe("quotaTracker reserve/release semantics", () => {
  beforeEach(() => {
    // Reset state between tests
    quotaTracker._forceRotateForTesting();
  });

  it("allows reserving available quota and reflects in getStatus", () => {
    const r = quotaTracker.reserve(5);
    expect(r && r.success).toBeTruthy();
    expect(r && r.reservationId).toBeTruthy();
    const s = quotaTracker.getStatus();
    expect(s.reservedCount).toBe(5);
    expect(s.availableQuota).toBe(s.limit - s.callCount - 5);
  });

  it("releaseReservation frees a single reservation", () => {
    const r = quotaTracker.reserve(4);
    const id = r.reservationId;
    let s = quotaTracker.getStatus();
    expect(s.reservedCount).toBe(4);
    const rel = quotaTracker.releaseReservation(id);
    expect(rel.success).toBeTruthy();
    s = quotaTracker.getStatus();
    expect(s.reservedCount).toBe(0);
  });

  it("prevents over-reserving beyond available quota", () => {
    const r1 = quotaTracker.reserve(20);
    expect(r1.success).toBeTruthy();
    const r2 = quotaTracker.reserve(1);
    expect(r2.success).toBeFalsy();
    expect(r2.reason).toBe("INSUFFICIENT_QUOTA");
  });

  it("release frees reserved quota correctly", () => {
    quotaTracker.reserve(6);
    let s = quotaTracker.getStatus();
    expect(s.reservedCount).toBe(6);
    const rel = quotaTracker.release(4);
    expect(rel.success).toBeTruthy();
    s = quotaTracker.getStatus();
    expect(s.reservedCount).toBe(2);
    quotaTracker.release();
    s = quotaTracker.getStatus();
    expect(s.reservedCount).toBe(0);
  });

  it("rotateWindow clears reservations", () => {
    quotaTracker.reserve(3);
    let s = quotaTracker.getStatus();
    expect(s.reservedCount).toBe(3);
    quotaTracker.rotateWindow();
    s = quotaTracker.getStatus();
    expect(s.reservedCount).toBe(0);
    expect(s.callCount).toBe(0);
  });

  it("rejects invalid reserve/release counts", () => {
    const r = quotaTracker.reserve(0);
    expect(r.success).toBeFalsy();
    const rel = quotaTracker.release(0);
    expect(rel.success).toBeFalsy();
  });
});
// The tests above cover reserve/release semantics. Keep this file limited to
// CommonJS style imports so it runs reliably under the test runner. Extra
// ESM-style duplicates caused `Identifier 'quotaTracker' has already been
// declared` when Vitest executed the file. If additional assertions are
// needed, add them to the block at the top of this file.
