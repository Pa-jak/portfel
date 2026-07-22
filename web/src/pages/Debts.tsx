import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Currency, type Debt, type DebtDirection } from "../lib/api";
import { qk } from "../lib/queryClient";
import { CURRENCIES, currencySymbol, formatMinor } from "../lib/money";
import { Field, MoneyInput, Spinner, StateMsg } from "../components/ui";
import { useVault, type VaultDebt } from "../lib/vault";

interface EditState {
  id: number | null;
  tempId: string | null; // hidden (vault) debt
  direction: DebtDirection;
  person: string;
  amountMinor: number;
  currency: Currency;
  note: string;
  settled: number;
  hidden: boolean; // vault target
}

const EMPTY: EditState = {
  id: null,
  tempId: null,
  direction: "owed_to_me",
  person: "",
  amountMinor: 0,
  currency: "PLN",
  note: "",
  settled: 0,
  hidden: false,
};

export default function Debts() {
  const qc = useQueryClient();
  const vault = useVault();
  const list = useQuery({ queryKey: qk.debts, queryFn: () => api.listDebts() });
  const [editing, setEditing] = useState<EditState | null>(null);

  const createMut = useMutation({
    mutationFn: (b: Parameters<typeof api.createDebt>[0]) => api.createDebt(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.debts }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); setEditing(null); },
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: number; b: Parameters<typeof api.updateDebt>[1] }) => api.updateDebt(v.id, v.b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.debts }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteDebt(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.debts }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); },
  });
  const toggleSettled = useMutation({
    mutationFn: (d: Debt) => api.updateDebt(d.id, {
      direction: d.direction, person: d.person, amount_minor: d.amount_minor,
      currency: d.currency, note: d.note, settled: d.settled ? 0 : 1,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.debts }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); },
  });

  const owedToMe = (list.data ?? []).filter((d) => d.direction === "owed_to_me");
  const iOwe = (list.data ?? []).filter((d) => d.direction === "i_owe");

  const hiddenDebts: VaultDebt[] = vault.unlocked && vault.doc ? vault.doc.debts : [];
  const hiddenOwed = hiddenDebts.filter((d) => d.direction === "owed_to_me");
  const hiddenIOwe = hiddenDebts.filter((d) => d.direction === "i_owe");

  async function onSave(s: EditState) {
    if (s.hidden) {
      if (vault.unlocked) {
        const payload = {
          direction: s.direction,
          person: s.person,
          amount_minor: s.amountMinor,
          currency: s.currency,
          note: s.note,
          settled: s.settled,
        };
        if (s.tempId) await vault.updateDebt(s.tempId, payload);
        else await vault.addDebt(payload);
      }
      setEditing(null);
      return;
    }
    const body = {
      direction: s.direction, person: s.person, amount_minor: s.amountMinor,
      currency: s.currency, note: s.note || null, settled: s.settled,
    };
    if (s.id == null) createMut.mutate(body);
    else updateMut.mutate({ id: s.id, b: body });
  }

  return (
    <div className="page">
      <div className="section-title">
        <h2>Długi</h2>
        <button className="btn primary sm" onClick={() => setEditing({ ...EMPTY })}>+ Nowy</button>
      </div>

      <DebtSection
        title="Pożyczyłem (powinno mi wrócić)"
        rows={owedToMe}
        hiddenRows={hiddenOwed}
        loading={list.isLoading}
        unlocked={vault.unlocked}
        onEdit={(d) => setEditing(toEdit(d))}
        onHiddenEdit={(d) => setEditing(toEditHidden(d))}
        onToggle={toggleSettled.mutate}
        onHiddenToggle={(d) => void vault.updateDebt(d.tempId, { settled: d.settled ? 0 : 1 })}
        onHiddenDelete={(d) => { if (confirm(`Usunąć dług „${d.person}”?`)) void vault.deleteDebt(d.tempId); }}
        onDelete={(d) => { if (confirm(`Usunąć dług „${d.person}”?`)) deleteMut.mutate(d.id); }}
        sumLabel="Suma należności"
      />
      <DebtSection
        title="Jestem winien"
        rows={iOwe}
        hiddenRows={hiddenIOwe}
        loading={list.isLoading}
        unlocked={vault.unlocked}
        onEdit={(d) => setEditing(toEdit(d))}
        onHiddenEdit={(d) => setEditing(toEditHidden(d))}
        onToggle={toggleSettled.mutate}
        onHiddenToggle={(d) => void vault.updateDebt(d.tempId, { settled: d.settled ? 0 : 1 })}
        onHiddenDelete={(d) => { if (confirm(`Usunąć dług „${d.person}”?`)) void vault.deleteDebt(d.tempId); }}
        onDelete={(d) => { if (confirm(`Usunąć dług „${d.person}”?`)) deleteMut.mutate(d.id); }}
        sumLabel="Suma zobowiązań"
      />

      {editing ? (
        <EditModal
          state={editing}
          pending={!editing.hidden && (createMut.isPending || updateMut.isPending)}
          error={createMut.error?.message ?? updateMut.error?.message}
          allowHidden={vault.unlocked}
          onClose={() => setEditing(null)}
          onSave={(s) => void onSave(s)}
        />
      ) : null}
    </div>
  );
}

function toEdit(d: Debt): EditState {
  return { id: d.id, tempId: null, direction: d.direction, person: d.person, amountMinor: d.amount_minor, currency: d.currency, note: d.note ?? "", settled: d.settled, hidden: false };
}

function toEditHidden(d: VaultDebt): EditState {
  return { id: null, tempId: d.tempId, direction: d.direction, person: d.person, amountMinor: d.amount_minor, currency: d.currency, note: d.note ?? "", settled: d.settled, hidden: true };
}

function EditModal({
  state, onClose, onSave, pending, error, allowHidden,
}: {
  state: EditState; onClose: () => void; onSave: (s: EditState) => void; pending: boolean; error?: string; allowHidden: boolean;
}): React.ReactNode {
  const [s, setS] = useState<EditState>(state);
  const valid = s.person.trim().length > 0;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="h3">{state.id == null && state.tempId == null ? "Nowy dług" : "Edytuj dług"}</div>
      <div className="row">
        <div style={{ width: 180 }}>
          <Field label="Kierunek">
            <select className="field" value={s.direction} onChange={(e) => setS({ ...s, direction: e.target.value as DebtDirection })}>
              <option value="owed_to_me">Pożyczyłem (winien mi)</option>
              <option value="i_owe">Jestem winien</option>
            </select>
          </Field>
        </div>
        <div className="grow">
          <Field label="Osoba / kontrahent">
            <input className="field" value={s.person} onChange={(e) => setS({ ...s, person: e.target.value })} />
          </Field>
        </div>
        {allowHidden ? (
          <div style={{ alignSelf: "flex-end", paddingBottom: 12 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.9rem" }}>
              <input type="checkbox" checked={s.hidden}
                onChange={(e) => setS({ ...s, hidden: e.target.checked })} />
              ukryta
            </label>
          </div>
        ) : null}
      </div>
      <div className="row">
        <div className="grow">
          <Field label={`Kwota (${currencySymbol(s.currency)})`}>
            <MoneyInput valueMinor={s.amountMinor} currency={s.currency} onChange={(v) => setS({ ...s, amountMinor: v })} />
          </Field>
        </div>
        <div style={{ width: 140 }}>
          <Field label="Waluta">
            <select className="field" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value as Currency })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ width: 110, alignSelf: "flex-end" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={s.settled === 1}
              onChange={(e) => setS({ ...s, settled: e.target.checked ? 1 : 0 })} />
            rozliczony
          </label>
        </div>
      </div>
      <Field label="Notatka">
        <input className="field" value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} />
      </Field>
      {error ? <div className="err" style={{ marginTop: 8 }}>{error}</div> : null}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
        <button className="btn" onClick={onClose} disabled={pending}>Anuluj</button>
        <button className="btn primary" disabled={!valid || pending} onClick={() => onSave(s)}>
          {state.id == null && state.tempId == null ? "Dodaj" : "Zapisz"}
        </button>
      </div>
    </div>
  );
}

function DebtSection({
  title, rows, hiddenRows, loading, onEdit, onDelete, onToggle, onHiddenEdit, onHiddenDelete, onHiddenToggle, sumLabel, unlocked,
}: {
  title: string;
  rows: Debt[];
  hiddenRows: VaultDebt[];
  loading: boolean;
  unlocked: boolean;
  onEdit: (d: Debt) => void;
  onDelete: (d: Debt) => void;
  onToggle: (d: Debt) => void;
  onHiddenEdit: (d: VaultDebt) => void;
  onHiddenDelete: (d: VaultDebt) => void;
  onHiddenToggle: (d: VaultDebt) => void;
  sumLabel: string;
}): React.ReactNode {
  const active = rows.filter((d) => !d.settled);
  const hiddenActive = hiddenRows.filter((d) => !d.settled);
  return (
    <div className="section-title" style={{ display: "block" }}>
      <h3 className="h3" style={{ marginBottom: 8 }}>{title}</h3>
      {loading ? <Spinner /> : rows.length === 0 && hiddenRows.length === 0 ? (
        <StateMsg>Brak wpisów.</StateMsg>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Osoba</th>
                  <th className="num">Kwota</th>
                  <th>Notatka</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} style={{ opacity: d.settled ? 0.55 : 1 }}>
                    <td>{d.person}</td>
                    <td className="num">{formatMinor(d.amount_minor, d.currency)}</td>
                    <td className="muted">{d.note ?? "—"}</td>
                    <td>
                      <button className="btn sm" onClick={() => onToggle(d)}>
                        <span className={`pill ${d.settled ? "good" : ""}`}>{d.settled ? "rozliczony" : "aktywny"}</span>
                      </button>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn sm" onClick={() => onEdit(d)}>Edytuj</button>
                        <button className="btn danger sm" onClick={() => onDelete(d)}>Usuń</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {unlocked ? hiddenRows.map((d) => (
                  <tr key={d.tempId} style={{ opacity: d.settled ? 0.55 : 1, background: "var(--surface-2)" }}>
                    <td>
                      {d.person} <span className="pill" style={{ fontSize: "0.66rem", marginLeft: 4 }} title="ukryta">ukryta</span>
                    </td>
                    <td className="num">{formatMinor(d.amount_minor, d.currency)}</td>
                    <td className="muted">{d.note ?? "—"}</td>
                    <td>
                      <button className="btn sm" onClick={() => onHiddenToggle(d)}>
                        <span className={`pill ${d.settled ? "good" : ""}`}>{d.settled ? "rozliczony" : "aktywny"}</span>
                      </button>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn sm" onClick={() => onHiddenEdit(d)}>Edytuj</button>
                        <button className="btn danger sm" onClick={() => onHiddenDelete(d)}>Usuń</button>
                      </div>
                    </td>
                  </tr>
                )) : null}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: "0.82rem", marginTop: 6 }}>
            {sumLabel}: {" "}
            {active.length === 0 && hiddenActive.length === 0 ? "—" : <>
              {sumByCurrency(active).concat(sumByCurrencyVault(hiddenActive)).map((x) => `${formatMinor(x.sum, x.currency)}`).join(" + ")}
            </>}
          </div>
        </>
      )}
    </div>
  );
}

function sumByCurrency(rows: Debt[]): Array<{ currency: Currency; sum: number }> {
  const map = new Map<Currency, number>();
  for (const d of rows) map.set(d.currency, (map.get(d.currency) ?? 0) + d.amount_minor);
  return Array.from(map.entries()).map(([currency, sum]) => ({ currency, sum }));
}

function sumByCurrencyVault(rows: VaultDebt[]): Array<{ currency: Currency; sum: number }> {
  const map = new Map<Currency, number>();
  for (const d of rows) map.set(d.currency, (map.get(d.currency) ?? 0) + d.amount_minor);
  return Array.from(map.entries()).map(([currency, sum]) => ({ currency, sum }));
}