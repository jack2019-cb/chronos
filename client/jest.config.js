/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest"],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    // Handle module aliases (if you're using them in tsconfig.json)
    "^@/(.*)$": "<rootDir>/src/$1",
    // Handle CSS imports (if you're using them)
    "^.+\\.(css|less|scss|sass)$": "identity-obj-proxy",
  },
  testEnvironmentOptions: {
    url: "http://localhost:3000",
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "/playwright/", // Ignore Playwright tests
  ],
};

export default config;
