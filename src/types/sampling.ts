export type SampleBucket = "top_digg" | "latest" | "high_reply" | "random" | "fill";

export type SamplingStrategy = "none" | "stratified";

export interface StratifiedQuotas {
  top_by_digg: number;
  latest_by_time: number;
  high_reply: number;
  random: number;
}

export interface SamplingOptions {
  enabled: boolean;
  strategy: SamplingStrategy;
  /** 抽样前先 over-fetch 的目标条数 */
  over_fetch_target: number;
  quotas: StratifiedQuotas;
}

export interface SamplingMeta {
  strategy: SamplingStrategy;
  collected_before_sample: number;
  output_count: number;
  quotas: StratifiedQuotas;
  bucket_counts: Record<SampleBucket, number>;
}

export const DEFAULT_STRATIFIED_QUOTAS: StratifiedQuotas = {
  top_by_digg: 200,
  latest_by_time: 150,
  high_reply: 100,
  random: 50,
};
