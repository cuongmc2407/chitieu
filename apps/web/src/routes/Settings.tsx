import { useState } from "react";
import { useNavigate } from "react-router";
import { useCurrentUser, useLogout, useUpdateMe } from "../hooks/useAuth";
import { useRevokeSession, useSessions } from "../hooks/useSessions";
import { resolveUrl } from "../lib/apiClient";
import { getServerUrl, getToken, setServerUrl } from "../lib/auth";

const IS_APP = typeof window !== "undefined" && "Capacitor" in window;

export default function Settings() {
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: me } = useCurrentUser();
  const updateMe = useUpdateMe();
  const { data: sessions } = useSessions();
  const revoke = useRevokeSession();
  const [serverUrl, setServerUrlState] = useState(getServerUrl());
  const [exporting, setExporting] = useState(false);

  async function exportCsv(): Promise<void> {
    setExporting(true);
    try {
      const token = getToken();
      const res = await fetch(resolveUrl("/api/export.csv"), {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "chitieu.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-safe pt-4 pb-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Cài đặt</h1>

      {me && (
        <div className="mt-3 rounded-2xl bg-white p-4 text-sm shadow-sm dark:bg-slate-900">
          <p className="text-slate-500 dark:text-slate-400">Đang đăng nhập với</p>
          <p className="font-medium text-slate-900 dark:text-white">{me.name ?? me.username ?? `User #${me.id}`}</p>
        </div>
      )}

      {IS_APP && (
        <div className="mt-4">
          <h2 className="px-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Địa chỉ server</h2>
          <div className="mt-2 flex gap-2">
            <input
              value={serverUrl}
              onChange={(e) => setServerUrlState(e.target.value)}
              placeholder="https://chitieu.cuongmc.id.vn"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button onClick={() => setServerUrl(serverUrl)} className="rounded-xl bg-teal-600 px-4 text-sm font-medium text-white">
              Lưu
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        <label className="flex items-center justify-between px-4 py-3.5 text-sm">
          <span className="text-slate-700 dark:text-slate-200">Nhắc nhở buổi tối (21:30)</span>
          <input
            type="checkbox"
            checked={me?.reminderEnabled ?? false}
            onChange={(e) => updateMe.mutate({ reminderEnabled: e.target.checked })}
            className="h-5 w-5 accent-teal-600"
          />
        </label>
        <button
          onClick={exportCsv}
          disabled={exporting}
          className="flex w-full items-center justify-between border-t border-slate-100 px-4 py-3.5 text-left text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200"
        >
          Xuất CSV chi tiêu tháng này
          <span className="text-slate-400">{exporting ? "…" : "›"}</span>
        </button>
      </div>

      {sessions && sessions.length > 0 && (
        <div className="mt-4">
          <h2 className="px-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Thiết bị đang đăng nhập</h2>
          <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-700 dark:text-slate-200">
                    {s.client === "ios" ? "📱 App iOS" : "💻 Trình duyệt"} {s.current && <span className="text-teal-600">(hiện tại)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-400">{s.device ?? "Không rõ thiết bị"}</p>
                </div>
                {!s.current && (
                  <button onClick={() => revoke.mutate(s.id)} className="text-xs font-medium text-red-500">
                    Thu hồi
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={handleLogout} className="mt-6 w-full rounded-2xl bg-white py-3.5 text-sm font-medium text-red-600 shadow-sm dark:bg-slate-900">
        Đăng xuất
      </button>
    </div>
  );
}
