import { z } from "zod";

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

export const fetchOptionsSchema = z.object({
  max_comments_per_video: z.number().int().positive().max(5000).optional(),
  high_reply_threshold: z.number().int().nonnegative().optional(),
  delay_ms: z.number().int().nonnegative().optional(),
  sampling: samplingSchema.optional(),
});

export const fetchRequestSchema = z.object({
  video_ids: z.array(z.string().min(1)).min(1).max(100),
  options: fetchOptionsSchema.optional(),
});

export type FetchRequestBody = z.infer<typeof fetchRequestSchema>;
