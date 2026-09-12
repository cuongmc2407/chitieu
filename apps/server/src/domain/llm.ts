import type { CategoryDef } from "@chitieu/core";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";

// This runs fully in the background, well after the bot has already
// replied (see upgradeFallbackCategoriesWithLlm) — so it's fine to spend
// real time here. Confirmed against a live ai-box.vn reasoning model
// (deepseek-flash): it spent all 128 tokens on hidden `reasoning_content`
// and returned empty `content` with finish_reason "length" before ever
// writing the JSON answer. 1024 tokens gives it room to actually finish;
// the timeout is raised to match how long that many tokens can take.
const LLM_TIMEOUT_MS = 15000;
const LLM_MAX_TOKENS = 1024;

const ChatCompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});
const CategoryGuessSchema = z.object({ categoryId: z.string() });

/**
 * Asks the (optional) LLM at LLM_BASE_URL/chat/completions — an
 * OpenAI-compatible endpoint — to pick one of `categories` for `note`.
 * Returns null on any error, timeout (2s), disabled config, or a guess
 * that doesn't match a real category id — callers should already have
 * replied with the dictionary/fallback guess before this resolves, and
 * only use the result to *upgrade* that guess in the background.
 */
export async function guessCategory(llm: AppConfig["llm"], note: string, categories: CategoryDef[]): Promise<string | null> {
  if (!llm.enabled || !llm.apiKey || !llm.model) return null;
  if (note.trim() === "") return null;

  try {
    const categoryList = categories.map((c) => `${c.id}: ${c.name}`).join("\n");
    const res = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.apiKey}` },
      body: JSON.stringify({
        model: llm.model,
        temperature: 0,
        max_tokens: LLM_MAX_TOKENS,
        messages: [
          {
            role: "system",
            content:
              'Bạn phân loại một khoản chi tiêu tiếng Việt vào đúng MỘT danh mục cho sẵn. Chỉ trả JSON dạng {"categoryId":"..."} dùng đúng id trong danh sách, không giải thích thêm.',
          },
          { role: "user", content: `Danh mục:\n${categoryList}\n\nGhi chú giao dịch: "${note}"` },
        ],
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const parsed = ChatCompletionSchema.parse(await res.json());
    const content = parsed.choices[0]?.message.content ?? "";
    const jsonMatch = /\{[^{}]*\}/.exec(content);
    if (!jsonMatch) return null;

    const guess = CategoryGuessSchema.parse(JSON.parse(jsonMatch[0]));
    return categories.some((c) => c.id === guess.categoryId) ? guess.categoryId : null;
  } catch {
    return null;
  }
}

/** Best-effort connectivity check on startup — logs only, never blocks or throws. */
export async function pingLlm(llm: AppConfig["llm"], logger: Logger): Promise<void> {
  if (!llm.enabled) return;
  try {
    const res = await fetch(`${llm.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${llm.apiKey}` },
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (res.ok) {
      logger.info({ baseUrl: llm.baseUrl }, "Đã kết nối LLM (đoán danh mục nền)");
    } else {
      logger.warn({ baseUrl: llm.baseUrl, status: res.status }, "Không kết nối được LLM — tính năng đoán danh mục sẽ luôn bỏ qua");
    }
  } catch (err) {
    logger.warn({ baseUrl: llm.baseUrl, err }, "Không kết nối được LLM — tính năng đoán danh mục sẽ luôn bỏ qua");
  }
}
