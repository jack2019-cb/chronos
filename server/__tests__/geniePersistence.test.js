const genieService = require("../genieService");

describe("genieService persistence read-first behavior", () => {
  afterEach(() => {
    genieService._resetDbUtils();
    genieService._resetSampleService();
  });

  it("returns cached result when a matching prompt and AI row exist", async () => {
    const promptText = "Once upon a time";
    // Mock dbUtils to return a matching prompt and ai row
    const mockDb = {
      getPrompts: async () => [{ id: 101, prompt: promptText }],
      getAIResultById: async (promptId) => {
        if (promptId === 101) {
          return {
            id: 202,
            promptId: 101,
            result: JSON.stringify({
              content: { title: "T", body: "B", layout: "poem-single-column" },
              metadata: { model: "cached-1", tokens: 10 },
            }),
          };
        }
        return null;
      },
    };

    // Inject sampleService that would fail if called to ensure no generation
    genieService._setSampleService({
      generateFromPrompt: async () => {
        throw new Error("Should not be called when cached result exists");
      },
    });

    genieService._setDbUtils(mockDb);

    const res = await genieService.generate(promptText);
    expect(res && res.success).toBeTruthy();
    expect(res.data && res.data.promptId).toBe(101);
    expect(res.data && res.data.resultId).toBe(202);
    expect(res.data.metadata && res.data.metadata.model).toBe("cached-1");
  });
});
