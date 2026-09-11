import { getServerUrl, getToken, setLoggedInFlag } from "./auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function baseUrl(): string {
  const url = getServerUrl();
  return url ? url.replace(/\/$/, "") : "";
}

/**
 * A thin fetch wrapper: attaches the bearer token when one is stored
 * (pairing-code login / iOS app), always sends cookies (web login), and
 * throws ApiError with the server's Vietnamese error message on failure.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers, credentials: "include" });

  if (res.status === 401) setLoggedInFlag(false);

  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
}
export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });
}
export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}

export function resolveUrl(path: string): string {
  return `${baseUrl()}${path}`;
}
