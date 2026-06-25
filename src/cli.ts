import { fetchVideoCommentsSync } from "./services/batch-processor.js";
import { normalizeVideoId } from "./utils/video-id.js";
import { logProgress } from "./utils/logger.js";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const videoInput = args["video-id"] ?? args.videoId;
  if (!videoInput) {
    console.error("Usage: npm run fetch -- --video-id <id-or-url>");
    process.exit(1);
  }

  const videoId = normalizeVideoId(videoInput);
  if (!videoId) {
    console.error("Invalid video id or url");
    process.exit(1);
  }

  const limit = args.limit ? Number.parseInt(args.limit, 10) : undefined;
  const threshold = args.threshold
    ? Number.parseInt(args.threshold, 10)
    : undefined;

  const noSampling = args["no-sampling"] === "true";
  const overFetch = args["over-fetch"]
    ? Number.parseInt(args["over-fetch"], 10)
    : undefined;

  logProgress(`开始拉取 video_id=${videoId}`);

  const result = await fetchVideoCommentsSync(videoId, {
    max_comments_per_video: Number.isFinite(limit) ? limit : undefined,
    high_reply_threshold: Number.isFinite(threshold) ? threshold : undefined,
    sampling: {
      enabled: noSampling ? false : undefined,
      over_fetch_target: Number.isFinite(overFetch) ? overFetch : undefined,
    },
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
