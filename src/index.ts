import Koa from "koa";
import bodyParser from "@koa/bodyparser";
import { getConfig, getPort } from "./config.js";
import { isDatabaseEnabled } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { commentsRouter } from "./routes/comments.js";

async function main(): Promise<void> {
  getConfig();

  if (isDatabaseEnabled()) {
    await runMigrations();
    console.log("[db] PostgreSQL connected, migrations applied");
  }

  const app = new Koa();

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      ctx.status = 500;
      ctx.body = { error: message };
    }
  });

  app.use(
    bodyParser({
      jsonLimit: "1mb",
      enableTypes: ["json"],
    }),
  );

  app.use(commentsRouter.routes());
  app.use(commentsRouter.allowedMethods());

  const port = getPort();
  app.listen(port, () => {
    console.log(`Douyin comment service listening on http://localhost:${port}`);
    console.log("  POST /api/comments/fetch");
    console.log("  GET  /api/comments/fetch/:jobId");
    console.log("  GET  /api/videos/:videoId/comments");
    console.log("  GET  /health");
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
