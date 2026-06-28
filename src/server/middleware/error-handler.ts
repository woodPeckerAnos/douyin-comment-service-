import type { Context, Next } from "koa";
import { log } from "../../utils/logger.js";

export async function errorHandler(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    log.error("HTTP handler error", {
      error,
      http: { method: ctx.method, path: ctx.path, status: 500 },
    });
    ctx.status = 500;
    ctx.body = { error: message };
  }
}
