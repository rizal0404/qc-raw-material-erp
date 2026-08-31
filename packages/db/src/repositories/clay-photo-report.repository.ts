import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ClayPhotoReportRepository } from "@qc/domain";
import { clayReportHourDayOffset } from "@qc/domain";
import { OreVisionDiagnosticsSchema } from "@qc/contracts";
import type {
  ClayPhotoReportImport,
  CrusherReportObservation,
} from "@qc/contracts";
import type * as Schema from "../schema/index";

type Row = Record<string, any>;
const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const iso = (value: unknown) =>
  value == null ? null : new Date(String(value)).toISOString();

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
    ].flatMap((key) =>
      changes(
        (before as Row)[key],
        (after as Row)[key],
        path ? `${path}.${key}` : key,
      ),
    );
  return [{ path, before: before ?? null, after: after ?? null }];
}

export function createClayPhotoReportRepository(
  db: PostgresJsDatabase<typeof Schema>,
): ClayPhotoReportRepository {
  const rows = async (query: ReturnType<typeof sql>) =>
    (await db.execute(query)) as unknown as Row[];

  async function get(id: string): Promise<ClayPhotoReportImport | null> {
    const [row] = await rows(sql`
      SELECT i.*,f.aligned_bytes IS NOT NULL AS has_aligned
      FROM clay_report_imports i
      LEFT JOIN clay_report_import_files f ON f.import_id=i.id
      WHERE i.id=${id}::uuid
    `);
    if (!row) return null;
    const observationRows = await rows(sql`
      SELECT observation
      FROM clay_report_import_observations
      WHERE import_id=${id}::uuid
        AND parser_run=(
          SELECT max(parser_run)
          FROM clay_report_import_observations
          WHERE import_id=${id}::uuid
        )
      ORDER BY field_path
    `);
    // The immutable parser evidence is separate from the reviewed draft.
    // Missing legacy or malformed diagnostic metadata must not block review.
    const diagnostics = OreVisionDiagnosticsSchema.safeParse(
      row.parsed_json?.diagnostics,
    );
    return {
      id: row.id,
      crusherId: row.crusher_id,
      fileName: row.file_name,
      sha256: row.sha256,
      status: row.status,
      revision: row.revision,
      createdAt: iso(row.created_at)!,
      confirmedAt: iso(row.confirmed_at),
      parserVersion: row.parser_version,
      templateVersion: row.template_version,
      draft: row.draft_json,
      observations: observationRows.map(
        (entry) => entry.observation as CrusherReportObservation,
      ),
      issues: row.issues_json ?? [],
      error: row.error,
      hasAlignedImage: row.has_aligned,
      reportId: row.report_id ?? null,
      diagnostics: diagnostics.success ? diagnostics.data : null,
    };
  }

  async function file(id: string, aligned: boolean) {
    const [row] = await rows(sql`
      SELECT mime_type,${aligned ? sql`aligned_bytes` : sql`source_bytes`} AS bytes
      FROM clay_report_import_files
      WHERE import_id=${id}::uuid
    `);
    return row?.bytes
      ? {
          bytes: Buffer.from(row.bytes),
          mimeType: aligned ? "image/jpeg" : String(row.mime_type),
        }
      : null;
  }

  return {
    transaction: (work) =>
      db.transaction((tx) => work(createClayPhotoReportRepository(tx))),
    async lock(id) {
      await rows(
        sql`SELECT id FROM clay_report_imports WHERE id=${id}::uuid FOR UPDATE`,
      );
    },
    async lockContext(input) {
      await rows(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${`clay-photo:${input.operationDate}:${input.shiftCode}:${input.crusherId}`},
            0
          )
        )
      `);
    },
    get,
    async list(crusherId) {
      const items = await rows(sql`
        SELECT id,crusher_id,file_name,sha256,status,revision,created_at,
               confirmed_at,parser_version,template_version,error,report_id
        FROM clay_report_imports
        WHERE crusher_id=${crusherId}::uuid
        ORDER BY created_at DESC
        LIMIT 30
      `);
      return items.map((row) => ({
        id: row.id,
        crusherId: row.crusher_id,
        fileName: row.file_name,
        sha256: row.sha256,
        status: row.status,
        revision: row.revision,
        createdAt: iso(row.created_at)!,
        confirmedAt: iso(row.confirmed_at),
        parserVersion: row.parser_version,
        templateVersion: row.template_version,
        draft: null,
        observations: [],
        issues: [],
        error: row.error,
        hasAlignedImage: false,
        reportId: row.report_id ?? null,
      }));
    },
    async create(input) {
      return db.transaction(async (tx) => {
        const inserted = (await tx.execute(sql`
          INSERT INTO clay_report_imports(
            crusher_id,file_name,sha256,created_by
          )
          VALUES(
            ${input.crusherId}::uuid,${input.fileName},${input.sha256},
            ${input.actorId}::uuid
          )
          ON CONFLICT(crusher_id,sha256) DO NOTHING
          RETURNING id
        `)) as unknown as Row[];
        const [existing] = inserted[0]
          ? inserted
          : ((await tx.execute(sql`
              SELECT id FROM clay_report_imports
              WHERE crusher_id=${input.crusherId}::uuid
                AND sha256=${input.sha256}
            `)) as unknown as Row[]);
        if (!existing) throw new Error("Import hash conflict tidak ditemukan.");
        const id = String(existing.id);
        await tx.execute(sql`
          INSERT INTO clay_report_import_files(
            import_id,mime_type,source_bytes
          )
          VALUES(${id}::uuid,${input.mimeType},${input.bytes})
          ON CONFLICT(import_id) DO NOTHING
        `);
        return id;
      });
    },
    file,
    async deleteUnconfirmed(id, actor) {
      const [target] = await rows(sql`
        SELECT id,crusher_id,file_name,sha256,status,revision,created_at
        FROM clay_report_imports
        WHERE id=${id}::uuid
          AND status<>'CONFIRMED'
          AND report_id IS NULL
        FOR UPDATE
      `);
      if (!target) return false;
      const deleted = await rows(sql`
        DELETE FROM clay_report_imports
        WHERE id=${id}::uuid AND status<>'CONFIRMED' AND report_id IS NULL
        RETURNING id
      `);
      if (!deleted[0]) return false;
      await rows(sql`
        INSERT INTO audit_logs(
          actor_user_id,actor_role_snapshot,action,entity_type,entity_id,
          before_json,reason
        )
        VALUES(
          ${actor.userId}::uuid,${actor.role},'CLAY_REPORT_IMPORT_DELETED',
          'CLAY_REPORT_IMPORT',${id},${json({
            crusherId: target.crusher_id,
            fileName: target.file_name,
            sha256: target.sha256,
            status: target.status,
            revision: target.revision,
            createdAt: iso(target.created_at),
          })},
          'Pembersihan file dan data laporan foto Clay yang belum diverifikasi'
        )
      `);
      return true;
    },
    async saveDraft(id, draft, issues, actor) {
      const before = await get(id);
      if (!before) throw new Error("Import not found");
      for (const correction of changes(before.draft, draft))
        await rows(sql`
          INSERT INTO clay_report_import_corrections(
            import_id,revision,field_path,predicted_value,corrected_value,
            created_by
          )
          VALUES(
            ${id}::uuid,${before.revision + 1},${correction.path},
            ${json(correction.before)},${json(correction.after)},
            ${actor.userId}::uuid
          )
        `);
      await rows(sql`
        UPDATE clay_report_imports
        SET draft_json=${json(draft)},
            issues_json=${json(issues)},
            revision=revision+1,
            status=${
              issues.some((issue) => issue.severity === "BLOCKING")
                ? "NEEDS_REVIEW"
                : "READY"
            }
        WHERE id=${id}::uuid
      `);
    },
    async target(input) {
      const [row] = await rows(sql`
        SELECT
          r.id,
          r.status,
          (SELECT count(*)::int FROM clay_report_columns c WHERE c.report_id=r.id) AS column_count,
          (SELECT count(*)::int FROM clay_report_operation_logs l WHERE l.report_id=r.id) AS log_count,
          (SELECT count(*)::int FROM retase_events e WHERE e.clay_report_id=r.id) AS retase_count
        FROM clay_shift_reports r
        WHERE r.operation_date=${input.operationDate}::date
          AND r.shift_code=${input.shiftCode}
          AND r.crusher_id=${input.crusherId}::uuid
          AND r.status<>'SUPERSEDED'
        LIMIT 1
      `);
      return row
        ? {
            reportId: String(row.id),
            status: String(row.status),
            columnCount: Number(row.column_count),
            logCount: Number(row.log_count),
            retaseCount: Number(row.retase_count),
          }
        : {
            reportId: null,
            status: null,
            columnCount: 0,
            logCount: 0,
            retaseCount: 0,
          };
    },
    async confirm({ item, actor, draft }) {
      const target = await this.target({
        crusherId: item.crusherId,
        operationDate: draft.operationDate!,
        shiftCode: draft.shiftCode!,
      });
      const reportId = target.reportId ?? randomUUID();
      if (!target.reportId)
        await rows(sql`
          INSERT INTO clay_shift_reports(
            id,operation_date,shift_code,material_kind,crusher_id,status,
            operator_user_id,operator_name_snapshot,created_by,updated_by
          )
          VALUES(
            ${reportId}::uuid,${draft.operationDate}::date,${draft.shiftCode},
            'CL',${item.crusherId}::uuid,'DRAFT',NULL,
            ${draft.header.operatorName},${actor.userId}::uuid,
            ${actor.userId}::uuid
          )
        `);
      await rows(sql`
        UPDATE clay_shift_reports
        SET operator_user_id=NULL,
            operator_name_snapshot=${draft.header.operatorName},
            production_tonnage=${draft.production.productionTonnage},
            running_minutes=${draft.production.runningMinutes},
            total_running_minutes=${draft.production.totalRunningMinutes},
            capacity_tph=${draft.production.capacityTph},
            stock_percent=${draft.production.stockPercent},
            pickup_location=${draft.operation.pickupLocation},
            weather=${draft.operation.weather},
            pile_filling=${draft.operation.pileFilling},
            sm=${draft.chemistry.sm},
            sio2=${draft.chemistry.sio2},
            h2o=${draft.chemistry.h2o},
            attendance_present=${draft.attendance.present},
            attendance_sick=${draft.attendance.sick},
            attendance_overtime=${draft.attendance.overtime},
            attendance_permission=${draft.attendance.permission},
            attendance_leave=${draft.attendance.leave},
            note=${draft.note},
            updated_by=${actor.userId}::uuid,
            updated_at=now()
        WHERE id=${reportId}::uuid
      `);
      for (const column of draft.columns) {
        const columnId = randomUUID();
        const sourceSnapshot =
          column.sourceNameSnapshot ??
          [column.headerPrimary, column.headerSecondary]
            .filter(Boolean)
            .join(" / ");
        await rows(sql`
          INSERT INTO clay_report_columns(
            id,report_id,material_kind,display_order,vendor_id,source_id,
            pile_id,vendor_name_snapshot,source_name_snapshot,header_primary,
            header_secondary,input_mode,status,ton_per_retase_snapshot,
            created_by,updated_by
          )
          VALUES(
            ${columnId}::uuid,${reportId}::uuid,'CL',${column.displayOrder},
            ${column.vendorId}::uuid,${column.sourceId}::uuid,
            ${column.pileId}::uuid,${column.vendorNameSnapshot},
            ${sourceSnapshot},${column.headerPrimary},
            ${column.headerSecondary},${column.inputMode},'CONFIRMED',
            ${column.tonPerRetaseSnapshot},${actor.userId}::uuid,
            ${actor.userId}::uuid
          )
        `);
        for (const cell of column.hourly) {
          if (!cell.retase) continue;
          const hour = String(cell.hour).padStart(2, "0");
          const dayOffset = clayReportHourDayOffset(
            draft.hours,
            cell.hour,
          );
          await rows(sql`
            INSERT INTO retase_events(
              request_id,operation_date,event_ts,shift_code,crusher_id,
              vendor_id,clay_report_id,clay_report_column_id,entry_source,
              entry_batch_id,source_id,pile_id,material_kind,
              material_category,vendor_name_snapshot,source_name_snapshot,
              delta,event_type,status,created_by,reason
            )
            SELECT
              gen_random_uuid(),${draft.operationDate}::date,
              (
                ${draft.operationDate}::date + ${dayOffset}::int
                + make_interval(hours => ${cell.hour})
              ) AT TIME ZONE 'Asia/Makassar',
              ${draft.shiftCode},${item.crusherId}::uuid,
              ${column.vendorId}::uuid,${reportId}::uuid,${columnId}::uuid,
              'IMPORT',${item.id}::uuid,${column.sourceId}::uuid,
              ${column.pileId}::uuid,'CL','CLAY',
              ${column.vendorNameSnapshot},${sourceSnapshot},1,'DUMP','VALID',
              ${actor.userId}::uuid,
              ${`Foto Clay ${item.id}; ${column.headerPrimary} / jam ${hour}:00`}
            FROM generate_series(1,${cell.retase}::int)
          `);
        }
      }
      for (const log of draft.operationLogs) {
        const hasTimePair = Boolean(log.startTime && log.endTime);
        await rows(sql`
          INSERT INTO clay_report_operation_logs(
            report_id,display_order,start_time,end_time,category,description,
            created_by
          )
          VALUES(
            ${reportId}::uuid,${log.displayOrder},
            ${hasTimePair ? log.startTime : null}::time,
            ${hasTimePair ? log.endTime : null}::time,
            ${log.category},${log.description},
            ${actor.userId}::uuid
          )
        `);
      }
      await rows(sql`
        UPDATE clay_report_imports
        SET status='CONFIRMED',
            confirmed_by=${actor.userId}::uuid,
            confirmed_at=now(),
            report_id=${reportId}::uuid,
            revision=revision+1
        WHERE id=${item.id}::uuid
      `);
      await rows(sql`
        INSERT INTO audit_logs(
          actor_user_id,actor_role_snapshot,action,entity_type,entity_id,
          after_json
        )
        VALUES(
          ${actor.userId}::uuid,${actor.role},'CLAY_REPORT_IMPORT_CONFIRMED',
          'CLAY_SHIFT_REPORT',${reportId}::uuid,${json({
            importId: item.id,
            reportId,
            totalRetase: draft.columns.reduce(
              (total, column) =>
                total +
                column.hourly.reduce(
                  (columnTotal, cell) => columnTotal + (cell.retase ?? 0),
                  0,
                ),
              0,
            ),
          })}
        )
      `);
      return reportId;
    },
    async claim(id) {
      await rows(sql`
        UPDATE clay_report_imports
        SET status='QUEUED',
            error='Proses ekstraksi sebelumnya terputus; permintaan ini mengambil alih dengan aman.',
            lease_token=NULL
        WHERE id=${id}::uuid
          AND status='PROCESSING'
          AND started_at<now()-interval '5 minutes'
      `);
      const [row] = await rows(sql`
        UPDATE clay_report_imports
        SET status='PROCESSING',started_at=now(),lease_token=gen_random_uuid(),
            error=NULL,parsed_json=NULL
        WHERE id=${id}::uuid AND status='QUEUED'
        RETURNING id,lease_token
      `);
      if (!row) return null;
      const source = await file(row.id, false);
      if (!source) throw new Error("Source image missing");
      return {
        id: row.id,
        leaseToken: row.lease_token,
        bytes: source.bytes,
      };
    },
    async finish(id, leaseToken, result, aligned) {
      await db.transaction(async (tx) => {
        const updated = (await tx.execute(sql`
          UPDATE clay_report_imports
          SET status='NEEDS_REVIEW',
              parsed_json=${json(result)},
              draft_json=${json(result.draft)},
              issues_json=${json(result.issues)},
              parser_version=${result.parserVersion},
              template_version=${result.templateVersion},
              completed_at=now(),
              lease_token=NULL,
              revision=revision+1
          WHERE id=${id}::uuid
            AND status='PROCESSING'
            AND lease_token=${leaseToken}::uuid
          RETURNING revision
        `)) as unknown as Row[];
        const [row] = updated;
        if (!row) return;
        for (const observation of result.observations)
          await tx.execute(sql`
            INSERT INTO clay_report_import_observations(
              import_id,parser_run,field_path,observation
            )
            VALUES(
              ${id}::uuid,${row.revision},${observation.fieldPath},
              ${json(observation)}
            )
          `);
        await tx.execute(sql`
          UPDATE clay_report_import_files
          SET aligned_bytes=${aligned}
          WHERE import_id=${id}::uuid
        `);
      });
    },
    async fail(id, leaseToken, message, diagnostics) {
      const parsed = diagnostics
        ? json({ diagnostics: OreVisionDiagnosticsSchema.parse(diagnostics) })
        : sql`NULL`;
      await rows(sql`
        UPDATE clay_report_imports
        SET status='FAILED',error=${message},parsed_json=${parsed},lease_token=NULL,
            completed_at=now(),revision=revision+1
        WHERE id=${id}::uuid
          AND lease_token=${leaseToken}::uuid
          AND status='PROCESSING'
      `);
    },
    async requeue(id) {
      await rows(sql`
        UPDATE clay_report_imports
        SET status='QUEUED',error=NULL,parsed_json=NULL,lease_token=NULL,revision=revision+1
        WHERE id=${id}::uuid AND status='FAILED'
      `);
    },
  };
}
