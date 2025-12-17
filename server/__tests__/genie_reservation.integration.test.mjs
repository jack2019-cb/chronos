import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const genieService = require("../genieService");
const quotaTracker = require("../utils/quotaTracker");

describe("genieService reservation semantics (integration)", () => {
  beforeEach(() => {
    quotaTracker._forceRotateForTesting();
  });

  afterEach(() => {
    // Reset any injected mocks
    try {
      vi.restoreAllMocks();
    } catch (e) {}
  });

  it(
    "reserves quota for first job and defers concurrent job when insufficient",
    async () => {
      // Use a payload with pageCount=20 so cost = 1 + ceil(20/2) = 11
      const payload = {
        mode: "ebook",
        prompt: "Reserve test",
        metadata: { pageCount: 20 },
      };

      // Mock ebookService.handle to delay so we can start a concurrent request
      const ebookService = require("../ebookService");
      const realHandle = ebookService.handle;

      let resolveFirst;
      const firstPromise = new Promise((res) => (resolveFirst = res));

      vi.spyOn(ebookService, "handle").mockImplementation(async (p, c) => {
        // Wait until test signals to finish
        await firstPromise;
        return {
          pages: [{ id: "p1" }, { id: "p2" }],
          metadata: { mode: "ebook" },
        };
      });

      // Start first process (should reserve 11)
      const first = genieService.process(payload);

      // Immediately attempt a second concurrent process with same cost
      let secondErr = null;
      try {
        await genieService.process(payload);
      } catch (e) {
        secondErr = e;
      }

      // The second request should have been deferred due to insufficient quota
      expect(secondErr).toBeTruthy();
      // Helpful debug output when this assertion fails
      // eslint-disable-next-line no-console
      console.log(
        "SECOND ERR:",
        secondErr && {
          message: secondErr.message,
          status: secondErr.status,
          defer: secondErr.defer,
        }
      );
      expect(secondErr.status).toBe(202);
      expect(secondErr.defer).toBeTruthy();

      // Now allow the first job to complete
      resolveFirst();
      const envelope = await first;
      expect(
        envelope &&
          envelope.out_envelope &&
          envelope.out_envelope.pages &&
          envelope.out_envelope.pages.length
      ).toBe(2);
      // After reservation released, a subsequent request should be allowed
      const envelope2 = await genieService.process(payload);
      expect(envelope2 && envelope2.out_envelope).toBeDefined();

      // Restore original
      ebookService.handle = realHandle;
    },
    { timeout: 30000 }
  );
});
