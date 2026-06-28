/** HTTP 服务入口：Koa API + 队列入队，不消费 Redis */
import { startServer } from "./server/start.js";
import { getConfig } from "./config.js";
import { log } from "./utils/logger.js";

getConfig();

startServer().catch((error) => {
  log.fatal("Failed to start server", { error });
  process.exit(1);
});
