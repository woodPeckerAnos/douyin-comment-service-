import { startServer } from "./server/start.js";
import { getConfig } from "./config.js";

getConfig();

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
