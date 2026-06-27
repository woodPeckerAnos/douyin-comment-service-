import { enqueueJob, queueConfigFromEnv } from "job-queue";
import type { CommentFetchPayload } from "./payload.js";

export async function enqueueCommentFetchJob(
  jobName: string,
  payload: CommentFetchPayload,
): Promise<string> {
  return enqueueJob(queueConfigFromEnv(), jobName, payload, {
    trigger: "manual",
  });
}
