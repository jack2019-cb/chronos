import { exportToPDF } from "../src/app/utils/pdfExport";

describe("exportToPDF utility", () => {
  it("should be defined", () => {
    expect(exportToPDF).toBeDefined();
  });

  it("should not throw when called with minimal valid arguments", () => {
    expect(() =>
      exportToPDF({
        year: 2025,
        selectedMonths: ["January"],
        events: [{ date: "2025-01-01", title: "Test Event" }],
        backgroundUrl: undefined,
      })
    ).not.toThrow();
  });

  // Add more tests as the utility grows
});
