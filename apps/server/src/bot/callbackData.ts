/**
 * Compact callback_data encoding for inline buttons. Telegram caps
 * callback_data at 64 bytes, so we reference transactions/categories by
 * their SQLite `rowid` (a small integer) instead of their public UUID.
 */
export type CallbackAction =
  | { kind: "changeCategory"; txRowId: number }
  | { kind: "selectCategory"; txRowId: number; categoryRowId: number }
  | { kind: "undo"; txRowId: number }
  | { kind: "restore"; txRowId: number }
  | { kind: "undoAll"; telegramMessageId: number };

export function encodeChangeCategory(txRowId: number): string {
  return `c:${txRowId}`;
}
export function encodeSelectCategory(txRowId: number, categoryRowId: number): string {
  return `s:${txRowId}:${categoryRowId}`;
}
export function encodeUndo(txRowId: number): string {
  return `u:${txRowId}`;
}
export function encodeRestore(txRowId: number): string {
  return `r:${txRowId}`;
}
export function encodeUndoAll(telegramMessageId: number): string {
  return `ua:${telegramMessageId}`;
}

export function decodeCallbackData(data: string): CallbackAction | null {
  let m = /^c:(\d+)$/.exec(data);
  if (m?.[1]) return { kind: "changeCategory", txRowId: Number(m[1]) };

  m = /^s:(\d+):(\d+)$/.exec(data);
  if (m?.[1] && m[2]) return { kind: "selectCategory", txRowId: Number(m[1]), categoryRowId: Number(m[2]) };

  m = /^u:(\d+)$/.exec(data);
  if (m?.[1]) return { kind: "undo", txRowId: Number(m[1]) };

  m = /^r:(\d+)$/.exec(data);
  if (m?.[1]) return { kind: "restore", txRowId: Number(m[1]) };

  m = /^ua:(\d+)$/.exec(data);
  if (m?.[1]) return { kind: "undoAll", telegramMessageId: Number(m[1]) };

  return null;
}
