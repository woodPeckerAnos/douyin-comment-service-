import { describe, expect, it } from "vitest";
import { buildLogEntry } from "../src/utils/logger.js";

describe("buildLogEntry", () => {
  it("matches log-entry.schema required fields", () => {
    const entry = buildLogEntry("info", "Fetch job completed", {
      job_id: "550e8400-e29b-41d4-a716-446655440000",
      duration_ms: 12450,
    });

    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.level).toBe("info");
    expect(entry.service).toBe("douyin-comment");
    expect(entry.message).toBe("Fetch job completed");
    expect(entry.job_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(entry.duration_ms).toBe(12450);
    expect(entry.env).toBeDefined();
    expect(entry.version).toBeDefined();
  });

  it("includes error object for error level", () => {
    const entry = buildLogEntry("error", "Fetch job failed", {
      error: new Error("Redis connection timeout"),
    });

    expect(entry.error).toMatchObject({
      type: "Error",
      message: "Redis connection timeout",
    });
    expect(entry.error?.stack).toBeDefined();
  });

  it("maps http context", () => {
    const entry = buildLogEntry("info", "HTTP request", {
      http: {
        method: "POST",
        path: "/api/comments/fetch",
        status: 202,
        duration_ms: 12,
      },
    });

    expect(entry.http).toEqual({
      method: "POST",
      path: "/api/comments/fetch",
      status: 202,
      duration_ms: 12,
    });
  });
});
