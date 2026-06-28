/**
 * 批量拉取任务编排：HTTP 异步（startFetchJob）与 MQ 同步（runFetchJobBlocking）共用 processJob。
 *
 * 约束：进程内同时只能跑一个 fetch job（runningJobId），因与 content-discovery
 * 共享 Chrome Profile，调度层亦应避免 discovery 与 comment 并行占用 Profile。
 */
import { mergeFetchOptions, type FetchOptionsOverride } from "./fetch-options.js";
import { PlaywrightDriver } from "../drivers/playwright-driver.js";
import { FetchError } from "../types/comment.js";
import type { FetchJob, FetchOptions, FetchResult } from "../types/comment.js";
import { CommentFetcher } from "./comment-fetcher.js";
import { getJobStore } from "./job-store.js";
import { randomDelay, sleep } from "../utils/retry.js";
import { normalizeVideoId } from "../utils/video-id.js";
import { log } from "../utils/logger.js";

/** 进程内单 job 互斥；与 Playwright 单 Profile 绑定 */
let runningJobId: string | null = null;

export function isJobRunning(): boolean {
  return runningJobId !== null;
}

/** HTTP 202：创建 job 后立即返回，后台 void processJob */
export async function startFetchJob(
  videoIds: string[],
  options?: FetchOptionsOverride,
): Promise<string> {
  if (runningJobId) {
    throw new Error(`Another job is running: ${runningJobId}`);
  }

  const normalizedIds = videoIds.map((id) => normalizeVideoId(id)).filter(Boolean);
  if (normalizedIds.length !== videoIds.length) {
    throw new Error("All video_ids must be valid Douyin video IDs or URLs");
  }

  const mergedOptions = mergeFetchOptions(options);

  const store = getJobStore();
  const job = await store.createJob(normalizedIds as string[], mergedOptions);

  void processJob(job.job_id).catch(async (error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("Fetch job failed", {
      job_id: job.job_id,
      error,
      context: { video_count: normalizedIds.length },
    });
    await store.markFailed(job.job_id, message);
    runningJobId = null;
  });

  log.info("Fetch job accepted", {
    job_id: job.job_id,
    context: { video_count: normalizedIds.length, async: true },
  });

  return job.job_id;
}

/** MQ Worker：阻塞直到整批视频处理完毕，失败时抛出让 job-queue 重试 */
export async function runFetchJobBlocking(
  videoIds: string[],
  options?: FetchOptionsOverride,
): Promise<FetchJob> {
  if (runningJobId) {
    throw new Error(`Another job is running: ${runningJobId}`);
  }

  const normalizedIds = videoIds.map((id) => normalizeVideoId(id)).filter(Boolean);
  if (normalizedIds.length !== videoIds.length) {
    throw new Error("All video_ids must be valid Douyin video IDs or URLs");
  }

  const mergedOptions = mergeFetchOptions(options);
  const store = getJobStore();
  const job = await store.createJob(normalizedIds as string[], mergedOptions);

  try {
    await processJob(job.job_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await store.markFailed(job.job_id, message);
    throw error;
  }

  const completed = await store.getJob(job.job_id);
  if (!completed) {
    throw new Error(`Job not found after completion: ${job.job_id}`);
  }
  return completed;
}

async function processJob(jobId: string): Promise<void> {
  const store = getJobStore();
  const job = await store.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  runningJobId = jobId;
  await store.markRunning(jobId);
  const started = Date.now();

  log.info("Fetch job started", {
    job_id: jobId,
    context: { video_count: job.video_ids.length },
  });

  const driver = await PlaywrightDriver.create();
  try {
    const loggedIn = await driver.isLoggedIn();
    if (!loggedIn) {
      log.warn("Browser profile not logged in", { job_id: jobId });
      for (const videoId of job.video_ids) {
        await store.appendResult(jobId, authExpiredResult(videoId));
      }
      await store.markCompleted(jobId);
      log.info("Fetch job completed", {
        job_id: jobId,
        duration_ms: Date.now() - started,
        context: { status: "auth_expired" },
      });
      return;
    }

    const fetcher = new CommentFetcher(driver);
    for (let index = 0; index < job.video_ids.length; index += 1) {
      const videoId = job.video_ids[index]!;
      const result = await fetchVideoWithFetcher(fetcher, videoId, job.options);
      await store.appendResult(jobId, result);

      if (index < job.video_ids.length - 1) {
        await sleep(randomDelay(job.options.delay_ms ?? 1500));
      }
    }

    await store.markCompleted(jobId);
    log.info("Fetch job completed", {
      job_id: jobId,
      duration_ms: Date.now() - started,
      context: {
        video_count: job.video_ids.length,
        result_count: job.results.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("Fetch job failed", {
      job_id: jobId,
      duration_ms: Date.now() - started,
      error,
    });
    await store.markFailed(jobId, message);
    throw error;
  } finally {
    await driver.close();
    runningJobId = null;
  }
}

/** 单视频业务错误转为 FetchResult，不中断同 job 内后续视频 */
async function fetchVideoWithFetcher(
  fetcher: CommentFetcher,
  videoId: string,
  options: FetchOptions,
): Promise<FetchResult> {
  try {
    return await fetcher.fetchVideoComments(videoId, options);
  } catch (error) {
    if (error instanceof FetchError) {
      return {
        video_id: videoId,
        status: error.status,
        comments: [],
        high_reply_comments: [],
        meta: { fetched: 0, truncated: false, pages: 0 },
        error: error.message,
      };
    }

    return {
      video_id: videoId,
      status: "failed",
      comments: [],
      high_reply_comments: [],
      meta: { fetched: 0, truncated: false, pages: 0 },
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function authExpiredResult(videoId: string): FetchResult {
  return {
    video_id: videoId,
    status: "auth_expired",
    comments: [],
    high_reply_comments: [],
    meta: { fetched: 0, truncated: false, pages: 0 },
    error:
      "Browser profile is not logged in. Run login in content-discovery-service.",
  };
}

/** CLI / 调试：不经 JobStore，单进程单次拉取 */
export async function fetchVideoCommentsSync(
  videoIdInput: string,
  options?: FetchOptionsOverride,
): Promise<FetchResult> {
  const videoId = normalizeVideoId(videoIdInput);
  if (!videoId) {
    throw new Error("Invalid video_id");
  }

  const mergedOptions = mergeFetchOptions(options);

  const { fetchSingleVideoComments } = await import("./comment-fetcher.js");
  return fetchSingleVideoComments(videoId, mergedOptions);
}
