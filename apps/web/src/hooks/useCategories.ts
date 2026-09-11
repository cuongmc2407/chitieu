import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/apiClient";
import { cacheCategories, getCachedCategories } from "../lib/db";
import type { Category } from "../types";

export function useCategories(includeHidden = false) {
  const query = useQuery({
    queryKey: ["categories", includeHidden],
    queryFn: () => apiGet<Category[]>(`/api/categories${includeHidden ? "?includeHidden=true" : ""}`),
    placeholderData: (prev) => prev,
  });

  // Keep an offline copy so Quick Entry's preview still has real categories
  // (and learned keywords) to work with when there's no network at all.
  useEffect(() => {
    if (!includeHidden && query.data) void cacheCategories(query.data);
  }, [includeHidden, query.data]);

  return query;
}

export function useCachedCategoriesFallback(): Category[] | undefined {
  const { data } = useQuery({
    queryKey: ["categories-cache-fallback"],
    queryFn: async () => (await getCachedCategories<Category[]>()) ?? null,
    staleTime: Infinity,
  });
  return data ?? undefined;
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; emoji: string; type: "expense" | "income"; keywords?: string[] }) =>
      apiPost<Category>("/api/categories", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<Pick<Category, "name" | "emoji" | "keywords" | "hidden" | "sortOrder" | "monthlyBudget">>) =>
      apiPatch<Category>(`/api/categories/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true; reassignedCount: number }>(`/api/categories/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
