process.env.NEXT_PUBLIC_GEMINI_API_URL = "https://api.gemini.test";
process.env.NEXT_PUBLIC_GEMINI_API_KEY = "test-key";
import { describe, expect, test, jest } from "@jest/globals";
import {
  runImageGenerationPipeline,
  ImagePipelineOptions,
} from "../../utils/geminiPipeline";
import {
  requestGeminiImage,
  GeminiImageResponse,
  GeminiImageRequest,
} from "../../utils/gemini";

// Create a properly typed mock function
const mockRequestGeminiImage = jest
  .fn<(req: GeminiImageRequest) => Promise<GeminiImageResponse>>()
  .mockResolvedValue({
    imageUrl: "https://api.gemini.test/image.png",
    meta: {},
  });

// Mock the module with our typed mock function
jest.mock("../../utils/gemini", () => ({
  requestGeminiImage: mockRequestGeminiImage,
}));

describe("Image Generation Pipeline", () => {
  const mockOptions: ImagePipelineOptions = {
    prompt: "Generate a calendar background",
    width: 1024,
    height: 768,
    optimize: true,
    format: "png",
  };

  const mockResponse: GeminiImageResponse = {
    imageUrl: "https://api.gemini.test/image.png",
    meta: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestGeminiImage.mockResolvedValue(mockResponse);
    process.env.NEXT_PUBLIC_GEMINI_API_URL = "https://api.gemini.test";
    process.env.NEXT_PUBLIC_GEMINI_API_KEY = "test-key";
  });

  test("successfully runs pipeline with optimization", async () => {
    const result = await runImageGenerationPipeline(mockOptions);

    const expectedRequest: GeminiImageRequest = {
      prompt: mockOptions.prompt,
      width: mockOptions.width,
      height: mockOptions.height,
    };
    expect(mockRequestGeminiImage).toHaveBeenCalledWith(expectedRequest);
    expect(result.imageUrl).toBe(mockResponse.imageUrl);
    expect(result.optimizedUrl).toContain("optimized=true");
    expect(result.format).toBe("png");
  });

  test("runs pipeline without optimization", async () => {
    const result = await runImageGenerationPipeline({
      ...mockOptions,
      optimize: false,
    });

    expect(result.optimizedUrl).toBe(mockResponse.imageUrl);
    expect(result.format).toBe("png");
  });

  test("handles pipeline errors", async () => {
    mockRequestGeminiImage.mockRejectedValue(new Error("Pipeline error"));

    await expect(runImageGenerationPipeline(mockOptions)).rejects.toThrow(
      "Pipeline error"
    );
  });
});
