import { useState, type ReactNode } from "react";

export function Spinner(): ReactNode {
  return <span className="spinner" aria-label="ładowanie" />;
}

export function StateMsg({ children }: { children: ReactNode }): ReactNode {
  return <div className="card center muted" style={{ padding: 24 }}>{children}</div>;
}

export function ErrorMsg({ children }: { children: ReactNode }): ReactNode {
  return <div className="card err center" style={{ padding: 16 }}>{children}</div>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="formrow">
      <label>{label}</label>
      {children}
    </div>
  );
}

/** Money input that works in integer minor units end-to-end. */
export function MoneyInput({
  valueMinor,
  currency,
  onChange,
  placeholder,
}: {
  valueMinor: number;
  currency: import("../lib/api").Currency;
  onChange: (minor: number) => void;
  placeholder?: string;
}): ReactNode {
  const [text, setText] = useState<string>(() =>
    valueMinor ? minorToInput(valueMinor, currency) : "",
  );
  // Sync when external value changes (e.g. load completes).
  const [lastMinor, setLastMinor] = useState<number>(valueMinor);
  if (lastMinor !== valueMinor) {
    setLastMinor(valueMinor);
    setText(valueMinor ? minorToInput(valueMinor, currency) : "");
  }

  return (
    <input
      className="field"
      inputMode="decimal"
      value={text}
      placeholder={placeholder ?? minorInputPlaceholder(currency)}
      onChange={(e) => {
        setText(e.target.value);
        const minor = parseMoneyToMinor(e.target.value, currency);
        if (minor != null) setLastMinor(minor), onChange(minor);
        else onChange(0);
      }}
    />
  );
}

// Local helpers to avoid circular type churn.
import { minorToInputString as minorToInput, parseMoneyToMinor, currencyDecimals } from "../lib/money";

function minorInputPlaceholder(currency: import("../lib/api").Currency): string {
  const d = currencyDecimals(currency);
  const zeros = "0".repeat(Math.max(d - 1, 0));
  return `0.${zeros}`;
}