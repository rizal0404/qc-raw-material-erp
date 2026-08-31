import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  OREVISION_PROVIDERS,
  type OreVisionProvider,
  type OreVisionSettingsInput,
  type OreVisionSettingsView,
} from "@qc/contracts";
import { Modal } from "../../components/modal";
import { apiFetch } from "../../lib/api-client";
import "./parser-tuning.css";

const numericParameter = (value: string) =>
  value.trim() === "" ? null : Number(value);

function parameterError(temperature: string, topP: string, maxOutputTokens: string) {
  const values = [numericParameter(temperature), numericParameter(topP), numericParameter(maxOutputTokens)];
  if (values.some((value) => value !== null && !Number.isFinite(value)))
    return "Parameter numerik harus berupa angka yang valid.";
  const [temperatureValue, topPValue, tokenValue] = values;
  if (temperatureValue != null && (temperatureValue < 0 || temperatureValue > 2))
    return "Temperature harus antara 0 dan 2.";
  if (topPValue != null && (topPValue <= 0 || topPValue > 1))
    return "Top-p harus lebih dari 0 dan maksimal 1.";
  if (tokenValue != null && (!Number.isInteger(tokenValue) || tokenValue < 256 || tokenValue > 65536))
    return "Batas output token harus bilangan bulat antara 256 dan 65536.";
  return "";
}

export function EngineSettings({
  canManage,
  compact = false,
}: {
  canManage: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["orevision-settings"],
    queryFn: () =>
      apiFetch<{ item: OreVisionSettingsView }>("/orevision/settings"),
  });
  return (
    <>
      <button
        className={compact ? "orevision-engine-link" : "btn"}
        onClick={() => setOpen(true)}
      >
        {compact ? "Ganti engine" : "Pengaturan AI"}
        {!compact && query.data
          ? ` · ${OREVISION_PROVIDERS[query.data.item.provider].name}`
          : ""}
      </button>
      {open && (
        <Modal
          title="Konfigurasi engine OreVision"
          subtitle="Input dan parameter VLM bersama untuk Limestone dan Clay. Hanya supervisor dapat mengubah konfigurasi."
          onClose={() => setOpen(false)}
        >
          {query.isPending ? (
            <p>Memuat konfigurasi…</p>
          ) : query.error ? (
            <p role="alert">{query.error.message}</p>
          ) : (
            query.data && (
              <SettingsForm settings={query.data.item} canManage={canManage} />
            )
          )}
        </Modal>
      )}
    </>
  );
}

function SettingsForm({
  settings,
  canManage,
}: {
  settings: OreVisionSettingsView;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState(settings.provider),
    [model, setModel] = useState(settings.model),
    [endpoint, setEndpoint] = useState(settings.customEndpoint);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt ?? "");
  const [temperature, setTemperature] = useState(settings.temperature?.toString() ?? "");
  const [topP, setTopP] = useState(settings.topP?.toString() ?? "");
  const [maxOutputTokens, setMaxOutputTokens] = useState(settings.maxOutputTokens?.toString() ?? "");
  const [keys, setKeys] = useState<Partial<Record<OreVisionProvider, string>>>(
    {},
  );
  const [showKey, setShowKey] = useState(false),
    [message, setMessage] = useState("");
  const [removeKeys, setRemoveKeys] = useState<
    Partial<Record<OreVisionProvider, boolean>>
  >({});
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const hasKey =
    !!keys[provider]?.trim() ||
    (!removeKeys[provider] && settings.configuredProviders.includes(provider));
  const input = (): OreVisionSettingsInput => ({
    provider,
    model,
    customEndpoint: endpoint,
    systemPrompt,
    temperature: numericParameter(temperature),
    topP: numericParameter(topP),
    maxOutputTokens: numericParameter(maxOutputTokens),
    ...(removeKeys[provider]
      ? { apiKey: "" }
      : keys[provider]?.trim()
        ? { apiKey: keys[provider]!.trim() }
        : {}),
  });
  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ item: OreVisionSettingsView }>("/orevision/settings", {
        method: "PUT",
        body: JSON.stringify(input()),
      }),
    onSuccess: (result) => {
      qc.setQueryData(["orevision-settings"], result);
      setKeys((previous) => ({ ...previous, [provider]: undefined }));
      setRemoveKeys((previous) => ({ ...previous, [provider]: false }));
      setModel(result.item.model);
      setSystemPrompt(result.item.systemPrompt ?? "");
      setTemperature(result.item.temperature?.toString() ?? "");
      setTopP(result.item.topP?.toString() ?? "");
      setMaxOutputTokens(result.item.maxOutputTokens?.toString() ?? "");
      setMessage(
        "Konfigurasi tersimpan. Ekstraksi berikutnya atau uji parser memakai konfigurasi ini; hasil dan koreksi lama tidak berubah otomatis.",
      );
    },
  });
  const test = useMutation({
    mutationFn: () =>
      apiFetch<{ message: string }>("/orevision/test", {
        method: "POST",
        body: JSON.stringify(input()),
      }),
    onSuccess: (result) => setMessage(result.message),
  });
  const discover = useMutation({
    mutationFn: () =>
      apiFetch<{ items: { id: string; name: string }[] }>("/orevision/models", {
        method: "POST",
        // Discovery must work even when the currently typed model ID is invalid.
        body: JSON.stringify({
          ...input(),
          model: OREVISION_PROVIDERS.gemini.model,
        }),
      }),
    onSuccess: (result) => {
      setModels(result.items);
      setModelsLoaded(true);
      setMessage(
        result.items.length
          ? "Daftar model dimuat. Pilih model Gemini yang mendukung gambar, lalu uji koneksi. Konfigurasi belum disimpan."
          : "Tidak ada model generateContent yang tersedia untuk key ini.",
      );
    },
  });
  const preset = OREVISION_PROVIDERS[provider],
    busy = save.isPending || test.isPending || discover.isPending;
  const tuningError = parameterError(temperature, topP, maxOutputTokens);
  const changed = () => {
    setMessage("");
    save.reset();
    test.reset();
    discover.reset();
  };
  return (
    <div className="orevision-settings form-stack">
      <div className="orevision-provider-grid">
        {(Object.keys(OREVISION_PROVIDERS) as OreVisionProvider[]).map((p) => (
          <button
            className={`btn ${provider === p ? "primary" : ""}`}
            disabled={!canManage || busy}
            key={p}
            onClick={() => {
              setProvider(p);
              setModel(
                p === settings.provider
                  ? settings.model
                  : OREVISION_PROVIDERS[p].model,
              );
              setShowKey(false);
              changed();
            }}
          >
            {OREVISION_PROVIDERS[p].name}
          </button>
        ))}
      </div>
      <label>
        Model vision
        <input
          aria-label="Model vision"
          list="orevision-models"
          value={model}
          disabled={!canManage || busy}
          onChange={(e) => {
            setModel(e.target.value);
            changed();
          }}
        />
        <datalist id="orevision-models">
          {preset.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <p>
        Preset dapat diganti dengan ID model lain yang tersedia di akun dan
        mendukung gambar serta JSON.
      </p>
      {provider === "gemini" && canManage && (
        <div className="form-stack orevision-model-discovery">
          <button
            className="btn"
            disabled={busy || !hasKey}
            onClick={() => {
              changed();
              discover.mutate();
            }}
          >
            {discover.isPending ? "Memuat model…" : "Muat model Gemini"}
          </button>
          {modelsLoaded && models.length > 0 && (
            <label>
              Model tersedia dari API Gemini
              <select
                aria-label="Model tersedia dari API Gemini"
                disabled={busy}
                value={
                  models.some((m) => m.id === model.replace(/^models\//, ""))
                    ? model.replace(/^models\//, "")
                    : ""
                }
                onChange={(e) => {
                  setModel(e.target.value);
                  changed();
                }}
              >
                <option value="" disabled>
                  Pilih model untuk key ini
                </option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.id}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p>
            ID dengan awalan models/ diterima otomatis. Daftar ini berasal dari
            Gemini Developer API, bukan ID OpenRouter atau Vertex AI. Daftar
            generateContent tidak menjamin dukungan gambar/JSON pada semua
            model.
          </p>
        </div>
      )}
      {provider === "custom" && (
        <label>
          Endpoint OpenAI-compatible
          <input
            aria-label="Endpoint custom"
            value={endpoint}
            disabled={!canManage || busy}
            onChange={(e) => {
              setEndpoint(e.target.value);
              changed();
            }}
          />
          <small>
            Harus diizinkan lewat OREVISION_CUSTOM_ENDPOINTS. Localhost merujuk
            ke mesin API, bukan browser.
          </small>
        </label>
      )}
      {canManage && (
        <>
          <label>
            API key{" "}
            {settings.configuredProviders.includes(provider)
              ? "(tersimpan; biarkan kosong untuk memakai key lama)"
              : "(belum disimpan)"}
            <input
              aria-label="API key OreVision"
              type={showKey ? "text" : "password"}
              value={keys[provider] ?? ""}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(e) => {
                setKeys((k) => ({ ...k, [provider]: e.target.value }));
                setRemoveKeys((k) => ({ ...k, [provider]: false }));
                setModelsLoaded(false);
                setModels([]);
                changed();
              }}
            />
          </label>
          <div className="inline-actions">
            <button className="btn small" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "Sembunyikan key" : "Tampilkan key"}
            </button>
            <button
              className="btn small"
              disabled={busy}
              onClick={() => {
                setKeys((k) => ({ ...k, [provider]: undefined }));
                setRemoveKeys((k) => ({ ...k, [provider]: !k[provider] }));
                setModelsLoaded(false);
                setModels([]);
                changed();
              }}
            >
              {removeKeys[provider]
                ? "Batalkan hapus key"
                : "Hapus key saat simpan"}
            </button>
            {preset.docUrl && (
              <a href={preset.docUrl} target="_blank" rel="noreferrer">
                Dapatkan API key
              </a>
            )}
          </div>
        </>
      )}
      <fieldset className="orevision-tuning-fields" disabled={!canManage || busy}>
        <legend>Konfigurasi input &amp; output VLM</legend>
        <label>
          <span>System prompt tambahan</span>
          <textarea
            aria-label="System prompt tambahan"
            rows={6}
            maxLength={12000}
            value={systemPrompt}
            spellCheck={false}
            placeholder="Contoh: Pertahankan kode DT sesuai tulisan pada foto. Gunakan null jika angka tidak terbaca."
            onChange={(event) => {
              setSystemPrompt(event.target.value);
              changed();
            }}
          />
          <small>
            {systemPrompt.length.toLocaleString("id-ID")} / 12.000 karakter.
            Instruksi tambahan tidak mengganti format JSON bawaan Limestone/Clay.
            Jangan masukkan API key atau rahasia ke prompt.
          </small>
        </label>
        <div className="orevision-tuning-grid">
          <label>
            <span>Temperature</span>
            <input
              aria-label="Temperature VLM"
              type="number"
              min="0"
              max="2"
              step="any"
              value={temperature}
              placeholder="Default"
              onChange={(event) => {
                setTemperature(event.target.value);
                changed();
              }}
            />
            <small>0–2 · makin rendah, variasi keluaran makin kecil.</small>
          </label>
          <label>
            <span>Top-p</span>
            <input
              aria-label="Top-p VLM"
              type="number"
              min="0.000001"
              max="1"
              step="any"
              value={topP}
              placeholder="Default"
              onChange={(event) => {
                setTopP(event.target.value);
                changed();
              }}
            />
            <small>Lebih dari 0 hingga 1 · batas cakupan sampling.</small>
          </label>
          <label>
            <span>Batas output token</span>
            <input
              aria-label="Batas output token VLM"
              type="number"
              min="256"
              max="65536"
              step="1"
              value={maxOutputTokens}
              placeholder="Default"
              onChange={(event) => {
                setMaxOutputTokens(event.target.value);
                changed();
              }}
            />
            <small>256–65.536 · naikkan jika JSON terpotong.</small>
          </label>
        </div>
        <p>
          Kosongkan angka untuk memakai default engine. Dukungan parameter dan
          batas token mengikuti model. Ubah satu parameter, simpan, lalu uji
          parser dan bandingkan output pada panel diagnostik.
        </p>
        {canManage && (
          <button
            className="btn small"
            type="button"
            onClick={() => {
              setSystemPrompt("");
              setTemperature("");
              setTopP("");
              setMaxOutputTokens("");
              changed();
            }}
          >
            Reset parameter &amp; prompt
          </button>
        )}
      </fieldset>
      {tuningError && <p className="alert error" role="alert">{tuningError}</p>}
      <p>
        Key tidak dikirim kembali ke browser dan tidak disimpan di localStorage.
        Foto dikirim ke provider yang dipilih; gunakan custom/local bila dokumen
        harus tetap di jaringan internal.
      </p>
      {canManage && (
        <p>
          Uji koneksi model reasoning dapat memerlukan hingga 90 detik. Biarkan
          modal ini terbuka sampai provider merespons.
        </p>
      )}
      {canManage && provider !== "custom" && !hasKey && (
        <p className="alert warning">
          {removeKeys[provider]
            ? "Key provider ini akan dihapus saat konfigurasi disimpan."
            : "Masukkan API key provider ini sebelum memuat model atau menguji koneksi."}
        </p>
      )}
      {(save.error || test.error || discover.error) && (
        <div className="alert error" role="alert">
          {(save.error ?? test.error ?? discover.error)?.message}
        </div>
      )}
      {message && (
        <div className="alert success" role="status">
          {message}
        </div>
      )}
      {canManage && (
        <div className="inline-actions">
          <button
            className="btn"
            disabled={
              busy || !!tuningError || !model.trim() || (provider !== "custom" && !hasKey)
            }
            onClick={() => {
              changed();
              test.mutate();
            }}
          >
            {test.isPending ? "Menguji…" : "Uji koneksi"}
          </button>
          <button
            className="btn primary"
            disabled={busy || !!tuningError || !model.trim()}
            onClick={() => {
              changed();
              save.mutate();
            }}
          >
            {save.isPending ? "Menyimpan…" : "Simpan konfigurasi"}
          </button>
        </div>
      )}
    </div>
  );
}
