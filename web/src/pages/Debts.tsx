import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Currency, type Debt, type DebtDirection } from "../lib/api";
import { qk } from "../lib/queryClient";
import { CURRENCIES, currencySymbol, formatMinor } from "../lib/money";
import { Field, MoneyInput, Spinner, StateMsg } from "../components/ui";
import { useReveal } from "../lib/vault";

interface EditState {
  id: number | null;
  direction: DebtDirection;
  person: string;
  amountMinor: number;
  currency: Currency;
  note: string;
  settled: number;
  hidden: boolean;
}

const EMPTY: EditState = {
  id: null,
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
  const { revealed } = useReveal();
  const list = useQuery({
    queryKey: [...qk.debts, { revealed }],
    queryFn: () => api.listDebts({ includeHidden: revealed }),
  });
  const [editing, setEditing] = useState<EditState | null>(null);

  const createMut = useMutation({
    mutationFn: (b: Parameters<typeof api.createDebt>[0]) => api.createDebt(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.debts }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); qc.invalidateQueries({ queryKey: qk.history }); setEditing(null); },
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: number; b: Parameters<typeof api.updateDebt>[1] }) => api.updateDebt(v.id, v.b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.debts }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); qc.invalidateQueries({ queryKey: qk.history }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteDebt(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.debts }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); qc.invalidateQueries({ queryKey: qk.history }); },
  });
  const toggleSettled = useMutation({
    mutationFn: (d: Debt) => api.updateDebt(d.id, {
      direction: d.direction, person: d.person, amount_minor: d.amount_minor,
      currency: d.currency, note: d.note, settled: d.settled ? 0 : 1, hidden: d.hidden,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.debts }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); qc.invalidateQueries({ queryKey: qk.history }); },
  });

  const all = list.data ?? [];
  const owedToMe = all.filter((d) => d.direction === "owed_to_me");
  const iOwe = all.filter((d) => d.direction === "i_owe");

  async function onSave(s: EditState) {
    const body = {
      direction: s.direction, person: s.person, amount_minor: s.amountMinor,
      currency: s.currency, note: s.note || null, settled: s.settled,
      hidden: s.hidden ? 1 : 0,
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
        loading={list.isLoading}
        onEdit={(d) => setEditing(toEdit(d))}
        onToggle={toggleSettled.mutate}
        onDelete={(d) => { if (confirm(`Usunąć dług „${d.person}”?`)) deleteMut.mutate(d.id); }}
        sumLabel="Suma należności"
      />
      <DebtSection
        title="Jestem winien"
        rows={iOwe}
        loading={list.isLoading}
        onEdit={(d) => setEditing(toEdit(d))}
        onToggle={toggleSettled.mutate}
        onDelete={(d) => { if (confirm(`Usunąć dług „${d.person}”?`)) deleteMut.mutate(d.id); }}
        sumLabel="Suma zobowiązań"
      />

      {editing ? (
        <EditModal
          state={editing}
          pending={createMut.isPending || updateMut.isPending}
          error={createMut.error?.message ?? updateMut.error?.message}
          allowHidden={revealed}
          onClose={() => setEditing(null)}
          onSave={(s) => void onSave(s)}
        />
      ) : null}
    </div>
  );
}

function toEdit(d: Debt): EditState {
  return { id: d.id, direction: d.direction, person: d.person, amountMinor: d.amount_minor, currency: d.currency, note: d.note ?? "", settled: d.settled, hidden: d.hidden === 1 };
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
      <div className="h3">{state.id == null ? "Nowy dług" : "Edytuj dług"}</div>
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
          {state.id == null ? "Dodaj" : "Zapisz"}
        </button>
      </div>
    </div>
  );
}

function DebtSection({
  title, rows, loading, onEdit, onDelete, onToggle, sumLabel,
}: {
  title: string;
  rows: Debt[];
  loading: boolean;
  onEdit: (d: Debt) => void;
  onDelete: (d: Debt) => void;
  onToggle: (d: Debt) => void;
  sumLabel: string;
}): React.ReactNode {
  const active = rows.filter((d) => !d.settled);
  const hasHidden = rows.some((d) => d.hidden === 1);
  return (
    <div className="section-title" style={{ display: "block" }}>
      <h3 className="h3" style={{ marginBottom: 8 }}>{title}</h3>
      {loading ? <Spinner /> : rows.length === 0 ? (
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
                  <tr key={d.id} style={{ opacity: d.settled ? 0.55 : 1, background: d.hidden ? "var(--surface-2)" : undefined }}>
                    <td>
                      {d.person}
                      {d.hidden ? <span className="pill" style={{ fontSize: "0.66rem", marginLeft: 4 }} title="ukryta">ukryta</span> : null}
                    </td>
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
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: "0.82rem", marginTop: 6 }}>
            {sumLabel}: {" "}
            {active.length === 0 ? "—" : <>
              {sumByCurrency(active).map((x) => formatMinor(x.sum, x.currency)).join(" + ")}
              {hasHidden ? " (w tym ukryte)" : ""}
            </>}
          </div>
        </>
      )}
    </div>
  );
}

function sumByCurrency(rows: Debt[]): Array<{ currency: Currency; sum: number }> {
  const map = new Map<Currency, number>();
  for (const d of rows) if (!d.settled) map.set(d.currency, (map.get(d.currency) ?? 0) + d.amount_minor);
  return Array.from(map.entries()).map(([currency, sum]) => ({ currency, sum }));
}