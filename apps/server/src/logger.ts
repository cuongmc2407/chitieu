import pino from "pino";
import type { AppConfig } from "./config.js";

export function createLogger(config: Pick<AppConfig, "logLevel">) {
  // Skip the pino-pretty worker thread entirely when nothing will be logged
  // (e.g. tests run with logLevel "silent") — no point paying its startup cost.
  const pretty = process.env.NODE_ENV !== "production" && config.logLevel !== "silent";
  return pino({
    level: config.logLevel,
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } } : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
