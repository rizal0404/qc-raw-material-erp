import { useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import type {
  CounterAssignment,
  CrusherReportDraft,
  Equipment,
  MasterLookupResponse,
} from "@qc/contracts";
import { Modal } from "../../components/modal";
import { createMaster, masterKeys } from "../master/master-api";
import { createOperationalAssignment } from "../retase/retase-api";
import type { EquipmentLookupItem } from "../vendor/vendor-api";
import {
  equipmentMatches,
  matchingEquipment,
  rowAssignments,
  rowWithEquipment,
  type ReportVehicle,
} from "./mapping-model";

export function RowAssignment({
  row,
  vendorId,
  assignments,
  equipment,
  draft,
  crusherId,
  sources,
  canCreate,
  disabled,
  demo,
  onApply,
  onBusy,
  onRefresh,
}: {
  row: ReportVehicle;
  vendorId: string | null;
  assignments: CounterAssignment[];
  equipment: EquipmentLookupItem[];
  draft: CrusherReportDraft;
  crusherId: string;
  sources: MasterLookupResponse["sources"];
  canCreate: boolean;
  disabled: boolean;
  demo: boolean;
  onApply: (row: ReportVehicle) => void;
  onBusy: (busy: boolean) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const matches = matchingEquipment(row, equipment, vendorId);
  const choices = rowAssignments(row, vendorId, assignments, equipment);
  const linked =
    equipment.find((e) => e.id === row.equipmentId) ||
    (matches.length === 1 ? matches[0] : undefined);
  return (
    <div className="orevision-row-mapping">
      <select
        aria-label={`Assignment baris ${row.rowIndex}`}
        value={row.assignmentAaId ?? ""}
        disabled={disabled || !vendorId || demo}
        onChange={(e) => {
          const selected = choices.find((c) => c.id === e.target.value);
          const aa = equipment.find((e) => e.id === selected?.aaId);
          onApply({
            ...row,
            ...(aa ? { equipmentId: aa.id } : {}),
            assignmentAaId: selected?.id ?? null,
            reviewed: false,
          });
        }}
      >
        <option value="">Belum terhubung ke AM</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
        {row.assignmentAaId &&
          !choices.some((c) => c.id === row.assignmentAaId) && (
            <option value={row.assignmentAaId}>
              Mapping tidak tersedia · muat ulang
            </option>
          )}
      </select>
      <button
        className="orevision-engine-link"
        disabled={disabled || !vendorId || demo}
        onClick={() => setOpen(true)}
        aria-label={`Hubungkan DT baris ${row.rowIndex}`}
      >
        {linked
          ? `DT ${linked.unitNo} · atur AM`
          : matches.length > 1
            ? "Pilih DT — beberapa kecocokan"
            : "Cari / daftarkan DT"}
      </button>
      {!vendorId && <small>Pilih vendor master dahulu.</small>}
      {demo && <small>Demo: tidak menulis equipment/assignment.</small>}
      {open &&
        vendorId &&
        createPortal(
          <div className="orevision">
            <MappingDialog
              key={`${vendorId}:${row.rowIndex}`}
              row={row}
              vendorId={vendorId}
              equipment={equipment}
              assignments={assignments}
              draft={draft}
              crusherId={crusherId}
              sources={sources}
              canCreate={canCreate}
              onApply={onApply}
              onBusy={onBusy}
              onRefresh={onRefresh}
              onClose={() => setOpen(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function MappingDialog({
  row,
  vendorId,
  equipment,
  assignments,
  draft,
  crusherId,
  sources,
  canCreate,
  onApply,
  onBusy,
  onRefresh,
  onClose,
}: {
  row: ReportVehicle;
  vendorId: string;
  equipment: EquipmentLookupItem[];
  assignments: CounterAssignment[];
  draft: CrusherReportDraft;
  crusherId: string;
  sources: MasterLookupResponse["sources"];
  canCreate: boolean;
  onApply: (row: ReportVehicle) => void;
  onBusy: (busy: boolean) => void;
  onRefresh: () => Promise<unknown>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const matches = matchingEquipment(row, equipment, vendorId);
  const [selectedId, setSelectedId] = useState(
    row.equipmentId ?? (matches.length === 1 ? matches[0]!.id : ""),
  );
  const [created, setCreated] = useState<EquipmentLookupItem | null>(null);
  const [amId, setAmId] = useState(""),
    [sourceId, setSourceId] = useState(""),
    [validFrom, setValidFrom] = useState(""),
    [validTo, setValidTo] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const fleet = equipment.filter((e) => e.active && e.vendorId === vendorId);
  const trucks =
    created && !fleet.some((e) => e.id === created.id)
      ? [...fleet.filter((e) => e.type === "AA"), created]
      : fleet.filter((e) => e.type === "AA");
  const effectiveId =
    selectedId || (matches.length === 1 ? matches[0]!.id : "");
  const aa = trucks.find((e) => e.id === effectiveId);
  const choices = aa
    ? rowAssignments(
        { ...rowWithEquipment(row, aa) },
        vendorId,
        assignments,
        trucks,
      )
    : [];
  const [assignmentId, setAssignmentId] = useState(row.assignmentAaId ?? "");
  const usableSources = sources.filter(
    (s) => s.active && s.materialKind === "LS",
  );
  const saveMapping = (assignmentAaId: string | null) => {
    if (!aa) return;
    onApply({ ...rowWithEquipment(row, aa), assignmentAaId });
    onClose();
  };
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Penyimpanan gagal.");
      await onRefresh().catch(() => undefined);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <Modal
      title={`Hubungkan DT / AA ${row.dtNo || "(belum diisi)"} ke alat muat`}
      subtitle="Satu mapping untuk baris OreVision ini; tidak ada tabel review kedua."
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <button className="btn" disabled={busy} onClick={onClose}>
            Tutup
          </button>
          <button
            className="btn primary"
            disabled={
              busy || !aa || !choices.some((c) => c.id === assignmentId)
            }
            onClick={() => saveMapping(assignmentId)}
          >
            Gunakan assignment
          </button>
        </>
      }
    >
      <div className="orevision-mapping-dialog form-stack">
        <p>
          Tanggal {draft.reportDate ?? "belum dipilih"} ·{" "}
          {draft.shiftCode ?? "shift belum dipilih"} · {row.retase ?? "—"}{" "}
          retase. DT = Alat Angkut (AA), alat muat = AM.
        </p>
        <label>
          <span>DT / AA dari database equipment</span>
          <select
            aria-label="DT dari master equipment"
            value={effectiveId}
            disabled={busy}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setAssignmentId("");
              setError("");
            }}
          >
            <option value="">Pilih DT milik vendor laporan</option>
            {trucks.map((e) => (
              <option key={e.id} value={e.id}>
                {e.unitNo} · {e.label}
              </option>
            ))}
          </select>
        </label>
        {aa && !equipmentMatches(row.dtNo, aa) && (
          <p className="alert warning">
            Nomor pada draft akan dikoreksi menjadi {aa.unitNo} saat mapping
            digunakan. Foto dan hasil parser asli tetap disimpan.
          </p>
        )}
        {!matches.length && (
          <div className="orevision-register-dt">
            <p>
              Nomor hasil parsing <b>{row.dtNo || "—"}</b> belum cocok dengan
              equipment vendor ini. Periksa nomor pada tabel sebelum
              mendaftarkan DT.
            </p>
            <button
              className="btn"
              disabled={!canCreate || busy || !row.dtNo.trim()}
              onClick={() =>
                void perform(async () => {
                  const result = await createMaster<Equipment>("equipment", {
                    vendorId,
                    type: "AA",
                    unitNo: row.dtNo.trim(),
                    aliases: [],
                    materialKinds: ["LS"],
                  });
                  const item: EquipmentLookupItem = {
                    ...result.item,
                    code: `${vendorId}:AA:${result.item.unitNo}`,
                    label: result.item.unitNo,
                  };
                  setCreated(item);
                  setSelectedId(item.id);
                  await qc.invalidateQueries({ queryKey: masterKeys.lookups });
                  await onRefresh();
                  setNotice(
                    `DT ${item.unitNo} tersimpan di database equipment. Selanjutnya pilih atau buat assignment AM.`,
                  );
                })
              }
            >
              {busy
                ? "Menyimpan…"
                : `Daftarkan DT ${row.dtNo || "baru"} ke equipment`}
            </button>
          </div>
        )}
        {aa && (
          <>
            <label>
              <span>Assignment AM / source yang sudah ada</span>
              <select
                aria-label="Assignment tersedia untuk DT"
                value={assignmentId}
                disabled={busy}
                onChange={(e) => setAssignmentId(e.target.value)}
              >
                <option value="">
                  Pilih assignment untuk tanggal / shift / crusher ini
                </option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn small"
              disabled={busy}
              onClick={() => {
                onApply(rowWithEquipment(row, aa));
                onClose();
              }}
            >
              Hubungkan equipment saja, assignment nanti
            </button>
            <fieldset
              disabled={busy || !canCreate}
              className="orevision-new-assignment"
            >
              <legend>Buat assignment operasional dari laporan foto</legend>
              <div className="form-grid">
                <label>
                  <span>Alat Muat (AM)</span>
                  <select
                    aria-label="Alat Muat (AM)"
                    value={amId}
                    onChange={(e) => setAmId(e.target.value)}
                  >
                    <option value="">Pilih AM vendor ini</option>
                    {fleet
                      .filter((e) => e.type === "AM")
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.unitNo} · {e.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>Source / blok Limestone</span>
                  <select
                    aria-label="Source assignment foto"
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                  >
                    <option value="">Pilih source</option>
                    {usableSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                        {s.block ? ` · ${s.block}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Mulai (opsional)</span>
                  <input
                    aria-label="Mulai assignment foto"
                    type="time"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                  />
                </label>
                <label>
                  <span>Selesai (opsional)</span>
                  <input
                    aria-label="Selesai assignment foto"
                    type="time"
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                  />
                </label>
              </div>
              <p>
                Waktu kosong berlaku satu shift. Jika DT sudah memiliki route
                pada waktu yang sama, pilih assignment existing; route tidak
                ditimpa otomatis.
              </p>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  !canCreate ||
                  !draft.reportDate ||
                  !draft.shiftCode ||
                  !amId ||
                  !sourceId ||
                  Boolean(validFrom) !== Boolean(validTo)
                }
                onClick={() =>
                  void perform(async () => {
                    const result = await createOperationalAssignment({
                      vendorId,
                      operationDate: draft.reportDate!,
                      shiftCode: draft.shiftCode!,
                      crusherId,
                      amId,
                      sourceId,
                      aaIds: [aa.id],
                      validFrom: validFrom || null,
                      validTo: validTo || null,
                      note: `Mapping laporan foto · DT ${row.dtNo}`,
                    });
                    const assignment = result.item.aa.find(
                      (e) => e.aaId === aa.id,
                    );
                    if (!assignment)
                      throw new Error(
                        "Assignment tersimpan tetapi DT belum ditemukan. Muat ulang daftar assignment.",
                      );
                    await onRefresh();
                    saveMapping(assignment.assignmentAaId);
                  })
                }
              >
                {busy ? "Menyimpan…" : "Buat assignment & gunakan"}
              </button>
            </fieldset>
          </>
        )}
        {!canCreate && (
          <p className="photo-help">
            Operator dapat memilih assignment existing. Penambahan equipment dan
            assignment baru memerlukan QC / supervisor.
          </p>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
      </div>
    </Modal>
  );
}
