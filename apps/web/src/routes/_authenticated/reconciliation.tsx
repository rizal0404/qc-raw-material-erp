import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import type {
  MappingStatus,
  MaterialKind,
  ReconciliationAllocation,
  ReconciliationAssignment,
  ReconciliationException,
  ShiftCode,
} from "@qc/contracts";
import {
  useMaterial,
  useMaterialLookups,
} from "../../features/navigation/material-context";
import { materialNames } from "../../features/navigation/workflow";
import {
  confirmRetaseAllocation,
  createRetaseAllocation,
  getExceptionAssignmentCandidates,
  getReconciliation,
  getReconciliationCandidates,
  getReconciliationEvents,
  resolveReconciliationException,
  updateRetaseAllocation,
} from "../../features/reconciliation/reconciliation-api";
import { Modal } from "../../components/modal";
import { validateReportHandoff } from "../../features/navigation/report-handoff";
import { businessDateToday } from "../../lib/business-date";

export const Route = createFileRoute("/_authenticated/reconciliation")({
  validateSearch: validateReportHandoff,
  component: ReconciliationPage,
});

const today = businessDateToday;
const fmtTime = (value: string) =>
  new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const statuses: MappingStatus[] = [
  "UNMAPPED",
  "SUGGESTED",
  "RESERVED",
  "AMBIGUOUS",
  "CONFIRMED",
  "CONSUMED",
  "REVIEW_REQUIRED",
];
const editableAllocationStatuses: MappingStatus[] = [
  "SUGGESTED",
  "RESERVED",
  "AMBIGUOUS",
  "REVIEW_REQUIRED",
];

type ReconciliationAmGroup = ReconciliationAssignment & {
  items: ReconciliationAssignment[];
};

function sameValue<T>(items: T[], value: T | null | undefined) {
  return items.every((item) => item === value) ? value ?? null : null;
}

function groupMappingStatus(items: ReconciliationAssignment[]): MappingStatus {
  if (items.some((item) => item.mappingStatus === "REVIEW_REQUIRED"))
    return "REVIEW_REQUIRED";
  if (items.every((item) => item.mappingStatus === "CONSUMED"))
    return "CONSUMED";
  if (items.some((item) => item.mappingStatus === "CONFIRMED"))
    return "CONFIRMED";
  const candidateCount = Math.max(
    ...items.map((item) => item.candidateCount),
  );
  if (candidateCount === 0) return "UNMAPPED";
  if (candidateCount === 1) return "RESERVED";
  return "AMBIGUOUS";
}

function groupAssignments(
  assignments: ReconciliationAssignment[],
): ReconciliationAmGroup[] {
  const groups = new Map<string, ReconciliationAssignment[]>();
  for (const assignment of assignments) {
    const key = [
      assignment.operationDate,
      assignment.shiftCode,
      assignment.crusherId ?? "cross-crusher",
      assignment.vendorId,
      assignment.amId,
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), assignment]);
  }

  return [...groups.values()].map((items) => {
    const first = items[0]!;
    const status = groupMappingStatus(items);
    const allocations = items.flatMap((item) => item.allocations);
    const candidateCount = Math.max(
      ...items.map((item) => item.candidateCount),
    );
    const suggested = items.find((item) => item.suggestedSampleId);
    const exceptions = [
      ...new Set(items.map((item) => item.exception).filter(Boolean)),
    ];

    return {
      ...first,
      items,
      sourceId: sameValue(items.map((item) => item.sourceId), first.sourceId),
      sourceCode: sameValue(
        items.map((item) => item.sourceCode),
        first.sourceCode,
      ),
      sourceName: sameValue(
        items.map((item) => item.sourceName),
        first.sourceName,
      ),
      blockSnapshot: sameValue(
        items.map((item) => item.blockSnapshot),
        first.blockSnapshot,
      ),
      assignedAaUnitNos: [
        ...new Set(items.flatMap((item) => item.assignedAaUnitNos ?? [])),
      ],
      assignedAaCount: items.reduce(
        (total, item) => total + item.assignedAaCount,
        0,
      ),
      aaWithDumpCount: items.reduce(
        (total, item) => total + item.aaWithDumpCount,
        0,
      ),
      observedRetase: items.reduce(
        (total, item) => total + item.observedRetase,
        0,
      ),
      reservedRetase: items.reduce(
        (total, item) => total + item.reservedRetase,
        0,
      ),
      consumedRetase: items.reduce(
        (total, item) => total + item.consumedRetase,
        0,
      ),
      remainingRetase: items.reduce(
        (total, item) => total + item.remainingRetase,
        0,
      ),
      candidateCount,
      suggestedSampleId: suggested?.suggestedSampleId ?? null,
      suggestedSampleCode: suggested?.suggestedSampleCode ?? null,
      mappingStatus: status,
      reviewRequired: items.some((item) => item.reviewRequired),
      exception: exceptions.length ? exceptions.join(" · ") : null,
      allocations,
    };
  });
}

function badgeClass(status: MappingStatus) {
  if (["RESERVED", "CONFIRMED", "CONSUMED"].includes(status)) return "success";
  if (
    status === "UNMAPPED" ||
    status === "AMBIGUOUS" ||
    status === "REVIEW_REQUIRED"
  )
    return "warning";
  return "muted";
}

function canFinalizeAm(item: ReconciliationAmGroup) {
  const allocations = item.allocations.filter(
    (entry) => entry.mappingStatus === "RESERVED",
  );
  return (
    item.mappingStatus === "RESERVED" &&
    allocations.length > 0 &&
    allocations.every(
      (entry) =>
        Boolean(entry.sampleId) &&
        entry.approvedRetase !== null &&
        entry.approvedRetase > 0 &&
        entry.candidateCount <= 1,
    )
  );
}

function ReconciliationPage() {
  const kind = useMaterial();
  return kind === "CL" ? (
    <Navigate to="/qc-workbench" search={{ material: "CL" }} replace />
  ) : (
    <LimestoneReconciliationPage />
  );
}

function LimestoneReconciliationPage() {
  const queryClient = useQueryClient();
  const lookups = useMaterialLookups();
  const handoff = Route.useSearch();
  const [date, setDate] = useState(handoff.operationDate ?? today());
  const [shift, setShift] = useState<string>(handoff.shiftCode ?? "");
  const [crusher, setCrusher] = useState(handoff.crusherId ?? "");
  const [vendor, setVendor] = useState("");
  const kind = useMaterial();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReconciliationAmGroup | null>(null);
  const [allocation, setAllocation] = useState<ReconciliationAllocation | null>(
    null,
  );
  const [savedAllocations, setSavedAllocations] = useState<
    ReconciliationAllocation[]
  >([]);
  const [expandedAmRows, setExpandedAmRows] = useState<Set<string>>(
    () => new Set(),
  );
  const [sampleId, setSampleId] = useState("");
  const [approved, setApproved] = useState("");
  const [note, setNote] = useState("");
  const [exception, setException] = useState<ReconciliationException | null>(
    null,
  );
  const [exceptionAssignmentId, setExceptionAssignmentId] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [message, setMessage] = useState("Ready");

  const query = useQuery({
    queryKey: [
      "reconciliation",
      date,
      shift,
      crusher,
      vendor,
      kind,
      search,
    ],
    queryFn: () =>
      getReconciliation({
        operationDate: date,
        ...(shift ? { shiftCode: shift as ShiftCode } : {}),
        ...(crusher ? { crusherId: crusher } : {}),
        ...(vendor ? { vendorId: vendor } : {}),
        ...(kind ? { materialKind: kind as MaterialKind } : {}),
        ...(search ? { search } : {}),
      }),
    enabled: Boolean(date),
  });

  const candidates = useQuery({
    queryKey: ["reconciliation-candidates", selected?.assignmentId],
    queryFn: () => getReconciliationCandidates(selected!.assignmentId),
    enabled: Boolean(selected),
  });

  const eventQueries = useQueries({
    queries:
      selected?.items.map((item) => ({
        queryKey: ["reconciliation-events", item.assignmentId],
        queryFn: () => getReconciliationEvents(item.assignmentId),
        enabled: Boolean(selected),
      })) ?? [],
  });

  const events = useMemo(
    () => eventQueries.flatMap((result) => result.data?.items ?? []),
    [eventQueries],
  );

  const exceptionAssignments = useQuery({
    queryKey: ["reconciliation-exception-assignments", exception?.eventId],
    queryFn: () => getExceptionAssignmentCandidates(exception!.eventId),
    enabled: Boolean(exception),
  });

  useEffect(() => {
    if (!selected) {
      setAllocation(null);
      setSavedAllocations([]);
      return;
    }
    setSavedAllocations([]);
    const editable =
      selected.items
        .flatMap((item) => item.allocations)
        .find((item) => editableAllocationStatuses.includes(item.mappingStatus)) ??
      null;
    setAllocation(editable);
    setSampleId(editable?.sampleId ?? selected.suggestedSampleId ?? "");
    setApproved(
      String(
        editable?.approvedRetase ??
          (Math.max(0, selected.remainingRetase) || ""),
      ),
    );
    setNote(editable?.note ?? "");
  }, [selected]);

  useEffect(() => {
    if (selected && candidates.data?.items.length === 1 && !sampleId)
      setSampleId(candidates.data.items[0]!.id);
  }, [candidates.data, selected, sampleId]);

  useEffect(() => {
    if (!exception) return;
    const list = exceptionAssignments.data?.items ?? [];
    const aaMatch = list.filter((item) => item.aaListed);
    if (!exceptionAssignmentId && aaMatch.length === 1)
      setExceptionAssignmentId(aaMatch[0]!.assignmentId);
  }, [exception, exceptionAssignments.data, exceptionAssignmentId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    if (selected) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["reconciliation-candidates", selected.assignmentId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["reconciliation-events"],
        }),
      ]);
    }
  };

  const persistGroupMappings = async (value: number) => {
    if (!selected || !sampleId) throw new Error("Sample_ID wajib dipilih.");

    const targets = selected.items.map((item) => {
      const current =
        savedAllocations.find((entry) => entry.assignmentId === item.assignmentId) ??
        item.allocations.find(
          (entry) =>
            editableAllocationStatuses.includes(entry.mappingStatus) &&
            (entry.sampleId === sampleId || entry.sampleId === null),
        ) ?? null;
      return {
        item,
        current,
        capacity:
          Math.max(0, item.remainingRetase) +
          (current?.approvedRetase ?? 0),
      };
    });
    const capacity = targets.reduce(
      (total, target) => total + target.capacity,
      0,
    );
    if (value > capacity)
      throw new Error(
        "Approved Retase melebihi remaining AM sebesar " +
          Math.max(0, value - capacity) +
          ".",
      );

    let remaining = value;
    const saved: ReconciliationAllocation[] = [];
    for (const target of targets) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, target.capacity);
      if (amount <= 0) continue;
      const result = target.current
        ? await updateRetaseAllocation(target.current.id, {
            sampleId,
            approvedRetase: amount,
            note: note || null,
          })
        : await createRetaseAllocation({
            assignmentId: target.item.assignmentId,
            sampleId,
            approvedRetase: amount,
            note: note || null,
          });
      saved.push(result.item);
      remaining -= amount;
    }
    if (remaining > 0)
      throw new Error("Approved Retase belum dapat dibagi ke seluruh route AM.");
    return saved;
  };

  const saveMapping = useMutation({
    mutationFn: async () => {
      const value = Number(approved);
      if (!Number.isInteger(value) || value <= 0)
        throw new Error("Approved Retase harus bilangan bulat > 0.");
      return persistGroupMappings(value);
    },
    onSuccess: async (result) => {
      setAllocation(result[0] ?? null);
      setSavedAllocations(result);
      setMessage(
        "Mapping AM tersimpan pada " +
          result.length +
          " route sebagai " +
          (result[0]?.mappingStatus ?? "SAVED") +
          ".",
      );
      await refresh();
    },
    onError: (error) => setMessage(error.message),
  });

  const confirmMapping = useMutation({
    mutationFn: async () => {
      if (!selected || !sampleId) throw new Error("Sample_ID wajib dipilih.");
      const saved = await persistGroupMappings(Number(approved));
      if (!saved.length) throw new Error("Allocation belum tersedia.");
      return Promise.all(
        saved.map((item) =>
          confirmRetaseAllocation(item.id, {
            approvedRetase:
              item.approvedRetase ?? Math.max(1, Number(approved)),
            ...(note.trim().length >= 3 ? { reason: note.trim() } : {}),
          }),
        ),
      );
    },
    onSuccess: async () => {
      setMessage(
        "Retase allocation CONFIRMED dan siap menjadi Workbench suggestion.",
      );
      setSelected(null);
      setAllocation(null);
      setSavedAllocations([]);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["retase-suggestions"] }),
      ]);
    },
    onError: (error) => setMessage(error.message),
  });

  const finalizeMapping = useMutation({
    mutationFn: async (item: ReconciliationAmGroup) => {
      const allocations = item.allocations.filter(
        (entry) => entry.mappingStatus === "RESERVED",
      );
      if (!allocations.length)
        throw new Error("Belum ada allocation RESERVED untuk difinalisasi.");
      if (!canFinalizeAm(item))
        throw new Error(
          "Mapping belum siap finalize. Buka Map / Review untuk melengkapi sample dan approved retase.",
        );
      return Promise.all(
        allocations.map((entry) =>
          confirmRetaseAllocation(entry.id, {
            approvedRetase: entry.approvedRetase!,
          }),
        ),
      );
    },
    onSuccess: async (result) => {
      setMessage(
        `${result.length} allocation berhasil FINALIZE menjadi CONFIRMED dan tersedia di Mixing Workbench.`,
      );
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["retase-suggestions"] }),
      ]);
    },
    onError: (error) => setMessage(error.message),
  });

  const resolveException = useMutation({
    mutationFn: async () => {
      if (!exception || !exceptionAssignmentId)
        throw new Error("Assignment tujuan wajib dipilih.");
      if (exceptionReason.trim().length < 3)
        throw new Error("Reason reconciliation minimal 3 karakter.");
      return resolveReconciliationException(exception.eventId, {
        assignmentId: exceptionAssignmentId,
        reason: exceptionReason.trim(),
      });
    },
    onSuccess: async () => {
      setMessage(
        "Exception event berhasil direconcile menjadi VALID dan masuk assignment terpilih.",
      );
      setException(null);
      setExceptionAssignmentId("");
      setExceptionReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reconciliation"] }),
        queryClient.invalidateQueries({ queryKey: ["retase-events"] }),
        queryClient.invalidateQueries({ queryKey: ["retase-summary"] }),
      ]);
    },
    onError: (error) => setMessage(error.message),
  });

  const allAmRows = useMemo(
    () => groupAssignments(query.data?.items ?? []),
    [query.data?.items],
  );
  const amRows = useMemo(
    () =>
      status
        ? allAmRows.filter((item) => item.mappingStatus === status)
        : allAmRows,
    [allAmRows, status],
  );
  const summary = useMemo(
    () => ({
      assignmentCount: amRows.length,
      observedRetase: amRows.reduce(
        (total, item) => total + item.observedRetase,
        0,
      ),
      reservedRetase: amRows.reduce(
        (total, item) => total + item.reservedRetase,
        0,
      ),
      remainingRetase: amRows.reduce(
        (total, item) => total + Math.max(0, item.remainingRetase),
        0,
      ),
      reviewRequired: amRows.filter((item) => item.reviewRequired).length,
      unassignedEvents:
        query.data?.exceptions.filter(
          (item) => item.status === "EXCEPTION_UNASSIGNED",
        ).length ?? 0,
      ambiguousEvents:
        query.data?.exceptions.filter((item) => item.status === "AMBIGUOUS")
          .length ?? 0,
    }),
    [amRows, query.data?.exceptions],
  );
  const filteredCrushers = useMemo(() => {
    const all = lookups.data?.crushers ?? [];
    return kind ? all.filter((item) => item.materialKind === kind) : all;
  }, [lookups.data?.crushers, kind]);

  const canCreateNewAllocation = selected
    ? selected.remainingRetase > 0
    : false;
  const isEditableAllocation = Boolean(
    allocation ??
    selected?.items
      .flatMap((item) => item.allocations)
      .find((item) => editableAllocationStatuses.includes(item.mappingStatus)),
  );
  const showMappingForm = Boolean(
    selected &&
    (isEditableAllocation || canCreateNewAllocation) &&
    selected.mappingStatus !== "CONSUMED",
  );
  const toggleAmRow = (assignmentId: string) => {
    setExpandedAmRows((current) => {
      const next = new Set(current);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  };

  return (
    <section className="page-stack reconciliation-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{materialNames[kind]} / KONTROL MUTU</p>
          <h1>Rekonsiliasi Retase</h1>
          <p>
            Cocokkan perjalanan armada dengan sampel laboratorium sebelum
            digunakan dalam mixing.
          </p>
        </div>
        <span className="status-badge success">KONFIRMASI QC</span>
      </div>

      <div className="card reconciliation-filters">
        <label>
          <span>Operation Date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          <span>Shift</span>
          <select
            value={shift}
            onChange={(event) => setShift(event.target.value)}
          >
            <option value="">ALL</option>
            {(lookups.data?.shifts ?? []).map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Material</span>
          <input value={materialNames[kind]} readOnly />
        </label>
        <label>
          <span>Crusher</span>
          <select
            value={crusher}
            onChange={(event) => setCrusher(event.target.value)}
          >
            <option value="">ALL</option>
            {filteredCrushers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Vendor</span>
          <select
            value={vendor}
            onChange={(event) => setVendor(event.target.value)}
          >
            <option value="">ALL</option>
            {(lookups.data?.vendors ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">ALL</option>
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          <span>Search</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Vendor, AM, source, block..."
          />
        </label>
        <div className="filter-button">
          <button className="btn" onClick={() => void query.refetch()}>
            Refresh
          </button>
        </div>
      </div>

      {query.data?.items.some((item) => item.crusherId === null) && (
        <div className="card reconciliation-banner">
          <small>
            Penugasan lintas crusher dihitung satu kali untuk seluruh tujuan.
            Filter crusher menyertakan penugasan tersebut; Observed, Reserved,
            dan Remaining tetap total penugasan lintas crusher, bukan subtotal
            crusher yang dipilih.
          </small>
        </div>
      )}

      <div className="reconciliation-kpis">
        <div className="card kpi">
          <span>AM Assignments</span>
          <strong>{summary?.assignmentCount ?? 0}</strong>
        </div>
        <div className="card kpi">
          <span>Observed Retase</span>
          <strong>{summary?.observedRetase ?? 0}</strong>
        </div>
        <div className="card kpi">
          <span>Reserved</span>
          <strong>{summary?.reservedRetase ?? 0}</strong>
        </div>
        <div className="card kpi">
          <span>Remaining</span>
          <strong>{summary?.remainingRetase ?? 0}</strong>
        </div>
        <div className="card kpi">
          <span>Review Required</span>
          <strong>{summary?.reviewRequired ?? 0}</strong>
        </div>
        <div className="card kpi">
          <span>Event Exception</span>
          <strong>
            {(summary?.unassignedEvents ?? 0) + (summary?.ambiguousEvents ?? 0)}
          </strong>
        </div>
      </div>

      <div className="card reconciliation-banner">
        <strong>{message}</strong>
        <small>
          Candidate rule saat ini: Operation Date + Material Kind + afiliasi AM
          (No Alat Muat) atau Vendor.
        </small>
      </div>

      <div className="card table-card">
        <div className="section-toolbar">
          <div>
            <strong>Rekonsiliasi per Alat Muat (AM)</strong>
            <small>
              Satu baris = satu AM. Klik baris atau ikon mata untuk melihat
              route dan AA yang ter-assign. Reserved = approved + consumed.
            </small>
          </div>
          <span className="toolbar-meta">
            {amRows.length} AM
          </span>
        </div>
        <div className="table-shell">
          <table className="native-table reconciliation-table">
            <thead>
              <tr>
                <th>Shift / Crusher</th>
                <th>Vendor / AM</th>
                <th>Source / Block</th>
                <th>AA (detail)</th>
                <th>Observed</th>
                <th>Reserved</th>
                <th>Remaining</th>
                <th>Candidate</th>
                <th>Status</th>
                <th>Allocation</th>
                <th>Exception</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {amRows.map((item) => (
                <tr
                  key={item.assignmentId}
                  className="reconciliation-am-row"
                  tabIndex={0}
                  aria-expanded={expandedAmRows.has(item.assignmentId)}
                  onClick={() => toggleAmRow(item.assignmentId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleAmRow(item.assignmentId);
                    }
                  }}
                >
                  <td>
                    <strong>{item.shiftCode}</strong>
                    <small className="table-sub">{item.crusherName}</small>
                  </td>
                  <td>
                    {item.vendorName}
                    <small className="table-sub">AM {item.amUnitNo}</small>
                  </td>
                  <td>
                    {item.items.length > 1
                      ? item.items.length + " route"
                      : item.sourceName ?? "—"}
                    <small className="table-sub">
                      {item.items.length > 1
                        ? "Klik untuk detail source / block"
                        : item.blockSnapshot ?? item.materialCategory}
                    </small>
                  </td>
                  <td>
                    {item.aaWithDumpCount}/{item.assignedAaCount}
                    <small className="table-sub">AA dump / ter-assign</small>
                  </td>
                  <td>
                    <strong>{item.observedRetase}</strong>
                  </td>
                  <td>{item.reservedRetase}</td>
                  <td className={item.remainingRetase < 0 ? "warn-text" : ""}>
                    {item.remainingRetase}
                  </td>
                  <td>
                    {item.candidateCount}
                    {item.suggestedSampleCode ? (
                      <small className="table-sub">
                        {item.suggestedSampleCode}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${badgeClass(item.mappingStatus)}`}
                    >
                      {item.mappingStatus}
                    </span>
                    {item.reviewRequired && (
                      <small className="table-sub warn-text">REVIEW</small>
                    )}
                  </td>
                  <td>
                    {item.allocations.length ? (
                      <>
                        <button
                          type="button"
                          className="allocation-collapsed"
                          aria-expanded={expandedAmRows.has(item.assignmentId)}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleAmRow(item.assignmentId);
                          }}
                        >
                          <span>
                            <strong>{item.allocations.length}</strong>{" "}
                            allocation
                          </span>
                          <span aria-hidden="true">
                            {expandedAmRows.has(item.assignmentId) ? "⌃" : "⌄"}
                          </span>
                        </button>
                        {expandedAmRows.has(item.assignmentId) &&
                          item.allocations.map((entry) => (
                            <div key={entry.id} className="allocation-chip">
                              <span>
                                {entry.sampleCode ?? "—"} ·{" "}
                                {entry.approvedRetase ?? "—"} ret
                              </span>
                              <small>
                                {entry.mappingStatus}
                                {entry.consumedMixCode
                                  ? " · " + entry.consumedMixCode
                                  : ""}
                              </small>
                            </div>
                          ))}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <small>{item.exception ?? "—"}</small>
                  </td>
                  <td>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="icon-button table-icon-button"
                        title="Lihat detail AA"
                        aria-label={"Lihat detail AA AM " + item.amUnitNo}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(item);
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                          <circle cx="12" cy="12" r="2.5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(item);
                        }}
                      >
                        {item.remainingRetase <= 0 &&
                        ["CONFIRMED", "CONSUMED"].includes(item.mappingStatus)
                          ? "Trace"
                          : "Map / Review"}
                      </button>
                      {item.mappingStatus === "RESERVED" && (
                        <button
                          type="button"
                          className="btn small primary"
                          disabled={finalizeMapping.isPending}
                          title={
                            canFinalizeAm(item)
                              ? "Finalize mapping menjadi CONFIRMED"
                              : "Review mapping terlebih dahulu"
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!canFinalizeAm(item)) {
                              setSelected(item);
                              setMessage(
                                "Mapping belum siap finalize. Silakan review sample dan approved retase.",
                              );
                              return;
                            }
                            if (
                              typeof window !== "undefined" &&
                              !window.confirm(
                                `Finalize mapping AM ${item.amUnitNo} menjadi CONFIRMED? Data akan muncul di Mixing Workbench.`,
                              )
                            )
                              return;
                            finalizeMapping.mutate(item);
                          }}
                        >
                          Finalize
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!query.isFetching && !amRows.length && (
                <tr>
                  <td colSpan={12} className="table-empty">
                    Tidak ada AM sesuai filter.
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
            <strong>Unassigned / Ambiguous Dump Events</strong>
            <small>
              Exception dapat direconcile QC ke assignment valid tanpa menghapus
              event asli.
            </small>
          </div>
          <span className="toolbar-meta">
            {query.data?.exceptions.length ?? 0} event
          </span>
        </div>
        <div className="table-shell">
          <table className="native-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Shift</th>
                <th>Crusher</th>
                <th>Vendor</th>
                <th>AA</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.exceptions ?? []).map((item) => (
                <tr key={item.eventId}>
                  <td>{fmtTime(item.eventTs)}</td>
                  <td>{item.shiftCode}</td>
                  <td>{item.crusherName}</td>
                  <td>{item.vendorName ?? "—"}</td>
                  <td>{item.aaUnitNo ?? "—"}</td>
                  <td>
                    <span className="status-badge warning">{item.status}</span>
                  </td>
                  <td>{item.reason ?? "—"}</td>
                  <td>
                    <button
                      className="btn small"
                      onClick={() => {
                        setException(item);
                        setExceptionAssignmentId("");
                        setExceptionReason("");
                      }}
                    >
                      Resolve
                    </button>
                  </td>
                </tr>
              ))}
              {!query.data?.exceptions.length && (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Tidak ada event exception.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <Modal
          title="Retase Mapping per AM"
          subtitle={`${selected.vendorName} · AM ${selected.amUnitNo} · ${selected.crusherName}`}
          onClose={() => {
            setSelected(null);
            setAllocation(null);
          }}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  setSelected(null);
                  setAllocation(null);
                }}
              >
                Tutup
              </button>
              {selected.mappingStatus !== "CONSUMED" && (
                <>
                  <button
                    className="btn"
                    disabled={
                      !showMappingForm || !sampleId || saveMapping.isPending
                    }
                    onClick={() => saveMapping.mutate()}
                  >
                    Save Mapping
                  </button>
                  <button
                    className="btn primary"
                    disabled={
                      !showMappingForm ||
                      !sampleId ||
                      Number(approved) <= 0 ||
                      saveMapping.isPending ||
                      confirmMapping.isPending
                    }
                    onClick={() => confirmMapping.mutate()}
                  >
                    Save & Confirm
                  </button>
                </>
              )}
            </>
          }
        >
          <div className="reconciliation-modal-grid">
            <div className="card-lite">
              <span>Observed</span>
              <strong>{selected.observedRetase}</strong>
            </div>
            <div className="card-lite">
              <span>Reserved</span>
              <strong>{selected.reservedRetase}</strong>
            </div>
            <div className="card-lite">
              <span>Remaining</span>
              <strong>{selected.remainingRetase}</strong>
            </div>
            <div className="card-lite">
              <span>Candidate</span>
              <strong>
                {candidates.data?.items.length ?? selected.candidateCount}
              </strong>
            </div>
          </div>

          <div className="dialog-section">
            <strong>Detail AA yang Ter-assign ke AM</strong>
            <div className="table-shell compact">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Source / Block</th>
                    <th>AA</th>
                    <th>Observed</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.assignmentId}>
                      <td>
                        <strong>AM {item.amUnitNo}</strong>
                        <small className="table-sub">{item.crusherName}</small>
                      </td>
                      <td>
                        {item.sourceName ?? "—"}
                        <small className="table-sub">
                          {item.blockSnapshot ?? item.materialCategory}
                        </small>
                      </td>
                      <td>
                        {item.assignedAaUnitNos?.length
                          ? item.assignedAaUnitNos.join(", ")
                          : item.aaWithDumpCount + "/" + item.assignedAaCount}
                        <small className="table-sub">
                          {item.assignedAaUnitNos?.length
                            ? item.aaWithDumpCount +
                              "/" +
                              item.assignedAaCount +
                              " AA sudah dump"
                            : "AA dump / ter-assign"}
                        </small>
                      </td>
                      <td>{item.observedRetase}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {showMappingForm ? (
            <div className="form-grid reconciliation-map-form">
              <label className="span-2">
                <span>Sample_ID Candidate</span>
                <select
                  value={sampleId}
                  onChange={(event) => setSampleId(event.target.value)}
                >
                  <option value="">— pilih sample —</option>
                  {(candidates.data?.items ?? []).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.sampleId} · {candidate.typeGrade ?? "—"} ·{" "}
                      {candidate.matchMode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Approved Retase</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={approved}
                  onChange={(event) => setApproved(event.target.value)}
                />
              </label>
              <label>
                <span>Mapping Status</span>
                <input
                  readOnly
                  value={allocation?.mappingStatus ?? selected.mappingStatus}
                />
              </label>
              <label className="span-2">
                <span>Note / Reason</span>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Wajib bila candidate > 1 atau perlu menjelaskan override/review"
                />
              </label>
            </div>
          ) : (
            <div className="inline-alert">
              Seluruh observed retase sudah reserved/consumed. Mode ini hanya
              untuk traceability.
            </div>
          )}

          <div className="dialog-section">
            <strong>Sample Candidate Detail</strong>
            <div className="candidate-list">
              {(candidates.data?.items ?? []).map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  className={`candidate-card ${sampleId === candidate.id ? "selected" : ""}`}
                  disabled={!showMappingForm}
                  onClick={() => setSampleId(candidate.id)}
                >
                  <span>{candidate.sampleId}</span>
                  <small>
                    {candidate.vendorSnapshot ?? "—"} ·{" "}
                    {candidate.sourceSnapshot ?? "—"} · {candidate.block ?? "—"}
                  </small>
                  <small>
                    LSF {candidate.quality.lsf?.toFixed(2) ?? "—"} · SM{" "}
                    {candidate.quality.sm?.toFixed(2) ?? "—"} · AM{" "}
                    {candidate.quality.am?.toFixed(2) ?? "—"}
                  </small>
                </button>
              ))}
              {!candidates.data?.items.length && (
                <div className="table-empty">
                  Tidak ada candidate berdasarkan afiliasi AM/Vendor.
                </div>
              )}
            </div>
          </div>
          <div className="dialog-section">
            <strong>Assignment Event Drilldown</strong>
            <div className="table-shell compact">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>AA</th>
                    <th>Type</th>
                    <th>Δ</th>
                    <th>Status</th>
                    <th>Actor</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>{fmtTime(event.eventTs)}</td>
                      <td>{event.aaUnitNo ?? "—"}</td>
                      <td>{event.eventType}</td>
                      <td>{event.delta > 0 ? "+1" : "-1"}</td>
                      <td>{event.status}</td>
                      <td>{event.createdByName}</td>
                      <td>{event.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {exception && (
        <Modal
          title="Resolve Retase Exception"
          subtitle={`${exception.status} · ${exception.vendorName ?? "Vendor belum teridentifikasi"} · AA ${exception.aaUnitNo ?? "—"}`}
          onClose={() => setException(null)}
          footer={
            <>
              <button className="btn" onClick={() => setException(null)}>
                Batal
              </button>
              <button
                className="btn primary"
                disabled={
                  !exceptionAssignmentId ||
                  exceptionReason.trim().length < 3 ||
                  resolveException.isPending
                }
                onClick={() => resolveException.mutate()}
              >
                Resolve to Assignment
              </button>
            </>
          }
        >
          <div className="inline-alert">
            Resolusi ini tidak menghapus DUMP event. Sistem hanya
            mengklasifikasikan ulang exception menjadi VALID, menautkan
            assignment, dan menyimpan actor/reason/timestamp audit.
          </div>
          <div className="dialog-section">
            <strong>Assignment Candidates</strong>
            <div className="candidate-list">
              {(exceptionAssignments.data?.items ?? []).map((candidate) => (
                <button
                  type="button"
                  key={candidate.assignmentId}
                  className={`candidate-card ${exceptionAssignmentId === candidate.assignmentId ? "selected" : ""}`}
                  onClick={() =>
                    setExceptionAssignmentId(candidate.assignmentId)
                  }
                >
                  <span>
                    {candidate.vendorName} · AM {candidate.amUnitNo}
                  </span>
                  <small>
                    {candidate.sourceName ?? "—"} ·{" "}
                    {candidate.blockSnapshot ?? candidate.materialCategory} ·{" "}
                    {candidate.crusherName}
                  </small>
                  <small>
                    {candidate.aaListed
                      ? "AA tercantum pada assignment"
                      : "AA tidak tercantum — manual assignment review"}
                  </small>
                </button>
              ))}
              {!exceptionAssignments.data?.items.length && (
                <div className="table-empty">
                  Tidak ada assignment candidate pada operation date / shift /
                  crusher / vendor yang sama. Perbaiki Shift Report, Operational
                  Assignment, atau master data terlebih dahulu.
                </div>
              )}
            </div>
          </div>
          <label>
            <span>Resolution Reason</span>
            <textarea
              rows={3}
              value={exceptionReason}
              onChange={(event) => setExceptionReason(event.target.value)}
              placeholder="Contoh: Unit pengganti AA 112, dikonfirmasi ke assignment AM 12."
            />
          </label>
        </Modal>
      )}
    </section>
  );
}
