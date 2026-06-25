import type { Comment } from "../types/comment.js";

export interface ParsedCommentPage {
  comments: Comment[];
  has_more: boolean;
  cursor?: string;
  status_code?: number;
  status_msg?: string;
}

interface RawComment {
  cid?: string;
  text?: string;
  aweme_id?: string;
  digg_count?: number;
  reply_comment_total?: number;
  reply_count?: number;
  create_time?: number;
  user?: {
    uid?: string;
    sec_uid?: string;
    unique_id?: string;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function pickCommentId(raw: RawComment): string | null {
  if (raw.cid && String(raw.cid).length > 0) {
    return String(raw.cid);
  }
  return null;
}

function pickUserId(raw: RawComment): string {
  return (
    raw.user?.uid ??
    raw.user?.sec_uid ??
    raw.user?.unique_id ??
    "unknown"
  );
}

function pickReplyCount(raw: RawComment): number {
  const count = raw.reply_comment_total ?? raw.reply_count ?? 0;
  return Number.isFinite(count) ? Number(count) : 0;
}

export function parseCommentListResponse(
  text: string,
  videoId: string,
  highReplyThreshold: number,
): ParsedCommentPage {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { comments: [], has_more: false, status_code: -1, status_msg: "invalid_json" };
  }

  const statusCode =
    typeof payload.status_code === "number" ? payload.status_code : undefined;
  const statusMsg =
    typeof payload.status_msg === "string" ? payload.status_msg : undefined;

  const commentsRaw = Array.isArray(payload.comments)
    ? payload.comments
    : Array.isArray(asRecord(payload.data)?.comments)
      ? (asRecord(payload.data)!.comments as unknown[])
      : [];

  const comments: Comment[] = [];
  const seen = new Set<string>();

  for (const item of commentsRaw) {
    const raw = item as RawComment;
    const commentId = pickCommentId(raw);
    if (!commentId || seen.has(commentId)) {
      continue;
    }

    const textContent = (raw.text ?? "").trim();
    // 保留纯表情/图片评论（text 为空但 cid 有效）
    const displayText = textContent || "[无文字评论]";

    seen.add(commentId);
    const replyCount = pickReplyCount(raw);
    comments.push({
      comment_id: commentId,
      video_id: videoId,
      text: displayText,
      user_id: pickUserId(raw),
      digg_count: Number(raw.digg_count ?? 0),
      reply_count: replyCount,
      is_high_reply: replyCount >= highReplyThreshold,
      create_time: Number(raw.create_time ?? 0),
    });
  }

  const hasMore =
    payload.has_more === 1 ||
    payload.has_more === true ||
    asRecord(payload.data)?.has_more === 1 ||
    asRecord(payload.data)?.has_more === true;

  const cursorValue =
    payload.cursor ??
    asRecord(payload.data)?.cursor ??
    payload.min_cursor ??
    asRecord(payload.data)?.min_cursor;

  return {
    comments,
    has_more: Boolean(hasMore),
    cursor: cursorValue != null ? String(cursorValue) : undefined,
    status_code: statusCode,
    status_msg: statusMsg,
  };
}

export function mergeComments(
  existing: Map<string, Comment>,
  incoming: Comment[],
): void {
  for (const comment of incoming) {
    existing.set(comment.comment_id, comment);
  }
}

export function filterHighReplyComments(comments: Comment[]): Comment[] {
  return comments.filter((comment) => comment.is_high_reply);
}
