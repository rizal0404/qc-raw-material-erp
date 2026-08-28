import { and, asc, count, desc, eq, ne, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { ShiftReportStatus } from '@qc/contracts';
import type { LoadingAssignmentRecord, ShiftReportWriteRecord, VendorShiftReportRecord, VendorShiftReportRepository } from '@qc/domain';
import type * as Schema from '../schema/index';
import {
  auditLogs, crushers, equipment, loadingAssignmentAas, loadingAssignments, piles, sources, users, vendorShiftReports, vendors,
} from '../schema/index';

function fleet(prefix: 'am'|'aa', row: any) {
  return {
    total: Number(row[`${prefix}Total`] ?? 0),
    operating: Number(row[`${prefix}Operating`] ?? 0),
    standby: Number(row[`${prefix}Standby`] ?? 0),
    breakdown: Number(row[`${prefix}Breakdown`] ?? 0),
    repair: Number(row[`${prefix}Repair`] ?? 0),
    other: Number(row[`${prefix}Other`] ?? 0),
  };
}

function reportValues(input: ShiftReportWriteRecord, actorUserId: string) {
  return {
    operationDate: input.operationDate,
    shiftCode: input.shiftCode,
    vendorId: input.vendorId,
    materialKind: input.materialKind,
    amTotal: input.am.total,
    amOperating: input.am.operating,
    amStandby: input.am.standby,
    amBreakdown: input.am.breakdown,
    amRepair: input.am.repair,
    amOther: input.am.other,
    aaTotal: input.aa.total,
    aaOperating: input.aa.operating,
    aaStandby: input.aa.standby,
    aaBreakdown: input.aa.breakdown,
    aaRepair: input.aa.repair,
    aaOther: input.aa.other,
    note: input.note,
    updatedBy: actorUserId,
  };
}

export function createVendorOperationRepository(db: PostgresJsDatabase<typeof Schema>): VendorShiftReportRepository {
  async function assignmentsForReport(reportId: string): Promise<LoadingAssignmentRecord[]> {
    const rows = await db.select({
      id: loadingAssignments.id,
      reportId: loadingAssignments.reportId,
      operationDate: loadingAssignments.operationDate,
      shiftCode: loadingAssignments.shiftCode,
      vendorId: loadingAssignments.vendorId,
      amId: loadingAssignments.amId,
      amUnitNo: equipment.unitNo,
      amBrand: equipment.brand,
      amModel: equipment.model,
      sourceId: loadingAssignments.sourceId,
      sourceCode: sources.code,
      sourceName: sources.name,
      blockSnapshot: loadingAssignments.blockSnapshot,
      materialCategory: loadingAssignments.materialCategory,
      materialKind: loadingAssignments.materialKind,
      crusherId: loadingAssignments.crusherId,
      crusherCode: crushers.code,
      crusherName: crushers.name,
      pileId: loadingAssignments.pileId,
      pileCode: piles.code,
      pileName: piles.name,
      validFrom: loadingAssignments.validFrom,
      validTo: loadingAssignments.validTo,
      status: loadingAssignments.status,
      note: loadingAssignments.note,
    }).from(loadingAssignments)
      .innerJoin(equipment, eq(equipment.id, loadingAssignments.amId))
      .innerJoin(sources, eq(sources.id, loadingAssignments.sourceId))
      .leftJoin(crushers, eq(crushers.id, loadingAssignments.crusherId))
      .leftJoin(piles, eq(piles.id, loadingAssignments.pileId))
      .where(eq(loadingAssignments.reportId, reportId))
      .orderBy(asc(loadingAssignments.createdAt));

    if (!rows.length) return [];
    const assignmentIds = rows.map(r => r.id);
    const aaRows = await db.select({
      assignmentId: loadingAssignmentAas.assignmentId,
      assignmentAaId: loadingAssignmentAas.id,
      id: equipment.id,
      unitNo: equipment.unitNo,
      brand: equipment.brand,
      model: equipment.model,
    }).from(loadingAssignmentAas)
      .innerJoin(equipment, eq(equipment.id, loadingAssignmentAas.aaId))
      .where(sql`${loadingAssignmentAas.assignmentId} IN (${sql.join(assignmentIds.map(id=>sql`${id}::uuid`), sql`,`)})`)
      .orderBy(asc(equipment.unitNo));

    const aaMap = new Map<string, typeof aaRows>();
    for (const aa of aaRows) {
      const list = aaMap.get(aa.assignmentId) ?? [];
      list.push(aa);
      aaMap.set(aa.assignmentId, list);
    }
    return rows.map(r => ({
      ...r,
      reportId: r.reportId!,
      shiftCode: r.shiftCode as LoadingAssignmentRecord['shiftCode'],
      status: r.status as LoadingAssignmentRecord['status'],
      sourceId: r.sourceId!,
      validFrom: r.validFrom?.slice(0,5) ?? null,
      validTo: r.validTo?.slice(0,5) ?? null,
      aa: (aaMap.get(r.id) ?? []).map(x=>({ id:x.id, assignmentAaId:x.assignmentAaId, unitNo:x.unitNo, brand:x.brand, model:x.model })),
    }));
  }

  async function reportById(id: string): Promise<VendorShiftReportRecord | null> {
    const [row] = await db.select({
      id: vendorShiftReports.id,
      operationDate: vendorShiftReports.operationDate,
      shiftCode: vendorShiftReports.shiftCode,
      vendorId: vendorShiftReports.vendorId,
      vendorCode: vendors.code,
      vendorName: vendors.name,
      materialKind: vendorShiftReports.materialKind,
      version: vendorShiftReports.version,
      status: vendorShiftReports.status,
      amTotal: vendorShiftReports.amTotal,
      amOperating: vendorShiftReports.amOperating,
      amStandby: vendorShiftReports.amStandby,
      amBreakdown: vendorShiftReports.amBreakdown,
      amRepair: vendorShiftReports.amRepair,
      amOther: vendorShiftReports.amOther,
      aaTotal: vendorShiftReports.aaTotal,
      aaOperating: vendorShiftReports.aaOperating,
      aaStandby: vendorShiftReports.aaStandby,
      aaBreakdown: vendorShiftReports.aaBreakdown,
      aaRepair: vendorShiftReports.aaRepair,
      aaOther: vendorShiftReports.aaOther,
      note: vendorShiftReports.note,
      revisionReason: vendorShiftReports.revisionReason,
      revisesReportId: vendorShiftReports.revisesReportId,
      submittedAt: vendorShiftReports.submittedAt,
      submittedBy: vendorShiftReports.submittedBy,
      createdBy: vendorShiftReports.createdBy,
      createdByName: users.displayName,
      createdAt: vendorShiftReports.createdAt,
      updatedAt: vendorShiftReports.updatedAt,
    }).from(vendorShiftReports)
      .innerJoin(vendors, eq(vendors.id, vendorShiftReports.vendorId))
      .innerJoin(users, eq(users.id, vendorShiftReports.createdBy))
      .where(eq(vendorShiftReports.id, id)).limit(1);
    if (!row) return null;
    let submittedByName: string | null = null;
    if (row.submittedBy) {
      const [u] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, row.submittedBy)).limit(1);
      submittedByName = u?.displayName ?? null;
    }
    return {
      id: row.id,
      operationDate: row.operationDate,
      shiftCode: row.shiftCode as VendorShiftReportRecord['shiftCode'],
      vendorId: row.vendorId,
      vendorCode: row.vendorCode,
      vendorName: row.vendorName,
      materialKind: row.materialKind,
      version: row.version,
      status: row.status as ShiftReportStatus,
      am: fleet('am', row),
      aa: fleet('aa', row),
      note: row.note,
      revisionReason: row.revisionReason,
      revisesReportId: row.revisesReportId,
      submittedAt: row.submittedAt,
      submittedBy: row.submittedBy,
      submittedByName,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      assignments: await assignmentsForReport(row.id),
    };
  }

  async function insertAssignments(tx: any, reportId: string, input: ShiftReportWriteRecord, actorUserId: string) {
    for (const assignment of input.assignments) {
      const [created] = await tx.insert(loadingAssignments).values({
        reportId,
        operationDate: input.operationDate,
        shiftCode: input.shiftCode,
        vendorId: input.vendorId,
        amId: assignment.amId,
        sourceId: assignment.sourceId,
        blockSnapshot: assignment.blockSnapshot,
        materialCategory: assignment.materialCategory,
        materialKind: assignment.materialKind,
        crusherId: assignment.crusherId,
        pileId: assignment.pileId,
        validFrom: assignment.validFrom,
        validTo: assignment.validTo,
        status: 'ACTIVE',
        note: assignment.note,
        assignmentOrigin: 'SHIFT_REPORT',
        createdBy: actorUserId,
        updatedBy: actorUserId,
      }).returning({ id: loadingAssignments.id });
      if (!created) throw new Error('Gagal membuat loading assignment.');
      if (assignment.aaIds.length) {
        await tx.insert(loadingAssignmentAas).values(assignment.aaIds.map(aaId=>({
          assignmentId: created.id,
          aaId,
          materialKind: assignment.materialKind,
          validFrom: assignment.validFrom,
          validTo: assignment.validTo,
          active: true,
        })));
      }
    }
  }

  async function findIdByStatus(input: {vendorId:string;operationDate:string;shiftCode:string;materialKind:'LS'|'CL';status:'DRAFT'|'SUBMITTED'}) {
    const [row] = await db.select({ id: vendorShiftReports.id }).from(vendorShiftReports)
      .where(and(
        eq(vendorShiftReports.vendorId,input.vendorId),
        eq(vendorShiftReports.operationDate,input.operationDate),
        eq(vendorShiftReports.shiftCode,input.shiftCode),
        eq(vendorShiftReports.materialKind,input.materialKind),
        eq(vendorShiftReports.status,input.status),
      )).orderBy(desc(vendorShiftReports.version)).limit(1);
    return row?.id ?? null;
  }

  return {
    async getCurrent(input) {
      const draftId = await findIdByStatus({...input,status:'DRAFT'});
      if (draftId) return reportById(draftId);
      const submittedId = await findIdByStatus({...input,status:'SUBMITTED'});
      return submittedId ? reportById(submittedId) : null;
    },

    async getEffectiveSubmitted(input) {
      const submittedId = await findIdByStatus({...input,status:'SUBMITTED'});
      return submittedId ? reportById(submittedId) : null;
    },

    getById: reportById,

    async list(filter) {
      const where = and(
        filter.vendorId ? eq(vendorShiftReports.vendorId, filter.vendorId) : undefined,
        filter.operationDate ? eq(vendorShiftReports.operationDate, filter.operationDate) : undefined,
        filter.shiftCode ? eq(vendorShiftReports.shiftCode, filter.shiftCode) : undefined,
        filter.status ? eq(vendorShiftReports.status, filter.status) : undefined,
        filter.materialKind ? eq(vendorShiftReports.materialKind,filter.materialKind) : undefined,
      );
      const [ids,totalRows] = await Promise.all([
        db.select({id:vendorShiftReports.id}).from(vendorShiftReports).where(where)
          .orderBy(desc(vendorShiftReports.operationDate),asc(vendorShiftReports.shiftCode),desc(vendorShiftReports.version))
          .limit(filter.limit).offset(filter.offset),
        db.select({value:count()}).from(vendorShiftReports).where(where),
      ]);
      const items = (await Promise.all(ids.map(x=>reportById(x.id)))).filter((x):x is VendorShiftReportRecord=>!!x);
      return { items, total:Number(totalRows[0]?.value ?? 0) };
    },

    async createDraft(input, actorUserId, revisesReportId=null, revisionReason=null) {
      const reportId = await db.transaction(async tx => {
        const [maxRow] = await tx.select({ maxVersion: sql<number>`coalesce(max(${vendorShiftReports.version}),0)` })
          .from(vendorShiftReports)
          .where(and(eq(vendorShiftReports.vendorId,input.vendorId),eq(vendorShiftReports.operationDate,input.operationDate),eq(vendorShiftReports.shiftCode,input.shiftCode),eq(vendorShiftReports.materialKind,input.materialKind)));
        const version = Number(maxRow?.maxVersion ?? 0) + 1;
        const [created] = await tx.insert(vendorShiftReports).values({
          ...reportValues(input,actorUserId),
          version,
          status:'DRAFT',
          revisionReason,
          revisesReportId,
          createdBy:actorUserId,
          updatedBy:actorUserId,
        }).returning({id:vendorShiftReports.id});
        if (!created) throw new Error('Gagal membuat draft shift report.');
        await insertAssignments(tx,created.id,input,actorUserId);
        return created.id;
      });
      const report = await reportById(reportId);
      if (!report) throw new Error('Draft tersimpan tetapi gagal direload.');
      return report;
    },

    async replaceDraft(reportId, input, actorUserId) {
      await db.transaction(async tx => {
        const locked = await tx.execute(sql`SELECT id,status,operation_date,shift_code,vendor_id,material_kind FROM vendor_shift_reports WHERE id=${reportId}::uuid FOR UPDATE`);
        const row = (locked as unknown as Array<any>)[0];
        if (!row || row.status !== 'DRAFT') throw new Error('Hanya report DRAFT yang dapat diubah.');
        await tx.update(vendorShiftReports).set({
          amTotal:input.am.total,amOperating:input.am.operating,amStandby:input.am.standby,amBreakdown:input.am.breakdown,amRepair:input.am.repair,amOther:input.am.other,
          aaTotal:input.aa.total,aaOperating:input.aa.operating,aaStandby:input.aa.standby,aaBreakdown:input.aa.breakdown,aaRepair:input.aa.repair,aaOther:input.aa.other,
          note:input.note,updatedBy:actorUserId,
        }).where(eq(vendorShiftReports.id,reportId));
        await tx.delete(loadingAssignments).where(eq(loadingAssignments.reportId,reportId));
        await insertAssignments(tx,reportId,{
          operationDate:String(row.operation_date),shiftCode:String(row.shift_code) as any,vendorId:String(row.vendor_id),materialKind:String(row.material_kind) as 'LS'|'CL',
          ...input,
        },actorUserId);
      });
      const report = await reportById(reportId);
      if (!report) throw new Error('Draft berhasil diupdate tetapi gagal direload.');
      return report;
    },

    async submit(reportId, actorUserId) {
      await db.transaction(async tx => {
        const locked = await tx.execute(sql`SELECT id,status,operation_date,shift_code,vendor_id,material_kind FROM vendor_shift_reports WHERE id=${reportId}::uuid FOR UPDATE`);
        const row = (locked as unknown as Array<any>)[0];
        if (!row || row.status !== 'DRAFT') throw new Error('Hanya report DRAFT yang dapat disubmit.');
        const now = new Date();
        await tx.update(vendorShiftReports).set({ status:'SUPERSEDED',supersededAt:now,supersededBy:actorUserId,updatedBy:actorUserId })
          .where(and(
            eq(vendorShiftReports.vendorId,String(row.vendor_id)),
            eq(vendorShiftReports.operationDate,String(row.operation_date)),
            eq(vendorShiftReports.shiftCode,String(row.shift_code)),
            eq(vendorShiftReports.materialKind,String(row.material_kind) as 'LS'|'CL'),
            eq(vendorShiftReports.status,'SUBMITTED'),
            ne(vendorShiftReports.id,reportId),
          ));
        await tx.update(vendorShiftReports).set({ status:'SUBMITTED',submittedAt:now,submittedBy:actorUserId,updatedBy:actorUserId })
          .where(eq(vendorShiftReports.id,reportId));
      });
      const report = await reportById(reportId);
      if (!report) throw new Error('Report berhasil disubmit tetapi gagal direload.');
      return report;
    },

    async createRevision(reportId, actorUserId, reason) {
      const newId = await db.transaction(async tx => {
        const locked = await tx.execute(sql`SELECT * FROM vendor_shift_reports WHERE id=${reportId}::uuid FOR UPDATE`);
        const old = (locked as unknown as Array<any>)[0];
        if (!old || old.status !== 'SUBMITTED') throw new Error('Revision hanya dapat dibuat dari report SUBMITTED aktif.');
        const [existingDraft] = await tx.select({id:vendorShiftReports.id}).from(vendorShiftReports).where(and(
          eq(vendorShiftReports.vendorId,String(old.vendor_id)),eq(vendorShiftReports.operationDate,String(old.operation_date)),eq(vendorShiftReports.shiftCode,String(old.shift_code)),eq(vendorShiftReports.materialKind,String(old.material_kind) as 'LS'|'CL'),eq(vendorShiftReports.status,'DRAFT'),
        )).limit(1);
        if (existingDraft) throw new Error('Sudah ada draft revision untuk vendor/tanggal/shift ini.');

        const [maxRow] = await tx.select({ maxVersion: sql<number>`coalesce(max(${vendorShiftReports.version}),0)` }).from(vendorShiftReports)
          .where(and(eq(vendorShiftReports.vendorId,String(old.vendor_id)),eq(vendorShiftReports.operationDate,String(old.operation_date)),eq(vendorShiftReports.shiftCode,String(old.shift_code)),eq(vendorShiftReports.materialKind,String(old.material_kind) as 'LS'|'CL')));
        const [created] = await tx.insert(vendorShiftReports).values({
          operationDate:String(old.operation_date),shiftCode:String(old.shift_code),vendorId:String(old.vendor_id),materialKind:String(old.material_kind) as 'LS'|'CL',version:Number(maxRow?.maxVersion??old.version)+1,status:'DRAFT',
          amTotal:Number(old.am_total),amOperating:Number(old.am_operating),amStandby:Number(old.am_standby),amBreakdown:Number(old.am_breakdown),amRepair:Number(old.am_repair),amOther:Number(old.am_other),
          aaTotal:Number(old.aa_total),aaOperating:Number(old.aa_operating),aaStandby:Number(old.aa_standby),aaBreakdown:Number(old.aa_breakdown),aaRepair:Number(old.aa_repair),aaOther:Number(old.aa_other),
          note:old.note ? String(old.note) : null,revisionReason:reason,revisesReportId:reportId,createdBy:actorUserId,updatedBy:actorUserId,
        }).returning({id:vendorShiftReports.id});
        if(!created)throw new Error('Gagal membuat draft revision.');

        const oldAssignments = await tx.select().from(loadingAssignments).where(eq(loadingAssignments.reportId,reportId)).orderBy(asc(loadingAssignments.createdAt));
        for(const a of oldAssignments){
          const [copy]=await tx.insert(loadingAssignments).values({
            reportId:created.id,operationDate:a.operationDate,shiftCode:a.shiftCode,vendorId:a.vendorId,amId:a.amId,sourceId:a.sourceId,blockSnapshot:a.blockSnapshot,
            materialCategory:a.materialCategory,materialKind:a.materialKind,crusherId:a.crusherId,pileId:a.pileId,validFrom:a.validFrom,validTo:a.validTo,status:'ACTIVE',note:a.note,
            assignmentOrigin:'SHIFT_REPORT',createdBy:actorUserId,updatedBy:actorUserId,
          }).returning({id:loadingAssignments.id});
          if(!copy)throw new Error('Gagal menyalin assignment revision.');
          const aas=await tx.select().from(loadingAssignmentAas).where(and(eq(loadingAssignmentAas.assignmentId,a.id),eq(loadingAssignmentAas.active,true)));
          if(aas.length)await tx.insert(loadingAssignmentAas).values(aas.map(x=>({assignmentId:copy.id,aaId:x.aaId,materialKind:a.materialKind,validFrom:x.validFrom,validTo:x.validTo,active:true,note:x.note})));
        }
        return created.id;
      });
      const report=await reportById(newId);
      if(!report)throw new Error('Revision dibuat tetapi gagal direload.');
      return report;
    },

    async appendAudit(input) {
      await db.insert(auditLogs).values({
        actorUserId:input.actorUserId,
        actorRoleSnapshot:input.actorRoleSnapshot??null,
        action:input.action,
        entityType:input.entityType,
        entityId:input.entityId,
        beforeJson:input.beforeJson,
        afterJson:input.afterJson,
        reason:input.reason??null,
        requestId:input.requestId,
      });
    },
  };
}
