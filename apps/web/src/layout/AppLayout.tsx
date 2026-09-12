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
    <div className="relative min-h-dvh pb-24">
      {/* A soft brand wash behind the top of every screen, so the page has a
          horizon instead of being a flat grey sheet. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-brand-500/12 to-transparent dark:from-brand-500/10"
      />
      <div className="relative">
        {pendingCount > 0 && (
          <div className="pt-safe sticky top-0 z-10 bg-amber-500/95 px-4 py-1.5 text-center text-xs font-medium text-white backdrop-blur">
            {pendingCount} khoản đang chờ đồng bộ…
          </div>
        )}
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
}
