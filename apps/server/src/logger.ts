import { createRequire } from "node:module";
import pino from "pino";
import type { AppConfig } from "./config.js";

function isPinoPrettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

export function createLogger(config: Pick<AppConfig, "logLevel">) {
  // Skip the pino-pretty worker thread entirely when nothing will be logged
  // (e.g. tests run with logLevel "silent") — no point paying its startup
  // cost. Also fall back to plain JSON logs if pino-pretty isn't installed
  // at all (it's a devDependency — a `pnpm --prod deploy` build, as Docker
  // uses, never has it) instead of crashing the whole process over a log
  // formatting nicety.
  const pretty = process.env.NODE_ENV !== "production" && config.logLevel !== "silent" && isPinoPrettyAvailable();
  return pino({
    level: config.logLevel,
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } } : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
