import { startServer } from "./server/start.js";
import { getConfig } from "./config.js";
import { log } from "./utils/logger.js";

getConfig();

startServer().catch((error) => {
  log.fatal("Failed to start server", { error });
  process.exit(1);
});
