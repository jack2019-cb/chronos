process.env.NEXT_PUBLIC_GEMINI_THEME_API_URL = "https://api.gemini.test/theme";
process.env.NEXT_PUBLIC_GEMINI_API_KEY = "test-key";
import { describe, expect, test, jest } from "@jest/globals";
import {
  requestThemeSuggestions,
  ThemeSuggestionRequest,
} from "../../utils/geminiTheme";
import axios from "axios";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("Theme Suggestion System", () => {
  const mockRequest: ThemeSuggestionRequest = {
    prompt: "Modern minimalist theme",
    style: "modern",
  };

  const mockResponse = {
    suggestions: [
      {
        palette: ["#000000", "#ffffff", "#007AFF"],
        fonts: ["Inter", "SF Pro Display"],
        description: "Modern minimalist theme with bold contrasts",
      },
    ],
    meta: { style: "modern" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_GEMINI_THEME_API_URL =
      "https://api.gemini.test/theme";
    process.env.NEXT_PUBLIC_GEMINI_API_KEY = "test-key";
  });

  test("successfully fetches theme suggestions", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const result = await requestThemeSuggestions(mockRequest);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].palette).toHaveLength(3);
    expect(result.suggestions[0].fonts).toHaveLength(2);
  });

  test("handles missing API configuration", async () => {
    process.env.NEXT_PUBLIC_GEMINI_THEME_API_URL = "";
    process.env.NEXT_PUBLIC_GEMINI_API_KEY = "";

    await expect(requestThemeSuggestions(mockRequest)).rejects.toThrow(
      "Gemini Theme API URL or key not set in environment variables"
    );
  });

  test("handles empty suggestions response", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { suggestions: [] } });

    const result = await requestThemeSuggestions(mockRequest);
    expect(result.suggestions).toEqual([]);
  });

  test("handles API error response", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("Theme API Error"));

    await expect(requestThemeSuggestions(mockRequest)).rejects.toThrow(
      "Failed to fetch theme suggestions from Gemini API"
    );
  });
});
