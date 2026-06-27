import type pg from "pg";
import type { Comment, FetchResult } from "../types/comment.js";

export function commentCreateTimeToDate(unixSeconds: number): Date {
  return new Date(unixSeconds * 1000);
}

export function shouldPersistDouyinComments(result: FetchResult): boolean {
  return result.status === "ok" && result.comments.length > 0;
}

export async function persistDouyinComments(
  client: pg.PoolClient,
  fetchResultId: number,
  result: FetchResult,
): Promise<void> {
  if (!shouldPersistDouyinComments(result)) {
    return;
  }

  const highReplyIds = new Set(
    result.high_reply_comments.map((comment) => comment.comment_id),
  );

  await upsertDouyinComments(client, result.video_id, result.comments);
  await replaceDouyinCommentObservations(
    client,
    fetchResultId,
    result.video_id,
    result.comments,
    highReplyIds,
  );
}

async function upsertDouyinComments(
  client: pg.PoolClient,
  videoId: string,
  comments: Comment[],
): Promise<void> {
  const videoIds: string[] = [];
  const commentIds: string[] = [];
  const userIds: string[] = [];
  const texts: string[] = [];
  const diggCounts: number[] = [];
  const replyCounts: number[] = [];
  const isHighReplyFlags: boolean[] = [];
  const createTimes: Date[] = [];

  for (const comment of comments) {
    videoIds.push(videoId);
    commentIds.push(comment.comment_id);
    userIds.push(comment.user_id);
    texts.push(comment.text);
    diggCounts.push(comment.digg_count);
    replyCounts.push(comment.reply_count);
    isHighReplyFlags.push(comment.is_high_reply);
    createTimes.push(commentCreateTimeToDate(comment.create_time));
  }

  await client.query(
    `INSERT INTO douyin_comments
       (video_id, comment_id, user_id, text, digg_count, reply_count,
        is_high_reply, create_time, last_seen_at)
     SELECT v, c, u, t, d, r, h, ct, now()
     FROM UNNEST(
       $1::text[],
       $2::text[],
       $3::text[],
       $4::text[],
       $5::int[],
       $6::int[],
       $7::boolean[],
       $8::timestamptz[]
     ) AS rows(v, c, u, t, d, r, h, ct)
     ON CONFLICT (video_id, comment_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       text = EXCLUDED.text,
       digg_count = EXCLUDED.digg_count,
       reply_count = EXCLUDED.reply_count,
       is_high_reply = EXCLUDED.is_high_reply,
       create_time = EXCLUDED.create_time,
       last_seen_at = now()`,
    [
      videoIds,
      commentIds,
      userIds,
      texts,
      diggCounts,
      replyCounts,
      isHighReplyFlags,
      createTimes,
    ],
  );
}

async function replaceDouyinCommentObservations(
  client: pg.PoolClient,
  fetchResultId: number,
  videoId: string,
  comments: Comment[],
  highReplyIds: Set<string>,
): Promise<void> {
  await client.query(
    `DELETE FROM douyin_comment_observations WHERE fetch_result_id = $1`,
    [fetchResultId],
  );

  const videoIds: string[] = [];
  const commentIds: string[] = [];
  const sampleBuckets: (string | null)[] = [];
  const includedFlags: boolean[] = [];

  for (const comment of comments) {
    videoIds.push(videoId);
    commentIds.push(comment.comment_id);
    sampleBuckets.push(comment.sample_bucket ?? null);
    includedFlags.push(highReplyIds.has(comment.comment_id));
  }

  await client.query(
    `INSERT INTO douyin_comment_observations
       (fetch_result_id, video_id, comment_id, sample_bucket, included_in_high_reply)
     SELECT $1, v, c, b, i
     FROM UNNEST(
       $2::text[],
       $3::text[],
       $4::text[],
       $5::boolean[]
     ) AS rows(v, c, b, i)`,
    [fetchResultId, videoIds, commentIds, sampleBuckets, includedFlags],
  );
}
