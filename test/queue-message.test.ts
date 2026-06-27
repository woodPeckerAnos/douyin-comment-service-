import { describe, expect, it } from "vitest";
import { commentFetchPayloadSchema } from "../src/mq/payload.js";

describe("commentFetchPayloadSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = commentFetchPayloadSchema.safeParse({
      trace_id: "run-1",
      video_ids: ["7123456789012345678"],
      options: { delay_ms: 1000 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty video_ids", () => {
    const parsed = commentFetchPayloadSchema.safeParse({
      video_ids: [],
    });
    expect(parsed.success).toBe(false);
  });
});
