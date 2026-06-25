import Router from "@koa/router";
import { z } from "zod";
import {
  fetchVideoCommentsSync,
  isJobRunning,
  startFetchJob,
} from "../services/batch-processor.js";
import { getJobStore } from "../services/job-store.js";
import { isValidDouyinVideoId, normalizeVideoId } from "../utils/video-id.js";

const samplingQuotasSchema = z.object({
  top_by_digg: z.number().int().nonnegative().optional(),
  latest_by_time: z.number().int().nonnegative().optional(),
  high_reply: z.number().int().nonnegative().optional(),
  random: z.number().int().nonnegative().optional(),
});

const samplingSchema = z.object({
  enabled: z.boolean().optional(),
  strategy: z.enum(["none", "stratified"]).optional(),
  over_fetch_target: z.number().int().positive().max(10000).optional(),
  quotas: samplingQuotasSchema.optional(),
});

const fetchRequestSchema = z.object({
  video_ids: z.array(z.string().min(1)).min(1).max(100),
  options: z
    .object({
      max_comments_per_video: z.number().int().positive().max(5000).optional(),
      high_reply_threshold: z.number().int().nonnegative().optional(),
      delay_ms: z.number().int().nonnegative().optional(),
      sampling: samplingSchema.optional(),
    })
    .optional(),
});

export const commentsRouter = new Router();

commentsRouter.get("/health", async (ctx) => {
  ctx.body = {
    status: "ok",
    job_running: isJobRunning(),
  };
});

commentsRouter.post("/api/comments/fetch", async (ctx) => {
  const parsed = fetchRequestSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      error: "Invalid request body",
      details: parsed.error.flatten(),
    };
    return;
  }

  try {
    const jobId = await startFetchJob(
      parsed.data.video_ids,
      parsed.data.options,
    );
    ctx.status = 202;
    ctx.body = { job_id: jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start job";
    ctx.status = 409;
    ctx.body = { error: message };
  }
});

commentsRouter.get("/api/comments/fetch/:jobId", async (ctx) => {
  const job = await getJobStore().getJob(ctx.params.jobId);
  if (!job) {
    ctx.status = 404;
    ctx.body = { error: "Job not found" };
    return;
  }
  ctx.body = job;
});

commentsRouter.get("/api/videos/:videoId/comments", async (ctx) => {
  const videoId = normalizeVideoId(ctx.params.videoId);
  if (!videoId || !isValidDouyinVideoId(videoId)) {
    ctx.status = 400;
    ctx.body = { error: "Invalid video_id" };
    return;
  }

  const limitRaw = ctx.query.limit;
  const thresholdRaw = ctx.query.threshold;
  const limit =
    typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) : undefined;
  const threshold =
    typeof thresholdRaw === "string"
      ? Number.parseInt(thresholdRaw, 10)
      : undefined;

  if (isJobRunning()) {
    ctx.status = 409;
    ctx.body = { error: "Another fetch job is currently running" };
    return;
  }

  const result = await fetchVideoCommentsSync(videoId, {
    max_comments_per_video: Number.isFinite(limit) ? limit : undefined,
    high_reply_threshold: Number.isFinite(threshold) ? threshold : undefined,
  });

  ctx.body = result;
});
