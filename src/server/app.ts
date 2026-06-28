import Koa from "koa";
import bodyParser from "@koa/bodyparser";
import { log } from "../utils/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { httpLogger } from "./middleware/http-logger.js";
import { commentsRouter } from "./routes/comments.js";
import { healthRouter } from "./routes/health.js";
import { queueRouter } from "./routes/queue.js";

export function createApp(): Koa {
  const app = new Koa();

  app.use(errorHandler);
  app.use(httpLogger);
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
  log.info("HTTP server listening", {
    context: {
      url: `http://localhost:${port}`,
      routes: [
        "GET /health",
        "POST /api/comments/fetch",
        "GET /api/comments/fetch/:jobId",
        "GET /api/videos/:videoId/comments",
        "POST /api/queue/comments/fetch",
      ],
    },
  });
}
