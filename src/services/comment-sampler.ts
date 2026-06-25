import type { Comment } from "../types/comment.js";
import type {
  SampleBucket,
  SamplingMeta,
  StratifiedQuotas,
} from "../types/sampling.js";
import { DEFAULT_STRATIFIED_QUOTAS } from "../types/sampling.js";

export interface StratifiedSampleResult {
  comments: Comment[];
  meta: SamplingMeta;
}

function shuffleInPlace<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

export function normalizeQuotas(
  quotas: StratifiedQuotas,
  targetSize: number,
): StratifiedQuotas {
  const sum =
    quotas.top_by_digg +
    quotas.latest_by_time +
    quotas.high_reply +
    quotas.random;

  if (sum <= targetSize) {
    return quotas;
  }

  const scale = targetSize / sum;
  const scaled: StratifiedQuotas = {
    top_by_digg: Math.floor(quotas.top_by_digg * scale),
    latest_by_time: Math.floor(quotas.latest_by_time * scale),
    high_reply: Math.floor(quotas.high_reply * scale),
    random: Math.floor(quotas.random * scale),
  };

  let remainder =
    targetSize -
    (scaled.top_by_digg +
      scaled.latest_by_time +
      scaled.high_reply +
      scaled.random);

  const keys: (keyof StratifiedQuotas)[] = [
    "top_by_digg",
    "latest_by_time",
    "high_reply",
    "random",
  ];
  let idx = 0;
  while (remainder > 0) {
    scaled[keys[idx % keys.length]!] += 1;
    remainder -= 1;
    idx += 1;
  }

  return scaled;
}

function pickFromPool(
  pool: Comment[],
  count: number,
  bucket: SampleBucket,
  picked: Map<string, Comment>,
): number {
  let added = 0;
  for (const comment of pool) {
    if (added >= count) {
      break;
    }
    if (picked.has(comment.comment_id)) {
      continue;
    }
    picked.set(comment.comment_id, { ...comment, sample_bucket: bucket });
    added += 1;
  }
  return added;
}

export function applyStratifiedSampling(
  source: Comment[],
  targetSize: number,
  quotasInput: StratifiedQuotas = DEFAULT_STRATIFIED_QUOTAS,
): StratifiedSampleResult {
  const quotas = normalizeQuotas(quotasInput, targetSize);
  const picked = new Map<string, Comment>();
  const bucketCounts: Record<SampleBucket, number> = {
    top_digg: 0,
    latest: 0,
    high_reply: 0,
    random: 0,
    fill: 0,
  };

  if (source.length <= targetSize) {
    const comments = source.map((comment) => ({ ...comment }));
    return {
      comments,
      meta: {
        strategy: "stratified",
        collected_before_sample: source.length,
        output_count: comments.length,
        quotas,
        bucket_counts: bucketCounts,
      },
    };
  }

  const byDigg = [...source].sort((a, b) => b.digg_count - a.digg_count);
  bucketCounts.top_digg = pickFromPool(
    byDigg,
    quotas.top_by_digg,
    "top_digg",
    picked,
  );

  const byHighReply = [...source]
    .filter((c) => c.is_high_reply)
    .sort((a, b) => b.reply_count - a.reply_count);
  bucketCounts.high_reply = pickFromPool(
    byHighReply,
    quotas.high_reply,
    "high_reply",
    picked,
  );

  const byTime = [...source].sort((a, b) => b.create_time - a.create_time);
  bucketCounts.latest = pickFromPool(
    byTime,
    quotas.latest_by_time,
    "latest",
    picked,
  );

  const remaining = source.filter((c) => !picked.has(c.comment_id));
  shuffleInPlace(remaining);
  bucketCounts.random = pickFromPool(
    remaining,
    quotas.random,
    "random",
    picked,
  );

  if (picked.size < targetSize) {
    const fillPool = source.filter((c) => !picked.has(c.comment_id));
    bucketCounts.fill = pickFromPool(
      fillPool,
      targetSize - picked.size,
      "fill",
      picked,
    );
  }

  const comments = Array.from(picked.values()).slice(0, targetSize);

  return {
    comments,
    meta: {
      strategy: "stratified",
      collected_before_sample: source.length,
      output_count: comments.length,
      quotas,
      bucket_counts: bucketCounts,
    },
  };
}
