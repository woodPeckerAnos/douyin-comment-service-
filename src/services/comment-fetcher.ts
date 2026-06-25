import { applyStratifiedSampling } from "./comment-sampler.js";
import { getFetchCollectionTarget } from "./fetch-options.js";
import type { Response } from "playwright-core";
import { getConfig } from "../config.js";
import {
  buildDouyinVideoUrl,
  loadDouyinConfig,
  matchesDouyinNetworkUrl,
} from "../config/platform-config.js";
import { PlaywrightDriver } from "../drivers/playwright-driver.js";
import {
  filterHighReplyComments,
  mergeComments,
  parseCommentListResponse,
} from "../parsers/comment-parser.js";
import type { FetchOptions, FetchResult } from "../types/comment.js";
import type { SamplingMeta } from "../types/sampling.js";
import { FetchError } from "../types/comment.js";
import { logProgress } from "../utils/logger.js";
import { randomDelay, sleep } from "../utils/retry.js";

export class CommentFetcher {
  constructor(private readonly driver: PlaywrightDriver) {}

  async fetchVideoComments(
    videoId: string,
    options: FetchOptions,
  ): Promise<FetchResult> {
    const config = getConfig();
    const platformCfg = await loadDouyinConfig();
    const collectionTarget = getFetchCollectionTarget(options);
    const sampling = options.sampling;
    const collected = new Map<string, import("../types/comment.js").Comment>();
    let pages = 0;
    let lastHasMore = false;
    let lastCursor: string | undefined;
    let sawAnyResponse = false;
    let lastRawCount = 0;
    let lastStatusCode: number | undefined;
    let lastStatusMsg: string | undefined;

    const onResponse = async (response: Response) => {
      const url = response.url();
      if (!matchesDouyinNetworkUrl(platformCfg, url)) {
        return;
      }

      try {
        const text = await response.text();
        if (!text.includes("comment") && !text.includes("comments")) {
          return;
        }

        sawAnyResponse = true;
        const parsed = parseCommentListResponse(
          text,
          videoId,
          options.high_reply_threshold,
        );
        lastStatusCode = parsed.status_code;
        lastStatusMsg = parsed.status_msg;
        lastHasMore = parsed.has_more;
        lastCursor = parsed.cursor;
        lastRawCount = parsed.comments.length;
        const beforeMerge = collected.size;
        mergeComments(collected, parsed.comments);
        void (collected.size - beforeMerge); // merged count for this response
      } catch {
        // ignore unreadable responses
      }
    };

    this.driver.onResponse(onResponse);

    try {
      const videoUrl = buildDouyinVideoUrl(platformCfg, videoId);
      logProgress(`打开视频页 ${videoUrl}`);
      await this.driver.goto(videoUrl);
      await this.driver.wait(config.PAGE_WAIT_MS);

      logProgress("滚动至评论区（route-scroll-container）…");
      await this.driver.openCommentPanel();
      await this.driver.wait(config.SCROLL_DELAY_MS);

      if (sampling?.enabled) {
        logProgress(
          `分层抽样已开启：先收集 ${collectionTarget} 条，再抽样至 ${options.max_comments_per_video} 条`,
        );
      }

      let stableRounds = 0;

      while (
        collected.size < collectionTarget &&
        pages < config.MAX_PAGES_PER_VIDEO
      ) {
        const beforeCount = collected.size;
        await this.waitForCommentResponses(config.SCROLL_DELAY_MS);

        if (collected.size === beforeCount) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
          pages += 1;
          logProgress(
            `已收集 ${collected.size}/${collectionTarget} 条（第 ${pages} 页，本页 +${collected.size - beforeCount}，has_more=${lastHasMore}${lastCursor ? `, cursor=${lastCursor}` : ""}）`,
          );
        }

        if (collected.size >= collectionTarget) {
          break;
        }

        const maxStableRounds = lastHasMore ? 8 : 3;
        if (stableRounds >= maxStableRounds) {
          logProgress(
            `连续 ${maxStableRounds} 轮无新评论，停止翻页（has_more=${lastHasMore}）`,
          );
          break;
        }

        const scrollResult = await this.driver.scrollForMoreComments();
        logProgress(
          scrollResult.scrolled
            ? `滚动 ${scrollResult.target} | ${scrollResult.detail}`
            : `滚动未移动 | ${scrollResult.detail}`,
        );
        await sleep(randomDelay(config.SCROLL_DELAY_MS));
      }

      if (pages === 0 && lastRawCount > 0) {
        logProgress(
          `首屏 API 返回 ${lastRawCount} 条，解析合并后共 ${collected.size} 条`,
        );
      }

      const rawComments = Array.from(collected.values());
      const collectedRaw = rawComments.length;

      let comments = rawComments;
      let samplingMeta: SamplingMeta | undefined;

      if (sampling?.enabled && sampling.strategy === "stratified") {
        const sampled = applyStratifiedSampling(
          rawComments,
          options.max_comments_per_video,
          sampling.quotas,
        );
        comments = sampled.comments;
        samplingMeta = sampled.meta;
        logProgress(
          `分层抽样完成：${samplingMeta.collected_before_sample} → ${samplingMeta.output_count} 条（top_digg=${samplingMeta.bucket_counts.top_digg}, latest=${samplingMeta.bucket_counts.latest}, high_reply=${samplingMeta.bucket_counts.high_reply}, random=${samplingMeta.bucket_counts.random}）`,
        );
      } else {
        comments = rawComments.slice(0, options.max_comments_per_video);
      }

      if (!sawAnyResponse) {
        const pageTitle = await this.detectPageIssue();
        if (pageTitle === "not_found") {
          throw new FetchError("not_found", `Video not found: ${videoId}`);
        }
        if (pageTitle === "private") {
          throw new FetchError("private", `Video is private or unavailable: ${videoId}`);
        }
        throw new FetchError(
          "rate_limited",
          `No comment responses captured for video ${videoId}`,
        );
      }

      if (comments.length === 0 && lastStatusCode != null && lastStatusCode !== 0) {
        if (lastStatusCode === 5) {
          throw new FetchError("private", lastStatusMsg ?? "Video unavailable");
        }
        throw new FetchError(
          "failed",
          lastStatusMsg ?? `Douyin status_code=${lastStatusCode}`,
        );
      }

      if (comments.length === 0) {
        throw new FetchError(
          "rate_limited",
          `Empty comment list for video ${videoId}`,
        );
      }

      return {
        video_id: videoId,
        status: "ok",
        comments,
        high_reply_comments: filterHighReplyComments(comments),
        meta: {
          fetched: comments.length,
          collected_raw: collectedRaw,
          truncated:
            collectedRaw >= collectionTarget ||
            (collectedRaw >= options.max_comments_per_video && lastHasMore),
          pages: Math.max(pages, 1),
          sampling: samplingMeta,
        },
      };
    } finally {
      this.driver.offResponse(onResponse);
    }
  }

  private async waitForCommentResponses(ms: number): Promise<void> {
    await this.driver.wait(ms);
  }

  private async detectPageIssue(): Promise<"not_found" | "private" | "unknown"> {
    try {
      return await this.driver.evaluate(`() => {
        const text = document.body?.innerText ?? "";
        if (text.includes("视频不存在") || text.includes("页面不存在")) {
          return "not_found";
        }
        if (text.includes("私密") || text.includes("不可见")) {
          return "private";
        }
        return "unknown";
      }`);
    } catch {
      return "unknown";
    }
  }
}

export async function fetchSingleVideoComments(
  videoId: string,
  options: FetchOptions,
): Promise<FetchResult> {
  logProgress("启动浏览器（复用 discovery Profile）…");
  let driver: PlaywrightDriver;
  try {
    driver = await PlaywrightDriver.create();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to launch browser";
    logProgress(`浏览器启动失败: ${message}`);
    return {
      video_id: videoId,
      status: "failed",
      comments: [],
      high_reply_comments: [],
      meta: { fetched: 0, truncated: false, pages: 0 },
      error: message,
    };
  }

  try {
    logProgress("检查登录态…");
    const loggedIn = await driver.isLoggedIn();
    if (!loggedIn) {
      logProgress("未检测到有效 sessionid");
      return {
        video_id: videoId,
        status: "auth_expired",
        comments: [],
        high_reply_comments: [],
        meta: { fetched: 0, truncated: false, pages: 0 },
        error: "Browser profile is not logged in. Run login in content-discovery-service.",
      };
    }

    logProgress("登录态有效，开始拉取评论…");
    const fetcher = new CommentFetcher(driver);
    const result = await fetcher.fetchVideoComments(videoId, options);
    logProgress(`完成：status=${result.status}, fetched=${result.meta.fetched}`);
    return result;
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

    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      video_id: videoId,
      status: "failed",
      comments: [],
      high_reply_comments: [],
      meta: { fetched: 0, truncated: false, pages: 0 },
      error: message,
    };
  } finally {
    await driver.close();
  }
}
