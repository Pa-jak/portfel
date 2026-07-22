import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CategoryType, type Currency } from "../lib/api";
import { qk } from "../lib/queryClient";
import { CURRENCIES } from "../lib/money";
import { Field, Spinner, StateMsg } from "../components/ui";
import { useReveal } from "../lib/vault";

interface EditState {
  id: number | null;
  name: string;
  type: CategoryType;
  currency: Currency;
  sortOrder: number;
  hidden: boolean;
}

const EMPTY: EditState = { id: null, name: "", type: "asset", currency: "PLN", sortOrder: 0, hidden: false };

export default function Categories() {
  const qc = useQueryClient();
  const { revealed } = useReveal();
  const list = useQuery({
    queryKey: [...qk.categories, { revealed }],
    queryFn: () => api.listCategories({ includeHidden: revealed }),
  });
  const [edit, setEdit] = useState<EditState | null>(null);

  const createMut = useMutation({
    mutationFn: (b: Parameters<typeof api.createCategory>[0]) => api.createCategory(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.categories }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); qc.invalidateQueries({ queryKey: qk.history }); setEdit(null); },
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: number; b: Parameters<typeof api.updateCategory>[1] }) =>
      api.updateCategory(v.id, v.b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.categories }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); qc.invalidateQueries({ queryKey: qk.history }); setEdit(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.categories }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); qc.invalidateQueries({ queryKey: qk.history }); },
  });

  const sorted = [...(list.data ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  );

  async function onSave(s: EditState) {
    const body = {
      name: s.name,
      type: s.type,
      currency: s.currency,
      sort_order: s.sortOrder,
      hidden: s.hidden ? 1 : 0,
    };
    if (s.id == null) createMut.mutate(body);
    else updateMut.mutate({ id: s.id, b: body });
  }

  async function onDeletePlain(id: number) { await deleteMut.mutateAsync(id); }

  return (
    <div className="page">
      <div className="section-title">
        <h2>Kategorie</h2>
        <button className="btn primary sm" onClick={() => setEdit({ ...EMPTY })}>+ Nowa</button>
      </div>

      {list.isLoading ? <Spinner /> : null}
      {sorted.length === 0 && !list.isLoading ? (
        <StateMsg>Brak kategorii. Dodaj pierwszą.</StateMsg>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Typ</th>
                <th>Waluta</th>
                <th className="num">Kolejność</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} style={c.hidden ? { background: "var(--surface-2)" } : undefined}>
                  <td>
                    {c.name}
                    {c.hidden ? <span className="pill" style={{ fontSize: "0.66rem", marginLeft: 4 }} title="ukryta">ukryta</span> : null}
                  </td>
                  <td>
                    <span className={`pill ${c.type === "asset" ? "good" : "bad"}`}>
                      {c.type === "asset" ? "aktywo" : "zobowiązanie"}
                    </span>
                  </td>
                  <td>{c.currency}</td>
                  <td className="num">{c.sort_order}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn sm" onClick={() =>
                        setEdit({ id: c.id, name: c.name, type: c.type, currency: c.currency, sortOrder: c.sort_order, hidden: c.hidden === 1 })
                      }>Edytuj</button>
                      <button className="btn danger sm" disabled={deleteMut.isPending}
                        onClick={() => { if (confirm(`Usunąć kategorię „${c.name}”?`)) onDeletePlain(c.id); }}
                      >Usuń</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit ? (
        <EditModal
          state={edit}
          onClose={() => setEdit(null)}
          onSave={(s) => void onSave(s)}
          pending={createMut.isPending || updateMut.isPending}
          allowHidden={revealed}
          error={createMut.error?.message ?? updateMut.error?.message}
        />
      ) : null}
    </div>
  );
}

function EditModal({
  state,
  onClose,
  onSave,
  pending,
  error,
  allowHidden,
}: {
  state: EditState;
  onClose: () => void;
  onSave: (s: EditState) => void;
  pending: boolean;
  error?: string;
  allowHidden: boolean;
}): React.ReactNode {
  const [s, setS] = useState<EditState>(state);
  const valid = s.name.trim().length > 0;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="h3">{state.id == null ? "Nowa kategoria" : "Edytuj kategorię"}</div>
      <div className="row">
        <div className="grow">
          <Field label="Nazwa">
            <input className="field" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
          </Field>
        </div>
        <div style={{ width: 160 }}>
          <Field label="Typ">
            <select className="field" value={s.type} onChange={(e) => setS({ ...s, type: e.target.value as CategoryType })}>
              <option value="asset">aktywo</option>
              <option value="liability">zobowiązanie</option>
            </select>
          </Field>
        </div>
      </div>
      <div className="row">
        <div style={{ width: 160 }}>
          <Field label="Waluta">
            <select className="field" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value as Currency })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ width: 120 }}>
          <Field label="Kolejność">
            <input className="field" type="number" value={s.sortOrder}
              onChange={(e) => setS({ ...s, sortOrder: Number(e.target.value) || 0 })} />
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