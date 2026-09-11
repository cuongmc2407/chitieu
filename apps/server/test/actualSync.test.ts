import { describe, expect, it } from "vitest";
import { runActualSync } from "../src/domain/actualSync.js";
import { createTestConfig, createTestDb, seedUser } from "./setup.js";
import { createLogger } from "../src/logger.js";

describe("runActualSync", () => {
  it("is a safe no-op when Actual isn't configured (the default)", async () => {
    const db = createTestDb();
    seedUser(db, 1);
    const config = createTestConfig(); // actual.enabled is false by default
    const logger = createLogger({ logLevel: "silent" });

    // Must resolve without throwing and without requiring network/a real Actual server.
    await expect(runActualSync(db, config, logger)).resolves.toBeUndefined();
  });
});
