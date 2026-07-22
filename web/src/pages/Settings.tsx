import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Currency } from "../lib/api";
import { qk } from "../lib/queryClient";
import { CURRENCIES } from "../lib/money";
import { Spinner, StateMsg } from "../components/ui";
import { triggerUpdate } from "../lib/pwa";

export default function Settings() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => api.getSettings() });
  const notes = useQuery({ queryKey: qk.notes, queryFn: () => api.getNotes() });
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "latest" | "available">("idle");
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [baseCurrencies, setBaseCurrencies] = useState<string>("PLN,USD");
  const [accountCurrencies, setAccountCurrencies] = useState<string>("PLN,USD,EUR,NOK");
  const [loaded, setLoaded] = useState(false);
  const [notesText, setNotesText] = useState<string>("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!loaded && settings.data) {
      setLoaded(true);
      setBaseCurrencies(settings.data.base_currencies ?? "PLN,USD");
      setAccountCurrencies(settings.data.account_currencies ?? "PLN,USD,EUR,NOK");
    }
  }, [loaded, settings.data]);

  useEffect(() => {
    if (!notesLoaded && notes.data) {
      setNotesLoaded(true);
      setNotesText(notes.data.text ?? "");
    }
  }, [notesLoaded, notes.data]);

  const saveMut = useMutation({
    mutationFn: (b: Record<string, string>) => api.putSettings(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.settings });
      setMsg({ kind: "ok", text: "Zapisano ustawienia." });
      window.dispatchEvent(new Event("portfel:settings-updated"));
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });

  const fxMut = useMutation({
    mutationFn: () => api.refreshFx(),
    onSuccess: () => setMsg({ kind: "ok", text: "Kursy odświeżone." }),
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });

  const notesMut = useMutation({
    mutationFn: (text: string) => api.putNotes(text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notes });
      setMsg({ kind: "ok", text: "Zapisano notatkę." });
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });

  const fxInfo = useQuery({
    queryKey: ["fx", "info"],
    queryFn: async () => {
      const r = await fetch("/api/networth");
      const j = (await r.json()) as { fx_sources: { rates_at: string | null } };
      return j.fx_sources;
    },
  });

  async function checkUpdates() {
    setUpdateState("checking");
    setUpdateMsg(null);
    try {
      await triggerUpdate();
      const { version } = await api.getVersion();
      if (version && version !== __APP_VERSION__) {
        setUpdateState("available");
        setUpdateMsg(`Dostępna nowa wersja — odśwież (server: ${version}, klient: ${__APP_VERSION__}).`);
      } else {
        setUpdateState("latest");
        setUpdateMsg(`Masz najnowszą wersję (${__APP_VERSION__}).`);
      }
    } catch (e) {
      setUpdateState("idle");
      setUpdateMsg(e instanceof Error ? e.message : "Nie udało się sprawdzić wersji.");
    }
  }

  function applyWaitingSw() {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg && reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      window.location.reload();
    });
  }

  function toggleInList(list: string, code: Currency): string {
    const arr = list.split(",").map((x) => x.trim()).filter(Boolean);
    const i = arr.indexOf(code);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(code);
    return arr.join(",");
  }
  function active(list: string, code: string): boolean {
    return list.split(",").map((x) => x.trim()).includes(code);
  }

  function saveAll() {
    saveMut.mutate({
      base_currencies: baseCurrencies,
      account_currencies: accountCurrencies,
    });
  }

  if (settings.isLoading) return <div className="page"><Spinner /></div>;
  if (!settings.data) return <div className="page"><StateMsg>Nie udało się pobrać ustawień.</StateMsg></div>;

  return (
    <div className="page">
      <div className="section-title"><h2>Ustawienia</h2></div>

      <div className="card">
        <h3 className="h3">Waluty bazowe (wyświetlane)</h3>
        <div className="row" style={{ gap: 8 }}>
          {CURRENCIES.map((c) => (
            <label key={c} className="pill" style={{ cursor: "pointer", opacity: active(baseCurrencies, c) ? 1 : 0.5 }}>
              <input type="checkbox" style={{ marginRight: 6 }}
                checked={active(baseCurrencies, c)}
                onChange={() => setBaseCurrencies(toggleInList(baseCurrencies, c))}
              />
              {c}
            </label>
          ))}
        </div>
        <p className="muted" style={{ fontSize: "0.82rem", marginTop: 6 }}>
          Majątek netto pokazywany w tych walutach (domyślnie PLN i USD).
        </p>

        <h3 className="h3" style={{ marginTop: 14 }}>Waluty kont/produktów</h3>
        <div className="row" style={{ gap: 8 }}>
          {CURRENCIES.map((c) => (
            <label key={c} className="pill" style={{ cursor: "pointer", opacity: active(accountCurrencies, c) ? 1 : 0.5 }}>
              <input type="checkbox" style={{ marginRight: 6 }}
                checked={active(accountCurrencies, c)}
                onChange={() => setAccountCurrencies(toggleInList(accountCurrencies, c))}
              />
              {c}
            </label>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 className="h3">Kursy walut</h3>
        <div className="row between">
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            Źródło: Frankfurter API. Stan:{" "}
            {fxInfo.data?.rates_at ? `snapshot ${fxInfo.data.rates_at}` : "na bieżąco / brak"}
          </div>
          <button className="btn primary" disabled={fxMut.isPending} onClick={() => fxMut.mutate()}>
            {fxMut.isPending ? "Odświeżanie…" : "Odśwież kursy"}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 className="h3">Notatnik — co dodać / poprawić</h3>
        <textarea
          className="field"
          style={{ width: "100%", minHeight: 120, resize: "vertical", fontFamily: "inherit" }}
          placeholder="Wpisz pomysły, błędy, rzeczy do dodania…"
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
        />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button
            className="btn primary"
            disabled={notesMut.isPending}
            onClick={() => notesMut.mutate(notesText)}
          >
            {notesMut.isPending ? "Zapisywanie…" : "Zapisz notatkę"}
          </button>
        </div>
      </div>

      {msg ? (
        <div className={`card ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginTop: 12 }}>{msg.text}</div>
      ) : null}

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button
          className="btn primary"
          disabled={saveMut.isPending}
          onClick={() => saveAll()}
        >
          {saveMut.isPending ? "Zapisywanie…" : "Zapisz ustawienia"}
        </button>
      </div>

      <div className="card muted" style={{ marginTop: 12, fontSize: "0.82rem" }}>
        Instalacja PWA zależy od bezpiecznego kontekstu (HTTPS lub localhost).
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 className="h3">Aktualizacje</h3>
        <div className="muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
          Wersja klienta: <strong>{__APP_VERSION__}</strong>
        </div>
        <div className="row between" style={{ alignItems: "center" }}>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {updateMsg ?? "Sprawdź, czy dostępna jest nowsza wersja serwera/service workera."}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn primary"
              disabled={updateState === "checking"}
              onClick={() => void checkUpdates()}
            >
              {updateState === "checking" ? "Sprawdzanie…" : "Sprawdź aktualizacje"}
            </button>
            {updateState === "available" ? (
              <button className="btn primary" onClick={() => applyWaitingSw()}>
                Odśwież i zastosuj
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}