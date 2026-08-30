import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useBlocker } from "@tanstack/react-router";
import type { CounterAssignment, RetaseEvent, ShiftCode } from "@qc/contracts";
import { authQueryOptions } from "../../features/auth/auth-query";
import { useMaterialLookups } from "../../features/navigation/material-context";
import {
  getCounterAssignments,
  getCounterContext,
  getRetaseSummary,
  listRetaseEvents,
  recordRetase,
  reverseRetase,
} from "../../features/retase/retase-api";
import { Modal } from "../../components/modal";
import { PhotoReportImport } from "../../features/retase/photo-report-import";
import "../../features/retase/retase-counter.css";

export const Route = createFileRoute("/_authenticated/retase-counter")({
  beforeLoad: ({ search }) => {
    if (search.material === "CL")
      throw redirect({ to: "/clay-report", search: { material: "CL" } });
  },
  component: RetaseCounterPage,
});

function fmtTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function tallyMarksFor(
  assignmentAaId: string,
  fallbackCount: number,
  items: RetaseEvent[],
) {
  const buckets = new Map<string, number>();
  for (const event of items) {
    if (
      event.entrySource !== "LIVE_COUNTER" ||
      event.assignmentAaId !== assignmentAaId ||
      event.status === "REVERSED"
    ) {
      continue;
    }
    const hour = new Date(event.eventTs).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      hour12: false,
    });
    buckets.set(hour, Math.max(0, (buckets.get(hour) ?? 0) + event.delta));
  }

  const marks = Array.from(buckets.entries())
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, count]) => "│".repeat(Math.min(count, 40)))
    .join("  ");

  return marks || (fallbackCount > 0 ? "│".repeat(Math.min(fallbackCount, 40)) : "—");
}
function contextKey(
  crusherId: string,
  operationDate: string,
  shiftCode: ShiftCode,
) {
  return { crusherId, operationDate, shiftCode };
}

type CounterOperatorRow = {
  aa: CounterAssignment["aa"][number];
  activeNow: boolean;
};

type CounterVendorGroup = {
  vendorId: string;
  vendorName: string;
  rows: CounterOperatorRow[];
};

function RetaseCounterPage() {
  const auth = useQuery(authQueryOptions);
  const [tab, setTab] = useState<"counter" | "photo">("counter");
  const [photoDirty, setPhotoDirty] = useState(false);
  useBlocker({
    shouldBlockFn: () =>
      photoDirty &&
      !window.confirm("Tinggalkan koreksi laporan foto yang belum disimpan?"),
    enableBeforeUnload: photoDirty,
  });
  const isQc = auth.data?.user?.role === "QC_ANALYST";
  if (!auth.data?.user) return null;
  if (
    !["QC_ANALYST", "CRUSHER_OPERATOR", "SUPERVISOR_ADMIN"].includes(
      auth.data.user.role,
    )
  )
    return <p>Akses terbatas untuk QC dan operasi crusher.</p>;
  return (
    <section className="page-stack">
      <div
        className="retase-view-tabs"
        role="tablist"
        aria-label="Mode retase Limestone"
      >
        {!isQc && (
          <button
            role="tab"
            aria-selected={tab === "counter"}
            className={`btn ${tab === "counter" ? "primary" : ""}`}
            onClick={() => setTab("counter")}
          >
            Counter langsung
          </button>
        )}
        <button
          role="tab"
          aria-selected={isQc || tab === "photo"}
          className={`btn ${isQc || tab === "photo" ? "primary" : ""}`}
          onClick={() => setTab("photo")}
        >
          Laporan foto / gambar
        </button>
      </div>
      <div role="tabpanel" hidden={!isQc && tab !== "photo"}>
        <PhotoReportImport
          onDirty={setPhotoDirty}
          active={isQc || tab === "photo"}
        />
      </div>
      {!isQc && (
        <div role="tabpanel" hidden={tab !== "counter"}>
          <LiveRetaseCounterPage active={tab === "counter"} />
        </div>
      )}
    </section>
  );
}

function LiveRetaseCounterPage({ active }: { active: boolean }) {
  const qc = useQueryClient();
  const auth = useQuery(authQueryOptions);
  const user = auth.data?.user;
  const lookups = useMaterialLookups();
  const allowedCrushers = useMemo(() => {
    const all = (lookups.data?.crushers ?? []).filter((x) => x.active);
    if (user?.role === "CRUSHER_OPERATOR")
      return all.filter((x) => user.crusherIds.includes(x.id));
    return all;
  }, [lookups.data?.crushers, user?.role, user?.crusherIds]);
  const [crusherId, setCrusherId] = useState("");
  const [operationDate, setOperationDate] = useState("");
  const [shiftCode, setShiftCode] = useState<ShiftCode>("SHIFT_1");
  const [pending, setPending] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState<
    Record<string, { message: string; requestId: string }>
  >({});
  const [message, setMessage] = useState("Ready");
  const [unlistedOpen, setUnlistedOpen] = useState(false);
  const [unlistedUnit, setUnlistedUnit] = useState("");
  const [unlistedVendor, setUnlistedVendor] = useState("");
  const [unlistedReason, setUnlistedReason] = useState("");
  const [unlistedRequestId, setUnlistedRequestId] = useState<string | null>(
    null,
  );
  const [reverseTarget, setReverseTarget] = useState<RetaseEvent | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseRequestId, setReverseRequestId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState("");

  useEffect(() => {
    if (!crusherId && allowedCrushers[0]) setCrusherId(allowedCrushers[0].id);
  }, [allowedCrushers, crusherId]);
  useEffect(() => {
    setOperationDate("");
    setMessage("Loading server business context...");
  }, [crusherId]);

  const context = useQuery({
    queryKey: ["counter-context", crusherId, operationDate, shiftCode],
    queryFn: () =>
      getCounterContext({
        crusherId,
        ...(operationDate ? { operationDate, shiftCode } : {}),
      }),
    enabled: active && !!crusherId,
    refetchInterval: 30_000,
  });
  useEffect(() => {
    if (!context.data) return;
    if (!operationDate) {
      setOperationDate(context.data.requested.operationDate);
      setShiftCode(context.data.requested.shiftCode);
    }
    setMessage(
      context.data.canRecord
        ? "LIVE · counter siap mencatat dump"
        : "READ ONLY · pilih business context aktif untuk mencatat dump",
    );
  }, [context.data, operationDate]);

  const counterInput =
    crusherId && operationDate
      ? contextKey(crusherId, operationDate, shiftCode)
      : null;
  const assignments = useQuery({
    queryKey: ["counter-assignments", counterInput],
    queryFn: () => getCounterAssignments(counterInput!),
    enabled: active && !!counterInput,
    refetchInterval: 10_000,
  });
  const summary = useQuery({
    queryKey: ["retase-summary", counterInput],
    queryFn: () => getRetaseSummary(counterInput!),
    enabled: active && !!counterInput,
    refetchInterval: 10_000,
  });
  const events = useQuery({
    queryKey: ["retase-events", counterInput],
    queryFn: () => listRetaseEvents({ ...counterInput!, limit: 250 }),
    enabled: active && !!counterInput,
    refetchInterval: 10_000,
  });

  const vendorGroups = useMemo<CounterVendorGroup[]>(() => {
    const groups = new Map<
      string,
      {
        vendorId: string;
        vendorName: string;
        rows: Map<string, CounterOperatorRow>;
      }
    >();

    for (const assignment of assignments.data?.items ?? []) {
      const group =
        groups.get(assignment.vendorId) ??
        {
          vendorId: assignment.vendorId,
          vendorName: assignment.vendorName,
          rows: new Map<string, CounterOperatorRow>(),
        };

      for (const aa of assignment.aa) {
        const existing = group.rows.get(aa.assignmentAaId);
        if (!existing || assignment.activeNow) {
          group.rows.set(aa.assignmentAaId, {
            aa,
            activeNow: assignment.activeNow,
          });
        }
      }
      groups.set(assignment.vendorId, group);
    }

    return Array.from(groups.values())
      .map((group) => ({
        vendorId: group.vendorId,
        vendorName: group.vendorName,
        rows: Array.from(group.rows.values()),
      }))
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName, "id"));
  }, [assignments.data?.items]);
  const selectedVendor =
    vendorGroups.find((group) => group.vendorId === selectedVendorId) ??
    vendorGroups[0] ??
    null;
  const refresh = async () => {
    if (!counterInput) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["counter-assignments"] }),
      qc.invalidateQueries({ queryKey: ["retase-summary"] }),
      qc.invalidateQueries({ queryKey: ["retase-events"] }),
      qc.invalidateQueries({ queryKey: ["counter-context"] }),
    ]);
  };

  async function tapAa(assignmentAaId: string) {
    if (!counterInput || !context.data?.canRecord) return;
    const key = assignmentAaId;
    setPending((p) => ({ ...p, [key]: (p[key] ?? 0) + 1 }));
    const requestId = failed[key]?.requestId ?? crypto.randomUUID();
    try {
      const r = await recordRetase({
        ...counterInput,
        requestId,
        assignmentAaId,
        clientTs: new Date().toISOString(),
      });
      setFailed((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
      setMessage(
        `${r.idempotent ? "Retry aman" : "Dump tercatat"} · ${r.item.aaUnitNo ?? "AA"} · ${fmtTime(r.item.eventTs)}`,
      );
      await refresh();
    } catch (e) {
      setFailed((p) => ({
        ...p,
        [key]: { message: (e as Error).message, requestId },
      }));
      setMessage((e as Error).message);
    } finally {
      setPending((p) => ({ ...p, [key]: Math.max(0, (p[key] ?? 1) - 1) }));
    }
  }

  async function submitUnlisted() {
    if (!counterInput || !context.data?.canRecord) return;
    try {
      const requestId = unlistedRequestId ?? crypto.randomUUID();
      setUnlistedRequestId(requestId);
      const r = await recordRetase({
        ...counterInput,
        requestId,
        unlistedUnitNo: unlistedUnit.trim(),
        ...(unlistedVendor ? { vendorId: unlistedVendor } : {}),
        reason: unlistedReason.trim(),
        clientTs: new Date().toISOString(),
      });
      setMessage(
        `Unlisted AA tercatat · ${r.item.status} · ${r.item.aaUnitNo ?? unlistedUnit}`,
      );
      setUnlistedOpen(false);
      setUnlistedUnit("");
      setUnlistedVendor("");
      setUnlistedReason("");
      setUnlistedRequestId(null);
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function submitReverse() {
    if (!reverseTarget) return;
    try {
      const requestId = reverseRequestId ?? crypto.randomUUID();
      setReverseRequestId(requestId);
      const r = await reverseRetase(reverseTarget.id, {
        requestId,
        reason: reverseReason.trim(),
      });
      setMessage(
        `Reversal tercatat untuk ${reverseTarget.aaUnitNo ?? reverseTarget.id.slice(0, 8)} · ${fmtTime(r.item.eventTs)}`,
      );
      setReverseTarget(null);
      setReverseReason("");
      setReverseRequestId(null);
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  const s = summary.data?.summary;
  const vendors = lookups.data?.vendors ?? [];
  return (
    <section className="page-stack retase-counter-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LIMESTONE / COUNTER LANGSUNG</p>
          <h1>Counter Limestone</h1>
          <p>Catat seperti form harian: vendor, No DT, jam, lalu tally.</p>
        </div>
        <span
          className={`status-badge ${context.data?.canRecord ? "success" : "warning"}`}
        >
          {context.data?.canRecord ? "LIVE" : "READ ONLY"}
        </span>
      </div>

      <div className="card counter-context-panel">
        <div className="counter-context-heading">
          <div>
            <span className="counter-section-label">KONTEKS KERJA</span>
            <strong>
              {context.data?.crusher.name ?? "Crusher belum dipilih"}
            </strong>
            <small>
              {context.data
                ? context.data.current.localDate +
                  " · " +
                  context.data.current.localTime +
                  " WITA"
                : "Pilih crusher, tanggal, dan shift untuk mulai."}
            </small>
          </div>
          <span
            className={
              "status-badge " +
              (context.data?.canRecord ? "success" : "warning")
            }
          >
            {context.data?.canRecord ? "SIAP INPUT" : "READ ONLY"}
          </span>
        </div>
        <div className="counter-context-grid">
          <label>
            <span>Crusher</span>
            <select
              value={crusherId}
              onChange={(e) => setCrusherId(e.target.value)}
            >
              <option value="">— pilih crusher —</option>
              {allowedCrushers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tanggal kerja</span>
            <input
              type="date"
              value={operationDate}
              onChange={(e) => setOperationDate(e.target.value)}
            />
          </label>
          <label>
            <span>Shift</span>
            <select
              value={shiftCode}
              onChange={(e) => setShiftCode(e.target.value as ShiftCode)}
            >
              {(lookups.data?.shifts ?? []).map((x) => (
                <option key={x.code} value={x.code}>
                  {x.label} · {x.startTime.slice(0, 5)}–{x.endTime.slice(0, 5)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="counter-toolbar card">
        <div>
          <strong>{message}</strong>
          <small>
            Jam server: {context.data?.current.localTime ?? "—"} WITA ·{" "}
            {context.data?.assignmentCount ?? 0} DT terdaftar
          </small>
        </div>
        <div className="inline-actions">
          <button
            className="btn"
            onClick={() => void refresh()}
            disabled={!counterInput}
          >
            Muat ulang
          </button>
          <button
            className="btn primary"
            disabled={!context.data?.canRecord}
            onClick={() => setUnlistedOpen(true)}
          >
            + Tambah DT
          </button>
        </div>
      </div>

      <div className="card counter-paper-board">
        <div className="counter-board-heading">
          <div>
            <span className="counter-section-label">INPUT HARIAN LIMESTONE</span>
            <strong>Vendor · No DT · Jam · Tally</strong>
            <small>Tekan tombol +1 setiap kali dump masuk.</small>
          </div>
          <span className="counter-board-total">
            {vendorGroups.reduce((total, group) => total + group.rows.length, 0)} DT
          </span>
        </div>

        <div className="counter-vendor-tabs" role="tablist" aria-label="Vendor">
          {vendorGroups.map((group) => (
            <button
              key={group.vendorId}
              type="button"
              role="tab"
              aria-selected={group.vendorId === selectedVendor?.vendorId}
              className={
                "counter-vendor-tab" +
                (group.vendorId === selectedVendor?.vendorId ? " active" : "")
              }
              onClick={() => setSelectedVendorId(group.vendorId)}
            >
              <span>VENDOR</span>
              <strong>{group.vendorName}</strong>
              <small>{group.rows.length} DT</small>
            </button>
          ))}
        </div>

        {selectedVendor ? (
          <section className="counter-vendor-group">
            <div className="counter-paper-table" role="table">
              <div className="counter-paper-row counter-paper-head" role="row">
                <span role="columnheader">NO. DT / ALAT ANGKUT</span>
                <span role="columnheader">JAM</span>
                <span role="columnheader">TALLY / COUNTER</span>
              </div>
              {selectedVendor.rows.map(({ aa, activeNow }) => {
                const p = pending[aa.assignmentAaId] ?? 0;
                const display = aa.confirmedCount + p;
                const err = failed[aa.assignmentAaId];
                const tallyMarks = tallyMarksFor(
                  aa.assignmentAaId,
                  aa.confirmedCount,
                  events.data?.items ?? [],
                );
                return (
                  <div
                    key={aa.assignmentAaId}
                    className={
                      "counter-paper-row" +
                      (!activeNow ? " outside-window" : "")
                    }
                    role="row"
                  >
                    <div className="counter-dt-cell" role="cell">
                      <span className="counter-column-label">
                        NO. DT / ALAT ANGKUT
                      </span>
                      <strong>{aa.unitNo}</strong>
                    </div>
                    <div className="counter-time-cell" role="cell">
                      <span className="counter-column-label">JAM</span>
                      <strong>
                        {aa.lastEventAt ? fmtTime(aa.lastEventAt) : "—"}
                      </strong>
                      <small>
                        {activeNow ? "Jam dump terakhir" : "Di luar jam input"}
                      </small>
                    </div>
                    <button
                      type="button"
                      className={
                        "counter-tally" +
                        (p ? " pending" : "") +
                        (err ? " failed" : "")
                      }
                      disabled={
                        !context.data?.canRecord || !activeNow || p > 0
                      }
                      onClick={() => void tapAa(aa.assignmentAaId)}
                      aria-label={"Tambah 1 tally untuk DT " + aa.unitNo}
                    >
                      <span className="counter-column-label">
                        TALLY / COUNTER
                      </span>
                      <strong>{display}</strong>
                      <small>
                        {p
                          ? "MENYIMPAN..."
                          : err
                            ? "GAGAL · TEKAN ULANG"
                            : activeNow
                              ? "+1 DUMP"
                              : "TIDAK AKTIF"}
                      </small>
                      <span
                        className="counter-tally-marks"
                        aria-label="Tally mark per jam"
                        title="Tally mark dipisahkan berdasarkan jam"
                      >
                        {tallyMarks}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          !assignments.isFetching && (
            <div className="counter-empty">
              <strong>Belum ada DT yang bisa dicatat.</strong>
              <span>
                Pastikan Laporan Shift Vendor atau Penugasan Operasional
                Limestone sudah tersedia untuk tanggal, shift, dan crusher ini.
              </span>
            </div>
          )
        )}
      </div>
      <div className="counter-kpis">
        <div className="card kpi">
          <span>Total Tally</span>
          <strong>{s?.totalNet ?? 0}</strong>
        </div>
        <div className="card kpi">
          <span>Dump tercatat</span>
          <strong>{s?.dumpEvents ?? 0}</strong>
        </div>
        <div className="card kpi">
          <span>Koreksi</span>
          <strong>{s?.reversalEvents ?? 0}</strong>
        </div>
        <div className="card kpi">
          <span>DT belum terpetakan</span>
          <strong>{s?.unassignedEvents ?? 0}</strong>
        </div>
        <div className="card kpi">
          <span>Perlu review</span>
          <strong>{s?.ambiguousEvents ?? 0}</strong>
        </div>
      </div>
      <div className="counter-bottom-grid">
        <div className="card table-card">
          <div className="section-toolbar">
            <div>
              <strong>Hourly Retase</strong>
              <small>
                Jam counter langsung (WITA); retase foto tetap pada ringkasan
                shift.
              </small>
            </div>
          </div>
          <div className="table-shell">
            <table className="native-table">
              <thead>
                <tr>
                  <th>Jam</th>
                  <th>Net Retase</th>
                </tr>
              </thead>
              <tbody>
                {(s?.hourly ?? []).map((x) => (
                  <tr key={x.hour}>
                    <td>
                      <span className="code-chip">{x.hour}</span>
                    </td>
                    <td>{x.retase}</td>
                  </tr>
                ))}
                {!s?.hourly.length && (
                  <tr>
                    <td colSpan={2} className="table-empty">
                      Belum ada event.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card table-card">
          <div className="section-toolbar">
            <div>
              <strong>Retase per AA</strong>
              <small>Net = DUMP + reversal delta.</small>
            </div>
          </div>
          <div className="table-shell">
            <table className="native-table">
              <thead>
                <tr>
                  <th>AA</th>
                  <th>Retase</th>
                </tr>
              </thead>
              <tbody>
                {(s?.byAa ?? []).map((x, i) => (
                  <tr key={`${x.id ?? "x"}-${i}`}>
                    <td>{x.label}</td>
                    <td>{x.retase}</td>
                  </tr>
                ))}
                {!s?.byAa.length && (
                  <tr>
                    <td colSpan={2} className="table-empty">
                      Belum ada data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card table-card">
        <div className="section-toolbar">
          <div>
            <strong>Recent Event Ledger</strong>
            <small>
              Original DUMP tidak dihapus. Undo membuat REVERSAL -1.
            </small>
          </div>
          <span className="toolbar-meta">{events.data?.total ?? 0} event</span>
        </div>
        <div className="table-shell">
          <table className="native-table counter-event-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>AA</th>
                <th>Vendor</th>
                <th>Delta</th>
                <th>Status</th>
                <th>Actor</th>
                <th>Reason</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(events.data?.items ?? []).map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.entrySource === "IMPORT" && e.materialKind === "LS"
                      ? "Shift · foto"
                      : fmtTime(e.eventTs)}
                  </td>
                  <td>
                    <strong>{e.aaUnitNo ?? "UNLISTED"}</strong>
                  </td>
                  <td>
                    {e.vendorName ?? "—"}

                  </td>
                  <td>
                    <span
                      className={`event-delta ${e.delta > 0 ? "positive" : "negative"}`}
                    >
                      {e.delta > 0 ? "+1" : "-1"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${e.status === "VALID" ? "success" : e.status === "REVERSED" ? "muted" : "warning"}`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td>{e.createdByName}</td>
                  <td>{e.reason ?? "—"}</td>
                  <td>
                    {e.canReverse ? (
                      <button
                        className="btn small"
                        onClick={() => {
                          setReverseTarget(e);
                          setReverseReason("");
                          setReverseRequestId(null);
                        }}
                      >
                        {user?.role === "CRUSHER_OPERATOR"
                          ? "Undo Last"
                          : "Reverse"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!events.data?.items.length && (
                <tr>
                  <td colSpan={7} className="table-empty">
                    Belum ada event.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {unlistedOpen && (
        <Modal
          title="Record Unlisted AA"
          subtitle="Digunakan jika unit dump tidak ada pada assignment. Event tidak otomatis masuk QC mapping bila unresolved."
          onClose={() => {
            setUnlistedOpen(false);
            setUnlistedRequestId(null);
          }}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  setUnlistedOpen(false);
                  setUnlistedRequestId(null);
                }}
              >
                Batal
              </button>
              <button
                className="btn primary"
                disabled={
                  !unlistedUnit.trim() || unlistedReason.trim().length < 3
                }
                onClick={() => void submitUnlisted()}
              >
                Record +1
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label>
              <span>No AA / DT</span>
              <input
                value={unlistedUnit}
                onChange={(e) => setUnlistedUnit(e.target.value.toUpperCase())}
                placeholder="Contoh: 112"
              />
            </label>
            <label>
              <span>Vendor (jika diketahui)</span>
              <select
                value={unlistedVendor}
                onChange={(e) => setUnlistedVendor(e.target.value)}
              >
                <option value="">— unknown —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              <span>Reason</span>
              <input
                value={unlistedReason}
                onChange={(e) => setUnlistedReason(e.target.value)}
                placeholder="Contoh: Unit pengganti belum masuk assignment"
              />
            </label>
          </div>
        </Modal>
      )}
      {reverseTarget && (
        <Modal
          title={
            user?.role === "CRUSHER_OPERATOR"
              ? "Undo Last Retase"
              : "Reverse Retase Event"
          }
          subtitle={`${reverseTarget.aaUnitNo ?? "AA"} · ${fmtTime(reverseTarget.eventTs)} · original event tetap tersimpan`}
          onClose={() => {
            setReverseTarget(null);
            setReverseRequestId(null);
          }}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  setReverseTarget(null);
                  setReverseRequestId(null);
                }}
              >
                Batal
              </button>
              <button
                className="btn primary"
                disabled={reverseReason.trim().length < 3}
                onClick={() => void submitReverse()}
              >
                Simpan REVERSAL -1
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label className="span-2">
              <span>Reason</span>
              <input
                autoFocus
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="Alasan koreksi wajib"
              />
            </label>
          </div>
        </Modal>
      )}
    </section>
  );
}
