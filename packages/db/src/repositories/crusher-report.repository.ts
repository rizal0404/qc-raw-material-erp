import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { CrusherReportRepository } from "@qc/domain";
import type {
  CrusherReportDraft,
  CrusherReportImport,
  CrusherReportObservation,
} from "@qc/contracts";
import type * as Schema from "../schema/index";
import { createRetaseRepository } from "./retase.repository";

type Row = Record<string, any>;
const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
const iso = (v: any) => (v ? new Date(v).toISOString() : null);
function changes(
  before: unknown,
  after: unknown,
  path = "",
): Array<{ path: string; before: unknown; after: unknown }> {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object"
  )
    return [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].flatMap((k) =>
      changes((before as Row)[k], (after as Row)[k], path ? `${path}.${k}` : k),
    );
  return [{ path, before: before ?? null, after: after ?? null }];
}
export function createCrusherReportRepository(
  db: PostgresJsDatabase<typeof Schema>,
): CrusherReportRepository {
  const retase = createRetaseRepository(db);
  const rows = async (query: ReturnType<typeof sql>) =>
    (await db.execute(query)) as unknown as Row[];
  async function get(id: string): Promise<CrusherReportImport | null> {
    const [r] = await rows(
      sql`SELECT i.*,r.id AS report_id,f.aligned_bytes IS NOT NULL AS has_aligned FROM crusher_report_imports i LEFT JOIN crusher_report_import_files f ON f.import_id=i.id LEFT JOIN crusher_reports r ON r.import_id=i.id WHERE i.id=${id}::uuid`,
    );
    if (!r) return null;
    const observations = await rows(
      sql`SELECT observation FROM parser_field_observations WHERE import_id=${id}::uuid AND parser_run=(SELECT max(parser_run) FROM parser_field_observations WHERE import_id=${id}::uuid) ORDER BY field_path`,
    );
    // Corrections replace current validation; original evidence stays in parsed_json.
    const issueMap = new Map<string, CrusherReportImport["issues"][number]>(
      (r.issues_json ?? []).map(
        (issue: CrusherReportImport["issues"][number]) => [
          `${issue.code}:${issue.path}`,
          issue,
        ],
      ),
    );
    return {
      id: r.id,
      crusherId: r.crusher_id,
      fileName: r.file_name,
      sha256: r.sha256,
      status: r.status,
      revision: r.revision,
      createdAt: iso(r.created_at)!,
      confirmedAt: iso(r.confirmed_at),
      parserVersion: r.parser_version,
      templateVersion: r.template_version,
      draft: r.draft_json,
      issues: [...issueMap.values()],
      observations: observations.map(
        (x) => x.observation as CrusherReportObservation,
      ),
      error: r.error,
      hasAlignedImage: r.has_aligned,
      reportId: r.report_id ?? null,
    };
  }
  return {
    transaction: (work) =>
      db.transaction((tx) => work(createCrusherReportRepository(tx))),
    async lock(id) {
      await rows(
        sql`SELECT id FROM crusher_report_imports WHERE id=${id}::uuid FOR UPDATE`,
      );
    },
    get,
    async list(crusherId) {
      const items = await rows(
        sql`SELECT i.*,r.id AS report_id FROM crusher_report_imports i LEFT JOIN crusher_reports r ON r.import_id=i.id WHERE i.crusher_id=${crusherId}::uuid ORDER BY i.created_at DESC LIMIT 30`,
      );
      return items.map((r) => ({
        id: r.id,
        crusherId: r.crusher_id,
        fileName: r.file_name,
        sha256: r.sha256,
        status: r.status,
        revision: r.revision,
        createdAt: iso(r.created_at)!,
        confirmedAt: iso(r.confirmed_at),
        parserVersion: r.parser_version,
        templateVersion: r.template_version,
        draft: null,
        issues: [],
        observations: [],
        error: r.error,
        hasAlignedImage: false,
        reportId: r.report_id ?? null,
      }));
    },
    async create(input) {
      return db.transaction(async (tx) => {
        const result = (await tx.execute(
          sql`INSERT INTO crusher_report_imports(crusher_id,file_name,sha256,created_by) VALUES(${input.crusherId}::uuid,${input.fileName},${input.sha256},${input.actorId}::uuid) ON CONFLICT(crusher_id,sha256) DO NOTHING RETURNING id`,
        )) as unknown as Row[];
        let id: string;
        if (!result[0]) {
          const [existing] = (await tx.execute(
            sql`SELECT id FROM crusher_report_imports WHERE crusher_id=${input.crusherId}::uuid AND sha256=${input.sha256}`,
          )) as unknown as Row[];
          if (!existing) throw new Error("Import hash conflict tidak ditemukan.");
          id = String(existing.id);
        } else {
          id = String(result[0].id);
        }
        await tx.execute(
          sql`INSERT INTO crusher_report_import_files(import_id,mime_type,source_bytes)
              VALUES(${id}::uuid,${input.mimeType},${input.bytes})
              ON CONFLICT(import_id) DO NOTHING`,
        );
        return id;
      });
    },
    async file(id, aligned) {
      const [r] = await rows(
        sql`SELECT mime_type,${aligned ? sql`aligned_bytes` : sql`source_bytes`} AS bytes FROM crusher_report_import_files WHERE import_id=${id}::uuid`,
      );
      return r?.bytes
        ? {
            bytes: Buffer.from(r.bytes),
            mimeType: aligned ? "image/jpeg" : r.mime_type,
          }
        : null;
    },
    async deleteUnconfirmed(id, actor) {
      const [target] = await rows(
        sql`SELECT i.id,i.crusher_id,i.file_name,i.sha256,i.status,i.revision,i.created_at
            FROM crusher_report_imports i
            WHERE i.id=${id}::uuid
              AND i.status<>'CONFIRMED'
              AND NOT EXISTS(SELECT 1 FROM crusher_reports r WHERE r.import_id=i.id)
            FOR UPDATE`,
      );
      if (!target) return false;
      await rows(
        sql`DELETE FROM parser_field_observations WHERE import_id=${id}::uuid`,
      );
      await rows(
        sql`DELETE FROM parser_field_corrections WHERE import_id=${id}::uuid`,
      );
      await rows(
        sql`DELETE FROM crusher_report_import_files WHERE import_id=${id}::uuid`,
      );
      const deleted = await rows(
        sql`DELETE FROM crusher_report_imports
            WHERE id=${id}::uuid
              AND status<>'CONFIRMED'
              AND NOT EXISTS(SELECT 1 FROM crusher_reports r WHERE r.import_id=crusher_report_imports.id)
            RETURNING id`,
      );
      if (!deleted[0]) return false;
      await rows(
        sql`INSERT INTO audit_logs(actor_user_id,actor_role_snapshot,action,entity_type,entity_id,before_json,reason)
            VALUES(${actor.userId}::uuid,${actor.role},'CRUSHER_REPORT_IMPORT_DELETED','CRUSHER_REPORT_IMPORT',${id},${json({
              crusherId: target.crusher_id,
              fileName: target.file_name,
              sha256: target.sha256,
              status: target.status,
              revision: target.revision,
              createdAt: iso(target.created_at),
            })},'Pembersihan file dan data laporan foto yang belum diverifikasi')`,
      );
      return true;
    },
    async saveDraft(id, draft, issues, actor) {
      const before = await get(id);
      if (!before) throw new Error("Import not found");
      for (const c of changes(before.draft, draft))
        await rows(
          sql`INSERT INTO parser_field_corrections(import_id,revision,field_path,predicted_value,corrected_value,created_by) VALUES(${id}::uuid,${before.revision + 1},${c.path},${json(c.before)},${json(c.after)},${actor.userId}::uuid)`,
        );
      await rows(
        sql`UPDATE crusher_report_imports SET draft_json=${json(draft)},issues_json=${json(issues)},revision=revision+1,status=${issues.some((x) => x.severity === "BLOCKING") ? "NEEDS_REVIEW" : "READY"} WHERE id=${id}::uuid`,
      );
    },
    candidates: (input) => retase.listCounterAssignments(input),
    resolve: (id, crusher) => retase.getAssignmentAaById(id, crusher),
    async lockAssignments(ids) {
      for (const id of [...new Set(ids)].sort())
        await rows(
          sql`SELECT la.id FROM loading_assignments la JOIN loading_assignment_aas aa ON aa.assignment_id=la.id WHERE aa.id=${id}::uuid FOR UPDATE OF la,aa`,
        );
    },
    async confirm({ item, actor, shiftStart, rows: resolved }) {
      const draft = item.draft!;
      const reportId = randomUUID();
      await rows(
        sql`INSERT INTO crusher_reports(id,import_id,crusher_id,report_date,shift_code,canonical_json,confirmed_by) VALUES(${reportId}::uuid,${item.id}::uuid,${item.crusherId}::uuid,${draft.reportDate}::date,${draft.shiftCode},${json(draft)},${actor.userId}::uuid)`,
      );
      // Lock in a stable order; the trigger uses these same keys for live writes.
      for (const aaId of [
        ...new Set(resolved.map((x) => x.resolution.aaId)),
      ].sort())
        await rows(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${draft.reportDate}:${draft.shiftCode}:${item.crusherId}:${aaId}`},0))`,
        );
      for (const [vi, v] of draft.vendors.entries())
        for (const [ri, row] of v.vehicles.entries()) {
          const rowId = randomUUID(),
            mapping = resolved.find(
              (x) => x.vendorIndex === vi && x.rowIndex === ri,
            )?.resolution;
          await rows(
            sql`INSERT INTO crusher_report_vehicle_rows(id,report_id,block_key,row_index,dt_no,vendor_id,assignment_aa_id,retase) VALUES(${rowId}::uuid,${reportId}::uuid,${v.blockKey},${row.rowIndex},${row.dtNo},${v.vendorId}::uuid,${mapping?.assignmentAaId ?? null}::uuid,${row.retase})`,
          );
          if (!mapping || !row.retase) continue;
          const a = mapping;
          await rows(sql`INSERT INTO retase_events(request_id,operation_date,event_ts,shift_code,crusher_id,vendor_id,report_id,report_version,assignment_id,assignment_aa_id,assignment_origin,entry_source,entry_batch_id,am_id,aa_id,source_id,pile_id,block_snapshot,material_kind,material_category,vendor_name_snapshot,source_name_snapshot,am_unit_no_snapshot,aa_unit_no_snapshot,delta,event_type,status,created_by,reason,crusher_report_row_id)
          SELECT gen_random_uuid(),${draft.reportDate}::date,${`${draft.reportDate}T${shiftStart.slice(0, 5)}:00+08:00`}::timestamptz,${draft.shiftCode},${item.crusherId}::uuid,${a.vendorId}::uuid,${a.reportId}::uuid,${a.reportVersion},${a.assignmentId}::uuid,${a.assignmentAaId}::uuid,${a.assignmentOrigin},'IMPORT',${item.id}::uuid,${a.amId}::uuid,${a.aaId}::uuid,${a.sourceId}::uuid,${a.pileId}::uuid,${a.blockSnapshot},'LS',${a.materialCategory},${a.vendorName},${a.sourceName},${a.amUnitNo},${a.aaUnitNo},1,'DUMP','VALID',${actor.userId}::uuid,${`Foto ${item.id} / ${v.blockKey} baris ${row.rowIndex}; waktu hanya penanda SHIFT, bukan jam dump.`},${rowId}::uuid FROM generate_series(1,${row.retase}::int)`);
        }
      await rows(
        sql`UPDATE crusher_report_imports SET status='CONFIRMED',confirmed_by=${actor.userId}::uuid,confirmed_at=now(),revision=revision+1 WHERE id=${item.id}::uuid`,
      );
      await rows(
        sql`INSERT INTO audit_logs(actor_user_id,actor_role_snapshot,action,entity_type,entity_id,after_json) VALUES(${actor.userId}::uuid,${actor.role},'CRUSHER_REPORT_CONFIRMED','CRUSHER_REPORT',${reportId}::uuid,${json({ importId: item.id, reportId, total: resolved.reduce((n, r) => n + r.retase, 0) })})`,
      );
      return reportId;
    },
    async claim(id) {
      await rows(
        sql`UPDATE crusher_report_imports SET status='QUEUED',error='Proses ekstraksi sebelumnya terputus; permintaan ini mengambil alih dengan aman.',lease_token=NULL WHERE id=${id}::uuid AND status='PROCESSING' AND started_at<now()-interval '5 minutes'`,
      );
      const [r] = await rows(
        sql`UPDATE crusher_report_imports SET status='PROCESSING',started_at=now(),lease_token=gen_random_uuid(),error=NULL WHERE id=${id}::uuid AND status='QUEUED' RETURNING id,lease_token`,
      );
      if (!r) return null;
      const source = await this.file(r.id, false);
      if (!source) throw new Error("Source image missing");
      return { id: r.id, leaseToken: r.lease_token, bytes: source.bytes };
    },
    async finish(id, token, result, aligned) {
      await db.transaction(async (tx) => {
        const [r] = (await tx.execute(
          sql`UPDATE crusher_report_imports SET status='NEEDS_REVIEW',parsed_json=${json(result)},draft_json=${json(result.draft)},issues_json=${json(result.issues)},parser_version=${result.parserVersion},template_version=${result.templateVersion},completed_at=now(),lease_token=NULL,revision=revision+1 WHERE id=${id}::uuid AND status='PROCESSING' AND lease_token=${token}::uuid RETURNING revision`,
        )) as unknown as Row[];
        if (!r) return;
        for (const o of result.observations)
          await tx.execute(
            sql`INSERT INTO parser_field_observations(import_id,parser_run,field_path,observation) VALUES(${id}::uuid,${r.revision},${o.fieldPath},${json(o)})`,
          );
        await tx.execute(
          sql`UPDATE crusher_report_import_files SET aligned_bytes=${aligned} WHERE import_id=${id}::uuid`,
        );
      });
    },
    async fail(id, token, message) {
      await rows(
        sql`UPDATE crusher_report_imports SET status='FAILED',error=${message},lease_token=NULL,completed_at=now(),revision=revision+1 WHERE id=${id}::uuid AND lease_token=${token}::uuid AND status='PROCESSING'`,
      );
    },
    async requeue(id) {
      await rows(
        sql`UPDATE crusher_report_imports SET status='QUEUED',error=NULL,lease_token=NULL,revision=revision+1 WHERE id=${id}::uuid AND status='FAILED'`,
      );
    },
  };
}
