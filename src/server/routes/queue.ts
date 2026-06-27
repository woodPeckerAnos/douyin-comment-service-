import Router from "@koa/router";
import { z } from "zod";
import { getConfig } from "../../config.js";
import { enqueueCommentFetchJob } from "../../mq/enqueue.js";
import { fetchRequestSchema } from "../schemas/fetch-request.js";

const enqueueRequestSchema = fetchRequestSchema.extend({
  job_name: z.string().min(1).optional(),
});

export const queueRouter = new Router();

queueRouter.post("/api/queue/comments/fetch", async (ctx) => {
  const parsed = enqueueRequestSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      error: "Invalid request body",
      details: parsed.error.flatten(),
    };
    return;
  }

  const config = getConfig();
  const traceId =
    typeof ctx.request.headers["x-trace-id"] === "string"
      ? ctx.request.headers["x-trace-id"]
      : undefined;

  const jobName = parsed.data.job_name ?? config.QUEUE_DEFAULT_JOB_NAME;

  try {
    const queueJobId = await enqueueCommentFetchJob(jobName, {
      video_ids: parsed.data.video_ids,
      options: parsed.data.options,
      trace_id: traceId,
    });

    ctx.status = 202;
    ctx.body = {
      queue_job_id: queueJobId,
      job_name: jobName,
      trace_id: traceId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to enqueue job";
    ctx.status = 503;
    ctx.body = { error: message };
  }
});
