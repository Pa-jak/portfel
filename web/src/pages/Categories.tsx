import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Category, type CategoryType, type Currency } from "../lib/api";
import { qk } from "../lib/queryClient";
import { CURRENCIES } from "../lib/money";
import { Field, Spinner, StateMsg } from "../components/ui";
import { useReveal } from "../lib/vault";

interface EditState {
  id: number | null;
  name: string;
  type: CategoryType;
  currency: Currency;
  hidden: boolean;
}

const EMPTY: EditState = { id: null, name: "", type: "asset", currency: "PLN", hidden: false };

export default function Categories() {
  const qc = useQueryClient();
  const { revealed } = useReveal();
  const list = useQuery({
    queryKey: [...qk.categories, { revealed }],
    queryFn: () => api.listCategories({ includeHidden: revealed }),
  });
  const [edit, setEdit] = useState<EditState | null>(null);

  // Local ordering state (array of ids). Dragging reorders this optimistically,
  // then persists via PUT /api/categories/reorder.
  const [order, setOrder] = useState<number[]>([]);
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);
  const dragRef = useRef<{ id: number; pointerId: number } | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  // Sync local order whenever the server list changes.
  useEffect(() => {
    const ids = (list.data ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((c) => c.id);
    setOrder((prev) => (sameSet(prev, ids) ? prev : ids));
  }, [list.data]);

  const byId = useMemo(() => {
    const m = new Map<number, Category>();
    for (const c of list.data ?? []) m.set(c.id, c);
    return m;
  }, [list.data]);

  const sorted = order
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

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
  const reorderMut = useMutation({
    mutationFn: (ids: number[]) => api.reorderCategories(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.categories }); qc.invalidateQueries({ queryKey: qk.networth() }); qc.invalidateQueries({ queryKey: qk.networthLive }); qc.invalidateQueries({ queryKey: qk.history }); },
  });

  async function onSave(s: EditState) {
    const body = {
      name: s.name,
      type: s.type,
      currency: s.currency,
      hidden: s.hidden ? 1 : 0,
    };
    if (s.id == null) createMut.mutate(body);
    else updateMut.mutate({ id: s.id, b: body });
  }

  async function onDeletePlain(id: number) { await deleteMut.mutateAsync(id); }

  // ---- pointer-events drag reorder (mouse + touch) ----
  function onHandlePointerDown(e: React.PointerEvent, id: number) {
    // Only react to a "primary" pointer press to avoid edge cases.
    if (e.button !== undefined && e.button !== 0) return;
    dragRef.current = { id, pointerId: e.pointerId };
    setDraggingId(id);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    e.preventDefault();
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const rows = bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr");
    if (!rows) return;
    // Insert before the first row whose midpoint is below the cursor; default to end.
    let targetIndex = rows.length;
    rows.forEach((r, i) => {
      const rect = r.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid && i < targetIndex) targetIndex = i;
    });
    if (targetIndex === rows.length && rows.length === 0) return;
    setOrder((prev) => {
      const from = prev.indexOf(d.id);
      if (from === -1) return prev;
      let to = targetIndex;
      if (from < to) to -= 1; // removing the source shifts later indices left
      if (to < 0) to = 0;
      if (to === from) return prev;
      const next = prev.slice();
      next.splice(from, 1);
      next.splice(to, 0, d.id);
      return next;
    });
  }

  function onHandlePointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    dragRef.current = null;
    setDraggingId(null);
    if (d) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      // Persist the current order (server sets sort_order = index).
      reorderMut.mutate(order.length ? order : sorted.map((c) => c.id));
    }
  }

  return (
    <div className="page">
      <div className="section-title">
        <h2>Kategorie</h2>
        <button className="btn primary sm" onClick={() => setEdit({ ...EMPTY })}>+ Nowa</button>
      </div>

      {list.isLoading ? <Spinner /> : null}
      {list.data && sorted.length === 0 ? (
        <StateMsg>Brak kategorii. Dodaj pierwszą.</StateMsg>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Nazwa</th>
                <th>Typ</th>
                <th>Waluta</th>
                <th></th>
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {sorted.map((c) => (
                <tr
                  key={c.id}
                  style={{
                    background: c.hidden ? "var(--surface-2)" : undefined,
                    opacity: draggingId === c.id ? 0.6 : 1,
                    touchAction: "pan-y",
                  }}
                >
                  <td style={{ padding: 0, verticalAlign: "middle" }}>
                    <span
                      role="button"
                      aria-label="Przeciągnij, by zmienić kolejność"
                      title="Przeciągnij"
                      onPointerDown={(e) => onHandlePointerDown(e, c.id)}
                      onPointerMove={onHandlePointerMove}
                      onPointerUp={onHandlePointerUp}
                      onPointerCancel={onHandlePointerUp}
                      style={{
                        display: "inline-block",
                        width: 24,
                        height: "100%",
                        padding: "10px 0",
                        textAlign: "center",
                        cursor: "grab",
                        userSelect: "none",
                        touchAction: "none",
                      }}
                    >
                      ≡
                    </span>
                  </td>
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
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn sm" onClick={() =>
                        setEdit({ id: c.id, name: c.name, type: c.type, currency: c.currency, hidden: c.hidden === 1 })
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
      <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
        Przeciągnij uchwyt ≡ przy wierszu, aby zmienić kolejność.
      </div>

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

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
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