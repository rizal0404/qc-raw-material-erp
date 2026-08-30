import {
  useEffect,
  useMemo,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type {
  Chemistry,
  MaterialKind,
  SaveMixRequest,
  WorkbenchRetaseSuggestion,
  ClayRetaseUse,
} from "@qc/contracts";
import { Modal } from "../../components/modal";
import {
  chemistryHistory,
  getClayWorkbenchSources,
  getMix,
  getWorkbenchSamples,
  listMixes,
  qualityOf,
  replaceMix,
  reviseChemistry,
  saveMix,
  type MixView,
  type WorkbenchSample,
} from "../../features/qc/qc-api";
import {
  ClayRetasePicker,
  claySourceLabel,
} from "../../features/qc/clay-retase-picker";
import { getWorkbenchRetaseSuggestions } from "../../features/reconciliation/reconciliation-api";
import {
  useMaterial,
  useMaterialLookups,
} from "../../features/navigation/material-context";
import { useDraftGuard } from "../../features/navigation/use-draft-guard";
import { materialNames } from "../../features/navigation/workflow";
import { validateReportHandoff } from "../../features/navigation/report-handoff";
import { businessDateToday } from "../../lib/business-date";

export const Route = createFileRoute("/_authenticated/qc-workbench")({
  validateSearch: validateReportHandoff,
  component: QcWorkbenchPage,
});
const today = businessDateToday;
const fmt = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("id-ID", { maximumFractionDigits: d });
const keys = [
  "sio2",
  "al2o3",
  "fe2o3",
  "cao",
  "mgo",
  "k2o",
  "na2o",
  "so3",
  "h2o",
] as (keyof Chemistry)[];
interface GridRow extends WorkbenchSample {
  retase: number;
  tonPerRetase: number;
  rowNote: string;
  workingChemistry: Chemistry;
  oxideNote: string;
  mixItemId: string | undefined;
  hasAudit: boolean;
  mappedRetase: number;
  mappedAllocationIds: string[];
  retaseAllocationIds: string[];
  clayRetaseSources: ClayRetaseUse[];
}
function mixToken(v: string) {
  return v
    .trim()
    .replace(/\s+/g, "")
    .replace(/[./]/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .toUpperCase();
}
function preview(
  kind: MaterialKind,
  date: string,
  pileCode: string,
  shift: string,
  batch: string,
  tiang: string,
  cycle: number,
) {
  if (!date || !pileCode || !shift || !cycle) return "";
  const base = `${kind}-${date.replaceAll("-", "")}-${mixToken(pileCode)}-${mixToken(shift)}`;
  return kind === "LS" && Number(batch) > 0
    ? `${base}-B${String(Number(batch)).padStart(2, "0")}-C${String(cycle).padStart(2, "0")}`
    : kind === "CL" && tiang
      ? `${base}-T${mixToken(tiang)}-C${String(cycle).padStart(2, "0")}`
      : "";
}
function metrics(rows: GridRow[]) {
  const selected = rows.filter((r) => r.retase > 0 && r.tonPerRetase > 0);
  const total = selected.reduce((s, r) => s + r.retase * r.tonPerRetase, 0);
  const chem = Object.fromEntries(
    keys.map((k) => {
      let w = 0,
        has = false;
      for (const r of selected) {
        const v = r.workingChemistry[k];
        if (v !== null) {
          w += r.retase * r.tonPerRetase * v;
          has = true;
        }
      }
      return [k, total && has ? w / total : null];
    }),
  ) as Chemistry;
  return {
    count: selected.length,
    retase: selected.reduce((s, r) => s + r.retase, 0),
    ton: total,
    chem,
    quality: qualityOf(chem),
  };
}

function QcWorkbenchPage() {
  const handoff = Route.useSearch();
  const client = useQueryClient();
  const kind = useMaterial();
  const [date, setDate] = useState(handoff.operationDate ?? today());
  const [pileId, setPileId] = useState("");
  const [shift, setShift] = useState<string>(handoff.shiftCode ?? "SHIFT_1");
  const [batch, setBatch] = useState("1");
  const [tiang, setTiang] = useState("");
  const [cycle, setCycle] = useState(1);
  const [defaultTon, setDefaultTon] = useState(25);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [editMix, setEditMix] = useState<string>("");
  const [recall, setRecall] = useState("");
  const [message, setMessage] = useState("Ready");
  const [draftDirty, setDraftDirty] = useState(false);
  const [oxideIndex, setOxideIndex] = useState<number | null>(null);
  const [oxideDraft, setOxideDraft] = useState<Chemistry | null>(null);
  const [oxideReason, setOxideReason] = useState("");
  const [ownedClay, setOwnedClay] = useState<ClayRetaseUse[]>([]);
  const clayQuery = useQuery({
    queryKey: ["clay-workbench-retase", date, shift],
    queryFn: () => getClayWorkbenchSources(date, shift),
    enabled: kind === "CL" && !!date,
    refetchInterval: 30_000,
  });
  const claySources = clayQuery.data?.items ?? [];
  const lookups = useMaterialLookups();
  const piles = (lookups.data?.piles ?? []).filter(
    (p) => p.materialKind === kind,
  );
  const pile = piles.find((p) => p.id === pileId);
  const activeMixItemId =
    oxideIndex === null ? undefined : rows[oxideIndex]?.mixItemId;
  const history = useQuery({
    queryKey: ["chemistry-history", activeMixItemId],
    queryFn: () => chemistryHistory(activeMixItemId!),
    enabled: !!activeMixItemId,
  });
  const sampleQuery = useQuery({
    queryKey: ["workbench-samples", kind, date],
    queryFn: () => getWorkbenchSamples(kind, date),
    enabled: kind === "CL",
  });
  const mixList = useQuery({
    queryKey: ["mixes", kind, date],
    queryFn: () =>
      listMixes({
        materialKind: kind,
        operationDate: date,
        status: "ACTIVE",
        limit: 500,
        offset: 0,
      }),
  });
  const m = useMemo(() => metrics(rows), [rows]);
  const mixPreview = preview(
    kind,
    date,
    pile?.code ?? "",
    shift,
    batch,
    tiang,
    cycle,
  );
  const buildRows = (
    items: WorkbenchSample[],
    mix?: MixView,
    suggestions: WorkbenchRetaseSuggestion[] = [],
  ): GridRow[] =>
    items.map((s) => {
      const old = mix?.items.find((x) => x.rawSampleId === s.id);
      const suggestion = suggestions.find((x) => x.sampleId === s.id);
      const mapped = old?.mappedRetaseConsumed ?? suggestion?.mappedRetase ?? 0;
      const mappedIds =
        old?.retaseAllocationIds ?? suggestion?.allocationIds ?? [];
      return {
        ...s,
        retase: old?.retase ?? 0,
        tonPerRetase: old?.tonPerRetase ?? s.defaultTonPerRetase,
        rowNote: old?.note ?? "",
        workingChemistry: old?.chemistry ?? s.chemistry,
        oxideNote: "",
        mixItemId: old?.id,
        hasAudit: old?.hasChemistryRevision ?? false,
        mappedRetase: mapped,
        mappedAllocationIds: mappedIds,
        retaseAllocationIds:
          kind === "LS" ? (old?.retaseAllocationIds ?? []) : [],
        clayRetaseSources: old?.clayRetaseSources ?? [],
      };
    });
  useEffect(() => {
    if (kind === "CL" && sampleQuery.data && !rows.length)
      setRows(buildRows(sampleQuery.data.items));
  }, [kind, sampleQuery.data]);
  async function loadSamples() {
    const [result, suggestions] = await Promise.all([
      sampleQuery.refetch(),
      kind === "LS"
        ? getWorkbenchRetaseSuggestions(kind, date)
        : Promise.resolve({ items: [] }),
    ]);
    if (result.data) {
      setRows(buildRows(result.data.items, undefined, suggestions.items));
      setOwnedClay([]);
      if (kind === "CL") await clayQuery.refetch();
      setEditMix("");
      setRecall("");
      setDefaultTon(result.data.items[0]?.defaultTonPerRetase ?? 25);
      setDraftDirty(false);
      setMessage(
        kind === "CL"
          ? `${result.data.items.length} sampel lab dimuat · pilih kolom laporan crusher pada sampel yang sesuai.`
          : `${result.data.items.length} sample loaded · ${suggestions.items.length} mapped-retase suggestion`,
      );
    }
  }
  async function recallMix() {
    if (!recall) return;
    const mixR = await getMix(recall);
    const mix = mixR.item;
    const [sampleR, suggestions] = await Promise.all([
      getWorkbenchSamples(mix.materialKind, mix.operationDate),
      mix.materialKind === "LS"
        ? getWorkbenchRetaseSuggestions(mix.materialKind, mix.operationDate)
        : Promise.resolve({ items: [] }),
    ]);
    if (mix.materialKind !== kind)
      throw new Error("Mix berasal dari workspace material berbeda.");
    setDate(mix.operationDate);
    setPileId(mix.pileId);
    setShift(mix.shiftCode);
    setBatch(mix.batchNo ? String(mix.batchNo) : "");
    setTiang(mix.tiangKe ?? "");
    setCycle(mix.pileCycle);
    setDefaultTon(mix.defaultTonPerRetase);
    setRows(buildRows(sampleR.items, mix, suggestions.items));
    setOwnedClay(mix.items.flatMap((x) => x.clayRetaseSources ?? []));
    setEditMix(mix.mixCode);
    setDraftDirty(false);
    setMessage(`Recall ${mix.mixCode}`);
  }
  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const r of rows.filter((x) => kind === "LS" && x.retase > 0)) {
        if (r.mappedRetase > 0 && !r.retaseAllocationIds.length)
          throw new Error(
            `Sample ${r.sampleId} memiliki mapped retase ${r.mappedRetase}. Apply mapped retase atau perbaiki mapping di Reconciliation sebelum Save.`,
          );
        if (
          r.retaseAllocationIds.length &&
          r.retase !== r.mappedRetase &&
          r.rowNote.trim().length < 3
        )
          throw new Error(
            `Note wajib untuk override Retase sample ${r.sampleId}: mapped ${r.mappedRetase} → final ${r.retase}.`,
          );
      }
      const items = rows
        .filter((r) => r.retase > 0)
        .map((r) => ({
          rawSampleId: r.id,
          retase: r.retase,
          tonPerRetase: r.tonPerRetase,
          note: r.rowNote || null,
          chemistry: r.workingChemistry,
          oxideChangeNote: r.oxideNote || null,
          retaseAllocationIds: r.retaseAllocationIds,
          clayRetaseSources: r.clayRetaseSources.filter((x) => x.retase > 0),
          retaseOverrideReason:
            r.retaseAllocationIds.length && r.retase !== r.mappedRetase
              ? r.rowNote || null
              : null,
        }));
      const body: SaveMixRequest = {
        materialKind: kind,
        operationDate: date,
        pileId,
        shiftCode: shift as "SHIFT_1" | "SHIFT_2" | "SHIFT_3",
        batchNo: kind === "LS" ? Number(batch) : null,
        tiangKe: kind === "CL" ? tiang : null,
        pileCycle: cycle,
        defaultTonPerRetase: defaultTon,
        note: null,
        items,
      };
      if (editMix)
        return replaceMix(editMix, {
          ...body,
          reason: "Workbench controlled replace",
        });
      return saveMix(body);
    },
    onSuccess: async (r) => {
      setRows(buildRows(rows, r.item));
      setOwnedClay(r.item.items.flatMap((x) => x.clayRetaseSources ?? []));
      setEditMix(r.item.mixCode);
      setRecall(r.item.mixCode);
      setDraftDirty(false);
      setMessage(`Saved ${r.item.mixCode}`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["workspace-stats", kind] }),
        client.invalidateQueries({ queryKey: ["mixes"] }),
        client.invalidateQueries({ queryKey: ["reconciliation"] }),
        client.invalidateQueries({ queryKey: ["retase-suggestions"] }),
        client.invalidateQueries({ queryKey: ["clay-workbench-retase"] }),
      ]);
    },
    onError: (e) => setMessage(e.message),
  });
  const reviseMutation = useMutation({
    mutationFn: async () => {
      const row = oxideIndex === null ? null : rows[oxideIndex];
      if (!row?.mixItemId || !oxideDraft)
        throw new Error("Mix item tidak tersedia.");
      return reviseChemistry(row.mixItemId, oxideDraft, oxideReason);
    },
    onSuccess: async (r) => {
      const mix = r.item;
      const sampleR = await getWorkbenchSamples(
        mix.materialKind,
        mix.operationDate,
      );
      setRows(buildRows(sampleR.items, mix));
      setOxideIndex(null);
      setMessage("Chemistry revision tersimpan dan audit trail dibuat.");
    },
  });
  function updateClayRow(i: number, sources: ClayRetaseUse[]) {
    setDraftDirty(true);
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              clayRetaseSources: sources,
              retase: sources.reduce((sum, x) => sum + x.retase, 0),
            }
          : r,
      ),
    );
  }
  function updateRow(
    i: number,
    field: "retase" | "tonPerRetase" | "rowNote",
    value: string,
  ) {
    setDraftDirty(true);
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              [field]:
                field === "rowNote" ? value : Math.max(0, Number(value) || 0),
            }
          : r,
      ),
    );
  }
  function gridKey(
    e: KeyboardEvent<HTMLInputElement>,
    i: number,
    field: "retase" | "tonPerRetase",
  ) {
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
    e.preventDefault();
    const next = Math.max(
      0,
      Math.min(rows.length - 1, i + (e.key === "ArrowUp" ? -1 : 1)),
    );
    (
      document.querySelector(
        `input[data-grid="${field}-${next}"]`,
      ) as HTMLInputElement | null
    )?.focus();
  }
  function gridPaste(
    e: ClipboardEvent<HTMLInputElement>,
    i: number,
    field: "retase" | "tonPerRetase",
  ) {
    if (kind === "CL" && field === "retase") return;
    const txt = e.clipboardData.getData("text");
    if (!txt.includes("\n") && !txt.includes("\t")) return;
    e.preventDefault();
    setDraftDirty(true);
    const data = txt
      .replace(/\r/g, "")
      .trimEnd()
      .split("\n")
      .map((x) => x.split("\t"));
    setRows((prev) => {
      const out = [...prev];
      data.forEach((cols, ri) => {
        const idx = i + ri;
        if (!out[idx]) return;
        const a = Number((cols[0] ?? "").replace(",", "."));
        if (Number.isFinite(a))
          out[idx] = { ...out[idx]!, [field]: Math.max(0, a) };
        if (field === "retase" && cols[1] !== undefined) {
          const b = Number(cols[1].replace(",", "."));
          if (Number.isFinite(b))
            out[idx] = { ...out[idx]!, tonPerRetase: Math.max(0, b) };
        }
      });
      return out;
    });
  }
  function applyMapped(i: number) {
    setDraftDirty(true);
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              retase: r.mappedRetase,
              retaseAllocationIds: [...r.mappedAllocationIds],
            }
          : r,
      ),
    );
    setMessage(`Mapped Retase diterapkan ke ${rows[i]?.sampleId ?? "sample"}.`);
  }
  function openOxide(i: number) {
    setOxideIndex(i);
    setOxideDraft({ ...rows[i]!.workingChemistry });
    setOxideReason(rows[i]!.oxideNote);
  }
  function applyOxideLocal() {
    if (oxideIndex === null || !oxideDraft) return;
    if (!oxideReason.trim()) {
      setMessage("Note perubahan oksida wajib.");
      return;
    }
    setDraftDirty(true);
    setRows((prev) =>
      prev.map((r, i) =>
        i === oxideIndex
          ? { ...r, workingChemistry: oxideDraft, oxideNote: oxideReason }
          : r,
      ),
    );
    setOxideIndex(null);
  }
  useDraftGuard(
    draftDirty || saveMutation.isPending || reviseMutation.isPending,
  );
  return (
    <section
      className="page-stack qc-workbench"
      onChangeCapture={() => {
        if (rows.some((row) => row.retase > 0)) setDraftDirty(true);
      }}
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">{materialNames[kind]} / MIXING</p>
          <h1>Mixing Workbench</h1>
          <p>
            Susun komposisi {materialNames[kind]}, tinjau retase dan mutu, lalu
            simpan hasil mixing.
          </p>
        </div>
        <span className={`status-badge ${editMix ? "muted" : "success"}`}>
          {editMix ? "EDIT / REPLACE" : "NEW MIX"}
        </span>
      </div>
      <div className="card qc-header-grid">
        <label>
          <span>Material</span>
          <input
            aria-label="Material workspace"
            value={materialNames[kind]}
            readOnly
          />
        </label>
        <label>
          <span>Tanggal</span>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setRows([]);
              setOwnedClay([]);
              setEditMix("");
              setRecall("");
            }}
          />
        </label>
        <label>
          <span>Pile</span>
          <select value={pileId} onChange={(e) => setPileId(e.target.value)}>
            <option value="">— pilih pile —</option>
            {piles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Plant</span>
          <input
            value={
              pile?.plantId
                ? (lookups.data?.plants.find((p) => p.id === pile.plantId)
                    ?.label ?? "")
                : ""
            }
            readOnly
          />
        </label>
        <label>
          <span>Class</span>
          <input value={pile?.className ?? ""} readOnly />
        </label>
        <label>
          <span>Shift</span>
          <select
            value={shift}
            onChange={(e) => {
              setShift(e.target.value);
              if (kind === "CL") {
                setRows((prev) =>
                  prev.map((r) => ({
                    ...r,
                    retase: 0,
                    clayRetaseSources: [],
                    mixItemId: undefined,
                    hasAudit: false,
                    workingChemistry: r.chemistry,
                    oxideNote: "",
                  })),
                );
                setOwnedClay([]);
                setEditMix("");
                setRecall("");
              }
            }}
          >
            {(lookups.data?.shifts ?? []).map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{kind === "LS" ? "Batch_No" : "Tiang_ke"}</span>
          <input
            value={kind === "LS" ? batch : tiang}
            onChange={(e) =>
              kind === "LS"
                ? setBatch(e.target.value)
                : setTiang(e.target.value)
            }
          />
        </label>
        <label>
          <span>Pile Cycle</span>
          <input
            type="number"
            min="1"
            value={cycle}
            onChange={(e) => setCycle(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label>
          <span>Default Ton/Ret</span>
          <input
            type="number"
            value={defaultTon}
            onChange={(e) => setDefaultTon(Number(e.target.value) || 25)}
          />
        </label>
        <label className="span-2">
          <span>Mix ID Preview</span>
          <input className="mono-input" value={mixPreview} readOnly />
        </label>
      </div>
      <div className="card action-row">
        <button
          className="btn primary"
          onClick={() =>
            void loadSamples().catch((error) => setMessage(error.message))
          }
          disabled={!date || sampleQuery.isFetching}
        >
          {sampleQuery.isFetching ? "Loading..." : "Load Samples"}
        </button>
        <button
          className="btn"
          onClick={() => {
            setRows((r) =>
              r.map((x) => ({
                ...x,
                retase: 0,
                mixItemId: undefined,
                hasAudit: false,
                rowNote: "",
                workingChemistry: x.chemistry,
                oxideNote: "",
                retaseAllocationIds: [],
                clayRetaseSources: [],
              })),
            );
            setOwnedClay([]);
            setDraftDirty(false);
            setEditMix("");
            setRecall("");
            setMessage("New Mix");
          }}
        >
          New
        </button>
        <select value={recall} onChange={(e) => setRecall(e.target.value)}>
          <option value="">— Recall Mix_ID —</option>
          {(mixList.data?.items ?? []).map((x) => (
            <option key={x.id} value={x.mixCode}>
              {x.mixCode}
            </option>
          ))}
        </select>
        <button
          className="btn"
          disabled={!recall}
          onClick={() =>
            void recallMix().catch((error) => setMessage(error.message))
          }
        >
          Recall
        </button>
        <span className="action-status">{message}</span>
      </div>
      {kind === "CL" && (
        <div className="card table-card">
          <div className="page-heading">
            <div>
              <h2>Retase laporan crusher</h2>
              <p>
                Langsung dari counter / laporan tersimpan, termasuk draft. Pilih
                sumber pada baris sampel lab di bawah; tidak perlu rekonsiliasi.
              </p>
            </div>
          </div>
          {clayQuery.isError ? (
            <p role="alert">{clayQuery.error.message}</p>
          ) : clayQuery.isPending ? (
            <p>Memuat retase crusher…</p>
          ) : (
            <div className="table-shell">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Sumber / kolom kertas</th>
                    <th>Crusher</th>
                    <th>Status laporan / kolom</th>
                    <th>Total retase</th>
                    <th>Terpakai mixing</th>
                    <th>Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {claySources.map((source) => (
                    <tr key={source.columnId}>
                      <td>
                        <strong>{claySourceLabel(source)}</strong>
                        <small className="table-sub">
                          {source.vendorName ?? ""} {source.sourceName ?? ""}
                        </small>
                      </td>
                      <td>{source.crusherName}</td>
                      <td>
                        {source.reportStatus} / {source.columnStatus}
                      </td>
                      <td>{source.totalRetase}</td>
                      <td>{source.consumedRetase}</td>
                      <td>{source.availableRetase}</td>
                    </tr>
                  ))}
                  {!claySources.length && (
                    <tr>
                      <td colSpan={6} className="table-empty">
                        Belum ada kolom laporan crusher pada tanggal dan shift
                        ini. Simpan laporan Clay terlebih dahulu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p>
            Retase belum disimpan pada form crusher belum masuk di sini. Kolom
            PROVISIONAL perlu dikonfirmasi QC pada laporan. Nama manual tetap
            tersedia untuk dipilih.
          </p>
          {sampleQuery.isError && (
            <p role="alert">{sampleQuery.error.message}</p>
          )}
        </div>
      )}
      <div className="card table-card">
        <div className="table-shell">
          <table className="native-table workbench-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Sample ID</th>
                <th>Vendor</th>
                <th>Source</th>
                <th>CaO</th>
                <th>LSF</th>
                <th>SM</th>
                <th>AM</th>
                <th>NaEq</th>
                <th>
                  {kind === "CL"
                    ? "Retase crusher → sampel lab"
                    : "Mapped Retase"}
                </th>
                <th>Source</th>
                <th>{kind === "CL" ? "Kolom" : "Apply"}</th>
                <th>Retase</th>
                <th>Ton/Ret</th>
                <th>Tonase</th>
                <th>Note</th>
                <th>Oxide</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r, i) => {
                  const q = qualityOf(r.workingChemistry);
                  return (
                    <tr
                      key={r.id}
                      className={r.retase > 0 ? "row-selected" : ""}
                    >
                      <td>{i + 1}</td>
                      <td>
                        <strong>{r.sampleId}</strong>
                        {r.hasAudit && (
                          <span
                            className="audit-dot"
                            title="Ada chemistry revision"
                          />
                        )}
                      </td>
                      <td>{r.vendorSnapshot ?? "—"}</td>
                      <td>{r.sourceSnapshot ?? "—"}</td>
                      <td>{fmt(r.workingChemistry.cao)}</td>
                      <td>{fmt(q.lsf)}</td>
                      <td>{fmt(q.sm)}</td>
                      <td>{fmt(q.am)}</td>
                      <td>{fmt(q.naeq)}</td>
                      <td>
                        {kind === "CL" ? (
                          <ClayRetasePicker
                            sampleId={r.sampleId}
                            sources={claySources}
                            value={r.clayRetaseSources}
                            owned={ownedClay}
                            draft={rows.flatMap((x) => x.clayRetaseSources)}
                            onChange={(value) => updateClayRow(i, value)}
                            disabled={saveMutation.isPending}
                          />
                        ) : (
                          <strong>{r.mappedRetase || "—"}</strong>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${r.retaseAllocationIds.length ? "success" : "muted"}`}
                        >
                          {kind === "CL"
                            ? "CRUSHER"
                            : r.retaseAllocationIds.length
                              ? "MAPPED"
                              : "MANUAL"}
                        </span>
                      </td>
                      <td>
                        {kind === "CL" ? (
                          r.clayRetaseSources.length
                        ) : r.mappedRetase > 0 ? (
                          <div className="inline-actions">
                            <button
                              className="btn small"
                              disabled={r.retaseAllocationIds.length > 0}
                              onClick={() => applyMapped(i)}
                            >
                              {r.retaseAllocationIds.length
                                ? "Applied"
                                : "Apply"}
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <input
                          className="grid-number"
                          data-grid={`retase-${i}`}
                          readOnly={kind === "CL"}
                          aria-label={`Total retase ${r.sampleId}`}
                          type="number"
                          min="0"
                          value={r.retase || ""}
                          onChange={(e) =>
                            updateRow(i, "retase", e.target.value)
                          }
                          onKeyDown={(e) => gridKey(e, i, "retase")}
                          onPaste={(e) => gridPaste(e, i, "retase")}
                        />
                      </td>
                      <td>
                        <input
                          className="grid-number"
                          data-grid={`tonPerRetase-${i}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.tonPerRetase}
                          onChange={(e) =>
                            updateRow(i, "tonPerRetase", e.target.value)
                          }
                          onKeyDown={(e) => gridKey(e, i, "tonPerRetase")}
                          onPaste={(e) => gridPaste(e, i, "tonPerRetase")}
                        />
                      </td>
                      <td>{fmt(r.retase * r.tonPerRetase)}</td>
                      <td>
                        <input
                          className="grid-note"
                          value={r.rowNote}
                          onChange={(e) =>
                            updateRow(i, "rowNote", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="btn small"
                          onClick={() => openOxide(i)}
                        >
                          View/Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={17} className="table-empty">
                    Pilih tanggal lalu Load Samples.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="qc-kpis">
        <article className="card">
          <span className="card-label">SELECTED SAMPLE</span>
          <strong>{m.count}</strong>
        </article>
        <article className="card">
          <span className="card-label">TOTAL RETASE</span>
          <strong>{m.retase}</strong>
        </article>
        <article className="card">
          <span className="card-label">TOTAL TONASE</span>
          <strong>{fmt(m.ton)} t</strong>
        </article>
        <article className="card">
          <span className="card-label">MIX LSF</span>
          <strong>{fmt(m.quality.lsf)}</strong>
        </article>
        <article className="card">
          <span className="card-label">MIX SM</span>
          <strong>{fmt(m.quality.sm)}</strong>
        </article>
        <article className="card">
          <span className="card-label">MIX AM</span>
          <strong>{fmt(m.quality.am)}</strong>
        </article>
        <article className="card">
          <span className="card-label">MIX R2O3</span>
          <strong>{fmt(m.quality.r2o3)}</strong>
        </article>
        <article className="card save-panel">
          <button
            className="btn primary full"
            disabled={
              saveMutation.isPending ||
              !pileId ||
              !rows.some((r) => r.retase > 0) ||
              !mixPreview
            }
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending
              ? "Saving..."
              : editMix
                ? "Replace Mix"
                : "Save Mix"}
          </button>
        </article>
      </div>
      {oxideIndex !== null && oxideDraft && (
        <Modal
          title="Chemistry Snapshot"
          {...(rows[oxideIndex]?.sampleId
            ? { subtitle: rows[oxideIndex]!.sampleId }
            : {})}
          onClose={() => setOxideIndex(null)}
          footer={
            <>
              <button className="btn" onClick={() => setOxideIndex(null)}>
                Tutup
              </button>
              <button className="btn" onClick={applyOxideLocal}>
                Apply ke Form
              </button>
              {rows[oxideIndex]?.mixItemId && (
                <button
                  className="btn primary"
                  disabled={!oxideReason.trim() || reviseMutation.isPending}
                  onClick={() => reviseMutation.mutate()}
                >
                  Simpan Revision
                </button>
              )}
            </>
          }
        >
          <div className="oxide-mini-grid">
            {keys.map((k) => (
              <label key={k}>
                <span>{k.toUpperCase()}</span>
                <input
                  type="number"
                  step="0.0001"
                  value={oxideDraft[k] ?? ""}
                  onChange={(e) =>
                    setOxideDraft((c) =>
                      c
                        ? {
                            ...c,
                            [k]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }
                        : c,
                    )
                  }
                />
                <small>Raw: {fmt(rows[oxideIndex]!.chemistry[k], 4)}</small>
              </label>
            ))}
          </div>
          <label className="reason-field">
            <span>Note / Alasan Perubahan</span>
            <textarea
              rows={3}
              value={oxideReason}
              onChange={(e) => setOxideReason(e.target.value)}
              placeholder="Wajib jika chemistry berubah."
            />
          </label>
          {activeMixItemId && (
            <div className="revision-history">
              <span className="field-label">Revision History</span>
              {history.data?.items.length ? (
                history.data.items.map((h) => (
                  <div key={h.revisionNo} className="revision-row">
                    <strong>Rev {h.revisionNo}</strong>
                    <span>{h.reason}</span>
                    <small>
                      {h.changedByName} ·{" "}
                      {new Date(h.changedAt).toLocaleString("id-ID")}
                    </small>
                  </div>
                ))
              ) : (
                <small>Belum ada revision tersimpan.</small>
              )}
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
