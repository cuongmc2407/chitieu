import { getServerUrl, getToken, setLoggedInFlag } from "./auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function baseUrl(): Promise<string> {
  const url = await getServerUrl();
  return url ? url.replace(/\/$/, "") : "";
}

/**
 * A thin fetch wrapper: attaches the bearer token when one is stored
 * (pairing-code login / iOS app), always sends cookies (web login), and
 * throws ApiError with the server's Vietnamese error message on failure.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${await baseUrl()}${path}`, { ...init, headers, credentials: "include" });

  if (res.status === 401) void setLoggedInFlag(false);

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
  // Every real endpoint returns JSON or 204. A 2xx response in any other
  // content type means the request never reached the API — on iOS this
  // happens when no server address is configured yet, and the request
  // silently lands on the app's own bundled asset server (index.html)
  // instead of erroring, which otherwise surfaces as a confusing crash
  // several screens later.
  throw new ApiError(res.status, "Không kết nối được tới server — kiểm tra địa chỉ server trong Cài đặt");
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

export async function resolveUrl(path: string): Promise<string> {
  return `${await baseUrl()}${path}`;
}
