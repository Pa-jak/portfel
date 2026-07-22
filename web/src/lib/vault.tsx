import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

interface RevealContextValue {
  revealed: boolean;
  submitPhrase: (text: string) => Promise<void>;
}

const RevealContext = createContext<RevealContextValue | null>(null);

export function RevealProvider({ children }: { children: ReactNode }): ReactNode {
  const [revealed, setRevealed] = useState(false);

  const submitPhrase = useCallback(async (text: string): Promise<void> => {
    if (!text) return;
    try {
      const { action } = await api.search(text);
      if (action === "reveal") {
        setRevealed(true);
      } else if (action === "hide") {
        setRevealed(false);
      }
      // 'none' is a no-op — indistinguishable from an ordinary search.
    } catch {
      // network/server error: don't change reveal state (no hint to the user)
    }
  }, []);

  const value = useMemo<RevealContextValue>(
    () => ({ revealed, submitPhrase }),
    [revealed, submitPhrase],
  );

  return <RevealContext.Provider value={value}>{children}</RevealContext.Provider>;
}

export function useReveal(): RevealContextValue {
  const ctx = useContext(RevealContext);
  if (!ctx) throw new Error("useReveal must be used within RevealProvider");
  return ctx;
}