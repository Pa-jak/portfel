import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type CategoryType, type Currency, type DebtDirection } from "./api";
import {
  base64ToBytes,
  bytesToBase64,
  decryptToJSON,
  deriveKey,
  encryptJSON,
  randomSalt,
} from "./crypto";

const LOCK_PHRASE = "Obliviate"; // client-side constant, not a secret

const VAULT_VERSION = 1;

// ----- Vault document (stored ONLY in the encrypted blob) -----
export interface VaultCategory {
  tempId: string;
  name: string;
  type: CategoryType;
  currency: Currency;
  values: Record<string, number>; // 'YYYY-MM' -> amount_minor
}

export interface VaultDebt {
  tempId: string;
  direction: DebtDirection;
  person: string;
  amount_minor: number;
  currency: Currency;
  note: string;
  settled: number; // 0 | 1
}

export interface VaultDoc {
  version: number;
  categories: VaultCategory[];
  debts: VaultDebt[];
}

function emptyDoc(): VaultDoc {
  return { version: VAULT_VERSION, categories: [], debts: [] };
}

function genTempId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export interface UnlockOutcome {
  ok: boolean;
  hadBlob: boolean;
}

interface VaultContextValue {
  unlocked: boolean;
  doc: VaultDoc | null;
  // Behaviour of the "Szukaj / dodaj" trigger.
  submitTrigger: (text: string) => Promise<UnlockOutcome>;
  createVault: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  // re-encrypt current doc with in-memory key+salt and PUT (no-op unless unlocked)
  persist: () => Promise<boolean>;
  // mutators (only when unlocked)
  addCategory: (c: Omit<VaultCategory, "tempId" | "values"> &
    { values?: Record<string, number> }) => Promise<void>;
  updateCategory: (tempId: string, patch: Partial<VaultCategory>) => Promise<void>;
  deleteCategory: (tempId: string) => Promise<void>;
  setMonthValue: (tempId: string, month: string, amount_minor: number) => Promise<void>;
  addDebt: (d: Omit<VaultDebt, "tempId">) => Promise<void>;
  updateDebt: (tempId: string, patch: Partial<VaultDebt>) => Promise<void>;
  deleteDebt: (tempId: string) => Promise<void>;
  // passphrase change (re-encrypt under a new key)
  changePassphrase: (current: string, next: string) => Promise<boolean>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }): ReactNode {
  const [unlocked, setUnlocked] = useState(false);
  const [doc, setDoc] = useState<VaultDoc | null>(null);

  // Held ONLY in memory while unlocked; never in storage.
  const keyRef = useRef<CryptoKey | null>(null);
  const saltRef = useRef<Uint8Array | null>(null);
  const passRef = useRef<string | null>(null);

  const wipeMemory = useCallback(() => {
    keyRef.current = null;
    saltRef.current = null;
    passRef.current = null;
    setDoc(null);
    setUnlocked(false);
  }, []);

  // Re-encrypt current doc with the in-memory key+salt and PUT to the server.
  const persist = useCallback(async (): Promise<boolean> => {
    const key = keyRef.current;
    const salt = saltRef.current;
    const d = doc;
    if (!key || !salt || !d) return false;
    try {
      const blob = await encryptJSON(d, key);
      await api.putSecretBlob({
        salt: bytesToBase64(salt),
        iv: blob.ivBase64,
        ciphertext: blob.ciphertextBase64,
      });
      return true;
    } catch {
      return false;
    }
  }, [doc]);

  const lock = useCallback(() => {
    wipeMemory();
  }, [wipeMemory]);

  // Auto-lock on tab close / unload / hidden — nothing is persisted so reload locks too.
  useEffect(() => {
    const onUnload = (): void => wipeMemory();
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") wipeMemory();
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [wipeMemory]);

  const tryUnlock = useCallback(async (text: string): Promise<UnlockOutcome> => {
    if (!text) return { ok: false, hadBlob: false };
    const blob = await api.getSecretBlob();
    if (!blob.exists || !blob.salt || !blob.iv || !blob.ciphertext) {
      return { ok: false, hadBlob: false };
    }
    try {
      const parsed = await decryptToJSON<VaultDoc>(blob.salt, blob.iv, blob.ciphertext, text);
      if (!parsed || typeof parsed !== "object") throw new Error("bad doc");
      // Normalize doc shape defensively.
      const normalized: VaultDoc = {
        version: parsed.version ?? VAULT_VERSION,
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        debts: Array.isArray(parsed.debts) ? parsed.debts : [],
      };
      const salt = base64ToBytes(blob.salt);
      const key = await deriveKey(text, salt);
      keyRef.current = key;
      saltRef.current = salt;
      passRef.current = text;
      setDoc(normalized);
      setUnlocked(true);
      return { ok: true, hadBlob: true };
    } catch {
      // Bad GCM tag — wrong passphrase. Silent: indistinguishable from empty search.
      return { ok: false, hadBlob: true };
    }
  }, []);

  const createVault = useCallback(async (passphrase: string): Promise<boolean> => {
    if (!passphrase) return false;
    const existing = await api.getSecretBlob();
    if (existing.exists) return false;
    const salt = randomSalt();
    const key = await deriveKey(passphrase, salt);
    const d = emptyDoc();
    const blob = await encryptJSON(d, key);
    await api.putSecretBlob({
      salt: bytesToBase64(salt),
      iv: blob.ivBase64,
      ciphertext: blob.ciphertextBase64,
    });
    keyRef.current = key;
    saltRef.current = salt;
    passRef.current = passphrase;
    setDoc(d);
    setUnlocked(true);
    return true;
  }, []);

  // ----- mutators (operate on a fresh doc snapshot then persist) -----
  const mutate = useCallback(
    async (fn: (d: VaultDoc) => VaultDoc): Promise<void> => {
      if (!unlocked || !doc) return;
      const next = fn(doc);
      setDoc(next);
      // Persist with the updated doc state. persist reads from doc state ref,
      // so we re-encrypt directly here to avoid a stale closure.
      const key = keyRef.current;
      const salt = saltRef.current;
      if (!key || !salt) return;
      const blob = await encryptJSON(next, key);
      await api.putSecretBlob({
        salt: bytesToBase64(salt),
        iv: blob.ivBase64,
        ciphertext: blob.ciphertextBase64,
      });
    },
    [unlocked, doc],
  );

  const addCategory = useCallback(
    (c: Omit<VaultCategory, "tempId" | "values"> & { values?: Record<string, number> }) =>
      mutate((d) => ({
        ...d,
        categories: [...d.categories, { ...c, tempId: genTempId(), values: c.values ?? {} }],
      })),
    [mutate],
  );

  const updateCategory = useCallback(
    (tempId: string, patch: Partial<VaultCategory>) =>
      mutate((d) => ({
        ...d,
        categories: d.categories.map((c) => (c.tempId === tempId ? { ...c, ...patch } : c)),
      })),
    [mutate],
  );

  const deleteCategory = useCallback(
    (tempId: string) =>
      mutate((d) => ({
        ...d,
        categories: d.categories.filter((c) => c.tempId !== tempId),
      })),
    [mutate],
  );

  const setMonthValue = useCallback(
    (tempId: string, month: string, amount_minor: number) =>
      mutate((d) => ({
        ...d,
        categories: d.categories.map((c) =>
          c.tempId === tempId
            ? { ...c, values: { ...c.values, [month]: amount_minor } }
            : c,
        ),
      })),
    [mutate],
  );

  const addDebt = useCallback(
    (d2: Omit<VaultDebt, "tempId">) =>
      mutate((d) => ({ ...d, debts: [...d.debts, { ...d2, tempId: genTempId() }] })),
    [mutate],
  );

  const updateDebt = useCallback(
    (tempId: string, patch: Partial<VaultDebt>) =>
      mutate((d) => ({
        ...d,
        debts: d.debts.map((x) => (x.tempId === tempId ? { ...x, ...patch } : x)),
      })),
    [mutate],
  );

  const deleteDebt = useCallback(
    (tempId: string) =>
      mutate((d) => ({ ...d, debts: d.debts.filter((x) => x.tempId !== tempId) })),
    [mutate],
  );

  const changePassphrase = useCallback(
    async (current: string, next: string): Promise<boolean> => {
      if (!unlocked || !doc) return false;
      // Verify current by re-deriving & re-decrypting the latest blob.
      const blob = await api.getSecretBlob();
      if (!blob.exists || !blob.salt || !blob.iv || !blob.ciphertext) return false;
      try {
        await decryptToJSON(blob.salt, blob.iv, blob.ciphertext, current);
      } catch {
        return false;
      }
      // Re-encrypt the in-memory doc under the new passphrase.
      const salt = randomSalt();
      const key = await deriveKey(next, salt);
      const enc = await encryptJSON(doc, key);
      await api.putSecretBlob({
        salt: bytesToBase64(salt),
        iv: enc.ivBase64,
        ciphertext: enc.ciphertextBase64,
      });
      keyRef.current = key;
      saltRef.current = salt;
      passRef.current = next;
      return true;
    },
    [unlocked, doc],
  );

  const submitTrigger = useCallback(
    async (text: string): Promise<UnlockOutcome> => {
      if (!text) return { ok: false, hadBlob: false };
      if (unlocked) {
        // Already unlocked: only the lock phrase has a side effect.
        if (text === LOCK_PHRASE) {
          wipeMemory();
          return { ok: false, hadBlob: true };
        }
        return { ok: false, hadBlob: true };
      }
      // Attempt (silent) unlock: reveals whether a blob existed.
      return tryUnlock(text);
    },
    [unlocked, tryUnlock, wipeMemory],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      unlocked,
      doc,
      submitTrigger,
      createVault,
      lock,
      persist,
      addCategory,
      updateCategory,
      deleteCategory,
      setMonthValue,
      addDebt,
      updateDebt,
      deleteDebt,
      changePassphrase,
    }),
    [
      unlocked, doc, submitTrigger, createVault, lock, persist,
      addCategory, updateCategory, deleteCategory, setMonthValue,
      addDebt, updateDebt, deleteDebt, changePassphrase,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}

export { LOCK_PHRASE };