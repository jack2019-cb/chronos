import { prisma } from "../lib/prisma";
import { vi } from "vitest";

describe("trivial", () => {
  it("should pass", () => {
    expect(true).toBe(true);
  });
});

describe("Prisma Client", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalPrisma = global.prisma;

  beforeEach(() => {
    delete global.prisma;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    global.prisma = originalPrisma;
    vi.resetModules();
  });

  it("should initialize Prisma client in development environment", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const { prisma } = await import("../lib/prisma");
    expect(prisma).toBeDefined();
    expect(global.prisma).toBeDefined();
  });

  it("should initialize Prisma client in production environment", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { prisma } = await import("../lib/prisma");
    expect(prisma).toBeDefined();
    expect(global.prisma).toBeUndefined();
  });
});
