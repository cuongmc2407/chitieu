/**
 * A tiny grammY test harness: builds a real Bot<BotContext> wired through
 * createBot(), but intercepts every outgoing Telegram API call via
 * `bot.api.config.use(...)` so tests never touch the network. Feed it
 * synthetic Update objects via `bot.handleUpdate(...)`.
 */
import type { Bot, Transformer } from "grammy";
import type { ApiResponse, Chat, Message, Update, User, UserFromGetMe } from "grammy/types";
import { createBot } from "../src/bot/bot.js";
import type { BotContext } from "../src/bot/context.js";
import type { BotDeps } from "../src/bot/deps.js";

type NonChannelChat = Chat.PrivateChat | Chat.GroupChat | Chat.SupergroupChat;

export const FAKE_BOT_INFO: UserFromGetMe = {
  id: 111111111,
  is_bot: true,
  first_name: "Chi Tiêu Test",
  username: "chitieu_test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

export interface RecordedCall {
  method: string;
  payload: Record<string, unknown>;
}

export interface TestBot {
  bot: Bot<BotContext>;
  calls: RecordedCall[];
  lastCall(method?: string): RecordedCall | undefined;
  callsOf(method: string): RecordedCall[];
  reset(): void;
}

let nextSentMessageId = 5000;

function fakeMessage(payload: Record<string, unknown>): Message.TextMessage {
  return {
    message_id: nextSentMessageId++,
    date: Math.floor(Date.now() / 1000),
    chat: { id: Number(payload.chat_id), type: "private" } as Chat.PrivateChat,
    text: typeof payload.text === "string" ? payload.text : "",
  } as Message.TextMessage;
}

function fakeResponse(method: string, payload: Record<string, unknown>): ApiResponse<unknown> {
  switch (method) {
    case "sendMessage":
    case "sendDocument":
      return { ok: true, result: fakeMessage(payload) };
    case "getMe":
      return { ok: true, result: FAKE_BOT_INFO };
    default:
      return { ok: true, result: true };
  }
}

/** Builds a bot wired to `deps`, recording every outgoing Bot API call instead of sending it. */
export function createTestBot(deps: BotDeps): TestBot {
  const bot = createBot(deps, FAKE_BOT_INFO);
  const calls: RecordedCall[] = [];

  const transformer: Transformer = async (_prev, method, payload) => {
    const record = { method, payload: payload as Record<string, unknown> };
    calls.push(record);
    // deliberately loose: this is a test double, not a real per-method response shape.
    return fakeResponse(method, record.payload) as Awaited<ReturnType<Transformer>>;
  };
  bot.api.config.use(transformer);

  return {
    bot,
    calls,
    lastCall: (method) => (method ? [...calls].reverse().find((c) => c.method === method) : calls[calls.length - 1]),
    callsOf: (method) => calls.filter((c) => c.method === method),
    reset: () => {
      calls.length = 0;
    },
  };
}

let nextUpdateId = 1;
let nextIncomingMessageId = 1;

export function makeUser(id: number, overrides: Partial<User> = {}): User {
  return { id, is_bot: false, first_name: "Người dùng", username: `user${id}`, ...overrides };
}

export function makePrivateChat(userId: number): Chat.PrivateChat {
  return { id: userId, type: "private", first_name: "Người dùng" };
}

export function makeGroupChat(id = -1001): Chat.GroupChat {
  return { id, type: "group", title: "Nhóm test" };
}

/** grammY's bot.command() matches on a `bot_command` entity, not just a leading "/" — real Telegram clients always attach one. */
function commandEntities(text: string): Array<{ type: "bot_command"; offset: number; length: number }> {
  if (!text.startsWith("/")) return [];
  const length = (/^\S+/.exec(text)?.[0] ?? text).length;
  return [{ type: "bot_command", offset: 0, length }];
}

export function makeTextUpdate(
  from: User,
  text: string,
  opts: { chat?: NonChannelChat; messageId?: number; date?: Date } = {},
): Update {
  const message_id = opts.messageId ?? nextIncomingMessageId++;
  return {
    update_id: nextUpdateId++,
    message: {
      message_id,
      date: Math.floor((opts.date ?? new Date()).getTime() / 1000),
      chat: opts.chat ?? makePrivateChat(from.id),
      from,
      text,
      entities: commandEntities(text),
    },
  } as unknown as Update;
}

export function makeEditedTextUpdate(from: User, text: string, messageId: number, opts: { date?: Date } = {}): Update {
  return {
    update_id: nextUpdateId++,
    edited_message: {
      message_id: messageId,
      date: Math.floor((opts.date ?? new Date()).getTime() / 1000),
      edit_date: Math.floor((opts.date ?? new Date()).getTime() / 1000),
      chat: makePrivateChat(from.id),
      from,
      text,
    },
  } as unknown as Update;
}

export function makeCallbackUpdate(from: User, data: string, message: Message): Update {
  return {
    update_id: nextUpdateId++,
    callback_query: {
      id: String(nextUpdateId),
      from,
      chat_instance: "test-chat-instance",
      data,
      message,
    },
  } as unknown as Update;
}
