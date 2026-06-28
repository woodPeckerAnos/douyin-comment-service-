/** Koa HTTP 启动：迁移 DB、监听端口、注册 SIGINT/SIGTERM 优雅退出 */
import type { Server } from "node:http";
import { getPort } from "../config.js";
import { isDatabaseEnabled } from "../db/pool.js";
import { runMigrations } from "../db/migrate.js";
import { log } from "../utils/logger.js";
import { createApp, logHttpRoutes } from "./app.js";

let httpServer: Server | null = null;

export async function startServer(): Promise<void> {
  if (isDatabaseEnabled()) {
    await runMigrations();
    log.info("PostgreSQL migrations applied");
  }

  const app = createApp();
  const port = getPort();
  httpServer = app.listen(port, () => {
    logHttpRoutes(port);
  });

  registerShutdownHooks();
}

function registerShutdownHooks(): void {
  const shutdown = async (signal: string) => {
    log.info("Server shutting down", { context: { signal } });

    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      httpServer = null;
    }

    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
