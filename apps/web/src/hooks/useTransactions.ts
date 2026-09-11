import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/apiClient";
import type { Transaction, TxType } from "../types";

export interface TransactionFilters {
  from?: string;
  to?: string;
  category?: string;
  q?: string;
  type?: TxType;
}

function toQueryString(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => apiGet<Transaction[]>(`/api/transactions${toQueryString(filters)}`),
    placeholderData: (prev) => prev,
  });
}

export interface CreateTransactionInput {
  amount: number;
  type: TxType;
  categoryId: string;
  note?: string;
  occurredAt?: string;
  clientId: string;
  learn?: boolean;
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => apiPost<Transaction>("/api/transactions", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; amount?: number; categoryId?: string; note?: string; occurredAt?: string; learn?: boolean }) =>
      apiPatch<Transaction>(`/api/transactions/${id}`, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/transactions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
