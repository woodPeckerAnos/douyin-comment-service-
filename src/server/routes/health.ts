import Router from "@koa/router";
import { getQueueStats, queueConfigFromEnv } from "job-queue";
import { isJobRunning } from "../../services/batch-processor.js";

export const healthRouter = new Router();

healthRouter.get("/health", async (ctx) => {
  const queueConfig = queueConfigFromEnv();
  let queueStats = null;

  try {
    queueStats = await getQueueStats(queueConfig);
  } catch {
    queueStats = null;
  }

  ctx.body = {
    status: "ok",
    job_running: isJobRunning(),
    queue: {
      name: queueConfig.queueName,
      redis: `${queueConfig.redis.host}:${queueConfig.redis.port}`,
      stats: queueStats,
    },
  };
});
