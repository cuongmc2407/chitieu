import type { Context } from "grammy";
import type { UserRow } from "../db/repos/users.js";

/** Attached by the allowlist middleware once a message passes the allowlist check. */
export type BotContext = Context & { user: UserRow };
