import { getConfig } from "../config.js";
import type { FetchOptions } from "../types/comment.js";
import {
  DEFAULT_STRATIFIED_QUOTAS,
  type SamplingOptions,
  type StratifiedQuotas,
} from "../types/sampling.js";

export interface FetchOptionsOverride {
  max_comments_per_video?: number;
  high_reply_threshold?: number;
  delay_ms?: number;
  sampling?: SamplingOptionsInput;
}

export interface SamplingOptionsInput {
  enabled?: boolean;
  strategy?: SamplingOptions["strategy"];
  over_fetch_target?: number;
  quotas?: Partial<StratifiedQuotas>;
}

export function resolveSamplingOptions(
  partial?: SamplingOptionsInput,
  maxComments?: number,
): SamplingOptions {
  const config = getConfig();
  const max = maxComments ?? config.MAX_COMMENTS_PER_VIDEO;

  const quotas: StratifiedQuotas = {
    ...DEFAULT_STRATIFIED_QUOTAS,
    ...partial?.quotas,
  };

  return {
    enabled: partial?.enabled ?? config.SAMPLING_ENABLED,
    strategy: partial?.strategy ?? "stratified",
    over_fetch_target:
      partial?.over_fetch_target ??
      config.SAMPLING_OVER_FETCH_TARGET ??
      Math.max(1500, max * 3),
    quotas,
  };
}

export function mergeFetchOptions(
  partial?: FetchOptionsOverride,
): FetchOptions {
  const config = getConfig();
  const maxComments =
    partial?.max_comments_per_video ?? config.MAX_COMMENTS_PER_VIDEO;

  return {
    max_comments_per_video: maxComments,
    high_reply_threshold:
      partial?.high_reply_threshold ?? config.HIGH_REPLY_THRESHOLD,
    delay_ms: partial?.delay_ms ?? config.REQUEST_DELAY_MS,
    sampling: resolveSamplingOptions(partial?.sampling, maxComments),
  };
}

export function getFetchCollectionTarget(options: FetchOptions): number {
  const sampling = options.sampling;
  if (sampling?.enabled && sampling.strategy === "stratified") {
    return Math.max(sampling.over_fetch_target, options.max_comments_per_video);
  }
  return options.max_comments_per_video;
}
