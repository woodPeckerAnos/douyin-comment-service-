import type { SampleBucket, SamplingMeta, SamplingOptions } from "./sampling.js";

export type FetchStatus =
  | "ok"
  | "not_found"
  | "private"
  | "auth_expired"
  | "rate_limited"
  | "failed";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type { SampleBucket, SamplingMeta, SamplingOptions };

export interface Comment {
  comment_id: string;
  video_id: string;
  text: string;
  user_id: string;
  digg_count: number;
  reply_count: number;
  is_high_reply: boolean;
  create_time: number;
  /** 分层抽样来源桶（仅抽样开启时有值） */
  sample_bucket?: SampleBucket;
}

export interface FetchOptions {
  max_comments_per_video: number;
  high_reply_threshold: number;
  delay_ms?: number;
  sampling?: SamplingOptions;
}

export interface FetchResultMeta {
  fetched: number;
  truncated: boolean;
  pages: number;
  /** 抽样前实际收集条数 */
  collected_raw?: number;
  sampling?: SamplingMeta;
}

export interface FetchResult {
  video_id: string;
  status: FetchStatus;
  comments: Comment[];
  high_reply_comments: Comment[];
  meta: FetchResultMeta;
  error?: string;
}

export interface FetchJob {
  job_id: string;
  status: JobStatus;
  video_ids: string[];
  options: FetchOptions;
  results: FetchResult[];
  error?: string;
  created_at: string;
  completed_at?: string;
}

export class FetchError extends Error {
  constructor(
    readonly status: FetchStatus,
    message: string,
  ) {
    super(message);
    this.name = "FetchError";
  }
}
