import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ClayPhotoReportDraft,
  ClayPhotoReportImport,
  MasterLookupResponse,
  Role,
} from "@qc/contracts";
import { ApiClientError } from "../../lib/api-client";
import { EngineSettings } from "../orevision/engine-settings";
import { ParserDiagnostics } from "../orevision/parser-diagnostics";
import { shiftHours } from "./clay-form-model";
import {
  confirmClayPhotoReport,
  deleteClayPhotoReport,
  getClayPhotoReport,
  getClayPhotoReportImage,
  listClayPhotoReports,
  processClayPhotoReport,
  reparseClayPhotoReport,
  saveClayPhotoDraft,
  uploadClayPhotoReport,
} from "./clay-photo-report-api";

const statusLabels: Record<ClayPhotoReportImport["status"], string> = {
  QUEUED: "Tersimpan private",
  PROCESSING: "Diproses VLM",
  NEEDS_REVIEW: "Perlu verifikasi",
  READY: "Siap dikonfirmasi",
  CONFIRMED: "Masuk workbench",
  FAILED: "Parser gagal",
};
const numberValue = (value: string) => (value === "" ? null : Number(value));

export function ClayPhotoExtractor({
  lookup,
  role,
  active = true,
}: {
  lookup: MasterLookupResponse;
  role: Role;
  active?: boolean;
}) {
  const qc = useQueryClient();
  const crushers = lookup.crushers.filter(
    (crusher) => crusher.materialKind === "CL" && crusher.active,
  );
  const vendors = lookup.vendors.filter(
    (vendor) => vendor.active && vendor.materialKinds.includes("CL"),
  );
  const sources = lookup.sources.filter(
    (source) => source.active && source.materialKind === "CL",
  );
  const canConfirm = role === "QC_ANALYST" || role === "SUPERVISOR_ADMIN";
  const [crusherId, setCrusherId] = useState(crushers[0]?.id ?? "");
  const [importId, setImportId] = useState("");
  const [draft, setDraft] = useState<ClayPhotoReportDraft | null>(null);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [aligned, setAligned] = useState(true);
  const [vlmConsent, setVlmConsent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitIssues, setSubmitIssues] = useState<
    ClayPhotoReportImport["issues"]
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!crusherId && crushers[0]) setCrusherId(crushers[0].id);
  }, [crusherId, crushers]);
  useEffect(() => {
    if (!pendingFile) return setPendingUrl("");
    const url = URL.createObjectURL(pendingFile);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const history = useQuery({
    queryKey: ["clay-photo-reports", crusherId],
    queryFn: () => listClayPhotoReports(crusherId),
    enabled: active && !!crusherId,
  });
  const current = useQuery({
    queryKey: ["clay-photo-report", importId],
    queryFn: () => getClayPhotoReport(importId),
    enabled: active && !!importId,
  });
  const item = current.data?.item;
  const adopt = (value: ClayPhotoReportImport) => {
    setDraft(value.draft ? structuredClone(value.draft) : null);
    setRevision(value.revision);
    setDirty(false);
    setSubmitIssues([]);
    qc.setQueryData(["clay-photo-report", value.id], { item: value });
  };
  useEffect(() => {
    if (item && !dirty && item.revision !== revision) adopt(item);
  }, [item, dirty, revision]);
  useEffect(() => {
    if (!item || !active) return setSourceUrl("");
    let cancelled = false;
    let url = "";
    getClayPhotoReportImage(item.id, aligned && item.hasAlignedImage)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (!cancelled) setSourceUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Gambar gagal dimuat.");
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item?.id, item?.hasAlignedImage, aligned, active]);

  const mutationError = (cause: Error) => {
    setError(cause.message);
    if (cause instanceof ApiClientError && Array.isArray(cause.details?.issues))
      setSubmitIssues(cause.details.issues as ClayPhotoReportImport["issues"]);
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Ukuran gambar maksimum 4 MiB.");
      return uploadClayPhotoReport(crusherId, file);
    },
    onSuccess: async ({ item: value }) => {
      setPendingFile(null);
      setImportId(value.id);
      setVlmConsent(false);
      adopt(value);
      setNotice(
        "Gambar tersimpan private. Beri persetujuan sebelum mengirimnya ke provider VLM.",
      );
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["clay-photo-reports"] });
    },
    onError: mutationError,
  });
  const process = useMutation({
    mutationFn: () => processClayPhotoReport(importId),
    onSuccess: async ({ item: value }) => {
      adopt(value);
      setVlmConsent(false);
      setNotice(
        value.status === "FAILED"
          ? "Ekstraksi gagal. Periksa engine lalu ulangi parser."
          : "Ekstraksi selesai. Cocokkan semua nilai dengan foto.",
      );
      await qc.invalidateQueries({ queryKey: ["clay-photo-reports"] });
    },
    onError: mutationError,
  });
  const save = useMutation({
    mutationFn: () => saveClayPhotoDraft(importId, revision, draft!),
    onSuccess: ({ item: value }) => {
      adopt(value);
      setNotice("Koreksi tersimpan. Periksa daftar validasi.");
    },
    onError: mutationError,
  });
  const confirm = useMutation({
    mutationFn: () => confirmClayPhotoReport(importId, revision, draft!),
    onSuccess: async ({ item: value }) => {
      adopt(value);
      setNotice(
        "Retase terverifikasi kini tersedia bersama sampel laboratorium Clay di Mining Workbench.",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["clay-photo-reports"] }),
        qc.invalidateQueries({ queryKey: ["clay-report"] }),
        qc.invalidateQueries({ queryKey: ["clay-workbench-retase"] }),
        qc.invalidateQueries({ queryKey: ["workbench-samples", "CL"] }),
      ]);
    },
    onError: mutationError,
  });
  const retry = useMutation({
    mutationFn: () => reparseClayPhotoReport(importId),
    onSuccess: ({ item: value }) => {
      adopt(value);
      setVlmConsent(false);
    },
    onError: mutationError,
  });
  const remove = useMutation({
    mutationFn: () => deleteClayPhotoReport(importId),
    onSuccess: async () => {
      setImportId("");
      setDraft(null);
      setSourceUrl("");
      setDirty(false);
      setNotice("Import yang belum diverifikasi telah dihapus.");
      await qc.invalidateQueries({
        queryKey: ["clay-photo-reports", crusherId],
      });
    },
    onError: mutationError,
  });
  const busy =
    upload.isPending ||
    process.isPending ||
    save.isPending ||
    confirm.isPending ||
    retry.isPending ||
    remove.isPending;
  const issues = useMemo(
    () => [
      ...new Map(
        [...(item?.issues ?? []), ...submitIssues].map((issue) => [
          `${issue.code}:${issue.path}`,
          issue,
        ]),
      ).values(),
    ],
    [item?.issues, submitIssues],
  );

  const update = (mutate: (next: ClayPhotoReportDraft) => void) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const next = structuredClone(previous);
      mutate(next);
      return next;
    });
    setDirty(true);
    setSubmitIssues([]);
    setError("");
  };
  const changeShift = (shiftCode: string) => {
    const selected = lookup.shifts.find((shift) => shift.code === shiftCode);
    if (!selected || !draft?.operationDate) return;
    const hours = shiftHours(draft.operationDate, selected).map((row) =>
      Number(row.hour.slice(0, 2)),
    );
    update((next) => {
      next.shiftCode = shiftCode as ClayPhotoReportDraft["shiftCode"];
      next.hours = hours;
      for (const column of next.columns) {
        const old = new Map(
          column.hourly.map((cell) => [cell.hour, cell.retase]),
        );
        column.hourly = hours.map((hour) => ({
          hour,
          retase: old.get(hour) ?? null,
        }));
      }
    });
  };
  const setReference = (columnIndex: number, reference: string) => {
    update((next) => {
      const column = next.columns[columnIndex]!;
      Object.assign(column, {
        vendorId: null,
        sourceId: null,
        vendorNameSnapshot: null,
        sourceNameSnapshot: null,
      });
      if (reference.startsWith("vendor:")) {
        const vendor = vendors.find((x) => x.id === reference.slice(7));
        Object.assign(column, {
          vendorId: vendor?.id ?? null,
          vendorNameSnapshot: vendor?.label ?? null,
          inputMode: "MASTER",
        });
      } else if (reference.startsWith("source:")) {
        const source = sources.find((x) => x.id === reference.slice(7));
        Object.assign(column, {
          sourceId: source?.id ?? null,
          sourceNameSnapshot: source?.label ?? null,
          inputMode: "MASTER",
        });
      } else if (reference === "buffer") column.inputMode = "BUFFER";
      else {
        column.inputMode = "MANUAL";
        column.sourceNameSnapshot = column.headerPrimary;
      }
      column.reviewed = false;
    });
  };
  const referenceValue = (
    column: ClayPhotoReportDraft["columns"][number],
  ) =>
    column.vendorId
      ? `vendor:${column.vendorId}`
      : column.sourceId
        ? `source:${column.sourceId}`
        : column.inputMode === "BUFFER"
          ? "buffer"
          : "manual";

  return (
    <div className="clay-photo">
      <section className="clay-section clay-photo-upload">
        <div className="clay-section-heading">
          <div>
            <h2>Laporan foto / gambar</h2>
            <p>
              Format Clay Crusher: header operasi, matriks sumber per jam, turus
              retase, dan gangguan operasi.
            </p>
          </div>
          <div className="inline-actions">
            <EngineSettings canManage={role === "SUPERVISOR_ADMIN"} />
            <span className="clay-photo-private">Private storage</span>
          </div>
        </div>
        <div className="clay-photo-upload-grid">
          <label className="clay-field">
            <span>Unit Clay Crusher</span>
            <select
              value={crusherId}
              disabled={busy}
              onChange={(event) => {
                setCrusherId(event.target.value);
                setImportId("");
                setDraft(null);
                setRevision(0);
              }}
            >
              {crushers.map((crusher) => (
                <option key={crusher.id} value={crusher.id}>
                  {crusher.label}
                </option>
              ))}
            </select>
          </label>
          <label className="clay-field">
            <span>Riwayat gambar</span>
            <select
              value={importId}
              disabled={busy || history.isLoading}
              onChange={(event) => {
                setImportId(event.target.value);
                setDraft(null);
                setDirty(false);
                setRevision(0);
              }}
            >
              <option value="">Pilih import tersimpan</option>
              {(history.data?.items ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {new Date(entry.createdAt).toLocaleString("id-ID")} ·{" "}
                  {statusLabels[entry.status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="clay-photo-file-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              setError("");
              setPendingFile(event.target.files?.[0] ?? null);
            }}
          />
          <input
            ref={cameraRef}
            className="clay-sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) =>
              setPendingFile(event.target.files?.[0] ?? null)
            }
          />
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
          >
            Ambil foto
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!pendingFile || !crusherId || busy}
            onClick={() => pendingFile && upload.mutate(pendingFile)}
          >
            {upload.isPending ? "Menyimpan…" : "Simpan private"}
          </button>
        </div>
        {pendingUrl && (
          <div className="clay-photo-pending">
            <img src={pendingUrl} alt="Preview laporan Clay sebelum disimpan" />
            <div>
              <strong>{pendingFile?.name}</strong>
              <small>
                {((pendingFile?.size ?? 0) / 1024 / 1024).toFixed(2)} MiB ·
                belum dikirim ke VLM
              </small>
            </div>
          </div>
        )}
      </section>

      {error && (
        <p className="clay-message error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="clay-message">{notice}</p>}
      {current.isLoading && (
        <div className="clay-section clay-empty">Memuat import…</div>
      )}

      {item && (
        <ParserDiagnostics
          key={item.id}
          diagnostics={item.diagnostics}
          material="CL"
          importId={item.id}
          status={item.status}
          canManage={role === "SUPERVISOR_ADMIN"}
          disabled={busy}
          active={active}
        />
      )}

      {item && sourceUrl && (
        <section className="clay-photo-review-shell">
          <aside className="clay-section clay-photo-source">
            <div className="clay-photo-source-head">
              <div>
                <strong>{item.fileName}</strong>
                <small>{statusLabels[item.status]}</small>
              </div>
              {item.hasAlignedImage && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setAligned((value) => !value)}
                >
                  {aligned ? "Lihat asli" : "Lihat normalisasi"}
                </button>
              )}
            </div>
            <div className="clay-photo-image-scroll">
              <img src={sourceUrl} alt="Sumber laporan harian Clay" />
            </div>
          </aside>

          <main className="clay-photo-review">
            {(item.status === "QUEUED" || item.status === "FAILED") && (
              <section className="clay-section clay-photo-consent">
                <h2>
                  {item.status === "FAILED"
                    ? "Ekstraksi gagal"
                    : "Proses dengan VLM"}
                </h2>
                <p>
                  Gambar akan dikirim dari server ke provider/model yang dipilih
                  pada Engine OreVision. Pastikan dokumen boleh diproses oleh
                  provider tersebut. {item.error}
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={vlmConsent}
                    onChange={(event) => setVlmConsent(event.target.checked)}
                  />
                  <span>
                    Saya menyetujui pemrosesan gambar ini oleh provider VLM
                    terkonfigurasi.
                  </span>
                </label>
                <button
                  className="btn primary"
                  type="button"
                  disabled={!vlmConsent || busy}
                  onClick={() =>
                    item.status === "FAILED"
                      ? retry.mutate()
                      : process.mutate()
                  }
                >
                  {process.isPending || retry.isPending
                    ? "Mengekstrak…"
                    : item.status === "FAILED"
                      ? "Ulangi parser"
                      : "Proses dengan VLM"}
                </button>
              </section>
            )}

            {draft && (
              <>
                <section className="clay-section">
                  <div className="clay-section-heading">
                    <div>
                      <h2>Konteks hasil ekstraksi</h2>
                      <p>Nilai kosong berarti VLM tidak dapat membacanya.</p>
                    </div>
                    <span className={`clay-state ${item.status.toLowerCase()}`}>
                      {statusLabels[item.status]}
                    </span>
                  </div>
                  <div className="clay-fields three">
                    <label className="clay-field">
                      <span>Tanggal</span>
                      <input
                        type="date"
                        value={draft.operationDate ?? ""}
                        disabled={item.status === "CONFIRMED"}
                        onChange={(event) =>
                          update(
                            (next) =>
                              (next.operationDate = event.target.value || null),
                          )
                        }
                      />
                    </label>
                    <label className="clay-field">
                      <span>Shift</span>
                      <select
                        value={draft.shiftCode ?? ""}
                        disabled={item.status === "CONFIRMED"}
                        onChange={(event) => changeShift(event.target.value)}
                      >
                        <option value="">Pilih shift</option>
                        {lookup.shifts.map((shift) => (
                          <option key={shift.code} value={shift.code}>
                            {shift.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="clay-field">
                      <span>Operator</span>
                      <input
                        value={draft.header.operatorName ?? ""}
                        disabled={item.status === "CONFIRMED"}
                        onChange={(event) =>
                          update(
                            (next) =>
                              (next.header.operatorName =
                                event.target.value || null),
                          )
                        }
                      />
                    </label>
                  </div>
                </section>

                <section className="clay-section clay-photo-summary">
                  <div className="clay-section-heading">
                    <div>
                      <h2>Ringkasan operasi &amp; material</h2>
                      <p>Periksa satuan hasil baca VLM sebelum konfirmasi.</p>
                    </div>
                  </div>
                  <div className="clay-fields three">
                    {(
                      [
                        ["productionTonnage", "Produksi (ton)"],
                        ["runningMinutes", "Running time (menit)"],
                        ["totalRunningMinutes", "Total running (menit)"],
                        ["capacityTph", "Kapasitas (ton/jam)"],
                        ["stockPercent", "Stock gudang (%)"],
                      ] as const
                    ).map(([key, label]) => (
                      <label className="clay-field" key={key}>
                        <span>{label}</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={draft.production[key] ?? ""}
                          disabled={item.status === "CONFIRMED"}
                          onChange={(event) =>
                            update(
                              (next) =>
                                (next.production[key] = numberValue(
                                  event.target.value,
                                ) as never),
                            )
                          }
                        />
                      </label>
                    ))}
                    {(
                      [
                        ["sm", "SM"],
                        ["sio2", "SiO₂"],
                        ["h2o", "H₂O"],
                      ] as const
                    ).map(([key, label]) => (
                      <label className="clay-field" key={key}>
                        <span>{label}</span>
                        <input
                          type="number"
                          step="any"
                          value={draft.chemistry[key] ?? ""}
                          disabled={item.status === "CONFIRMED"}
                          onChange={(event) =>
                            update(
                              (next) =>
                                (next.chemistry[key] = numberValue(
                                  event.target.value,
                                )),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="clay-fields three clay-space-top">
                    {(
                      [
                        ["pickupLocation", "Lokasi pengambilan"],
                        ["weather", "Cuaca"],
                        ["pileFilling", "Pengisian pile"],
                      ] as const
                    ).map(([key, label]) => (
                      <label className="clay-field" key={key}>
                        <span>{label}</span>
                        <input
                          value={draft.operation[key] ?? ""}
                          disabled={item.status === "CONFIRMED"}
                          onChange={(event) =>
                            update(
                              (next) =>
                                (next.operation[key] =
                                  event.target.value || null),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </section>

                <section className="clay-section">
                  <div className="clay-section-heading">
                    <div>
                      <h2>Matriks retase per jam</h2>
                      <p>
                        Isi jumlah turus/retase yang benar-benar terlihat pada
                        setiap sel gambar.
                      </p>
                    </div>
                  </div>
                  <div className="clay-matrix-scroll">
                    <table className="clay-matrix clay-photo-matrix">
                      <thead>
                        <tr>
                          <th>Jam</th>
                          {draft.columns.map((column, columnIndex) => (
                            <th
                              className={column.reviewed ? "reviewed" : ""}
                              key={column.blockKey}
                            >
                              <div className="clay-photo-matrix-head">
                                <label>
                                  <span className="clay-sr-only">
                                    Header atas kolom {columnIndex + 1}
                                  </span>
                                  <input
                                    type="text"
                                    aria-label={`Header atas kolom ${columnIndex + 1}`}
                                    value={column.headerPrimary}
                                    disabled={item.status === "CONFIRMED"}
                                    onChange={(event) =>
                                      update((next) => {
                                        const target =
                                          next.columns[columnIndex]!;
                                        target.headerPrimary =
                                          event.target.value;
                                        if (
                                          target.inputMode === "MANUAL" &&
                                          !target.vendorId &&
                                          !target.sourceId
                                        )
                                          target.sourceNameSnapshot =
                                            event.target.value || null;
                                        target.reviewed = false;
                                      })
                                    }
                                  />
                                </label>
                                <select
                                  aria-label={`Mapping vendor atau source ${column.headerPrimary}`}
                                  value={referenceValue(column)}
                                  disabled={item.status === "CONFIRMED"}
                                  onChange={(event) =>
                                    setReference(
                                      columnIndex,
                                      event.target.value,
                                    )
                                  }
                                >
                                  <option value="manual">Nama dari foto</option>
                                  <option value="buffer">
                                    Buffer / area internal
                                  </option>
                                  <optgroup label="Vendor Clay">
                                    {vendors.map((vendor) => (
                                      <option
                                        key={vendor.id}
                                        value={`vendor:${vendor.id}`}
                                      >
                                        {vendor.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Source Clay">
                                    {sources.map((source) => (
                                      <option
                                        key={source.id}
                                        value={`source:${source.id}`}
                                      >
                                        {source.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                </select>
                                <label className="clay-photo-reviewed">
                                  <input
                                    type="checkbox"
                                    checked={column.reviewed}
                                    disabled={item.status === "CONFIRMED"}
                                    onChange={(event) =>
                                      update(
                                        (next) =>
                                          (next.columns[
                                            columnIndex
                                          ]!.reviewed = event.target.checked),
                                      )
                                    }
                                  />
                                  <span>Sudah diperiksa</span>
                                </label>
                                {item.status !== "CONFIRMED" &&
                                  draft.columns.length > 1 &&
                                  column.hourly.reduce(
                                    (total, cell) =>
                                      total + (cell.retase ?? 0),
                                    0,
                                  ) === 0 && (
                                    <button
                                      className="clay-photo-remove-column"
                                      type="button"
                                      onClick={() =>
                                        update((next) => {
                                          next.columns.splice(columnIndex, 1);
                                          next.columns.forEach(
                                            (entry, order) =>
                                              (entry.displayOrder = order),
                                          );
                                        })
                                      }
                                    >
                                      Hapus
                                    </button>
                                  )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {draft.hours.map((hour) => (
                          <tr key={hour}>
                            <th>{String(hour).padStart(2, "0")}:00</th>
                            {draft.columns.map((column, columnIndex) => {
                              const cell = column.hourly.find(
                                (entry) => entry.hour === hour,
                              );
                              return (
                                <td key={column.blockKey}>
                                  <input
                                    aria-label={`${column.headerPrimary} jam ${hour}`}
                                    type="number"
                                    min="0"
                                    max="5000"
                                    value={cell?.retase ?? ""}
                                    disabled={item.status === "CONFIRMED"}
                                    onChange={(event) =>
                                      update((next) => {
                                        const target =
                                          next.columns[columnIndex]!;
                                        const index = target.hourly.findIndex(
                                          (entry) => entry.hour === hour,
                                        );
                                        const value = numberValue(
                                          event.target.value,
                                        );
                                        if (index >= 0)
                                          target.hourly[index]!.retase = value;
                                        else
                                          target.hourly.push({
                                            hour,
                                            retase: value,
                                          });
                                      })
                                    }
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th>Jumlah</th>
                          {draft.columns.map((column) => (
                            <td key={column.blockKey}>
                              {column.hourly.reduce(
                                (total, cell) => total + (cell.retase ?? 0),
                                0,
                              )}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>

                <section className="clay-section">
                  <div className="clay-section-heading">
                    <div>
                      <h2>Gangguan operasi / keterangan</h2>
                      <p>Jam boleh kosong untuk catatan umum.</p>
                    </div>
                    {item.status !== "CONFIRMED" && (
                      <button
                        className="btn"
                        type="button"
                        onClick={() =>
                          update((next) =>
                            next.operationLogs.push({
                              displayOrder: next.operationLogs.length,
                              startTime: null,
                              endTime: null,
                              category: "NOTE",
                              description: "Catatan baru",
                            }),
                          )
                        }
                      >
                        + Catatan
                      </button>
                    )}
                  </div>
                  <div className="clay-photo-logs">
                    {draft.operationLogs.map((log, index) => (
                      <div key={index}>
                        <input
                          aria-label={`Mulai catatan ${index + 1}`}
                          type="time"
                          value={log.startTime ?? ""}
                          disabled={item.status === "CONFIRMED"}
                          onChange={(event) =>
                            update(
                              (next) =>
                                (next.operationLogs[index]!.startTime =
                                  event.target.value || null),
                            )
                          }
                        />
                        <input
                          aria-label={`Selesai catatan ${index + 1}`}
                          type="time"
                          value={log.endTime ?? ""}
                          disabled={item.status === "CONFIRMED"}
                          onChange={(event) =>
                            update(
                              (next) =>
                                (next.operationLogs[index]!.endTime =
                                  event.target.value || null),
                            )
                          }
                        />
                        <select
                          aria-label={`Jenis catatan ${index + 1}`}
                          value={log.category}
                          disabled={item.status === "CONFIRMED"}
                          onChange={(event) =>
                            update(
                              (next) =>
                                (next.operationLogs[index]!.category = event
                                  .target
                                  .value as typeof log.category),
                            )
                          }
                        >
                          <option value="SHIFT_CHANGE">Pergantian shift</option>
                          <option value="STOP">Stop</option>
                          <option value="BREAKDOWN">Breakdown</option>
                          <option value="MAINTENANCE">Maintenance</option>
                          <option value="NOTE">Catatan</option>
                        </select>
                        <input
                          aria-label={`Isi catatan ${index + 1}`}
                          value={log.description}
                          disabled={item.status === "CONFIRMED"}
                          onChange={(event) =>
                            update(
                              (next) =>
                                (next.operationLogs[index]!.description =
                                  event.target.value),
                            )
                          }
                        />
                        {item.status !== "CONFIRMED" && (
                          <button
                            className="clay-icon-button"
                            type="button"
                            aria-label="Hapus catatan"
                            onClick={() =>
                              update((next) => {
                                next.operationLogs.splice(index, 1);
                                next.operationLogs.forEach(
                                  (entry, order) =>
                                    (entry.displayOrder = order),
                                );
                              })
                            }
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                {!!issues.length && (
                  <section className="clay-section clay-photo-issues">
                    <div className="clay-section-heading">
                      <div>
                        <h2>Validasi review</h2>
                        <p>
                          {
                            issues.filter(
                              (issue) => issue.severity === "BLOCKING",
                            ).length
                          }{" "}
                          blocking ·{" "}
                          {
                            issues.filter(
                              (issue) => issue.severity !== "BLOCKING",
                            ).length
                          }{" "}
                          peringatan
                        </p>
                      </div>
                    </div>
                    {issues.map((issue) => (
                      <div
                        key={`${issue.code}:${issue.path}`}
                        className={issue.severity.toLowerCase()}
                      >
                        <strong>{issue.severity}</strong>
                        <span>{issue.message}</span>
                        <small>{issue.path}</small>
                      </div>
                    ))}
                  </section>
                )}

                <footer className="clay-footer">
                  <div>
                    <strong>
                      {dirty ? "Ada koreksi belum disimpan" : "Draft sinkron"}
                    </strong>
                    <small>
                      Konfirmasi QC menulis laporan dan retase Clay secara
                      atomik, lalu workbench menggabungkannya dengan raw sample.
                    </small>
                  </div>
                  <div className="clay-actions">
                    {role === "SUPERVISOR_ADMIN" &&
                      item.status !== "CONFIRMED" && (
                        <button
                          className="btn"
                          type="button"
                          disabled={busy}
                          onClick={() => remove.mutate()}
                        >
                          Hapus import
                        </button>
                      )}
                    {item.status !== "CONFIRMED" && (
                      <button
                        className="btn"
                        type="button"
                        disabled={busy || !dirty}
                        onClick={() => save.mutate()}
                      >
                        {save.isPending ? "Menyimpan…" : "Simpan koreksi"}
                      </button>
                    )}
                    {canConfirm && item.status !== "CONFIRMED" && (
                      <button
                        className="btn primary"
                        type="button"
                        disabled={
                          busy || !draft.operationDate || !draft.shiftCode
                        }
                        onClick={() => confirm.mutate()}
                      >
                        {confirm.isPending
                          ? "Mengintegrasikan…"
                          : "Konfirmasi ke Workbench"}
                      </button>
                    )}
                    {item.status === "CONFIRMED" && draft.operationDate && (
                      <>
                        <a className="btn" href="/raw-samples?material=CL">
                          Raw sample Clay
                        </a>
                        <a
                          className="btn primary"
                          href={`/qc-workbench?material=CL&operationDate=${draft.operationDate}&shiftCode=${draft.shiftCode}`}
                        >
                          Clay Mining Workbench
                        </a>
                      </>
                    )}
                  </div>
                </footer>
              </>
            )}
          </main>
        </section>
      )}
    </div>
  );
}
