import { describe, expect, it } from "vitest";
import {
  commentCreateTimeToDate,
  shouldPersistDouyinComments,
} from "../src/db/persist-douyin-comments.js";
import type { FetchResult } from "../src/types/comment.js";

function makeResult(partial: Partial<FetchResult>): FetchResult {
  return {
    video_id: "7123456789012345678",
    status: "ok",
    comments: [],
    high_reply_comments: [],
    meta: { fetched: 0, truncated: false, pages: 0 },
    ...partial,
  };
}

describe("shouldPersistDouyinComments", () => {
  it("persists when status is ok and comments exist", () => {
    expect(
      shouldPersistDouyinComments(
        makeResult({
          comments: [
            {
              comment_id: "c1",
              video_id: "7123456789012345678",
              text: "hi",
              user_id: "u1",
              digg_count: 1,
              reply_count: 0,
              is_high_reply: false,
              create_time: 1_700_000_000,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("skips failed fetch", () => {
    expect(
      shouldPersistDouyinComments(makeResult({ status: "failed" })),
    ).toBe(false);
  });

  it("skips ok with empty comments", () => {
    expect(shouldPersistDouyinComments(makeResult({ status: "ok" }))).toBe(
      false,
    );
  });
});

describe("commentCreateTimeToDate", () => {
  it("converts unix seconds to Date", () => {
    expect(commentCreateTimeToDate(1_700_000_000).toISOString()).toBe(
      "2023-11-14T22:13:20.000Z",
    );
  });
});
