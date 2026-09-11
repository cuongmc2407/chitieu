import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOutbox, enqueueOutbox, listOutbox } from "../src/lib/db";

const apiPostMock = vi.fn();

vi.mock("../src/lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/apiClient")>();
  return { ...actual, apiPost: (...args: [string, unknown?]) => apiPostMock(...args) };
});

const { flushOutbox } = await import("../src/lib/sync");
const { ApiError } = await import("../src/lib/apiClient");

describe("flushOutbox", () => {
  beforeEach(async () => {
    apiPostMock.mockReset();
    await clearOutbox(); // each test starts with an empty queue — flushOutbox() processes ALL queued items, not just the one a test just added
  });

  it("removes a successfully synced item from the outbox", async () => {
    await enqueueOutbox({ clientId: "sync-1", amount: 1000, type: "expense", categoryId: "c1", note: "", occurredAt: new Date().toISOString() });
    apiPostMock.mockResolvedValueOnce({ id: "tx-1" });

    const result = await flushOutbox();

    expect(result.synced).toBeGreaterThanOrEqual(1);
    expect((await listOutbox()).find((i) => i.clientId === "sync-1")).toBeUndefined();
  });

  it("leaves a network-failed item queued for the next flush", async () => {
    await enqueueOutbox({ clientId: "sync-2", amount: 1000, type: "expense", categoryId: "c1", note: "", occurredAt: new Date().toISOString() });
    apiPostMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await flushOutbox();

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect((await listOutbox()).find((i) => i.clientId === "sync-2")).toBeDefined();
  });

  it("records a permanent 4xx error on the item instead of retrying forever", async () => {
    await enqueueOutbox({ clientId: "sync-3", amount: 1000, type: "expense", categoryId: "bad", note: "", occurredAt: new Date().toISOString() });
    apiPostMock.mockRejectedValueOnce(new ApiError(400, "Không tìm thấy danh mục"));

    await flushOutbox();

    const item = (await listOutbox()).find((i) => i.clientId === "sync-3");
    expect(item?.lastError).toBe("Không tìm thấy danh mục");
  });

  it("does NOT mark a 401 as permanent — an expired session should keep retrying after re-login", async () => {
    await enqueueOutbox({ clientId: "sync-4", amount: 1000, type: "expense", categoryId: "c1", note: "", occurredAt: new Date().toISOString() });
    apiPostMock.mockRejectedValueOnce(new ApiError(401, "Chưa đăng nhập"));

    await flushOutbox();

    const item = (await listOutbox()).find((i) => i.clientId === "sync-4");
    expect(item?.lastError).toBeUndefined();
    expect(item?.attempts).toBe(0);
  });
});
