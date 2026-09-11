import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { apiGet, apiPost } from "../lib/apiClient";
import { getLoggedInFlag, setLoggedInFlag, setToken } from "../lib/auth";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

interface PublicConfig {
  botUsername: string | null;
}

export default function Login() {
  const navigate = useNavigate();
  const widgetHostRef = useRef<HTMLDivElement>(null);
  const [botUsername, setBotUsername] = useState<string | null | undefined>(undefined);
  const [pairCode, setPairCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionCheck, setSessionCheck] = useState<"checking" | "logged-in" | "logged-out">("checking");

  useEffect(() => {
    getLoggedInFlag().then((loggedIn) => setSessionCheck(loggedIn ? "logged-in" : "logged-out"));
  }, []);

  useEffect(() => {
    apiGet<PublicConfig>("/api/public-config")
      .then((c) => setBotUsername(c.botUsername))
      .catch(() => setBotUsername(null));
  }, []);

  useEffect(() => {
    if (!botUsername || !widgetHostRef.current) return;

    window.onTelegramAuth = (user) => {
      setLoading(true);
      setError(null);
      apiPost("/api/auth/telegram", user)
        .then(() => setLoggedInFlag(true))
        .then(() => navigate("/", { replace: true }))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Đăng nhập thất bại"))
        .finally(() => setLoading(false));
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    widgetHostRef.current.replaceChildren(script);
  }, [botUsername, navigate]);

  async function submitPairCode(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<{ token?: string }>("/api/auth/pair", { code: pairCode, client: "web" });
      if (result.token) await setToken(result.token);
      await setLoggedInFlag(true);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mã không hợp lệ");
    } finally {
      setLoading(false);
    }
  }

  if (sessionCheck === "checking") return null;
  if (sessionCheck === "logged-in") return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50 p-6 dark:bg-slate-950">
      <div className="text-center">
        <div className="text-5xl">💰</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Chi Tiêu</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Đăng nhập để xem, sửa và thống kê chi tiêu</p>
      </div>

      <div className="flex min-h-11 items-center justify-center" ref={widgetHostRef}>
        {botUsername === undefined && <p className="text-sm text-slate-400">Đang tải…</p>}
        {botUsername === null && <p className="text-sm text-slate-400">Chưa cấu hình đăng nhập Telegram trên server.</p>}
      </div>

      <div className="flex w-full max-w-xs items-center gap-3 text-slate-400">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        <span className="text-xs">hoặc dùng mã ghép nối</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>

      <form onSubmit={submitPairCode} className="flex w-full max-w-xs flex-col gap-3">
        <label className="text-center text-xs text-slate-500 dark:text-slate-400">
          Gõ <code className="rounded bg-slate-200 px-1 py-0.5 dark:bg-slate-800">/ketnoi</code> trong bot để lấy mã 6 số
        </label>
        <input
          value={pairCode}
          onChange={(e) => setPairCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          placeholder="123456"
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-lg tracking-[0.3em] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <button
          type="submit"
          disabled={loading || pairCode.length !== 6}
          className="rounded-xl bg-teal-600 px-4 py-3 font-medium text-white transition-opacity disabled:opacity-50"
        >
          Xác nhận mã
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
