import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type HistoryPoint } from "../lib/api";
import { formatMinor } from "../lib/money";
import { formatMonth, formatCompact } from "../lib/format";
import { qk } from "../lib/queryClient";
import { Spinner } from "../components/ui";
import { useReveal } from "../lib/vault";

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const reveal = useReveal();

  const netWorth = useQuery({
    queryKey: [...qk.networth(), { revealed: reveal.revealed }],
    queryFn: () => api.getNetWorth({ includeHidden: reveal.revealed }),
  });
  const live = useQuery({
    queryKey: [...qk.networthLive, { revealed: reveal.revealed }],
    queryFn: () => api.getNetWorthLive({ includeHidden: reveal.revealed }),
  });
  const history = useQuery({
    queryKey: [...qk.history, { revealed: reveal.revealed }],
    queryFn: () => api.getNetWorthHistory({ includeHidden: reveal.revealed }),
  });

  async function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = search.trim();
    if (!text) return;
    reveal.submitPhrase(text);
    setSearch("");
  }

  const nw = live.data ?? netWorth.data;

  function total(cur: "PLN" | "USD"): number {
    return nw ? Math.round(nw.base[cur]) : 0;
  }

  const chartData = useMemo(() => {
    if (!history.data) return [];
    return history.data.map((p) => ({
      month: p.month,
      label: formatMonth(p.month),
      PLN: Math.round(p.PLN / 100),
      USD: Math.round(p.USD / 100),
      income: p.income_minor,
      incomeCurrency: p.income_currency,
    }));
  }, [history.data]);

  return (
    <div className="page">
      {/* "Szukaj / dodaj" — reveal/hide trigger. */}
      <form className="search-top" onSubmit={onSearchSubmit}>
        <span className="ico">🔍</span>
        <input
          aria-label="Szukaj / dodaj"
          placeholder="Szukaj / dodaj"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {reveal.revealed ? (
          <span className="pill good" style={{ fontSize: "0.68rem", padding: "1px 7px" }} title="odblokowane">●</span>
        ) : null}
      </form>

      <div className="section-title"><h2>Majątek netto</h2></div>

      {netWorth.isLoading || live.isLoading ? (
        <Spinner />
      ) : nw ? (
        <div className="grid g4">
          <div className="stat">
            <div className="label">Majątek netto (PLN)</div>
            <div className="value">{formatMinor(total("PLN"), "PLN")}</div>
            <div className="sub">miesiąc: {nw.month ?? "—"}</div>
          </div>
          <div className="stat">
            <div className="label">Net worth (USD)</div>
            <div className="value">{formatMinor(total("USD"), "USD")}</div>
            <div className="sub"> miesiąc: {nw.month ?? "—"}</div>
          </div>
          <div className="stat">
            <div className="label">Aktywa (PLN)</div>
            <div className="value">{formatMinor(Math.round(nw.assets.PLN), "PLN")}</div>
            <div className="sub">zobowiązania: {formatMinor(Math.round(nw.liabilities.PLN), "PLN")}</div>
          </div>
          <div className="stat">
            <div className="label">Dłużnicy (PLN)</div>
            <div className="value">{formatMinor(Math.round(nw.debts_owed_to_me.PLN), "PLN")}</div>
            <div className="sub">jestem winien: {formatMinor(Math.round(nw["i_owe"].PLN), "PLN")}</div>
          </div>
        </div>
      ) : (
        <div className="card muted center">Brak danych. Utwórz pierwszy snapshot.</div>
      )}

      <div className="section-title"><h2>Trend netto w czasie</h2></div>
      <div className="card">
        {history.isLoading ? (
          <Spinner />
        ) : chartData.length === 0 ? (
          <div className="center muted">Brak historycznych snapshotów.</div>
        ) : (
          <div className="chart-wrap">
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: "var(--text-muted)" }} />
                <YAxis
                  fontSize={11}
                  tick={{ fill: "var(--text-muted)" }}
                  tickFormatter={(v: number) => formatCompact(v * 100, "PLN")}
                  width={48}
                />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                  formatter={(v: number, name: string) => {
                    const cur = name === "USD" ? "USD" : "PLN";
                    return [formatMinor(v * 100, cur), name];
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="PLN" stroke="#1f6feb" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="USD" stroke="#f78166" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="section-title"><h2>Dochód vs przyrost majątku</h2></div>
      <div className="card">
        {history.isLoading ? (
          <Spinner />
        ) : chartData.length < 2 ? (
          <div className="center muted">Potrzeba min. 2 snapshotów.</div>
        ) : (
          <IncomeVsGrowth data={history.data ?? []} />
        )}
      </div>
    </div>
  );
}

function IncomeVsGrowth({ data }: { data: HistoryPoint[] }): React.ReactNode {
  const rows = useMemo(() => {
    const out: Array<{ label: string; income: number; growth: number; incomeCurrency: string }> =
      [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const cur = data[i];
      const growthMinor = cur.PLN - prev.PLN;
      out.push({
        label: formatMonth(cur.month),
        income: Math.round(cur.income_minor / 100),
        growth: Math.round(growthMinor / 100),
        incomeCurrency: cur.income_currency,
      });
    }
    return out;
  }, [data]);

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Miesiąc</th>
            <th className="num">Dochód</th>
            <th className="num">Przyrost netto (PLN)</th>
            <th className="num">Stosunek</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{formatMinor(r.income * 100, r.incomeCurrency as never)}</td>
              <td className="num">{formatMinor(r.growth * 100, "PLN")}</td>
              <td className="num muted">
                {r.income > 0 ? `${Math.round((r.growth / r.income) * 100)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}