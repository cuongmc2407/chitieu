import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet } from "../lib/apiClient";
import { cacheOverrides } from "../lib/db";
import type { KeywordOverride } from "../types";
import { useEffect } from "react";

export function useKeywordOverrides() {
  const query = useQuery({
    queryKey: ["keyword-overrides"],
    queryFn: () => apiGet<KeywordOverride[]>("/api/keyword-overrides"),
  });

  useEffect(() => {
    if (query.data) void cacheOverrides(query.data);
  }, [query.data]);

  return query;
}

export function useDeleteKeywordOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ ok: true }>(`/api/keyword-overrides/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["keyword-overrides"] }),
  });
}
