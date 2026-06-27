import Koa from "koa";
import bodyParser from "@koa/bodyparser";
import { errorHandler } from "./middleware/error-handler.js";
import { commentsRouter } from "./routes/comments.js";
import { healthRouter } from "./routes/health.js";
import { queueRouter } from "./routes/queue.js";

export function createApp(): Koa {
  const app = new Koa();

  app.use(errorHandler);
  app.use(
    bodyParser({
      jsonLimit: "1mb",
      enableTypes: ["json"],
    }),
  );

  app.use(healthRouter.routes());
  app.use(healthRouter.allowedMethods());
  app.use(commentsRouter.routes());
  app.use(commentsRouter.allowedMethods());
  app.use(queueRouter.routes());
  app.use(queueRouter.allowedMethods());

  return app;
}

export function logHttpRoutes(port: number): void {
  console.log(`Douyin comment service listening on http://localhost:${port}`);
  console.log("  GET  /health");
  console.log("  POST /api/comments/fetch");
  console.log("  GET  /api/comments/fetch/:jobId");
  console.log("  GET  /api/videos/:videoId/comments");
  console.log("  POST /api/queue/comments/fetch");
}
