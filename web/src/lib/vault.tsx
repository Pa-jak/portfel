import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

const DEFAULT_REVEAL_PHRASE = "Alohomora";
const DEFAULT_HIDE_PHRASE = "Obliviate";

interface RevealContextValue {
  revealed: boolean;
  revealPhrase: string;
  hidePhrase: string;
  submitPhrase: (text: string) => void;
}

const RevealContext = createContext<RevealContextValue | null>(null);

export function RevealProvider({ children }: { children: ReactNode }): ReactNode {
  const [revealed, setRevealed] = useState(false);
  const [revealPhrase, setRevealPhrase] = useState(DEFAULT_REVEAL_PHRASE);
  const [hidePhrase, setHidePhrase] = useState(DEFAULT_HIDE_PHRASE);

  // Fetch phrases from settings on mount (fallback to defaults if missing).
  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        if (typeof s.reveal_phrase === "string" && s.reveal_phrase) {
          setRevealPhrase(s.reveal_phrase);
        }
        if (typeof s.hide_phrase === "string" && s.hide_phrase) {
          setHidePhrase(s.hide_phrase);
        }
      })
      .catch(() => {
        /* keep defaults on error */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submitPhrase = useCallback(
    (text: string) => {
      if (!text) return;
      if (text === revealPhrase) {
        setRevealed(true);
      } else if (text === hidePhrase) {
        setRevealed(false);
      }
      // otherwise: no-op (silent — indistinguishable from ordinary search)
    },
    [revealPhrase, hidePhrase],
  );

  // Live-sync phrases so changes in Settings take effect without a reload.
  useEffect(() => {
    const handler = () => {
      api
        .getSettings()
        .then((s) => {
          if (typeof s.reveal_phrase === "string" && s.reveal_phrase) {
            setRevealPhrase(s.reveal_phrase);
          }
          if (typeof s.hide_phrase === "string" && s.hide_phrase) {
            setHidePhrase(s.hide_phrase);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("portfel:settings-updated", handler);
    return () => window.removeEventListener("portfel:settings-updated", handler);
  }, []);

  const value = useMemo<RevealContextValue>(
    () => ({ revealed, revealPhrase, hidePhrase, submitPhrase }),
    [revealed, revealPhrase, hidePhrase, submitPhrase],
  );

  return <RevealContext.Provider value={value}>{children}</RevealContext.Provider>;
}

export function useReveal(): RevealContextValue {
  const ctx = useContext(RevealContext);
  if (!ctx) throw new Error("useReveal must be used within RevealProvider");
  return ctx;
}