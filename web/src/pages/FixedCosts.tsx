import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Currency,
  type FixedCost,
  type FixedCostCycle,
} from "../lib/api";
import { qk } from "../lib/queryClient";
import { CURRENCIES, currencySymbol, formatMinor } from "../lib/money";
import { Field, MoneyInput, Spinner, StateMsg } from "../components/ui";

interface EditState {
  id: number | null;
  name: string;
  amountMinor: number;
  currency: Currency;
  cycle: FixedCostCycle;
  note: string;
  active: boolean;
}

const EMPTY: EditState = {
  id: null,
  name: "",
  amountMinor: 0,
  currency: "PLN",
  cycle: "monthly",
  note: "",
  active: true,
};

export default function FixedCosts() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: qk.fixedCosts,
    queryFn: () => api.listFixedCosts(),
  });
  const fx = useQuery({
    queryKey: qk.fxRates,
    queryFn: () => api.getFxRates(),
  });
  const [editing, setEditing] = useState<EditState | null>(null);

  const createMut = useMutation({
    mutationFn: (b: Parameters<typeof api.createFixedCost>[0]) => api.createFixedCost(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.fixedCosts }); setEditing(null); },
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: number; b: Parameters<typeof api.updateFixedCost>[1] }) =>
      api.updateFixedCost(v.id, v.b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.fixedCosts }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteFixedCost(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.fixedCosts }); },
  });
  const toggleActive = useMutation({
    mutationFn: (f: FixedCost) =>
      api.updateFixedCost(f.id, {
        name: f.name,
        amount_minor: f.amount_minor,
        currency: f.currency,
        cycle: f.cycle,
        note: f.note,
        active: f.active ? 0 : 1,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.fixedCosts }); },
  });

  const all = list.data ?? [];

  /** Convert `minor` in `from` currency to `to` currency (minor units). */
  function convert(minor: number, from: Currency, to: Currency): number {
    const rates = fx.data?.rates;
    if (from === to) return minor;
    const direct = rates?.[from]?.[to];
    const rate = direct != null
      ? direct
      : (() => {
          const reverse = rates?.[to]?.[from];
          return reverse != null ? 1 / reverse : 1;
        })();
    return Math.round(minor * rate);
  }

  /** Monthly amount in minor units for a single fixed cost. */
  function monthlyMinor(f: FixedCost): number {
    if (f.cycle === "monthly") return f.amount_minor;
    return Math.round(f.amount_minor / 12);
  }

  const totals = useMemo(() => {
    const active = all.filter((f) => f.active === 1);
    let monthlyPLN = 0;
    let monthlyUSD = 0;
    for (const f of active) {
      const m = monthlyMinor(f);
      monthlyPLN += convert(m, f.currency, "PLN");
      monthlyUSD += convert(m, f.currency, "USD");
    }
    return {
      monthlyPLN,
      monthlyUSD,
      yearlyPLN: monthlyPLN * 12,
      yearlyUSD: monthlyUSD * 12,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, fx.data]);

  async function onSave(s: EditState) {
    const body = {
      name: s.name,
      amount_minor: s.amountMinor,
      currency: s.currency,
      cycle: s.cycle,
      note: s.note || null,
      active: s.active ? 1 : 0,
    };
    if (s.id == null) createMut.mutate(body);
    else updateMut.mutate({ id: s.id, b: body });
  }

  return (
    <div className="page">
      <div className="section-title">
        <h2>Koszty stałe</h2>
        <button className="btn primary sm" onClick={() => setEditing({ ...EMPTY })}>+ Nowy</button>
      </div>

      <div className="card stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
        <div className="stat">
          <div className="label">Miesięcznie razem (PLN)</div>
          <div className="value">{formatMinor(totals.monthlyPLN, "PLN")}</div>
          <div className="sub">USD: {formatMinor(totals.monthlyUSD, "USD")}</div>
        </div>
        <div className="stat">
          <div className="label">Rocznie razem (PLN)</div>
          <div className="value">{formatMinor(totals.yearlyPLN, "PLN")}</div>
          <div className="sub">USD: {formatMinor(totals.yearlyUSD, "USD")}</div>
        </div>
        <div className="muted" style={{ gridColumn: "1 / -1", fontSize: "0.8rem" }}>
          Liczone tylko pozycje aktywne. Roczne → miesięczne = /12, miesięczne → roczne = ×12.
          Waluty konwertowane z aktualnych kursów (jak widok na żywo na Pulpicie).
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 16 }} />
      {list.isLoading ? (
        <Spinner />
      ) : all.length === 0 ? (
        <StateMsg>Brak kosztów stałych. Dodaj pierwszy.</StateMsg>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th className="num">Kwota</th>
                <th>Waluta</th>
                <th>Cykl</th>
                <th>Aktywny</th>
                <th>Notatka</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {all.map((f) => (
                <tr key={f.id} style={{ opacity: f.active ? 1 : 0.55 }}>
                  <td>
                    {f.name}
                  </td>
                  <td className="num">{formatMinor(f.amount_minor, f.currency)}</td>
                  <td>{f.currency} {currencySymbol(f.currency)}</td>
                  <td>{f.cycle === "monthly" ? "miesięcznie" : "rocznie"}</td>
                  <td>
                    <button className="btn sm" onClick={() => toggleActive.mutate(f)}>
                      <span className={`pill ${f.active ? "good" : ""}`}>
                        {f.active ? "aktywny" : "nieaktywny"}
                      </span>
                    </button>
                  </td>
                  <td className="muted">{f.note ?? "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn sm" onClick={() => setEditing(toEdit(f))}>Edytuj</button>
                      <button
                        className="btn danger sm"
                        onClick={() => { if (confirm(`Usunąć „${f.name}”?`)) deleteMut.mutate(f.id); }}
                      >
                        Usuń
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <EditModal
          state={editing}
          pending={createMut.isPending || updateMut.isPending}
          error={createMut.error?.message ?? updateMut.error?.message}
          onClose={() => setEditing(null)}
          onSave={(s) => void onSave(s)}
        />
      ) : null}
    </div>
  );
}

function toEdit(f: FixedCost): EditState {
  return {
    id: f.id,
    name: f.name,
    amountMinor: f.amount_minor,
    currency: f.currency,
    cycle: f.cycle,
    note: f.note ?? "",
    active: f.active === 1,
  };
}

function EditModal({
  state, onClose, onSave, pending, error,
}: {
  state: EditState; onClose: () => void; onSave: (s: EditState) => void; pending: boolean; error?: string;
}): React.ReactNode {
  const [s, setS] = useState<EditState>(state);
  const valid = s.name.trim().length > 0;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="h3">{state.id == null ? "Nowy koszt stały" : "Edytuj koszt stały"}</div>
      <div className="row">
        <div className="grow">
          <Field label="Nazwa">
            <input className="field" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
          </Field>
        </div>
        <div style={{ width: 180 }}>
          <Field label="Cykl">
            <select
              className="field"
              value={s.cycle}
              onChange={(e) => setS({ ...s, cycle: e.target.value as FixedCostCycle })}
            >
              <option value="monthly">miesięcznie</option>
              <option value="yearly">rocznie</option>
            </select>
          </Field>
        </div>
        <div style={{ alignSelf: "flex-end", paddingBottom: 12 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.9rem" }}>
            <input
              type="checkbox"
              checked={s.active}
              onChange={(e) => setS({ ...s, active: e.target.checked })}
            />
            aktywny
          </label>
        </div>
      </div>
      <div className="row">
        <div className="grow">
          <Field label={`Kwota (${currencySymbol(s.currency)})`}>
            <MoneyInput
              valueMinor={s.amountMinor}
              currency={s.currency}
              onChange={(v) => setS({ ...s, amountMinor: v })}
            />
          </Field>
        </div>
        <div style={{ width: 140 }}>
          <Field label="Waluta">
            <select
              className="field"
              value={s.currency}
              onChange={(e) => setS({ ...s, currency: e.target.value as Currency })}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <Field label="Notatka">
        <input className="field" value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} />
      </Field>
      {error ? <div className="err" style={{ marginTop: 8 }}>{error}</div> : null}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
        <button className="btn" onClick={onClose} disabled={pending}>Anuluj</button>
        <button className="btn primary" disabled={!valid || pending} onClick={() => onSave(s)}>
          {state.id == null ? "Dodaj" : "Zapisz"}
        </button>
      </div>
    </div>
  );
}