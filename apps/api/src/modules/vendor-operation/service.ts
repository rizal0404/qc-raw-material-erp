import type {
  CreateShiftReportRequest, ShiftAssignmentInput, ShiftCode, UpdateShiftReportDraftRequest,
} from '@qc/contracts';
import type {
  AuthPrincipal, MasterRepository, ShiftReportListFilter, ShiftReportWriteRecord, VendorShiftReportRepository,
} from '@qc/domain';
import { assignmentInterval, findAssignmentConflicts, isFleetBalanced } from '@qc/domain';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors';

function clean(value: string | null | undefined): string | null {
  const x=value?.trim(); return x ? x : null;
}

export function createVendorOperationService(repository: VendorShiftReportRepository, master: MasterRepository) {
  function effectiveVendor(principal: AuthPrincipal, requested?: string): string {
    if (principal.role === 'VENDOR') {
      if (!principal.vendorId) throw forbidden('User vendor tidak memiliki vendor scope.');
      if (requested && requested !== principal.vendorId) throw forbidden('Vendor berada di luar scope user.');
      return principal.vendorId;
    }
    if (principal.role === 'SUPERVISOR_ADMIN' || principal.role === 'QC_ANALYST') {
      if (!requested) throw new AppError(400,'VENDOR_REQUIRED','vendorId wajib untuk user non-vendor.');
      return requested;
    }
    throw forbidden();
  }

  function assertWriteRole(principal: AuthPrincipal) {
    if (!['VENDOR','SUPERVISOR_ADMIN'].includes(principal.role)) throw forbidden('Role ini hanya dapat melihat shift report.');
  }

  async function shiftRecord(shiftCode: ShiftCode) {
    const shift=(await master.listShifts(true)).find(x=>x.code===shiftCode);
    if(!shift)throw new AppError(400,'INVALID_SHIFT','Shift tidak aktif atau tidak ditemukan.');
    return shift;
  }

  async function validateVendor(vendorId:string,materialKind:'LS'|'CL') {
    const vendor=await master.findVendorById(vendorId);
    if(!vendor)throw notFound('Vendor tidak ditemukan.');
    if(!vendor.active)throw new AppError(400,'INACTIVE_REFERENCE',`Vendor ${vendor.name} sedang INACTIVE.`);
    if(!vendor.materialKinds.includes(materialKind))throw new AppError(400,'MATERIAL_SCOPE_MISMATCH',`Vendor tidak tersedia untuk ${materialKind}.`);
    return vendor;
  }

  async function enrichAssignments(vendorId:string, materialKind:'LS'|'CL', shiftCode:ShiftCode, assignments:ShiftAssignmentInput[]) {
    const shift=await shiftRecord(shiftCode);
    const result: ShiftReportWriteRecord['assignments']=[];
    for(let index=0;index<assignments.length;index+=1){
      const a=assignments[index]!;
      const [am,source,crusher,pile]=await Promise.all([
        master.findEquipmentById(a.amId),master.findSourceById(a.sourceId),master.findCrusherById(a.crusherId),a.pileId?master.findPileById(a.pileId):Promise.resolve(null),
      ]);
      if(!am||am.type!=='AM')throw new AppError(400,'INVALID_AM',`Assignment #${index+1}: AM tidak valid.`);
      if(am.vendorId!==vendorId)throw new AppError(400,'EQUIPMENT_VENDOR_MISMATCH',`Assignment #${index+1}: AM bukan milik vendor report.`);
      if(!am.active)throw new AppError(400,'INACTIVE_REFERENCE',`Assignment #${index+1}: AM ${am.unitNo} sedang INACTIVE.`);
      if(!am.materialKinds.includes(materialKind))throw new AppError(400,'MATERIAL_SCOPE_MISMATCH',`Assignment #${index+1}: AM bukan equipment ${materialKind}.`);
      if(!source)throw new AppError(400,'INVALID_SOURCE',`Assignment #${index+1}: Source tidak ditemukan.`);
      if(!source.active)throw new AppError(400,'INACTIVE_REFERENCE',`Assignment #${index+1}: Source ${source.name} sedang INACTIVE.`);
      if(source.materialKind!==materialKind)throw new AppError(400,'MATERIAL_SCOPE_MISMATCH',`Assignment #${index+1}: Source bukan master ${materialKind}.`);
      if(!crusher)throw new AppError(400,'INVALID_CRUSHER',`Assignment #${index+1}: Crusher tidak ditemukan.`);
      if(!crusher.active)throw new AppError(400,'INACTIVE_REFERENCE',`Assignment #${index+1}: Crusher ${crusher.name} sedang INACTIVE.`);
      if(crusher.materialKind!==source.materialKind)throw new AppError(400,'MATERIAL_CRUSHER_MISMATCH',`Assignment #${index+1}: material ${source.materialKind} tidak sesuai crusher ${crusher.name}.`);
      if(a.pileId&&!pile)throw new AppError(400,'INVALID_PILE',`Assignment #${index+1}: Pile tidak ditemukan.`);
      if(pile&&(!pile.active||pile.materialKind!==source.materialKind))throw new AppError(400,'PILE_MATERIAL_MISMATCH',`Assignment #${index+1}: Pile tidak aktif atau berbeda material.`);
      if(pile&&pile.plantId&&crusher.plantId&&pile.plantId!==crusher.plantId)throw new AppError(400,'PILE_PLANT_MISMATCH',`Assignment #${index+1}: Pile dan crusher berada pada plant berbeda.`);

      const aaIds=Array.from(new Set(a.aaIds));
      for(const aaId of aaIds){
        const aa=await master.findEquipmentById(aaId);
        if(!aa||aa.type!=='AA')throw new AppError(400,'INVALID_AA',`Assignment #${index+1}: AA tidak valid.`);
        if(aa.vendorId!==vendorId)throw new AppError(400,'EQUIPMENT_VENDOR_MISMATCH',`Assignment #${index+1}: AA ${aa.unitNo} bukan milik vendor report.`);
        if(!aa.active)throw new AppError(400,'INACTIVE_REFERENCE',`Assignment #${index+1}: AA ${aa.unitNo} sedang INACTIVE.`);
        if(!aa.materialKinds.includes(materialKind))throw new AppError(400,'MATERIAL_SCOPE_MISMATCH',`Assignment #${index+1}: AA ${aa.unitNo} bukan equipment ${materialKind}.`);
      }

      try{ assignmentInterval(a,shift); }catch(error){ throw new AppError(400,'ASSIGNMENT_TIME_INVALID',error instanceof Error?error.message:'Window assignment tidak valid.'); }
      result.push({
        amId:a.amId,
        sourceId:a.sourceId,
        blockSnapshot:clean(a.blockSnapshot) ?? source.block,
        materialCategory:source.materialCategory,
        materialKind:source.materialKind,
        crusherId:a.crusherId,
        pileId:a.pileId ?? null,
        validFrom:a.validFrom ?? null,
        validTo:a.validTo ?? null,
        note:clean(a.note),
        aaIds,
      });
    }
    const conflicts=findAssignmentConflicts(result.map(x=>({amId:x.amId,crusherId:x.crusherId,aaIds:x.aaIds,validFrom:x.validFrom,validTo:x.validTo})),shift);
    if(conflicts.length){
      const first=conflicts[0]!;
      throw new AppError(409,'ASSIGNMENT_OVERLAP','AA memiliki assignment waktu overlap pada crusher yang sama.',{conflicts});
    }
    return result;
  }

  async function writeRecord(principal:AuthPrincipal, input:CreateShiftReportRequest):Promise<ShiftReportWriteRecord>{
    const vendorId=effectiveVendor(principal,input.vendorId);
    await validateVendor(vendorId,input.materialKind);
    return {
      operationDate:input.operationDate,
      shiftCode:input.shiftCode,
      vendorId,
      materialKind:input.materialKind,
      am:input.am,
      aa:input.aa,
      note:clean(input.note),
      assignments:await enrichAssignments(vendorId,input.materialKind,input.shiftCode,input.assignments),
    };
  }

  async function audit(principal:AuthPrincipal,action:string,entityId:string,before:unknown,after:unknown,reason:string|null|undefined,requestId?:string){
    await repository.appendAudit({
      actorUserId:principal.userId,actorRoleSnapshot:principal.role,action,entityType:'VENDOR_SHIFT_REPORT',entityId,
      beforeJson:before,afterJson:after,reason:clean(reason),requestId,
    });
  }

  function validateSubmit(report: Awaited<ReturnType<VendorShiftReportRepository['getById']>>) {
    if(!report)throw notFound('Shift report tidak ditemukan.');
    if(report.status!=='DRAFT')throw conflict('REPORT_NOT_DRAFT','Hanya report DRAFT yang dapat disubmit.');
    if(!isFleetBalanced(report.am))throw new AppError(400,'AM_SUMMARY_UNBALANCED','Ringkasan AM tidak balance.',{difference:report.am.total-(report.am.operating+report.am.standby+report.am.breakdown+report.am.repair+report.am.other)});
    if(!isFleetBalanced(report.aa))throw new AppError(400,'AA_SUMMARY_UNBALANCED','Ringkasan AA tidak balance.',{difference:report.aa.total-(report.aa.operating+report.aa.standby+report.aa.breakdown+report.aa.repair+report.aa.other)});
    if(!report.assignments.length)throw new AppError(400,'ASSIGNMENT_REQUIRED','Minimal satu loading assignment wajib sebelum Submit.');
    const empty=report.assignments.find((a)=>a.status==='ACTIVE'&&!a.aa.length);
    if(empty)throw new AppError(400,'AA_REQUIRED',`Assignment AM ${empty.amUnitNo} belum memiliki AA.`);
  }

  return {
    async getCurrent(principal:AuthPrincipal,query:{vendorId?:string | undefined;operationDate:string;shiftCode:ShiftCode;materialKind:'LS'|'CL'}){
      const vendorId=effectiveVendor(principal,query.vendorId);
      return repository.getCurrent({vendorId,operationDate:query.operationDate,shiftCode:query.shiftCode,materialKind:query.materialKind});
    },

    async getById(principal:AuthPrincipal,id:string){
      const report=await repository.getById(id);
      if(!report)throw notFound('Shift report tidak ditemukan.');
      effectiveVendor(principal,report.vendorId);
      return report;
    },

    async list(principal:AuthPrincipal,query:{vendorId?:string | undefined;operationDate?:string | undefined;shiftCode?:ShiftCode | undefined;materialKind?:'LS'|'CL'|undefined;status?:any;limit:number;offset:number}){
      let vendorId=query.vendorId;
      if(principal.role==='VENDOR')vendorId=effectiveVendor(principal,query.vendorId);
      else if(!['QC_ANALYST','SUPERVISOR_ADMIN'].includes(principal.role))throw forbidden();
      const filter:ShiftReportListFilter={
        ...(vendorId?{vendorId}:{}),...(query.operationDate?{operationDate:query.operationDate}:{}),...(query.shiftCode?{shiftCode:query.shiftCode}:{}),
        ...(query.status?{status:query.status}:{}),limit:query.limit,offset:query.offset,
        ...(query.materialKind?{materialKind:query.materialKind}:{}),
      };
      return repository.list(filter);
    },

    async createDraft(principal:AuthPrincipal,input:CreateShiftReportRequest,requestId?:string){
      assertWriteRole(principal);
      const data=await writeRecord(principal,input);
      const current=await repository.getCurrent({vendorId:data.vendorId,operationDate:data.operationDate,shiftCode:data.shiftCode,materialKind:data.materialKind});
      if(current?.status==='DRAFT')throw conflict('DRAFT_ALREADY_EXISTS','Draft sudah ada. Load current report lalu edit draft tersebut.');
      if(current?.status==='SUBMITTED')throw conflict('REVISION_REQUIRED','Report sudah SUBMITTED. Gunakan Create Revision untuk perubahan berikutnya.');
      const created=await repository.createDraft(data,principal.userId);
      await audit(principal,'SHIFT_REPORT_DRAFT_CREATED',created.id,null,created,null,requestId);
      return created;
    },

    async updateDraft(principal:AuthPrincipal,id:string,input:UpdateShiftReportDraftRequest,requestId?:string){
      assertWriteRole(principal);
      const before=await repository.getById(id);
      if(!before)throw notFound('Shift report tidak ditemukan.');
      effectiveVendor(principal,before.vendorId);
      if(before.status!=='DRAFT')throw conflict('REPORT_NOT_DRAFT','Hanya report DRAFT yang dapat diubah.');
      const enriched=await enrichAssignments(before.vendorId,before.materialKind,before.shiftCode,input.assignments);
      const updated=await repository.replaceDraft(id,{am:input.am,aa:input.aa,note:clean(input.note),assignments:enriched},principal.userId);
      await audit(principal,'SHIFT_REPORT_DRAFT_UPDATED',id,before,updated,null,requestId);
      return updated;
    },

    async submit(principal:AuthPrincipal,id:string,reason:string|null|undefined,requestId?:string){
      assertWriteRole(principal);
      const before=await repository.getById(id);
      if(!before)throw notFound('Shift report tidak ditemukan.');
      effectiveVendor(principal,before.vendorId);
      validateSubmit(before);
      // Re-run overlap/time checks from persisted snapshots before commit.
      const shift=await shiftRecord(before.shiftCode);
      for(const a of before.assignments) assignmentInterval({validFrom:a.validFrom,validTo:a.validTo} as any,shift);
      const conflicts=findAssignmentConflicts(before.assignments.map(a=>({amId:a.amId,crusherId:a.crusherId,aaIds:a.aa.map(x=>x.id),validFrom:a.validFrom,validTo:a.validTo})),shift);
      if(conflicts.length)throw conflict('ASSIGNMENT_OVERLAP','Assignment overlap harus diperbaiki sebelum Submit.');
      const submitted=await repository.submit(id,principal.userId);
      await audit(principal,'SHIFT_REPORT_SUBMITTED',id,before,submitted,reason,requestId);
      return submitted;
    },

    async createRevision(principal:AuthPrincipal,id:string,reason:string,requestId?:string){
      assertWriteRole(principal);
      const before=await repository.getById(id);
      if(!before)throw notFound('Shift report tidak ditemukan.');
      effectiveVendor(principal,before.vendorId);
      if(before.status!=='SUBMITTED')throw conflict('REPORT_NOT_SUBMITTED','Revision hanya dapat dibuat dari report SUBMITTED aktif.');
      const revision=await repository.createRevision(id,principal.userId,reason);
      await audit(principal,'SHIFT_REPORT_REVISION_CREATED',revision.id,before,revision,reason,requestId);
      return revision;
    },

    async getEffectiveSubmitted(principal:AuthPrincipal,query:{vendorId?:string | undefined;operationDate:string;shiftCode:ShiftCode;materialKind:'LS'|'CL'}){
      const vendorId=effectiveVendor(principal,query.vendorId);
      return repository.getEffectiveSubmitted({vendorId,operationDate:query.operationDate,shiftCode:query.shiftCode,materialKind:query.materialKind});
    },
  };
}

export type VendorOperationService = ReturnType<typeof createVendorOperationService>;
