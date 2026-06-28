/** HTTP POST /api/queue/comments/fetch 入队封装 */
import { enqueueJob, queueConfigFromEnv } from "job-queue";
import type { CommentFetchBatchPayload, CommentFetchPipelinePayload } from "./payload.js";

export async function enqueueCommentFetchJob(
  jobName: string,
  payload: CommentFetchBatchPayload | CommentFetchPipelinePayload,
  options: { trigger?: "manual" | "pipeline"; traceId?: string } = {},
): Promise<string> {
  return enqueueJob(queueConfigFromEnv(), jobName, payload, {
    trigger: options.trigger ?? "manual",
    traceId: options.traceId,
  });
}
