import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  filterHighReplyComments,
  parseCommentListResponse,
} from "../src/parsers/comment-parser.js";
import {
  isValidDouyinVideoId,
  normalizeVideoId,
  parseVideoIdFromHref,
} from "../src/utils/video-id.js";

const fixturePath = resolve(
  import.meta.dirname,
  "fixtures/comment-list-response.json",
);
const fixtureText = readFileSync(fixturePath, "utf8");

describe("comment-parser", () => {
  it("parses comment list and marks high reply comments", () => {
    const page = parseCommentListResponse(
      fixtureText,
      "7123456789012345678",
      10,
    );

    expect(page.status_code).toBe(0);
    expect(page.comments).toHaveLength(3);
    expect(page.has_more).toBe(true);
    expect(page.cursor).toBe("20");

    const first = page.comments[0];
    expect(first.comment_id).toBe("7523456789012345678");
    expect(first.reply_count).toBe(15);
    expect(first.is_high_reply).toBe(true);

    const second = page.comments[1];
    expect(second.is_high_reply).toBe(false);

    const emptyText = page.comments[2];
    expect(emptyText.text).toBe("[无文字评论]");
  });

  it("filters high reply comments", () => {
    const page = parseCommentListResponse(
      fixtureText,
      "7123456789012345678",
      10,
    );
    const highReply = filterHighReplyComments(page.comments);
    expect(highReply).toHaveLength(1);
    expect(highReply[0]?.comment_id).toBe("7523456789012345678");
  });

  it("returns empty result for invalid json", () => {
    const page = parseCommentListResponse("not-json", "7123456789012345678", 10);
    expect(page.comments).toHaveLength(0);
    expect(page.status_code).toBe(-1);
  });
});

describe("video-id", () => {
  it("validates douyin video ids", () => {
    expect(isValidDouyinVideoId("7123456789012345678")).toBe(true);
    expect(isValidDouyinVideoId("abc")).toBe(false);
  });

  it("parses video id from href", () => {
    expect(
      parseVideoIdFromHref("https://www.douyin.com/video/7123456789012345678"),
    ).toBe("7123456789012345678");
  });

  it("normalizes raw id or url", () => {
    expect(normalizeVideoId("7123456789012345678")).toBe("7123456789012345678");
    expect(
      normalizeVideoId("https://www.douyin.com/video/7123456789012345678"),
    ).toBe("7123456789012345678");
  });
});
