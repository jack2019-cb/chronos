process.env.NEXT_PUBLIC_GEMINI_API_URL = "https://api.gemini.test";
process.env.NEXT_PUBLIC_GEMINI_API_KEY = "test-key";
import { describe, expect, test, jest } from "@jest/globals";
import {
  requestGeminiImage,
  GeminiImageRequest,
  GeminiImageResponse,
} from "../../utils/gemini";
import axios from "axios";

// Mock axios
jest.mock("axios", () => ({
  default: {
    post: jest.fn(),
  },
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("Gemini API Integration", () => {
  const mockRequest: GeminiImageRequest = {
    prompt: "Create a modern calendar background",
    width: 1024,
    height: 768,
  };

  const mockResponse: GeminiImageResponse = {
    imageUrl: "https://api.gemini.example/images/123",
    meta: { style: "modern", timestamp: Date.now() },
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_GEMINI_API_URL = "https://api.gemini.test";
    process.env.NEXT_PUBLIC_GEMINI_API_KEY = "test-key";
  });

  test("successfully generates image with valid request", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const result = await requestGeminiImage(mockRequest);
    expect(result.imageUrl).toBe(mockResponse.imageUrl);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        prompt: mockRequest.prompt,
        width: mockRequest.width,
        height: mockRequest.height,
      }),
      expect.objectContaining({
        headers: {
          Authorization: expect.stringContaining("Bearer"),
          "Content-Type": "application/json",
        },
      })
    );
  });

  test("handles missing API configuration", async () => {
    process.env.NEXT_PUBLIC_GEMINI_API_URL = "";
    process.env.NEXT_PUBLIC_GEMINI_API_KEY = "";

    await expect(requestGeminiImage(mockRequest)).rejects.toThrow(
      "Gemini API URL or key not set in environment variables"
    );
  });

  test("handles API error response", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("API Error"));

    await expect(requestGeminiImage(mockRequest)).rejects.toThrow(
      "Failed to fetch image from Gemini API"
    );
  });
});
