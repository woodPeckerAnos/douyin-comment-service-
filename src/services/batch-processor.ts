import { mergeFetchOptions, type FetchOptionsOverride } from "./fetch-options.js";
import { PlaywrightDriver } from "../drivers/playwright-driver.js";
import { FetchError } from "../types/comment.js";
import type { FetchJob, FetchOptions, FetchResult } from "../types/comment.js";
import { CommentFetcher } from "./comment-fetcher.js";
import { getJobStore } from "./job-store.js";
import { randomDelay, sleep } from "../utils/retry.js";
import { normalizeVideoId } from "../utils/video-id.js";

let runningJobId: string | null = null;

export function isJobRunning(): boolean {
  return runningJobId !== null;
}

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
    await store.markFailed(job.job_id, message);
    runningJobId = null;
  });

  return job.job_id;
}

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

  const driver = await PlaywrightDriver.create();
  try {
    const loggedIn = await driver.isLoggedIn();
    if (!loggedIn) {
      for (const videoId of job.video_ids) {
        await store.appendResult(jobId, authExpiredResult(videoId));
      }
      await store.markCompleted(jobId);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await store.markFailed(jobId, message);
    throw error;
  } finally {
    await driver.close();
    runningJobId = null;
  }
}

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
