import { createWorker } from "job-queue";
import { registerCommentFetchHandlers } from "./mq/register.js";
import { log, logFromJobQueue } from "./utils/logger.js";

async function main(): Promise<void> {
  const jobNames = await registerCommentFetchHandlers();

  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 1);
  if (concurrency > 1) {
    log.warn(
      "WORKER_CONCURRENCY > 1：多个任务会争抢同一浏览器 Profile，建议设为 1",
      { context: { concurrency } },
    );
  }

  const worker = createWorker({
    concurrency,
    consumerName: process.env.WORKER_NAME ?? "douyin-comment",
    onLog: (level, message, meta) => logFromJobQueue(level, message, meta),
  });

  const shutdown = (signal: string) => {
    log.info("Shutting down worker", {
      context: { signal, jobNames },
    });
    worker.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  log.info("Comment fetch worker starting", {
    context: {
      queue: process.env.QUEUE_NAME ?? "jobs",
      redis: `${process.env.REDIS_HOST ?? "127.0.0.1"}:${process.env.REDIS_PORT ?? 6379}`,
      concurrency,
      jobNames,
    },
  });

  await worker.start();
}

main().catch((error) => {
  log.fatal("Worker failed to start", { error });
  process.exit(1);
});
