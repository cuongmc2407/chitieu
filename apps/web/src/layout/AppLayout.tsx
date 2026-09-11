import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router";
import TabBar from "../components/TabBar";
import { useCurrentUser } from "../hooks/useAuth";
import { useOutboxSync } from "../hooks/useOutboxSync";
import { getLoggedInFlag } from "../lib/auth";

export default function AppLayout() {
  const { data: loggedIn, isLoading: checkingFlag } = useQuery({ queryKey: ["logged-in-flag"], queryFn: getLoggedInFlag });
  const { isError } = useCurrentUser();
  const { pendingCount } = useOutboxSync();

  if (checkingFlag) return null; // avoid a flash redirect to /login before the flag has loaded
  if (!loggedIn || isError) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-dvh bg-slate-50 pb-20 dark:bg-slate-950">
      {pendingCount > 0 && (
        <div className="pt-safe bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
          {pendingCount} khoản đang chờ đồng bộ…
        </div>
      )}
      <Outlet />
      <TabBar />
    </div>
  );
}
