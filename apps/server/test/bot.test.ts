import { describe, expect, it } from "vitest";
import * as transactionsRepo from "../src/db/repos/transactions.js";
import * as usersRepo from "../src/db/repos/users.js";
import { createTestDb, createTestDeps } from "./setup.js";
import {
  createTestBot,
  makeCallbackUpdate,
  makeEditedTextUpdate,
  makeGroupChat,
  makeTextUpdate,
  makeUser,
  type RecordedCall,
} from "./testBot.js";

const ALICE = makeUser(111, { first_name: "Alice" });
const STRANGER = makeUser(999, { first_name: "Người lạ" });

interface InlineButton {
  text: string;
  callback_data?: string;
}

function findButton(call: RecordedCall | undefined, label: string): InlineButton | undefined {
  const markup = call?.payload.reply_markup as { inline_keyboard?: InlineButton[][] } | undefined;
  return markup?.inline_keyboard?.flat().find((b) => b.text === label);
}

describe("bot — access control", () => {
  it("ignores messages from anyone outside ALLOWED_TELEGRAM_IDS, and creates no user", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);

    await bot.handleUpdate(makeTextUpdate(STRANGER, "phở 45k"));

    const replies = callsOf("sendMessage");
    expect(replies).toHaveLength(1);
    expect(String(replies[0]?.payload.text)).toMatch(/chỉ phục vụ/);
    expect(usersRepo.findByTelegramId(db, STRANGER.id)).toBeUndefined();
  });

  it("ignores messages from group chats entirely, even from an allowed user", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, calls } = createTestBot(deps);

    await bot.handleUpdate(makeTextUpdate(ALICE, "phở 45k", { chat: makeGroupChat() }));

    expect(calls).toHaveLength(0);
  });
});

describe("bot — recording a transaction", () => {
  it("phở 45k -> confirms with the right amount and category", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);

    await bot.handleUpdate(makeTextUpdate(ALICE, "phở 45k"));

    const replies = callsOf("sendMessage");
    expect(replies).toHaveLength(1);
    const text = String(replies[0]?.payload.text);
    expect(text).toContain("🍜 Ăn uống");
    expect(text).toContain("45.000 ₫");
    expect(text).toContain("phở");
  });

  it("a message with no amount gets a plain-text error, not a crash", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);

    await bot.handleUpdate(makeTextUpdate(ALICE, "phở"));

    const replies = callsOf("sendMessage");
    expect(replies).toHaveLength(1);
    expect(String(replies[0]?.payload.text)).toMatch(/không tìm thấy số tiền/i);
  });

  it("a multi-item message creates separate transactions and one combined reply", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);

    await bot.handleUpdate(makeTextUpdate(ALICE, "phở 45k, trà đá 5k"));

    const replies = callsOf("sendMessage");
    expect(replies).toHaveLength(1);
    const text = String(replies[0]?.payload.text);
    expect(text).toContain("45.000 ₫");
    expect(text).toContain("5.000 ₫");

    const user = usersRepo.findByTelegramId(db, ALICE.id);
    expect(user).toBeDefined();
    const all = transactionsRepo.listRange(db, user!.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" });
    expect(all).toHaveLength(2);
  });

  it("resending the exact same Telegram message never duplicates the transaction", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot } = createTestBot(deps);

    const update = makeTextUpdate(ALICE, "xăng 80k", { messageId: 42 });
    await bot.handleUpdate(update);
    await bot.handleUpdate(update); // Telegram redelivering the same update

    const user = usersRepo.findByTelegramId(db, ALICE.id)!;
    const all = transactionsRepo.listRange(db, user.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" });
    expect(all).toHaveLength(1);
  });
});

describe("bot — category change teaches the bot", () => {
  it("pressing 🏷, picking a category, then sending the same note again auto-categorizes correctly", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);

    await bot.handleUpdate(makeTextUpdate(ALICE, "bún 30k"));
    const confirmation = callsOf("sendMessage")[0];
    expect(String(confirmation?.payload.text)).toContain("Ăn uống"); // dictionary default

    const changeBtn = findButton(confirmation, "🏷 Đổi danh mục");
    expect(changeBtn?.callback_data).toBeDefined();
    const sentMessage = { message_id: 5000, chat: { id: ALICE.id, type: "private" }, date: 0 };
    await bot.handleUpdate(makeCallbackUpdate(ALICE, changeBtn!.callback_data!, sentMessage as never));

    const editMarkupCall = callsOf("editMessageReplyMarkup")[0];
    const shoppingBtn = findButton(editMarkupCall, "🛒 Mua sắm");
    expect(shoppingBtn?.callback_data).toBeDefined();
    await bot.handleUpdate(makeCallbackUpdate(ALICE, shoppingBtn!.callback_data!, sentMessage as never));

    const editTextCall = callsOf("editMessageText")[0];
    expect(String(editTextCall?.payload.text)).toContain("Mua sắm");

    await bot.handleUpdate(makeTextUpdate(ALICE, "bún 20k"));
    const secondConfirmation = callsOf("sendMessage").at(-1);
    expect(String(secondConfirmation?.payload.text)).toContain("Mua sắm");
  });
});

describe("bot — undo / restore", () => {
  it("↩️ Hoàn tác then Khôi phục round-trips the transaction", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);

    await bot.handleUpdate(makeTextUpdate(ALICE, "cf 20k"));
    const confirmation = callsOf("sendMessage")[0];
    const undoBtn = findButton(confirmation, "↩️ Hoàn tác");
    const sentMessage = { message_id: 5001, chat: { id: ALICE.id, type: "private" }, date: 0 };

    await bot.handleUpdate(makeCallbackUpdate(ALICE, undoBtn!.callback_data!, sentMessage as never));
    const user = usersRepo.findByTelegramId(db, ALICE.id)!;
    expect(transactionsRepo.listRange(db, user.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).toHaveLength(0);

    const undoneEdit = callsOf("editMessageText")[0];
    const restoreBtn = findButton(undoneEdit, "Khôi phục");
    expect(restoreBtn?.callback_data).toBeDefined();
    await bot.handleUpdate(makeCallbackUpdate(ALICE, restoreBtn!.callback_data!, sentMessage as never));

    expect(transactionsRepo.listRange(db, user.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).toHaveLength(1);
  });
});

describe("bot — edited_message", () => {
  it("editing a message updates the existing transaction instead of creating a new one", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot } = createTestBot(deps);

    await bot.handleUpdate(makeTextUpdate(ALICE, "phở 45k", { messageId: 77 }));
    const user = usersRepo.findByTelegramId(db, ALICE.id)!;
    const before = transactionsRepo.listByTelegramMessageId(db, user.id, 77);
    expect(before).toHaveLength(1);

    await bot.handleUpdate(makeEditedTextUpdate(ALICE, "phở 55k", 77));
    const after = transactionsRepo.listByTelegramMessageId(db, user.id, 77);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before[0]?.id);
    expect(after[0]?.amount).toBe(55_000);
  });

  it("editing to remove the amount asks again instead of touching the existing transaction", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);

    await bot.handleUpdate(makeTextUpdate(ALICE, "phở 45k", { messageId: 78 }));
    await bot.handleUpdate(makeEditedTextUpdate(ALICE, "phở", 78));

    const user = usersRepo.findByTelegramId(db, ALICE.id)!;
    expect(transactionsRepo.listByTelegramMessageId(db, user.id, 78)).toHaveLength(1);
    const lastReply = callsOf("sendMessage").at(-1);
    expect(String(lastReply?.payload.text)).toMatch(/không tìm thấy số tiền/i);
  });
});

describe("bot — commands smoke test", () => {
  const commands = ["/start", "/huongdan", "/homnay", "/tuan", "/thang", "/danhmuc", "/ngansach", "/nhacnho", "/ketnoi"];

  it.each(commands)("%s is recognized as a real command, not the unknown-command fallback", async (command) => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, calls } = createTestBot(deps);
    await bot.handleUpdate(makeTextUpdate(ALICE, command));
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(String(call.payload.text ?? "")).not.toMatch(/chưa hiểu lệnh/i);
    }
  });

  it("/xoa with nothing to undo says so politely", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);
    await bot.handleUpdate(makeTextUpdate(ALICE, "/xoa"));
    expect(String(callsOf("sendMessage")[0]?.payload.text)).toMatch(/không có khoản nào/i);
  });

  it("/ngansach ăn uống 3tr sets, and /ngansach lists it back", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);
    await bot.handleUpdate(makeTextUpdate(ALICE, "/ngansach ăn uống 3tr"));
    expect(String(callsOf("sendMessage")[0]?.payload.text)).toMatch(/3.000.000|3tr/i);
    await bot.handleUpdate(makeTextUpdate(ALICE, "/ngansach"));
    expect(String(callsOf("sendMessage").at(-1)?.payload.text)).toContain("Ăn uống");
  });

  it("/xuat sends a CSV document", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);
    await bot.handleUpdate(makeTextUpdate(ALICE, "phở 45k"));
    await bot.handleUpdate(makeTextUpdate(ALICE, "/xuat"));
    expect(callsOf("sendDocument")).toHaveLength(1);
  });

  it("an unrecognized command gets a helpful reply instead of being parsed as an expense", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);
    await bot.handleUpdate(makeTextUpdate(ALICE, "/lenh_khong_ton_tai"));
    expect(String(callsOf("sendMessage")[0]?.payload.text)).toMatch(/chưa hiểu lệnh/i);
  });
});
