/**
 * job-queue 消息体：pipeline 单视频（Protocol）与 batch 多视频（HTTP/手动）两种形态。
 * parseCommentFetchPayload 统一转为 video_ids 供 batch-processor 使用。
 */
import { z } from "zod";
import { fetchOptionsSchema } from "../server/schemas/fetch-request.js";

/** Protocol pipeline job — one video per message. */
export const commentFetchPipelinePayloadSchema = z.object({
  videoId: z.string().min(1),
  videoUrl: z.string().min(1).optional(),
  sourceJob: z.string().min(1).optional(),
  searchBatchId: z.string().min(1).optional(),
});

/** Manual / HTTP batch enqueue. */
export const commentFetchBatchPayloadSchema = z.object({
  video_ids: z.array(z.string().min(1)).min(1).max(100),
  options: fetchOptionsSchema.optional(),
  trace_id: z.string().min(1).optional(),
});

export type CommentFetchPipelinePayload = z.infer<
  typeof commentFetchPipelinePayloadSchema
>;
export type CommentFetchBatchPayload = z.infer<
  typeof commentFetchBatchPayloadSchema
>;

export function parseCommentFetchPayload(payload: unknown): {
  video_ids: string[];
  options?: CommentFetchBatchPayload["options"];
  trace_id?: string;
} {
  const pipeline = commentFetchPipelinePayloadSchema.safeParse(payload);
  if (pipeline.success) {
    return {
      video_ids: [pipeline.data.videoId],
      trace_id: undefined,
    };
  }

  const batch = commentFetchBatchPayloadSchema.parse(payload);
  return {
    video_ids: batch.video_ids,
    options: batch.options,
    trace_id: batch.trace_id,
  };
}
