import { z } from "zod";
import { fetchOptionsSchema } from "../server/schemas/fetch-request.js";

export const commentFetchPayloadSchema = z.object({
  video_ids: z.array(z.string().min(1)).min(1).max(100),
  options: fetchOptionsSchema.optional(),
  trace_id: z.string().min(1).optional(),
});

export type CommentFetchPayload = z.infer<typeof commentFetchPayloadSchema>;

export function parseCommentFetchPayload(payload: unknown): CommentFetchPayload {
  return commentFetchPayloadSchema.parse(payload);
}
