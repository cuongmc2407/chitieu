import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "../lib/apiClient";
import { clearSession, getLoggedInFlag } from "../lib/auth";
import type { CurrentUser } from "../types";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<CurrentUser>("/api/auth/me"),
    retry: false,
    enabled: getLoggedInFlag(),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { reminderEnabled?: boolean; monthlyBudget?: number | null }) => apiPatch<CurrentUser>("/api/auth/me", patch),
    onSuccess: (user) => queryClient.setQueryData(["me"], user),
  });
}

export function useLogout(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    try {
      await apiPost("/api/auth/logout");
    } catch {
      // best-effort — clear local state regardless
    }
    clearSession();
    queryClient.clear();
  };
}
