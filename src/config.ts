import "dotenv/config";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FetchOptionsOverride } from "./services/fetch-options.js";
import { mergeFetchOptions } from "./services/fetch-options.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const DEFAULT_PROFILE_DIR = path.resolve(
  projectRoot,
  "../content-discovery-service/profiles/douyin",
);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HEADLESS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  BROWSER_PROFILE_DIR: z.string().default(DEFAULT_PROFILE_DIR),
  BROWSER_CHANNEL: z.string().default("chrome"),
  MAX_COMMENTS_PER_VIDEO: z.coerce.number().int().positive().default(500),
  HIGH_REPLY_THRESHOLD: z.coerce.number().int().nonnegative().default(10),
  REQUEST_DELAY_MS: z.coerce.number().int().nonnegative().default(1500),
  JOBS_DIR: z.string().default("jobs"),
  RESULTS_DIR: z.string().default("results"),
  PAGE_WAIT_MS: z.coerce.number().int().positive().default(3000),
  SCROLL_DELAY_MS: z.coerce.number().int().positive().default(1500),
  MAX_PAGES_PER_VIDEO: z.coerce.number().int().positive().default(50),
  SAMPLING_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SAMPLING_OVER_FETCH_TARGET: z.coerce.number().int().positive().default(1500),
  QUEUE_JOBS_CONFIG_PATH: z.string().default("config/queue-jobs.yaml"),
  QUEUE_DEFAULT_JOB_NAME: z.string().default("douyin_fetch_comments"),
});

export type AppConfig = z.infer<typeof envSchema> & {
  projectRoot: string;
  browserProfilePath: string;
  jobsPath: string;
  resultsPath: string;
  platformConfigPath: string;
  queueJobsPath: string;
};

let cachedConfig: AppConfig | null = null;

function resolveFromRoot(relativePath: string): string {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.join(projectRoot, relativePath);
}

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = envSchema.parse(process.env);
  cachedConfig = {
    ...parsed,
    projectRoot,
    browserProfilePath: path.resolve(parsed.BROWSER_PROFILE_DIR),
    jobsPath: resolveFromRoot(parsed.JOBS_DIR),
    resultsPath: resolveFromRoot(parsed.RESULTS_DIR),
    platformConfigPath: path.join(projectRoot, "config/platforms/douyin.yaml"),
    queueJobsPath: resolveFromRoot(parsed.QUEUE_JOBS_CONFIG_PATH),
  };
  return cachedConfig;
}

export function getPort(): number {
  return getConfig().PORT;
}

export function resetConfigForTests(): void {
  cachedConfig = null;
}

export function getDefaultFetchOptions(): import("./types/comment.js").FetchOptions {
  return mergeFetchOptions({});
}
