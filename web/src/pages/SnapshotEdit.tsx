import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Category,
  type Currency,
  type SnapshotValueInput,
} from "../lib/api";
import { qk } from "../lib/queryClient";
import { formatMinor } from "../lib/money";
import { toYearMonth } from "../lib/format";
import { Field, MoneyInput, Spinner, StateMsg} from "../components/ui";
import { useReveal } from "../lib/vault";

type ValueMap = Record<string, number>; // key: numeric category id as string

export default function SnapshotEdit() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { revealed } = useReveal();

  const categories = useQuery({
    queryKey: [...qk.categories, { revealed }],
    queryFn: () => api.listCategories({ includeHidden: revealed }),
  });
  const snapshots = useQuery({
    queryKey: qk.snapshots,
    queryFn: () => api.listSnapshots(),
  });

  const editingExisting = id != null;
  const snapshot = useQuery({
    queryKey: qk.snapshot(id ? Number(id) : "new"),
    queryFn: () => api.getSnapshot(Number(id)),
    enabled: editingExisting,
  });

  const [month, setMonth] = useState<string>(toYearMonth(new Date()));
  const [incomeMinor, setIncomeMinor] = useState<number>(0);
  const [incomeCurrency, setIncomeCurrency] = useState<Currency>("PLN");
  const [values, setValues] = useState<ValueMap>({});
  const [loadedId, setLoadedId] = useState<number | null>(null);

  useEffect(() => {
    if (!editingExisting && snapshots.data?.length) {
      const latest = snapshots.data[0];
      if (latest) {
        const [y, m] = latest.month.split("-").map(Number);
        const d = new Date(Date.UTC(y, m, 1));
        setMonth(toYearMonth(d));
      }
    }
  }, [editingExisting, snapshots.data]);

  useEffect(() => {
    if (editingExisting && snapshot.data && loadedId !== snapshot.data.id) {
      setLoadedId(snapshot.data.id);
      setMonth(snapshot.data.month);
      setIncomeMinor(snapshot.data.income_minor);
      setIncomeCurrency(snapshot.data.income_currency);
      const map: ValueMap = {};
      for (const v of snapshot.data.values) map[String(v.category_id)] = v.amount_minor;
      setValues(map);
    }
  }, [editingExisting, snapshot.data, loadedId]);

  const createMut = useMutation({
    mutationFn: (vars: Parameters<typeof api.createSnapshot>[0]) => api.createSnapshot(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.snapshots });
      qc.invalidateQueries({ queryKey: qk.history });
      qc.invalidateQueries({ queryKey: qk.networth() });
      qc.invalidateQueries({ queryKey: qk.networthLive });
      navigate("/");
    },
  });
  const updateMut = useMutation({
    mutationFn: (vars: Parameters<typeof api.updateSnapshot>[1]) =>
      api.updateSnapshot(Number(id), vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.snapshots });
      qc.invalidateQueries({ queryKey: qk.snapshot(Number(id)) });
      qc.invalidateQueries({ queryKey: qk.history });
      qc.invalidateQueries({ queryKey: qk.networth() });
      qc.invalidateQueries({ queryKey: qk.networthLive });
      navigate("/");
    },
  });

  const sortedCats = useMemo(
    () => [...(categories.data ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [categories.data],
  );

  const canSubmit =
    /^\d{4}-\d{2}$/.test(month) &&
    !createMut.isPending &&
    !updateMut.isPending;

  function buildValues(): SnapshotValueInput[] {
    return sortedCats
      .filter((c) => values[String(c.id)] != null && values[String(c.id)] !== 0)
      .map((c) => ({ category_id: c.id, amount_minor: values[String(c.id)], currency: c.currency }));
  }

  async function submit() {
    const body = {
      month,
      income_minor: incomeMinor,
      income_currency: incomeCurrency,
      values: buildValues(),
    };
    if (editingExisting) updateMut.mutate(body);
    else createMut.mutate(body);
  }

  if (categories.isLoading) return <div className="page"><Spinner /></div>;
  if (editingExisting && snapshot.isLoading) return <div className="page"><Spinner /></div>;
  if (editingExisting && !snapshot.data) return <div className="page"><StateMsg>Snapshot nie istnieje.</StateMsg></div>;
  if (sortedCats.length === 0)
    return (
      <div className="page">
        <StateMsg>Najpierw dodaj kategorie w zakładce „Kategorie”.</StateMsg>
      </div>
    );

  const errMsg = createMut.error?.message ?? updateMut.error?.message;

  return (
    <div className="page">
      <div className="section-title"><h2>{editingExisting ? "Edytuj snapshot" : "Nowy snapshot"}</h2></div>

      <div className="card">
        <div className="row">
          <div className="grow">
            <Field label="Miesiąc (YYYY-MM)">
              <input
                className="field"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value || "")}
              />
            </Field>
          </div>
          <div style={{ maxWidth: 200 }}>
            <Field label="Dochód">
              <MoneyInput
                valueMinor={incomeMinor}
                currency={incomeCurrency}
                onChange={setIncomeMinor}
              />
            </Field>
          </div>
          <div style={{ maxWidth: 120 }}>
            <Field label="Waluta dochodu">
              <select
                className="field"
                value={incomeCurrency}
                onChange={(e) => setIncomeCurrency(e.target.value as Currency)}
              >
                {(["PLN", "USD", "EUR", "NOK"] as Currency[]).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="section-title" style={{ marginTop: 8 }}><h3 className="h3">Wartości kategorii</h3></div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Kategoria</th>
                <th>Typ</th>
                <th className="num">Wartość</th>
              </tr>
            </thead>
            <tbody>
              {sortedCats.map((c) => (
                <ValueRow key={c.id} name={c.name} type={c.type} currency={c.currency}
                  hidden={c.hidden === 1}
                  value={values[String(c.id)] ?? 0}
                  onChange={(v) => setValues((m) => ({ ...m, [String(c.id)]: v }))} />
              ))}
            </tbody>
          </table>
        </div>

        {errMsg && <div className="err" style={{ marginTop: 10 }}>{errMsg}</div>}
        <div className="row between" style={{ marginTop: 14 }}>
          <div className="muted">
            Aktywa / Zobowiązania w walutach własnych. Wartości w jednostkach minor.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => navigate("/")}>Anuluj</button>
            <button className="btn primary" disabled={!canSubmit} onClick={() => void submit()}>
              {editingExisting ? "Zapisz" : "Utwórz snapshot"}
            </button>
          </div>
        </div>
      </div>

      {editingExisting && (
        <DeleteBlock id={Number(id)} />
      )}
    </div>
  );
}

function ValueRow({
  name, type, currency, value, onChange, hidden,
}: {
  name: string;
  type: Category["type"];
  currency: Currency;
  value: number;
  onChange: (v: number) => void;
  hidden?: boolean;
}): React.ReactNode {
  return (
    <tr style={hidden ? { background: "var(--surface-2)" } : undefined}>
      <td>
        {name}
        {hidden ? <span className="pill" style={{ fontSize: "0.66rem", marginLeft: 4 }} title="ukryta">ukryta</span> : null}
      </td>
      <td>
        <span className={`pill ${type === "asset" ? "good" : "bad"}`}>
          {type === "asset" ? "aktywo" : "zobowiązanie"}
        </span>{" "}
        <span className="muted">{currency}</span>
      </td>
      <td className="num">
        <div style={{ maxWidth: 180, marginLeft: "auto" }}>
          <MoneyInput valueMinor={value} currency={currency} onChange={onChange} />
          <div className="muted" style={{ fontSize: 12, textAlign: "right", marginTop: 2 }}>
            {value ? formatMinor(value, currency) : "—"}
          </div>
        </div>
      </td>
    </tr>
  );
}

function DeleteBlock({ id }: { id: number }): React.ReactNode {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.deleteSnapshot(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.snapshots });
      qc.invalidateQueries({ queryKey: qk.history });
      qc.invalidateQueries({ queryKey: qk.networth() });
      qc.invalidateQueries({ queryKey: qk.networthLive });
      navigate("/");
    },
  });
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row between">
        <span className="muted">Usunięcie snapshotu jest nieodwracalne.</span>
        <button
          className="btn danger sm"
          disabled={del.isPending}
          onClick={() => { if (confirm("Usunąć snapshot?")) del.mutate(); }}
        >
          Usuń snapshot
        </button>
      </div>
    </div>
  );
}