import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { getConfig } from "../config.js";

export interface DouyinPlatformConfig {
  videoUrlTemplate: string;
  network: {
    urlPatterns: string[];
  };
}

let cachedPlatformConfig: DouyinPlatformConfig | null = null;

export async function loadDouyinConfig(): Promise<DouyinPlatformConfig> {
  if (cachedPlatformConfig) {
    return cachedPlatformConfig;
  }

  const config = getConfig();
  const raw = await fs.readFile(config.platformConfigPath, "utf8");
  const parsed = parseYaml(raw) as {
    videoUrlTemplate?: string;
    network?: { urlPatterns?: string[] };
  };

  cachedPlatformConfig = {
    videoUrlTemplate:
      parsed.videoUrlTemplate ?? "https://www.douyin.com/video/{videoId}",
    network: {
      urlPatterns: parsed.network?.urlPatterns ?? [
        "/aweme/v1/web/comment/list/",
      ],
    },
  };
  return cachedPlatformConfig;
}

export function matchesDouyinNetworkUrl(
  platformCfg: DouyinPlatformConfig,
  url: string,
): boolean {
  return platformCfg.network.urlPatterns.some((pattern) => url.includes(pattern));
}

export function buildDouyinVideoUrl(
  platformCfg: DouyinPlatformConfig,
  videoId: string,
): string {
  return platformCfg.videoUrlTemplate.replace("{videoId}", videoId);
}

export function resetDouyinConfigForTests(): void {
  cachedPlatformConfig = null;
}
