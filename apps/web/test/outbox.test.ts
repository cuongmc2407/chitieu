import { describe, expect, it } from "vitest";
import { enqueueOutbox, listOutbox, markOutboxError, removeFromOutbox } from "../src/lib/db";

describe("outbox (IndexedDB)", () => {
  it("enqueues and lists an item", async () => {
    await enqueueOutbox({
      clientId: "outbox-a",
      amount: 45_000,
      type: "expense",
      categoryId: "food",
      note: "phở",
      occurredAt: new Date().toISOString(),
    });
    const items = await listOutbox();
    const item = items.find((i) => i.clientId === "outbox-a");
    expect(item).toBeDefined();
    expect(item?.amount).toBe(45_000);
    expect(item?.attempts).toBe(0);
  });

  it("removes an item", async () => {
    await enqueueOutbox({ clientId: "outbox-b", amount: 1000, type: "expense", categoryId: "c", note: "", occurredAt: new Date().toISOString() });
    await removeFromOutbox("outbox-b");
    const items = await listOutbox();
    expect(items.find((i) => i.clientId === "outbox-b")).toBeUndefined();
  });

  it("records an error and increments the attempt counter", async () => {
    await enqueueOutbox({ clientId: "outbox-c", amount: 1000, type: "expense", categoryId: "c", note: "", occurredAt: new Date().toISOString() });
    await markOutboxError("outbox-c", "Không tìm thấy danh mục");
    const item = (await listOutbox()).find((i) => i.clientId === "outbox-c");
    expect(item?.attempts).toBe(1);
    expect(item?.lastError).toBe("Không tìm thấy danh mục");
  });
});
