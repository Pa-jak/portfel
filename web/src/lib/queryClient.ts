import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const qk = {
  categories: ["categories"] as const,
  snapshots: ["snapshots"] as const,
  snapshot: (id: number | "new" | undefined) => ["snapshots", id] as const,
  debts: ["debts"] as const,
  settings: ["settings"] as const,
  networth: (snapshot?: number) => ["networth", snapshot ?? "current"] as const,
  networthLive: ["networth", "live"] as const,
  history: ["networth", "history"] as const,
  fxRates: ["fx", "rates"] as const,
};