import { describe, expect, it } from "vitest";
import {
  commentFetchBatchPayloadSchema,
  commentFetchPipelinePayloadSchema,
  parseCommentFetchPayload,
} from "../src/mq/payload.js";

describe("commentFetchPipelinePayloadSchema", () => {
  it("accepts protocol pipeline payload", () => {
    const parsed = commentFetchPipelinePayloadSchema.safeParse({
      videoId: "7123456789012345678",
      videoUrl: "https://www.douyin.com/video/7123456789012345678",
      sourceJob: "douyin_search",
      searchBatchId: "20260628T090000",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("commentFetchBatchPayloadSchema", () => {
  it("accepts manual batch payload", () => {
    const parsed = commentFetchBatchPayloadSchema.safeParse({
      trace_id: "run-1",
      video_ids: ["7123456789012345678"],
      options: { delay_ms: 1000 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty video_ids", () => {
    const parsed = commentFetchBatchPayloadSchema.safeParse({
      video_ids: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("parseCommentFetchPayload", () => {
  it("maps pipeline videoId to video_ids", () => {
    const parsed = parseCommentFetchPayload({
      videoId: "7123456789012345678",
      sourceJob: "douyin_search",
    });
    expect(parsed.video_ids).toEqual(["7123456789012345678"]);
  });
});
