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
          subtitle="Konfigurasi engine API. Hanya supervisor dapat mengubah provider dan key."
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
      setMessage(
        "Konfigurasi tersimpan. Job berikutnya memakai konfigurasi ini.",
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
              busy || !model.trim() || (provider !== "custom" && !hasKey)
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
            disabled={busy || !model.trim()}
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
