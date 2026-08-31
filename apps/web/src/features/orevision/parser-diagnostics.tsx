import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  OREVISION_PROVIDERS,
  type OreVisionDiagnostics,
  type OreVisionSettingsView,
} from "@qc/contracts";
import { apiFetch } from "../../lib/api-client";
import { EngineSettings } from "./engine-settings";
import { previewPhotoParser } from "./parser-diagnostics-api";
import "./parser-tuning.css";

const tabs = [
  ["input", "Input VLM"],
  ["rawOutput", "Output VLM mentah"],
  ["parsedOutput", "Hasil parsing VLM"],
  ["normalizedDraft", "Draft hasil parser"],
  ["error", "Validasi parser"],
] as const;
type DiagnosticTab = (typeof tabs)[number][0];

const explanations: Record<DiagnosticTab, string> = {
  input: "Snapshot input yang benar-benar dipakai: prompt, parameter efektif, metadata gambar, dan jam shift. API key dan isi gambar tidak disertakan.",
  rawOutput: "Teks asli respons VLM sebelum JSON dibaca atau dinormalisasi. Cocokkan dengan foto saat mengevaluasi prompt dan parameter.",
  parsedOutput: "JSON yang berhasil dibaca dari respons VLM, sebelum pemetaan ke draft aplikasi. JSON yang terbaca belum tentu lolos validasi skema.",
  normalizedDraft: "Draft awal hasil pemetaan parser, bukan draft yang sudah dikoreksi saat review. Panel ini tidak mengubah laporan.",
  error: "Kesalahan parsing atau validasi skema untuk snapshot ini. Validasi review bisnis tetap ditampilkan pada formulir laporan.",
};

function displayedValue(diagnostics: OreVisionDiagnostics, tab: DiagnosticTab) {
  const value = diagnostics[tab];
  if (value === null || value === undefined)
    return tab === "error"
      ? "Tidak ada error parser pada snapshot ini."
      : "Belum tersedia untuk ekstraksi ini.";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function ParserDiagnostics({
  diagnostics,
  material,
  importId,
  status,
  canManage,
  disabled = false,
  active = true,
  demo = false,
}: {
  diagnostics?: OreVisionDiagnostics | null | undefined;
  material: "LS" | "CL";
  importId: string;
  status: string;
  canManage: boolean;
  disabled?: boolean;
  active?: boolean;
  demo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DiagnosticTab>("input");
  const [source, setSource] = useState<"saved" | "preview">("saved");
  const [consent, setConsent] = useState(false);
  const [feedback, setFeedback] = useState("");
  const id = useId();
  const settingsQuery = useQuery({
    queryKey: ["orevision-settings"],
    queryFn: () => apiFetch<{ item: OreVisionSettingsView }>("/orevision/settings"),
    enabled: open && active && !demo,
    staleTime: 30_000,
  });
  const settings = settingsQuery.data?.item;
  const contextKey = JSON.stringify([
    material,
    importId,
    diagnostics?.capturedAt,
    settings?.provider,
    settings?.model,
    settings?.customEndpoint,
    settings?.systemPrompt,
    settings?.temperature,
    settings?.topP,
    settings?.maxOutputTokens,
  ]);
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  const preview = useMutation({
    mutationFn: async (request: { contextKey: string; importId: string; material: "LS" | "CL" }) => ({
      ...(await previewPhotoParser(request.material, request.importId)),
      contextKey: request.contextKey,
    }),
    onSuccess: (result) => {
      if (result.contextKey !== currentContext.current) return;
      setSource("preview");
      setConsent(false);
      setFeedback("");
    },
  });
  useEffect(() => {
    setSource("saved");
    setConsent(false);
    setFeedback("");
    preview.reset();
  }, [contextKey]);
  const experiment = preview.data?.contextKey === contextKey ? preview.data.diagnostics : null;
  const selected = source === "preview" && experiment ? experiment : diagnostics;
  const content = selected ? displayedValue(selected, tab) : "";
  const waiting = ["QUEUED", "PROCESSING"].includes(status);
  const canPreview = !demo && !!importId && !waiting;
  const previewBusy = preview.isPending || disabled;

  async function copyOutput() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(content);
      setFeedback("Isi tab disalin.");
    } catch {
      setFeedback("Clipboard tidak tersedia. Pilih teks pada panel untuk menyalin secara manual.");
    }
  }
  function downloadSnapshot() {
    if (!selected) return;
    try {
      const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = material.toLowerCase() + "-parser-" + importId + "-" + source + ".json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback("Snapshot JSON diunduh. Simpan dengan aman karena dapat memuat isi dokumen.");
    } catch {
      setFeedback("Unduhan belum tersedia. Gunakan Salin isi tab untuk menyimpan bagian yang diperlukan.");
    }
  }

  return (
    <details className="parser-diagnostics" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span>Input / output VLM &amp; tuning parser</span>
        <small>{diagnostics ? "Snapshot ekstraksi tersedia" : "Periksa input, respons asli, dan hasil parsing"}</small>
      </summary>
      {open && (
        <div className="parser-diagnostics-body">
          <div className="parser-diagnostics-heading">
            <div>
              <h3>Diagnostik ekstraksi</h3>
              <p>Arsip hasil parser terpisah dari koreksi manual. Uji konfigurasi baru tidak menimpa draft atau mengirim retase.</p>
            </div>
            {!demo && <EngineSettings canManage={canManage} />}
          </div>
          <div className="parser-diagnostics-sources" role="group" aria-label="Sumber diagnostik">
            <button type="button" className={source === "saved" ? "active" : ""} aria-pressed={source === "saved"} onClick={() => { setSource("saved"); setFeedback(""); }}>
              Arsip ekstraksi laporan
            </button>
            <button type="button" className={source === "preview" ? "active" : ""} aria-pressed={source === "preview"} disabled={!experiment} onClick={() => { setSource("preview"); setFeedback(""); }}>
              Eksperimen terakhir
            </button>
          </div>
          {source === "preview" && experiment && (
            <p className="parser-diagnostics-experiment" role="status">
              Hasil eksperimen saja — tidak disimpan ke laporan. Unduh snapshot sebelum mengganti konfigurasi atau meninggalkan halaman.
            </p>
          )}
          {selected ? (
            <>
              <div className="parser-diagnostics-meta">
                <span>{OREVISION_PROVIDERS[selected.input.provider].name} · {selected.input.model}</span>
                <time dateTime={selected.capturedAt}>{new Date(selected.capturedAt).toLocaleString("id-ID")}</time>
                <span>{selected.input.image.width ?? "?"} × {selected.input.image.height ?? "?"} px · {(selected.input.image.bytes / 1024).toFixed(1)} KiB</span>
              </div>
              {selected.error && <p className="parser-diagnostics-error" role="alert">{selected.error.code} · {selected.error.message}</p>}
              {selected.rawOutputTruncated && <p className="parser-diagnostics-warning">Respons mentah terlalu panjang; snapshot hanya menyimpan sebagian output. JSON parsing dan draft awal tersedia jika tahap tersebut berhasil.</p>}
              <div className="parser-diagnostics-tabs" role="tablist" aria-label="Tahap parser">
                {tabs.map(([key, label]) => (
                  <button type="button" role="tab" key={key} id={id + "-tab-" + key} aria-controls={id + "-panel"} aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); setFeedback(""); }}>
                    {label}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={id + "-panel"} aria-labelledby={id + "-tab-" + tab} className="parser-diagnostics-output">
                <p>{explanations[tab]}</p>
                <div className="parser-diagnostics-actions">
                  <button className="btn small" type="button" onClick={() => void copyOutput()}>Salin isi tab</button>
                  <button className="btn small" type="button" onClick={downloadSnapshot}>Unduh snapshot JSON</button>
                </div>
                <pre tabIndex={0}><code>{content}</code></pre>
              </div>
            </>
          ) : (
            <p className="parser-diagnostics-empty">
              {demo
                ? "Data contoh tidak memanggil VLM dan tidak memiliki respons asli."
                : "Diagnostik belum tersedia untuk import ini. Import lama tidak menyimpan respons VLM; gunakan uji parser untuk menghasilkan snapshot baru tanpa mengubah draft."}
            </p>
          )}
          {feedback && <p role="status">{feedback}</p>}
          {!demo && (
            <section className="parser-diagnostics-preview" aria-label="Uji tuning parser">
              <h4>Uji parser tanpa mengubah draft</h4>
              <p>Simpan konfigurasi di Pengaturan AI terlebih dahulu. Uji ini mengirim ulang gambar tersimpan ke provider dan dapat memakai kuota; hasil hanya tampil sebagai eksperimen.</p>
              {settings && <p className="parser-diagnostics-current-engine">Konfigurasi tersimpan: {OREVISION_PROVIDERS[settings.provider].name} · {settings.model}</p>}
              {waiting && <p>Uji tersedia setelah proses awal selesai. Untuk Clay yang baru disimpan, jalankan Proses dengan VLM terlebih dahulu.</p>}
              {settingsQuery.isLoading && <p role="status">Memuat konfigurasi engine…</p>}
              {settingsQuery.error && (
                <div className="parser-diagnostics-error" role="alert">
                  <p>Konfigurasi tidak dapat dimuat: {settingsQuery.error.message}</p>
                  <button className="btn small" type="button" onClick={() => void settingsQuery.refetch()}>Muat ulang konfigurasi</button>
                </div>
              )}
              <label className="parser-diagnostics-consent">
                <input type="checkbox" checked={consent} disabled={!canPreview || previewBusy || !settings} onChange={(event) => setConsent(event.target.checked)} />
                <span>Saya menyetujui pengiriman ulang gambar ini ke provider VLM terkonfigurasi untuk uji parser.</span>
              </label>
              <button className="btn primary" type="button" disabled={!canPreview || previewBusy || !settings || !consent || !active} onClick={() => { setFeedback(""); preview.mutate({ contextKey, importId, material }); }}>
                {preview.isPending ? "Menguji parser…" : "Jalankan uji parser"}
              </button>
              {preview.error && <p className="parser-diagnostics-error" role="alert">{preview.error.message}</p>}
            </section>
          )}
        </div>
      )}
    </details>
  );
}
