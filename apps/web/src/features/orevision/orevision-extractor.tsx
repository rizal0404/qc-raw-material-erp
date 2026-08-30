import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CrusherReportDraft,
  CrusherReportImport,
  CrusherReportIssue,
} from "@qc/contracts";
import { CRUSHER_REPORT_HOURS } from "@qc/contracts";
import { useMaterialLookups } from "../navigation/material-context";
import { authQueryOptions } from "../auth/auth-query";
import {
  confirmPhotoReport,
  deletePhotoReport,
  getPhotoAssignments,
  getPhotoReport,
  getPhotoReportImage,
  listPhotoReports,
  reparsePhotoReport,
  savePhotoDraft,
  uploadPhotoReport,
} from "../retase/photo-report-api";
import "./orevision.css";
import "./side-by-side-review.css";
import { EngineSettings } from "./engine-settings";
import { AppIcon } from "../../components/app-icon";
import {
  DemoDocument,
  ReviewHeader,
  ReviewMatrix,
  ReviewSummary,
} from "./side-by-side-review";
import {
  DocumentDetails,
  ReportAnalytics,
  ReportExport,
} from "./report-panels";
import { SAMPLE_IMPORT } from "./sample-report";
import { VendorReviewControls } from "./vendor-review-controls";
import { equipmentLookupQueryOptions, masterKeys } from "../master/master-api";
import { ApiClientError } from "../../lib/api-client";
import { type PhotoRowFilter } from "../retase/photo-report-review";
import { defaultRowAssignment } from "./mapping-model";
import {
  cropPhotoReportImage,
  FULL_IMAGE_CROP,
  normalizeImageCrop,
  type ImageCropPercent,
} from "./image-crop";

const numeric = (value: string) => (value === "" ? null : Number(value));
const sourceBlocks = ["upper-left", "upper-right", "lower-left", "lower-right"];
type Edit = (path: string, value: unknown) => void;
const productionLabels: Record<string, string> = {
  pileTon: "Pile (ton)",
  fillerTon: "Filler (ton)",
  totalTon: "Total produksi (ton)",
  runningTimeHours: "Running time (jam)",
  capacityTph: "Kapasitas (ton/jam)",
};
const pileLabels: Record<string, string> = {
  baratPercent: "Pile barat (%)",
  timurPercent: "Pile timur (%)",
  totalPercent: "Total pile (%)",
};

export function OreVisionExtractor({
  onDirty,
  active = true,
}: { onDirty?: (dirty: boolean) => void; active?: boolean } = {}) {
  const qc = useQueryClient(),
    lookups = useMaterialLookups(),
    auth = useQuery(authQueryOptions);
  const user = auth.data?.user;
  const crushers = (lookups.data?.crushers ?? []).filter(
    (c) =>
      c.active &&
      c.materialKind === "LS" &&
      (user?.role !== "CRUSHER_OPERATOR" || user.crusherIds.includes(c.id)),
  );
  const [activeTab, setActiveTab] = useState<
    "input" | "review" | "analytics" | "export"
  >("review");
  const [demo, setDemo] = useState(false),
    [demoItem, setDemoItem] = useState(SAMPLE_IMPORT),
    [selectedVendor, setSelectedVendor] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [submitIssues, setSubmitIssues] = useState<CrusherReportIssue[]>([]);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [grid, setGrid] = useState(false),
    [contrast, setContrast] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState("");
  const [crop, setCrop] = useState<ImageCropPercent>(FULL_IMAGE_CROP);
  const cameraRef = useRef<HTMLInputElement>(null);
  const cropStageRef = useRef<HTMLDivElement>(null);
  const cropDrag = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    crop: ImageCropPercent;
  } | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const openDetails = () => {
    if (!detailsRef.current) return;
    setDetailsOpen(true);
    detailsRef.current.open = true;
    detailsRef.current.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const [crusherId, setCrusherId] = useState(""),
    [importId, setImportId] = useState("");
  const [draft, setDraft] = useState<CrusherReportDraft | null>(null),
    [revision, setRevision] = useState(0),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [sourceUrl, setSourceUrl] = useState(""),
    [zoom, setZoom] = useState(1),
    [focusPath, setFocusPath] = useState(""),
    [lowOnly, setLowOnly] = useState(false),
    [aligned, setAligned] = useState(true);
  const [rowFilter, setRowFilter] = useState<PhotoRowFilter>("all");
  const [sourceSize, setSourceSize] = useState<[number, number]>([1600, 2200]);
  const sourceRef = useRef<HTMLDivElement>(null),
    fileRef = useRef<HTMLInputElement>(null);
  const automaticAssignmentKeys = useRef(new Set<string>());
  useEffect(() => {
    if (!pendingFile) {
      setPendingPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);
  useEffect(() => {
    if (!crusherId && crushers[0]) setCrusherId(crushers[0].id);
  }, [crusherId, crushers]);
  const history = useQuery({
    queryKey: ["photo-reports", crusherId],
    queryFn: () => listPhotoReports(crusherId),
    enabled: active && !!crusherId,
  });
  const current = useQuery({
    queryKey: ["photo-report", importId],
    queryFn: () => getPhotoReport(importId),
    enabled: active && !!importId,
    refetchInterval: (q) =>
      active &&
      ["QUEUED", "PROCESSING"].includes(q.state.data?.item.status ?? "")
        ? 2000
        : false,
  });
  const item = demo ? demoItem : current.data?.item;
  const adopt = (value: CrusherReportImport) => {
    setDraft(value.draft ? structuredClone(value.draft) : null);
    setRevision(value.revision);
    setDirty(false);
    setSubmitIssues([]);
    qc.setQueryData(["photo-report", value.id], { item: value });
  };
  useEffect(() => {
    if (item && !dirty && item.revision !== revision) {
      setDraft(item.draft ? structuredClone(item.draft) : null);
      setRevision(item.revision);
      setSubmitIssues([]);
    }
  }, [item, dirty, revision]);
  useEffect(() => {
    if (!item || demo || !active) {
      setSourceUrl("");
      return;
    }
    let cancelled = false,
      url = "";
    setSourceUrl("");
    getPhotoReportImage(item.id, aligned && item.hasAlignedImage)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (!cancelled) setSourceUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item?.id, item?.hasAlignedImage, aligned, demo, active, imageAttempt]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const candidates = useQuery({
    queryKey: [
      "photo-assignments",
      importId,
      draft?.reportDate,
      draft?.shiftCode,
    ],
    queryFn: () =>
      getPhotoAssignments(importId, draft!.reportDate!, draft!.shiftCode!),
    enabled:
      active &&
      !demo &&
      !!importId &&
      !!draft?.reportDate &&
      !!draft?.shiftCode,
  });
  const vendorIndex = Math.max(
    0,
    draft?.vendors.findIndex((v) => v.blockKey === selectedVendor) ?? 0,
  );
  const currentVendor = draft?.vendors[vendorIndex];
  const equipment = useQuery({
    ...equipmentLookupQueryOptions(
      currentVendor?.vendorId ?? undefined,
      undefined,
      "LS",
    ),
    enabled: active && !demo && !!currentVendor?.vendorId,
  });
  const refreshMapping = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: masterKeys.lookups }),
      qc.invalidateQueries({ queryKey: ["photo-assignments"] }),
      qc.invalidateQueries({ queryKey: ["counter-assignments"] }),
      qc.invalidateQueries({ queryKey: ["operational-assignments"] }),
    ]);
  };
  const upload = useMutation({
    mutationFn: async ({
      file,
      crop,
    }: {
      file: File;
      crop: ImageCropPercent;
    }) => {
      const croppedFile = await cropPhotoReportImage(file, crop);
      if (croppedFile.size > 4 * 1024 * 1024)
        throw new Error(
          "Hasil crop melebihi 4 MiB. Perkecil area crop atau gunakan JPEG/WebP.",
        );
      return uploadPhotoReport(crusherId, croppedFile);
    },
    onSuccess: async ({ item: value }) => {
      setPendingFile(null);
      setCrop(FULL_IMAGE_CROP);
      setImageAttempt((attempt) => attempt + 1);
      setDemo(false);
      setImportId(value.id);
      adopt(value);
      setActiveTab("review");
      setSelectedVendor("");
      setNotice(
        value.status === "FAILED"
          ? "Foto tersimpan, tetapi ekstraksi AI gagal. Periksa pesan lalu gunakan Ulangi parser."
          : "Foto tersimpan dan ekstraksi AI selesai; belum ada retase yang ditulis sebelum konfirmasi QC.",
      );
      if (fileRef.current) fileRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["photo-reports"] });
    },
    onError: (e) => setError(e.message),
  });
  const save = useMutation({
    mutationFn: () =>
      demo
        ? Promise.resolve({
            item: {
              ...demoItem,
              draft: structuredClone(draft!),
              revision: revision + 1,
            },
          })
        : savePhotoDraft(importId, revision, draft!),
    onSuccess: ({ item: value }) => {
      if (demo) setDemoItem(value);
      adopt(value);
      setNotice("Koreksi tersimpan. Periksa validasi sebelum konfirmasi.");
    },
    onError: (e) => setError(e.message),
  });
  const confirm = useMutation({
    mutationFn: () => {
      if (demo || !draft)
        throw new Error("Data demo atau draft kosong tidak dapat dikirim.");
      return confirmPhotoReport(importId, revision, draft);
    },
    onSuccess: async ({ item: value }) => {
      adopt(value);
      setNotice(
        "Laporan dikonfirmasi. Retase tersedia di rekonsiliasi; lakukan mapping sampel sebelum mixing.",
      );
      await Promise.all(
        [
          "photo-reports",
          "counter-assignments",
          "counter-context",
          "retase-summary",
          "retase-events",
          "reconciliation",
          "qc-retase",
          "retase-suggestions",
        ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
      await qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey.some(
            (k) =>
              typeof k === "string" && /allocation|suggestion|reconcil/.test(k),
          ),
      });
    },
    onError: (e) => {
      setError(e.message);
      if (e instanceof ApiClientError && Array.isArray(e.details?.issues))
        setSubmitIssues(e.details.issues as CrusherReportIssue[]);
    },
  });
  const retry = useMutation({
    mutationFn: () => reparsePhotoReport(importId),
    onSuccess: ({ item: value }) => adopt(value),
    onError: (e) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deletePhotoReport(importId),
    onSuccess: async () => {
      const deletedId = importId;
      setImportId("");
      setDraft(null);
      setRevision(0);
      setDirty(false);
      setSubmitIssues([]);
      setError("");
      setNotice(
        "File gambar dan data laporan yang belum diverifikasi telah dihapus.",
      );
      qc.removeQueries({ queryKey: ["photo-report", deletedId] });
      await qc.invalidateQueries({ queryKey: ["photo-reports", crusherId] });
    },
    onError: (e) => setError(e.message),
  });
  const busy =
    upload.isPending ||
    save.isPending ||
    confirm.isPending ||
    retry.isPending ||
    remove.isPending ||
    mappingBusy;
  const disabled =
    busy || !item || !["NEEDS_REVIEW", "READY"].includes(item.status);
  useEffect(() => {
    if (
      demo ||
      disabled ||
      !draft ||
      !currentVendor?.vendorId ||
      !candidates.data ||
      !equipment.data
    )
      return;
    const assignmentIds = candidates.data.items
      .flatMap((assignment) =>
        assignment.aa.map((aa) => aa.assignmentAaId),
      )
      .sort();
    const rowIdentity = currentVendor.vehicles.map((row) => [
      row.rowIndex,
      row.dtNo,
      row.equipmentId ?? null,
    ]);
    const key = JSON.stringify([
      importId,
      draft.reportDate,
      draft.shiftCode,
      currentVendor.blockKey,
      currentVendor.vendorId,
      assignmentIds,
      rowIdentity,
    ]);
    if (automaticAssignmentKeys.current.has(key)) return;
    automaticAssignmentKeys.current.add(key);

    const automaticChoices = currentVendor.vehicles.flatMap((row) => {
      const choice = defaultRowAssignment(
        row,
        currentVendor.vendorId,
        candidates.data.items,
        equipment.data.items.map((item) => ({
          ...item,
          aliases: item.aliases ?? [],
        })),
      );
      return choice ? [{ rowIndex: row.rowIndex, dtNo: row.dtNo, choice }] : [];
    });
    if (!automaticChoices.length) return;
    setDraft((previous) => {
      if (!previous) return previous;
      const next = structuredClone(previous);
      const vendor = next.vendors.find(
        (candidate) => candidate.blockKey === currentVendor.blockKey,
      );
      if (!vendor || vendor.vendorId !== currentVendor.vendorId) return previous;
      let changed = false;
      for (const automatic of automaticChoices) {
        const row = vendor.vehicles.find(
          (candidate) =>
            candidate.rowIndex === automatic.rowIndex &&
            candidate.dtNo === automatic.dtNo,
        );
        if (!row || row.assignmentAaId) continue;
        row.equipmentId = automatic.choice.aaId;
        row.assignmentAaId = automatic.choice.id;
        row.reviewed = false;
        changed = true;
      }
      return changed ? next : previous;
    });
    setDirty(true);
    setSubmitIssues([]);
    setError("");
    setNotice(
      `${automaticChoices.length} DT otomatis terhubung ke AM dari laporan shift vendor. Assignment tetap dapat diubah manual.`,
    );
  }, [
    candidates.data,
    currentVendor,
    demo,
    disabled,
    draft,
    equipment.data,
    importId,
  ]);
  const edit: Edit = (path, value) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const next = structuredClone(previous);
      const keys = path.split(".");
      let target: any = next;
      for (const key of keys.slice(0, -1)) target = target[key];
      target[keys.at(-1)!] = value;
      if (path === "reportDate" || path === "shiftCode")
        for (const v of next.vendors)
          for (const row of v.vehicles) {
            row.assignmentAaId = null;
            row.reviewed = false;
          }
      const vendorChange = /^vendors\.(\d+)\.vendorId$/.exec(path);
      if (vendorChange)
        for (const row of next.vendors[Number(vendorChange[1])]!.vehicles) {
          row.equipmentId = null;
          row.assignmentAaId = null;
          row.reviewed = false;
        }
      const hourPath = /^vendors\.(\d+)\.vehicles\.(\d+)\.hourly\./.exec(path);
      if (hourPath) {
        const row =
          next.vendors[Number(hourPath[1])]!.vehicles[Number(hourPath[2])]!;
        row.retase =
          row.hourly?.length && row.hourly.every((h) => h.retase !== null)
            ? row.hourly.reduce((n, h) => n + (h.retase ?? 0), 0)
            : null;
        row.reviewed = false;
      }
      const changedVendor =
        /^vendors\.(\d+)\.vehicles(?:$|\.\d+\.hourly\.)/.exec(path);
      if (changedVendor) {
        const vendor = next.vendors[Number(changedVendor[1])]!;
        if (vendor.vehicles.length && vendor.vehicles.every((r) => r.hourly))
          vendor.hourly = next.hours.map((hour) => {
            const counts = vendor.vehicles.map(
              (r) => r.hourly?.find((h) => h.hour === hour)?.retase,
            );
            return {
              hour,
              retase: counts.every((n) => n != null)
                ? counts.reduce<number>((n, value) => n + (value ?? 0), 0)
                : null,
            };
          });
      }
      if (path.startsWith("document.logs") && next.document)
        next.notes.raw = next.document.logs
          .map((log) => `${log.time ?? ""} ${log.text}`)
          .join("\n")
          .slice(0, 20000);
      const rowPath =
        /^vendors\.(\d+)\.vehicles\.(\d+)\.(dtNo|retase|assignmentAaId)$/.exec(
          path,
        );
      if (rowPath) {
        const row =
          next.vendors[Number(rowPath[1])]!.vehicles[Number(rowPath[2])]!;
        row.reviewed = false;
        if (rowPath[3] === "dtNo") {
          row.assignmentAaId = null;
          row.equipmentId = null;
        }
      }
      if (path === "shiftCode") {
        const hours = [...(CRUSHER_REPORT_HOURS[String(value)] ?? [])];
        if (JSON.stringify(hours) !== JSON.stringify(next.hours)) {
          next.hours = hours;
          for (const v of next.vendors) {
            v.hourly = hours.map((hour) => ({ hour, retase: null }));
            for (const r of v.vehicles)
              if (r.hourly)
                r.hourly = hours.map((hour) => ({ hour, retase: null }));
          }
        }
      }
      return next;
    });
    setDirty(true);
    setSubmitIssues([]);
    setError("");
    setNotice("Ada koreksi belum disimpan.");
  };
  const focus = (path: string) => {
    const keys = path.split(".");
    if (keys[0] === "vendors") {
      const v = draft?.vendors[Number(keys[1])];
      if (v) setSelectedVendor(v.blockKey);
      const visionIndex = /^vision-(\d+)$/.exec(v?.blockKey ?? "")?.[1];
      keys[1] = visionIndex ?? String(sourceBlocks.indexOf(v?.blockKey ?? ""));
      if (keys[2] === "vehicles")
        keys[3] = String((v?.vehicles[Number(keys[3])]?.rowIndex ?? 0) - 1);
    }
    const sourcePath = keys.join(".");
    setFocusPath(sourcePath);
    const observation = item?.observations.find(
      (o) => o.fieldPath === sourcePath,
    );
    if (observation?.bbox && sourceRef.current) {
      const [x, y, w, h] = observation.bbox;
      const el = sourceRef.current;
      el.scrollTo({
        left: (x + w / 2) * el.scrollWidth - el.clientWidth / 2,
        top: (y + h / 2) * el.scrollHeight - el.clientHeight / 2,
        behavior: "smooth",
      });
    }
  };
  const focused = item?.observations.find((o) => o.fieldPath === focusPath);
  const selectImport = (id: string) => {
    if (dirty && !window.confirm("Tinggalkan koreksi yang belum disimpan?"))
      return;
    setDemo(false);
    setSelectedVendor("");
    setImportId(id);
    setDraft(null);
    setRevision(0);
    setDirty(false);
    setSubmitIssues([]);
    setError("");
    setNotice("");
  };
  const chooseFile = (file: File | undefined) => {
    if (!file || busy || !crusherId) return;
    if (dirty && !window.confirm("Tinggalkan koreksi dan upload foto lain?"))
      return;
    if (file.size > 4 * 1024 * 1024) {
      setError("Ukuran foto maksimum 4 MiB untuk deployment Vercel.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Gunakan JPEG, PNG, atau WebP.");
      return;
    }
    setError("");
    setNotice("");
    setPendingFile(file);
    setCrop(FULL_IMAGE_CROP);
    setActiveTab("input");
  };
  const updateCrop = (change: Partial<ImageCropPercent>) =>
    setCrop((current) => normalizeImageCrop({ ...current, ...change }));
  const cancelPendingFile = () => {
    setPendingFile(null);
    setCrop(FULL_IMAGE_CROP);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };
  const showDemo = () => {
    if (dirty && !window.confirm("Tinggalkan koreksi dan buka demo?")) return;
    setDemo(true);
    setDemoItem(structuredClone(SAMPLE_IMPORT));
    setImportId("");
    adopt(SAMPLE_IMPORT);
    setActiveTab("review");
    setSelectedVendor("");
    cancelPendingFile();
    setNotice(
      "MODE DEMO: data contoh lokal. Tidak dikirim ke API ekstraksi atau rekonsiliasi.",
    );
  };
  const issues = submitIssues.length
    ? submitIssues
    : dirty
      ? []
      : (item?.issues ?? []);
  const canCreate = ["QC_ANALYST", "SUPERVISOR_ADMIN"].includes(
    user?.role ?? "",
  );
  const canDelete =
    !demo &&
    user?.role === "SUPERVISOR_ADMIN" &&
    !!item &&
    item.status !== "CONFIRMED" &&
    !item.reportId;
  const canConfirm =
    !demo &&
    canCreate &&
    !!draft?.reportDate &&
    !!draft.shiftCode &&
    draft.vendors.length > 0 &&
    draft.vendors.every(
      (v) =>
        !!v.vendorId &&
        v.vehicles.length > 0 &&
        v.retaseTotal !== null &&
        v.vehicles.every(
          (r) =>
            r.reviewed &&
            !!r.dtNo.trim() &&
            r.retase !== null &&
            (r.retase === 0 || !!r.assignmentAaId),
        ),
    );
  const checkedRows =
    draft?.vendors.reduce(
      (n, v) => n + v.vehicles.filter((r) => r.reviewed).length,
      0,
    ) ?? 0;
  const totalRows =
    draft?.vendors.reduce((n, v) => n + v.vehicles.length, 0) ?? 0;
  const selectedVendorKey =
    selectedVendor === "all" ||
    draft?.vendors.some((v) => v.blockKey === selectedVendor)
      ? selectedVendor
      : (draft?.vendors[0]?.blockKey ?? "");
  return (
    <div className="photo-report orevision page-stack">
      <div className="card photo-intro">
        <div>
          <p className="eyebrow">FOTO → REVIEW → REKONSILIASI</p>
          <h2>OreVision · Smart document extractor</h2>
          <p>
            Ekstraksi AI, pemeriksaan dokumen, dan analitik laporan Limestone
            dalam satu workspace.
          </p>
        </div>
        <div className="inline-actions">
          <span className="status-badge warning">AI vision · review wajib</span>
          <EngineSettings canManage={user?.role === "SUPERVISOR_ADMIN"} />
          <button className="btn" disabled={busy} onClick={showDemo}>
            Buka data contoh
          </button>
        </div>
      </div>
      <nav className="orevision-tabs" aria-label="OreVision">
        {(
          [
            ["input", "Input & AI"],
            ["review", "Review berdampingan"],
            ["analytics", "Analitik ritase"],
            ["export", "Ekspor & API"],
          ] as const
        ).map(([tab, label]) => (
          <button
            className={activeTab === tab ? "active" : ""}
            aria-pressed={activeTab === tab}
            key={tab}
            disabled={["analytics", "export"].includes(tab) && !draft}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div
        className="card photo-upload"
        hidden={activeTab !== "input" && !!draft}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (crusherId && !busy) chooseFile(e.dataTransfer.files[0]);
        }}
      >
        <label>
          <span>Crusher laporan</span>
          <select
            aria-label="Crusher laporan foto"
            value={crusherId}
            disabled={busy}
            onChange={(e) => {
              if (
                dirty &&
                !window.confirm("Tinggalkan koreksi belum disimpan?")
              )
                return;
              setDemo(false);
              setCrusherId(e.target.value);
              setImportId("");
              setDraft(null);
              setDirty(false);
              setRevision(0);
              cancelPendingFile();
            }}
          >
            <option value="">Pilih crusher</option>
            {crushers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Foto / scan · JPEG, PNG, WebP · maks. 4 MiB</span>
          <input
            aria-label="Upload foto laporan"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={!crusherId || busy}
            onChange={(e) => {
              chooseFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <input
          hidden
          ref={cameraRef}
          aria-label="Kamera laporan"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            chooseFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          className="btn"
          disabled={!crusherId || busy}
          onClick={() => cameraRef.current?.click()}
        >
          Ambil foto
        </button>
        <span>
          {upload.isPending
            ? "Mengunggah hasil crop dan mengekstrak dengan AI… jangan tutup halaman."
            : pendingFile
              ? "Periksa dan crop gambar di bawah. File masih lokal dan belum dikirim ke API atau model AI."
              : "Pilih atau jatuhkan foto di sini. Preview ditampilkan secara lokal sebelum Anda mengirimnya ke model AI."}
        </span>
        {pendingFile && pendingPreviewUrl && (
          <section
            className="photo-crop-preflight"
            aria-label="Preview dan crop gambar"
          >
            <div className="photo-crop-heading">
              <div>
                <strong>Preview sebelum ekstraksi AI</strong>
                <small>
                  {pendingFile.name} · {(pendingFile.size / 1024).toFixed(0)} KiB
                </small>
              </div>
              <span className="status-badge warning">Belum dikirim</span>
            </div>
            <div className="photo-crop-workspace">
              <div className="photo-crop-stage" ref={cropStageRef}>
                <img src={pendingPreviewUrl} alt="Preview laporan yang akan di-crop" />
                <div
                  className="photo-crop-selection"
                  aria-label="Area crop"
                  style={{
                    left: `${crop.x}%`,
                    top: `${crop.y}%`,
                    width: `${crop.width}%`,
                    height: `${crop.height}%`,
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    cropDrag.current = {
                      pointerId: event.pointerId,
                      clientX: event.clientX,
                      clientY: event.clientY,
                      crop,
                    };
                  }}
                  onPointerMove={(event) => {
                    const drag = cropDrag.current;
                    const stage = cropStageRef.current;
                    if (!drag || !stage || drag.pointerId !== event.pointerId)
                      return;
                    const bounds = stage.getBoundingClientRect();
                    if (!bounds.width || !bounds.height) return;
                    setCrop(
                      normalizeImageCrop({
                        ...drag.crop,
                        x:
                          drag.crop.x +
                          ((event.clientX - drag.clientX) / bounds.width) * 100,
                        y:
                          drag.crop.y +
                          ((event.clientY - drag.clientY) / bounds.height) * 100,
                      }),
                    );
                  }}
                  onPointerUp={(event) => {
                    if (cropDrag.current?.pointerId === event.pointerId)
                      cropDrag.current = null;
                  }}
                  onPointerCancel={() => {
                    cropDrag.current = null;
                  }}
                >
                  <span>Geser area crop</span>
                </div>
              </div>
              <div className="photo-crop-controls">
                {(
                  [
                    ["x", "Kiri", 0, 100 - crop.width],
                    ["y", "Atas", 0, 100 - crop.height],
                    ["width", "Lebar", 5, 100 - crop.x],
                    ["height", "Tinggi", 5, 100 - crop.y],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label key={key}>
                    <span>
                      {label} <output>{Math.round(crop[key])}%</output>
                    </span>
                    <input
                      aria-label={`Crop ${label.toLowerCase()}`}
                      type="range"
                      min={min}
                      max={max}
                      step="1"
                      value={crop[key]}
                      disabled={upload.isPending}
                      onChange={(event) =>
                        updateCrop({ [key]: Number(event.target.value) })
                      }
                    />
                  </label>
                ))}
                <div className="inline-actions photo-crop-actions">
                  <button
                    className="btn"
                    type="button"
                    disabled={upload.isPending}
                    onClick={() => setCrop({ x: 5, y: 5, width: 90, height: 90 })}
                  >
                    Potong margin 5%
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={upload.isPending}
                    onClick={() => setCrop(FULL_IMAGE_CROP)}
                  >
                    Seluruh gambar
                  </button>
                </div>
              </div>
            </div>
            <div className="photo-crop-confirm">
              <small>
                Hanya area di dalam kotak yang akan dikirim dan disimpan sebagai
                sumber laporan.
              </small>
              <div className="inline-actions">
                <button
                  className="btn"
                  type="button"
                  disabled={upload.isPending}
                  onClick={cancelPendingFile}
                >
                  Batal
                </button>
                <button
                  className="btn primary"
                  type="button"
                  disabled={upload.isPending}
                  onClick={() => upload.mutate({ file: pendingFile, crop })}
                >
                  {upload.isPending
                    ? "Mengirim ke VLM…"
                    : "Crop & kirim ke VLM"}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
      {(error ||
        current.error ||
        history.error ||
        candidates.error ||
        equipment.error) && (
        <div className="alert error" role="alert">
          {error ||
            (
              current.error ??
              history.error ??
              candidates.error ??
              equipment.error
            )?.message}
          <button
            className="btn small"
            disabled={busy}
            onClick={() => {
              setError("");
              setImageAttempt((v) => v + 1);
              void Promise.all([
                history.refetch(),
                ...(importId ? [current.refetch()] : []),
                ...(draft?.reportDate && draft.shiftCode && importId
                  ? [candidates.refetch()]
                  : []),
                ...(currentVendor?.vendorId ? [equipment.refetch()] : []),
              ]);
            }}
          >
            Coba hubungkan lagi
          </button>
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      <div className="photo-history">
        <label>
          <span>Riwayat import</span>
          <select
            aria-label="Riwayat import foto"
            value={importId}
            disabled={busy}
            onChange={(e) => selectImport(e.target.value)}
          >
            <option value="">Pilih laporan tersimpan</option>
            {history.data?.items.map((h) => (
              <option key={h.id} value={h.id}>
                {h.fileName} · {h.status} ·{" "}
                {new Date(h.createdAt).toLocaleDateString("id-ID")}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn"
          disabled={busy}
          onClick={() => void history.refetch()}
        >
          Muat ulang riwayat
        </button>
        {canDelete && (
          <button
            className="btn photo-delete"
            disabled={busy}
            onClick={() => {
              const message = dirty
                ? "Hapus permanen file gambar, hasil ekstraksi, dan koreksi yang belum disimpan untuk laporan ini?"
                : "Hapus permanen file gambar dan seluruh data laporan yang belum diverifikasi ini?";
              if (window.confirm(message)) remove.mutate();
            }}
          >
            {remove.isPending ? "Menghapus…" : "Hapus file & data"}
          </button>
        )}
      </div>
      {item && (
        <>
          <div className="photo-status">
            <span
              className={`status-badge ${item.status === "CONFIRMED" ? "success" : "warning"}`}
            >
              {item.status}
            </span>
            <small>
              Parser {item.parserVersion ?? "menunggu ekstraksi"} · Template{" "}
              {item.templateVersion ?? "—"} · revisi {revision}
            </small>
            {draft?.document && (
              <small>
                Engine laporan: {draft.document.provider} ·{" "}
                {draft.document.model}
              </small>
            )}
            {["QUEUED", "PROCESSING"].includes(item.status) && (
              <p>
                Ekstraksi AI sedang diproses oleh API. Halaman memperbarui
                status otomatis bila request lain masih memegang lease.
              </p>
            )}
            {item.status === "FAILED" && (
              <>
                <p role="alert">{item.error}</p>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => retry.mutate()}
                >
                  Ulangi parser
                </button>
              </>
            )}
            {item.status === "CONFIRMED" && (
              <small>
                Arsip terverifikasi dilindungi dan tidak dapat dihapus.
              </small>
            )}
          </div>
          {demo && (
            <div className="alert inline-alert" role="status">
              Mode demo · data contoh tidak dapat dikonfirmasi ke rekonsiliasi.
            </div>
          )}
          {draft && activeTab === "analytics" && (
            <ReportAnalytics draft={draft} />
          )}
          {draft && activeTab === "export" && (
            <ReportExport draft={draft} demo={demo} dirty={dirty} />
          )}
          {activeTab === "input" && (
            <div className="card">
              <h3>Alur ekstraksi dokumen</h3>
              <p>
                Unggah / kamera → ekstraksi AI pada API → review dan mapping DT
                → konfirmasi QC.
              </p>
              <p>
                Format JPEG, PNG, WebP. Model membaca turus, header, log
                operasi, serta produksi. Data contoh hanya tersedia melalui
                tombol demo, tidak pernah sebagai fallback kegagalan AI.
              </p>
            </div>
          )}
          {activeTab === "review" && (
            <section className="orevision-review">
              {draft && (
                <ReviewHeader
                  draft={draft}
                  edit={edit}
                  focus={focus}
                  disabled={disabled}
                  shifts={lookups.data?.shifts ?? []}
                />
              )}
              <div className="photo-review-layout">
                <aside className="card photo-source">
                  <div className="photo-source-tools">
                    <strong>
                      Dokumen asli <small>{Math.round(zoom * 100)}%</small>
                    </strong>
                    <div className="orevision-preview-controls">
                      <label title="Kontras tinggi">
                        <input
                          type="checkbox"
                          aria-label="Kontras tinggi"
                          checked={contrast}
                          onChange={(e) => setContrast(e.target.checked)}
                        />
                        <AppIcon name="mix" size={15} />
                      </label>
                      <label title="Grid bantu">
                        <input
                          type="checkbox"
                          aria-label="Grid bantu"
                          checked={grid}
                          onChange={(e) => setGrid(e.target.checked)}
                        />
                        <AppIcon name="overview" size={15} />
                      </label>
                      {item.hasAlignedImage && (
                        <label title="Gambar normalisasi">
                          <input
                            type="checkbox"
                            aria-label="Gambar normalisasi"
                            checked={aligned}
                            onChange={(e) => setAligned(e.target.checked)}
                          />
                          <AppIcon name="panel" size={15} />
                        </label>
                      )}
                      <button
                        className="btn small"
                        aria-label="Perbesar gambar"
                        title="Perbesar gambar"
                        disabled={zoom >= 3}
                        onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                      >
                        +
                      </button>
                      <button
                        className="btn small"
                        aria-label="Perkecil gambar"
                        title="Perkecil gambar"
                        disabled={zoom <= 1}
                        onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                      >
                        −
                      </button>
                      <button
                        className="btn small"
                        aria-label="Reset tampilan"
                        title="Reset tampilan"
                        onClick={() => {
                          setZoom(1);
                          setGrid(false);
                          setContrast(false);
                          setFocusPath("");
                          sourceRef.current?.scrollTo({ top: 0, left: 0 });
                        }}
                      >
                        <AppIcon name="reconcile" size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="photo-source-scroll" ref={sourceRef}>
                    {sourceUrl ? (
                      <div
                        className="photo-image-canvas"
                        style={{ width: `${zoom * 100}%` }}
                      >
                        {grid && (
                          <div
                            className="orevision-grid-overlay"
                            aria-hidden="true"
                          />
                        )}
                        <img
                          style={{
                            filter: contrast
                              ? "contrast(1.5) grayscale(1)"
                              : undefined,
                          }}
                          alt="Sumber laporan harian Limestone"
                          src={sourceUrl}
                          onLoad={(e) =>
                            setSourceSize([
                              e.currentTarget.naturalWidth,
                              e.currentTarget.naturalHeight,
                            ])
                          }
                        />
                        {aligned &&
                          item.hasAlignedImage &&
                          focused?.bbox &&
                          (focused.polygon ? (
                            <svg
                              className="photo-polygon"
                              viewBox="0 0 1 1"
                              preserveAspectRatio="none"
                              aria-hidden="true"
                            >
                              <polygon
                                points={focused.polygon
                                  .map((p) => p.join(","))
                                  .join(" ")}
                              />
                            </svg>
                          ) : (
                            <div
                              className="photo-bbox"
                              style={{
                                left: `${focused.bbox[0] * 100}%`,
                                top: `${focused.bbox[1] * 100}%`,
                                width: `${focused.bbox[2] * 100}%`,
                                height: `${focused.bbox[3] * 100}%`,
                              }}
                            />
                          ))}
                      </div>
                    ) : demo ? (
                      <div
                        className="photo-image-canvas orevision-demo-canvas"
                        style={{
                          width: `${zoom * 100}%`,
                          filter: contrast
                            ? "contrast(1.5) grayscale(1)"
                            : undefined,
                        }}
                      >
                        {grid && (
                          <div
                            className="orevision-grid-overlay"
                            aria-hidden="true"
                          />
                        )}
                        <DemoDocument
                          draft={SAMPLE_IMPORT.draft!}
                          vendorKey={selectedVendorKey}
                        />
                      </div>
                    ) : (
                      <p className="photo-help">Memuat gambar…</p>
                    )}
                  </div>
                  <footer className="orevision-source-footer">
                    <span>
                      <AppIcon name="report" size={15} />
                      Engine:{" "}
                      {demo
                        ? "Demo lokal"
                        : draft?.document?.provider ||
                          item.parserVersion ||
                          "Menunggu parser"}
                    </span>
                    <EngineSettings
                      compact
                      canManage={user?.role === "SUPERVISOR_ADMIN"}
                    />
                  </footer>
                  {focused && (
                    <div className="orevision-source-evidence">
                      <small>
                        {focused
                          ? `${focused.fieldPath} · ${focused.confidenceKind === "NOT_PROVIDED" ? "AI vision tanpa skor" : `skor OCR ${Math.round(focused.confidence * 100)}/100 (belum terkalibrasi)`} · teks: ${focused.rawText ?? "tidak terbaca"} · crop ${focused.geometry ?? "versi lama"}`
                          : "Grid bantu hanya panduan visual. AI vision tidak mengklaim koordinat crop atau skor akurasi; crop lama tetap tersedia untuk hasil OCR."}
                      </small>
                      {aligned &&
                        item.hasAlignedImage &&
                        sourceUrl &&
                        focused?.bbox &&
                        focused.bbox[2] > 0 &&
                        focused.bbox[3] > 0 && (
                          <div className="photo-focused-crop">
                            <span>
                              Crop field terpilih · bandingkan dengan nilai
                              isian
                            </span>
                            <svg
                              role="img"
                              aria-label="Crop field terpilih"
                              viewBox={`${focused.bbox[0] * sourceSize[0]} ${focused.bbox[1] * sourceSize[1]} ${focused.bbox[2] * sourceSize[0]} ${focused.bbox[3] * sourceSize[1]}`}
                            >
                              <image
                                href={sourceUrl}
                                width={sourceSize[0]}
                                height={sourceSize[1]}
                              />
                              {focused.polygon && (
                                <polygon
                                  points={focused.polygon
                                    .map(
                                      ([x, y]) =>
                                        `${x * sourceSize[0]},${y * sourceSize[1]}`,
                                    )
                                    .join(" ")}
                                  fill="none"
                                  stroke="#b36100"
                                  strokeWidth="1"
                                />
                              )}
                            </svg>
                          </div>
                        )}
                    </div>
                  )}
                </aside>
                {draft ? (
                  <ReviewMatrix
                    draft={draft}
                    selectedVendor={selectedVendorKey}
                    selectVendor={setSelectedVendor}
                    edit={edit}
                    focus={focus}
                    disabled={disabled}
                    dirty={dirty}
                    saving={save.isPending}
                    onSave={() => {
                      setError("");
                      save.mutate();
                    }}
                    onDetails={openDetails}
                    toolbar={
                      draft && (
                        <VendorReviewControls
                          draft={draft}
                          index={vendorIndex}
                          vendors={lookups.data?.vendors ?? []}
                          disabled={disabled}
                          edit={edit}
                          lowOnly={lowOnly}
                          setLowOnly={setLowOnly}
                          filter={rowFilter}
                          setFilter={setRowFilter}
                          onSelect={setSelectedVendor}
                        />
                      )
                    }
                    context={{
                      draft,
                      crusherId: item.crusherId,
                      assignments: candidates.data?.items ?? [],
                      equipment: (equipment.data?.items ?? []).map((e) => ({
                        ...e,
                        aliases: e.aliases ?? [],
                      })),
                      sources: lookups.data?.sources ?? [],
                      observations: item.observations,
                      issues,
                      canCreate,
                      demo,
                      lowOnly,
                      filter: rowFilter,
                      onBusy: setMappingBusy,
                      onRefresh: refreshMapping,
                    }}
                    busy={busy}
                    canConfirm={canConfirm}
                    confirming={confirm.isPending}
                    onConfirm={() => {
                      setError("");
                      confirm.mutate();
                    }}
                  />
                ) : (
                  <div className="card">
                    <p>
                      Draft akan tampil setelah parser selesai. Foto asli tetap
                      tersedia untuk diperiksa.
                    </p>
                  </div>
                )}
              </div>
              {draft && (
                <section
                  className="card orevision-review-result"
                  aria-label="Status review tunggal"
                >
                  <strong>
                    {checkedRows}/{totalRows} DT telah diperiksa
                  </strong>
                  <p>
                    Periksa DT, retase dan assignment AM pada tabel OreVision,
                    lalu klik Verifikasi & kirim ke rekonsiliasi. Tidak perlu
                    mengisi ulang tabel mapping.
                  </p>
                  {user?.role === "CRUSHER_OPERATOR" && (
                    <p>
                      Operator dapat menyiapkan draft; pengiriman final
                      dilakukan QC / supervisor.
                    </p>
                  )}
                  {issues.length > 0 && (
                    <ul>
                      {issues.map((issue, i) => (
                        <li key={`${issue.code}-${i}`}>
                          <button
                            className={`photo-issue photo-issue-${issue.severity.toLowerCase()}`}
                            onClick={() => focus(issue.path)}
                          >
                            {issue.severity} · {issue.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.status === "CONFIRMED" && (
                    <div className="inline-actions">
                      <a
                        className="btn primary"
                        href={`/reconciliation?material=LS&operationDate=${draft.reportDate}&shiftCode=${draft.shiftCode}&crusherId=${item.crusherId}`}
                      >
                        Buka rekonsiliasi retase
                      </a>
                      <a
                        className="btn"
                        href={`/qc-workbench?material=LS&operationDate=${draft.reportDate}&shiftCode=${draft.shiftCode}`}
                      >
                        Mixing Workbench
                      </a>
                      <small>
                        Retase sudah dikirim. Hubungkan ke sampel lab pada
                        rekonsiliasi sebelum dipakai mixing.
                      </small>
                    </div>
                  )}
                </section>
              )}
              {draft && <ReviewSummary draft={draft} onDetails={openDetails} />}
              <details
                className="orevision-review-details"
                ref={detailsRef}
                open={detailsOpen}
              >
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    setDetailsOpen((value) => !value);
                  }}
                >
                  Metadata laporan, produksi & catatan{" "}
                  <span>Tidak ada review DT / retase kedua</span>
                </summary>
                {detailsOpen && (
                  <div className="photo-fields">
                    {draft ? (
                      <>
                        <div className="card form-grid">
                          {(["day", "crusherCode"] as const).map((key) => (
                            <label key={key}>
                              <span>
                                {key === "day" ? "Hari" : "Crusher tertulis"}
                              </span>
                              <input
                                value={draft.header[key] ?? ""}
                                disabled={disabled}
                                onFocus={() => focus(`header.${key}`)}
                                onChange={(e) =>
                                  edit(`header.${key}`, e.target.value || null)
                                }
                              />
                            </label>
                          ))}
                          <label>
                            <span>Total retase laporan (opsional)</span>
                            <input
                              type="number"
                              min="0"
                              value={draft.reportRetaseTotal ?? ""}
                              disabled={disabled}
                              onChange={(e) =>
                                edit(
                                  "reportRetaseTotal",
                                  numeric(e.target.value),
                                )
                              }
                            />
                          </label>
                        </div>
                        <DocumentDetails
                          draft={draft}
                          edit={edit}
                          disabled={disabled}
                        />
                        <div className="card">
                          <h3>Produksi dan kondisi pile</h3>
                          <p>
                            Metadata laporan; tidak dibagi otomatis menjadi
                            tonase terukur per vendor.
                          </p>
                          <div className="form-grid">
                            {(["production", "pile"] as const).flatMap(
                              (group) =>
                                Object.entries(draft[group]).map(
                                  ([key, value]) => (
                                    <label key={`${group}.${key}`}>
                                      <span>
                                        {
                                          (group === "production"
                                            ? productionLabels
                                            : pileLabels)[key]
                                        }
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={value ?? ""}
                                        disabled={disabled}
                                        onFocus={() => focus(`${group}.${key}`)}
                                        onChange={(e) =>
                                          edit(
                                            `${group}.${key}`,
                                            numeric(e.target.value),
                                          )
                                        }
                                      />
                                    </label>
                                  ),
                                ),
                            )}
                          </div>
                          <label>
                            <span>Catatan / keterangan asli</span>
                            <textarea
                              rows={5}
                              value={draft.notes.raw ?? ""}
                              disabled={disabled}
                              onFocus={() => focus("notes.raw")}
                              onChange={(e) =>
                                edit("notes.raw", e.target.value || null)
                              }
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <div className="card">
                        <p>
                          Draft akan tampil setelah parser selesai. Foto asli
                          tetap tersedia untuk diperiksa.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </details>
            </section>
          )}
        </>
      )}
    </div>
  );
}
