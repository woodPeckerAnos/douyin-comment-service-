/** 将 config/queue-jobs.yaml（或 QUEUE_JOB_NAMES）中的 job 名注册到 job-queue SDK */
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";
import { registerHandler } from "job-queue";
import { getConfig } from "../config.js";
import { handleCommentFetchJob } from "./handlers.js";
import { log } from "../utils/logger.js";

const queueJobsSchema = z.object({
  job_names: z.array(z.string().min(1)).min(1),
});

export async function registerCommentFetchHandlers(): Promise<string[]> {
  const config = getConfig();
  const fromEnv = process.env.QUEUE_JOB_NAMES?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  let jobNames = fromEnv;

  if (!jobNames?.length) {
    const raw = await readFile(config.queueJobsPath, "utf8");
    const parsed = queueJobsSchema.parse(parse(raw));
    jobNames = parsed.job_names;
  }

  for (const jobName of jobNames) {
    registerHandler(jobName, handleCommentFetchJob);
  }

  log.info("Registered queue handlers", {
    context: { job_names: jobNames },
  });
  return jobNames;
}
