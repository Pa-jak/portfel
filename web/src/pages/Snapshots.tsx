import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, type HistoryPoint } from "../lib/api";
import { qk } from "../lib/queryClient";
import { formatMinor } from "../lib/money";
import { formatMonth } from "../lib/format";
import { Spinner, StateMsg } from "../components/ui";
import { useReveal } from "../lib/vault";

export default function Snapshots() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { revealed } = useReveal();

  const snapshots = useQuery({
    queryKey: qk.snapshots,
    queryFn: () => api.listSnapshots(),
  });
  const history = useQuery({
    queryKey: [...qk.history, { revealed }],
    queryFn: () => api.getNetWorthHistory({ includeHidden: revealed }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteSnapshot(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.snapshots });
      qc.invalidateQueries({ queryKey: qk.history });
      qc.invalidateQueries({ queryKey: qk.networth() });
      qc.invalidateQueries({ queryKey: qk.networthLive });
    },
  });

  // Map month -> { PLN, USD, income } from the history endpoint (oldest→newest).
  const byMonth = new Map<string, HistoryPoint>();
  for (const p of history.data ?? []) byMonth.set(p.month, p);

  // listSnapshots returns newest-first (ORDER BY month DESC).
  const rows = (snapshots.data ?? []).map((s) => {
    const h = byMonth.get(s.month);
    return {
      ...s,
      pln: h ? Math.round(h.PLN / 100) * 100 : undefined,
      usd: h ? Math.round(h.USD / 100) * 100 : undefined,
    };
  });

  return (
    <div className="page">
      <div className="section-title">
        <h2>Snapshoty</h2>
        <button className="btn primary sm" onClick={() => navigate("/snapshot")}>+ Nowy snapshot</button>
      </div>

      {snapshots.isLoading ? <Spinner /> : null}
      {!snapshots.isLoading && rows.length === 0 ? (
        <StateMsg>Brak snapshotów. Utwórz pierwszy.</StateMsg>
      ) : rows.length > 0 ? (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Miesiąc</th>
                <th className="num">Dochód</th>
                <th className="num">Majątek netto (PLN)</th>
                <th className="num">Net worth (USD)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{formatMonth(s.month)}</td>
                  <td className="num">
                    {s.income_minor ? formatMinor(s.income_minor, s.income_currency) : "—"}
                  </td>
                  <td className="num">{s.pln != null ? formatMinor(s.pln, "PLN") : "—"}</td>
                  <td className="num">{s.usd != null ? formatMinor(s.usd, "USD") : "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn sm" onClick={() => navigate(`/snapshot/${s.id}`)}>Edytuj</button>
                      <button
                        className="btn danger sm"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (confirm(`Usunąć snapshot ${s.month}?`)) deleteMut.mutate(s.id);
                        }}
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
      ) : null}
    </div>
  );
}