import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { IconChevronRight, IconTag } from "../components/icons";
import { Button, Card, Field, Page, PageHeader, SectionTitle, inputClass } from "../components/ui";
import { useCurrentUser, useLogout, useUpdateMe } from "../hooks/useAuth";
import { useRevokeSession, useSessions } from "../hooks/useSessions";
import { resolveUrl } from "../lib/apiClient";
import { getServerUrl, getToken, setServerUrl } from "../lib/auth";
import { isNative } from "../lib/native";

export default function Settings() {
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: me } = useCurrentUser();
  const updateMe = useUpdateMe();
  const { data: sessions } = useSessions();
  const revoke = useRevokeSession();
  const [serverUrl, setServerUrlState] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getServerUrl().then(setServerUrlState);
  }, []);

  async function exportCsv(): Promise<void> {
    setExporting(true);
    try {
      const token = await getToken();
      const res = await fetch(await resolveUrl("/api/export.csv"), {
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
    <Page>
      <PageHeader title="Cài đặt" />

      {me && (
        <Card className="mt-3 flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-lg dark:bg-brand-500/15">👤</span>
          <span className="min-w-0">
            <span className="block text-xs text-slate-500 dark:text-slate-400">Đang đăng nhập với</span>
            <span className="block truncate font-semibold text-slate-900 dark:text-white">
              {me.name ?? me.username ?? `User #${me.id}`}
            </span>
          </span>
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <Link
          to="/categories"
          className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-3.5 text-sm active:bg-slate-50 dark:border-slate-800/80 dark:active:bg-slate-800/60"
        >
          <IconTag className="h-5 w-5 text-slate-400" />
          <span className="flex-1 text-slate-700 dark:text-slate-200">Danh mục &amp; từ khóa</span>
          <IconChevronRight className="h-4 w-4 text-slate-300" />
        </Link>

        <label className="flex items-center justify-between border-b border-slate-100 px-3.5 py-3.5 text-sm dark:border-slate-800/80">
          <span className="pr-3 text-slate-700 dark:text-slate-200">
            Nhắc nhở buổi tối
            <span className="mt-0.5 block text-xs text-slate-400">21:30 nếu hôm đó chưa ghi khoản nào.</span>
          </span>
          <input
            type="checkbox"
            checked={me?.reminderEnabled ?? false}
            onChange={(e) => updateMe.mutate({ reminderEnabled: e.target.checked })}
            className="h-5 w-5 shrink-0 accent-brand-600"
          />
        </label>

        <button
          onClick={exportCsv}
          disabled={exporting}
          className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left text-sm active:bg-slate-50 dark:active:bg-slate-800/60"
        >
          <span className="flex-1 text-slate-700 dark:text-slate-200">Xuất CSV chi tiêu tháng này</span>
          <span className="text-xs text-slate-400">{exporting ? "…" : "⤓"}</span>
        </button>
      </Card>

      {isNative && (
        <section className="mt-5">
          <SectionTitle>Địa chỉ server</SectionTitle>
          <Card className="mt-2 p-3.5">
            <Field label="Địa chỉ server" hint="Đổi khi bạn chuyển domain hoặc chạy server ở nơi khác.">
              <div className="flex gap-2">
                <input
                  value={serverUrl}
                  onChange={(e) => setServerUrlState(e.target.value)}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="https://chitieu.cuongmc.id.vn"
                  className={inputClass}
                />
                <Button onClick={() => void setServerUrl(serverUrl)} className="!px-4">
                  Lưu
                </Button>
              </div>
            </Field>
          </Card>
        </section>
      )}

      {sessions && sessions.length > 0 && (
        <section className="mt-5">
          <SectionTitle>Thiết bị đang đăng nhập</SectionTitle>
          <Card className="mt-2 overflow-hidden">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-3 text-sm last:border-b-0 dark:border-slate-800/80"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-700 dark:text-slate-200">
                    {s.client === "ios" ? "📱 App iOS" : "💻 Trình duyệt"}{" "}
                    {s.current && <span className="text-brand-600 dark:text-brand-400">(hiện tại)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-400">{s.device ?? "Không rõ thiết bị"}</p>
                </div>
                {!s.current && (
                  <button onClick={() => revoke.mutate(s.id)} className="shrink-0 text-xs font-medium text-red-500">
                    Thu hồi
                  </button>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}

      <Button variant="danger" onClick={handleLogout} className="mt-6 w-full">
        Đăng xuất
      </Button>
    </Page>
  );
}
