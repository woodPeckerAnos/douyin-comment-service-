import { describe, expect, it } from "vitest";
import {
  applyStratifiedSampling,
  normalizeQuotas,
} from "../src/services/comment-sampler.js";
import type { Comment } from "../src/types/comment.js";

function makeComment(
  id: string,
  overrides: Partial<Comment> = {},
): Comment {
  return {
    comment_id: id,
    video_id: "7123456789012345678",
    text: `comment ${id}`,
    user_id: `user-${id}`,
    digg_count: 0,
    reply_count: 0,
    is_high_reply: false,
    create_time: 0,
    ...overrides,
  };
}

describe("comment-sampler", () => {
  it("normalizes quotas when sum exceeds target", () => {
    const quotas = normalizeQuotas(
      {
        top_by_digg: 200,
        latest_by_time: 150,
        high_reply: 100,
        random: 50,
      },
      100,
    );
    expect(
      quotas.top_by_digg +
        quotas.latest_by_time +
        quotas.high_reply +
        quotas.random,
    ).toBe(100);
  });

  it("picks representative buckets from a large pool", () => {
    const source: Comment[] = [];
    for (let i = 0; i < 1000; i += 1) {
      source.push(
        makeComment(String(i), {
          digg_count: i,
          reply_count: i % 20,
          is_high_reply: i % 20 >= 10,
          create_time: 1_700_000_000 + i,
        }),
      );
    }

    const result = applyStratifiedSampling(source, 50, {
      top_by_digg: 20,
      latest_by_time: 15,
      high_reply: 10,
      random: 5,
    });

    expect(result.comments).toHaveLength(50);
    expect(result.meta.collected_before_sample).toBe(1000);
    expect(result.meta.bucket_counts.top_digg).toBe(20);
    expect(result.meta.bucket_counts.latest).toBe(15);
    expect(result.meta.bucket_counts.high_reply).toBe(10);
    expect(result.meta.bucket_counts.random).toBe(5);

    const topDigg = result.comments.filter((c) => c.sample_bucket === "top_digg");
    expect(topDigg.every((c) => c.digg_count >= 980)).toBe(true);
  });

  it("returns all comments when pool is smaller than target", () => {
    const source = [makeComment("1"), makeComment("2")];
    const result = applyStratifiedSampling(source, 50);
    expect(result.comments).toHaveLength(2);
    expect(result.meta.output_count).toBe(2);
  });
});
