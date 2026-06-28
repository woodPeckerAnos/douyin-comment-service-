/** job-queue 消费端：解析 payload → runFetchJobBlocking → 失败抛出让队列重试 */
import type { JobMessage } from "job-queue";
import { runMigrations } from "../db/migrate.js";
import { isDatabaseEnabled } from "../db/pool.js";
import { runFetchJobBlocking } from "../services/batch-processor.js";
import { log } from "../utils/logger.js";
import { parseCommentFetchPayload } from "./payload.js";

export async function handleCommentFetchJob(message: JobMessage): Promise<void> {
  if (isDatabaseEnabled()) {
    await runMigrations();
  }

  const { video_ids, options, trace_id } = parseCommentFetchPayload(
    message.payload,
  );

  const started = Date.now();
  const traceId = message.traceId ?? trace_id;

  log.info("Comment fetch job started", {
    trace_id: traceId,
    job_name: message.jobName,
    context: {
      video_count: video_ids.length,
      trigger: message.trigger,
      attempt: message.attempt ?? 1,
    },
  });

  const fetchJob = await runFetchJobBlocking(video_ids, options);

  log.info("Comment fetch job completed", {
    trace_id: traceId,
    job_name: message.jobName,
    job_id: fetchJob.job_id,
    duration_ms: Date.now() - started,
    context: {
      status: fetchJob.status,
      result_count: fetchJob.results.length,
    },
  });

  if (fetchJob.status === "failed") {
    throw new Error(fetchJob.error ?? "Comment fetch job failed");
  }
}
