import type { AppConfig } from "../config.js";
import type { Db } from "../db/index.js";
import type { Logger } from "../logger.js";

export interface BotDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
}
