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

  log.info("Starting comment fetch job", {
    jobName: message.jobName,
    traceId: trace_id,
    videoCount: video_ids.length,
    trigger: message.trigger,
    attempt: message.attempt ?? 1,
  });

  const fetchJob = await runFetchJobBlocking(video_ids, options);

  log.info("Comment fetch job finished", {
    jobName: message.jobName,
    traceId: trace_id,
    fetchJobId: fetchJob.job_id,
    status: fetchJob.status,
    resultCount: fetchJob.results.length,
  });

  if (fetchJob.status === "failed") {
    throw new Error(fetchJob.error ?? "Comment fetch job failed");
  }
}
