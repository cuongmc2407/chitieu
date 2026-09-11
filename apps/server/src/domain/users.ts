import { DEFAULT_CATEGORIES } from "@chitieu/core";
import type { Db } from "../db/index.js";
import * as categoriesRepo from "../db/repos/categories.js";
import * as usersRepo from "../db/repos/users.js";

/** Finds the user for a Telegram id, creating them (with the default category set) on first contact. */
export function getOrCreateUser(
  db: Db,
  telegramId: number,
  profile: { username?: string | null; name?: string | null } = {},
): usersRepo.UserRow {
  const existing = usersRepo.findByTelegramId(db, telegramId);
  if (existing) return existing;

  const run = db.transaction(() => {
    const user = usersRepo.create(db, { telegramId, username: profile.username, name: profile.name });
    categoriesRepo.seedDefaults(db, user.id, DEFAULT_CATEGORIES);
    return user;
  });
  return run();
}
