import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/apiClient";
import type { FixedCost } from "../types";

export interface FixedCostInput {
  name: string;
  amount: number;
  categoryId: string;
  dayOfMonth: number;
  note?: string;
  autoPost?: boolean;
}

export function useFixedCosts() {
  return useQuery({
    queryKey: ["fixed-costs"],
    queryFn: () => apiGet<FixedCost[]>("/api/fixed-costs"),
    placeholderData: (prev) => prev,
  });
}

export function useCreateFixedCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FixedCostInput) => apiPost<FixedCost>("/api/fixed-costs", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fixed-costs"] }),
  });
}

export function useUpdateFixedCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<FixedCostInput & { active: boolean }>) =>
      apiPatch<FixedCost>(`/api/fixed-costs/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fixed-costs"] }),
  });
}

export function useDeleteFixedCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/fixed-costs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fixed-costs"] }),
  });
}
