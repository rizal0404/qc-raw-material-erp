import type { CounterContextLookup, CounterContextQuery, OperationalAssignmentInput, OperationalAssignmentListQuery, RecordRetaseEventRequest, RetaseEvent, ReverseRetaseEventRequest, ShiftCode, UpdateOperationalAssignmentRequest } from '@qc/contracts';
import type { AuthPrincipal, AssignmentAaResolutionRecord, CounterAssignmentRecord, MasterRepository, OperationalAssignmentWriteRecord, RetaseEventRecord, RetaseEventRepository, ShiftRecord } from '@qc/domain';
import { assignmentActiveAtLocalMinute, assignmentInterval, businessContextAt, COUNTER_TIMEZONE, OPERATOR_UNDO_WINDOW_MS } from '@qc/domain';
import { AppError, forbidden, notFound } from '../../lib/errors';

function sameContext(a:{operationDate:string;shiftCode:string},b:{operationDate:string;shiftCode:string}){return a.operationDate===b.operationDate&&a.shiftCode===b.shiftCode;}
function iso(d:Date|null){return d?d.toISOString():null;}
function clean(value:string|undefined|null){const x=value?.trim();return x||null;}
function idempotencyConflict(){return new AppError(409,'IDEMPOTENCY_KEY_REUSED','request_id sudah digunakan untuk logical event yang berbeda.');}
function overlaps(a:[number,number],b:[number,number]){return a[0]<b[1]&&b[0]<a[1];}

export function createRetaseService(repository:RetaseEventRepository,master:MasterRepository,options?:{now?:()=>Date;undoWindowMs?:number}){
  const now=options?.now??(()=>new Date());
  const undoWindowMs=options?.undoWindowMs??OPERATOR_UNDO_WINDOW_MS;

  async function shifts():Promise<ShiftRecord[]>{
    const values=await master.listShifts(true);if(!values.length)throw new AppError(500,'SHIFT_MASTER_EMPTY','Shift master belum dikonfigurasi.');return values;
  }
  async function contextAtNow(){return businessContextAt(now(),await shifts(),COUNTER_TIMEZONE);}
  async function shiftByCode(code:ShiftCode){const found=(await shifts()).find(s=>s.code===code);if(!found)throw new AppError(400,'SHIFT_NOT_FOUND','Shift tidak ditemukan/aktif.');return found;}
  async function crusher(principal:AuthPrincipal,crusherId:string){
    const value=await master.findCrusherById(crusherId);if(!value||!value.active)throw notFound('Crusher tidak ditemukan/aktif.');
    if(principal.role==='CRUSHER_OPERATOR'&&!principal.crusherIds.includes(crusherId))throw forbidden('Crusher berada di luar scope operator.');
    return value;
  }
  function effectiveConfigVendor(principal:AuthPrincipal,requested?:string){if(principal.role==='VENDOR'){if(!principal.vendorId)throw forbidden('User vendor tidak memiliki vendor scope.');if(requested&&requested!==principal.vendorId)throw forbidden('Vendor berada di luar scope user.');return principal.vendorId;}if(!['QC_ANALYST','SUPERVISOR_ADMIN'].includes(principal.role))throw forbidden();if(!requested)throw new AppError(400,'VENDOR_REQUIRED','vendorId wajib dipilih.');return requested;}
  function assignmentDto(a:CounterAssignmentRecord,activeNow:boolean){return {...a,updatedAt:a.updatedAt.toISOString(),activeNow,aa:a.aa.map(x=>({...x,lastEventAt:iso(x.lastEventAt)}))};}
  function assertCounterRole(principal:AuthPrincipal){if(!['CRUSHER_OPERATOR','SUPERVISOR_ADMIN'].includes(principal.role))throw forbidden();}
  async function assertLive(principal:AuthPrincipal,input:{operationDate:string;shiftCode:ShiftCode;crusherId:string}){
    assertCounterRole(principal);await crusher(principal,input.crusherId);const current=await contextAtNow();
    if(!sameContext(current,input))throw new AppError(409,'COUNTER_CONTEXT_NOT_CURRENT',`Counter hanya menerima event pada business context aktif ${current.operationDate} ${current.shiftCode}.`,{currentOperationDate:current.operationDate,currentShiftCode:current.shiftCode});
    return current;
  }
  async function activeResolution(candidate:AssignmentAaResolutionRecord,localMinute:number){
    const shift=await shiftByCode(candidate.shiftCode);return assignmentActiveAtLocalMinute(candidate.validFrom,candidate.validTo,shift,localMinute);
  }
  function eventDto(event:RetaseEventRecord,canReverse=false):RetaseEvent{
    return {
      id:event.id,requestId:event.requestId,operationDate:event.operationDate,eventTs:event.eventTs.toISOString(),shiftCode:event.shiftCode,crusherId:event.crusherId,crusherCode:event.crusherCode,crusherName:event.crusherName,
      vendorId:event.vendorId,vendorName:event.vendorName??event.vendorNameSnapshot,reportId:event.reportId,reportVersion:event.reportVersion,assignmentId:event.assignmentId,assignmentAaId:event.assignmentAaId,assignmentOrigin:event.assignmentOrigin,
      amId:event.amId,amUnitNo:event.amUnitNoSnapshot,aaId:event.aaId,aaUnitNo:event.aaUnitNoSnapshot,sourceId:event.sourceId,sourceCode:event.sourceCode,pileId:event.pileId,pileCode:event.pileCode,pileName:event.pileName,blockSnapshot:event.blockSnapshot,
      materialKind:event.materialKind,materialCategory:event.materialCategory,delta:event.delta,eventType:event.eventType,status:event.status,createdBy:event.createdBy,createdByName:event.createdByName,
      reversesEventId:event.reversesEventId,reason:event.reason,clientTs:iso(event.clientTs),canReverse,
    };
  }
  function assertRecordIdempotency(existing:RetaseEventRecord,principal:AuthPrincipal,input:RecordRetaseEventRequest){
    if(existing.createdBy!==principal.userId||existing.operationDate!==input.operationDate||existing.shiftCode!==input.shiftCode||existing.crusherId!==input.crusherId||existing.eventType!=='DUMP')throw idempotencyConflict();
    if(input.assignmentAaId&&existing.assignmentAaId!==input.assignmentAaId)throw idempotencyConflict();
    if(input.aaId&&existing.aaId!==input.aaId)throw idempotencyConflict();
    if(input.unlistedUnitNo&&existing.aaUnitNoSnapshot&&existing.aaUnitNoSnapshot.trim().toUpperCase()!==input.unlistedUnitNo.trim().toUpperCase())throw idempotencyConflict();
  }
  function assertReverseIdempotency(existing:RetaseEventRecord,principal:AuthPrincipal,eventId:string){
    if(existing.createdBy!==principal.userId||existing.eventType!=='REVERSAL'||existing.reversesEventId!==eventId)throw idempotencyConflict();
  }

  function writeFromResolution(input:RecordRetaseEventRequest,principal:AuthPrincipal,resolution:AssignmentAaResolutionRecord|null,status:'VALID'|'EXCEPTION_UNASSIGNED'|'AMBIGUOUS',manual:{vendorId:string|null;vendorName:string|null;aaId:string|null;aaUnitNo:string|null}){
    return {
      requestId:input.requestId,operationDate:input.operationDate,shiftCode:input.shiftCode,crusherId:input.crusherId,
      vendorId:resolution?.vendorId??manual.vendorId,reportId:resolution?.reportId??null,reportVersion:resolution?.reportVersion??null,assignmentId:resolution?.assignmentId??null,assignmentAaId:resolution?.assignmentAaId??null,assignmentOrigin:resolution?.assignmentOrigin??null,
      amId:resolution?.amId??null,aaId:resolution?.aaId??manual.aaId,sourceId:resolution?.sourceId??null,pileId:resolution?.pileId??null,blockSnapshot:resolution?.blockSnapshot??null,materialKind:resolution?.materialKind??null,materialCategory:resolution?.materialCategory??null,
      vendorNameSnapshot:resolution?.vendorName??manual.vendorName,amUnitNoSnapshot:resolution?.amUnitNo??null,aaUnitNoSnapshot:resolution?.aaUnitNo??manual.aaUnitNo,
      delta:1 as const,eventType:'DUMP' as const,status,createdBy:principal.userId,reversesEventId:null,reason:clean(input.reason),clientTs:input.clientTs?new Date(input.clientTs):null,
    };
  }

  async function prepareOperational(principal:AuthPrincipal,input:OperationalAssignmentInput|({vendorId?:string|undefined;operationDate:string;shiftCode:ShiftCode}&UpdateOperationalAssignmentRequest),excludeId?:string):Promise<OperationalAssignmentWriteRecord>{
    const vendorId=effectiveConfigVendor(principal,input.vendorId);const [vendor,am,source,c,pile,shift]=await Promise.all([master.findVendorById(vendorId),master.findEquipmentById(input.amId),input.sourceId?master.findSourceById(input.sourceId):Promise.resolve(null),master.findCrusherById(input.crusherId),input.pileId?master.findPileById(input.pileId):Promise.resolve(null),shiftByCode(input.shiftCode)]);
    if(!vendor||!vendor.active)throw notFound('Vendor tidak ditemukan/aktif.');if(!am||!am.active||am.type!=='AM')throw new AppError(400,'INVALID_AM','AM tidak ditemukan/aktif.');if(am.vendorId!==vendorId)throw new AppError(400,'EQUIPMENT_VENDOR_MISMATCH','AM bukan milik vendor yang dipilih.');if(!c||!c.active)throw new AppError(400,'INVALID_CRUSHER','Crusher tidak ditemukan/aktif.');
    if(source&&(!source.active||source.materialKind!==c.materialKind))throw new AppError(400,'SOURCE_MATERIAL_MISMATCH','Source tidak aktif atau berbeda material dengan crusher.');if(!source&&c.materialKind!=='CL')throw new AppError(400,'SOURCE_REQUIRED','Assignment tanpa Source hanya diizinkan untuk Clay.');
    if(input.pileId&&!pile)throw new AppError(400,'INVALID_PILE','Pile tidak ditemukan.');if(pile&&(!pile.active||pile.materialKind!==c.materialKind))throw new AppError(400,'PILE_MATERIAL_MISMATCH','Pile tidak aktif atau berbeda material dengan crusher.');if(pile&&pile.plantId&&c.plantId&&pile.plantId!==c.plantId)throw new AppError(400,'PILE_PLANT_MISMATCH','Pile dan crusher berada pada plant berbeda.');
    const aaIds=[...new Set(input.aaIds)];for(const aaId of aaIds){const aa=await master.findEquipmentById(aaId);if(!aa||!aa.active||aa.type!=='AA')throw new AppError(400,'INVALID_AA','AA tidak ditemukan/aktif.');if(aa.vendorId!==vendorId)throw new AppError(400,'EQUIPMENT_VENDOR_MISMATCH',`AA ${aa.unitNo} bukan milik vendor yang dipilih.`);const candidates=await repository.listAssignmentCandidatesForAa({operationDate:input.operationDate,shiftCode:input.shiftCode,crusherId:input.crusherId,aaId});const wanted=assignmentInterval({validFrom:input.validFrom??null,validTo:input.validTo??null},shift);if(candidates.some(x=>x.assignmentId!==excludeId&&overlaps(wanted,assignmentInterval({validFrom:x.validFrom,validTo:x.validTo},shift))))throw new AppError(409,'AA_ROUTE_OVERLAP',`AA ${aa.unitNo} sudah memiliki route aktif yang overlap pada crusher yang sama.`);}
    assignmentInterval({validFrom:input.validFrom??null,validTo:input.validTo??null},shift);
    return {operationDate:input.operationDate,shiftCode:input.shiftCode,vendorId,amId:input.amId,sourceId:source?.id??null,crusherId:c.id,pileId:pile?.id??null,blockSnapshot:clean(input.blockSnapshot)??source?.block??null,materialKind:c.materialKind,materialCategory:source?.materialCategory??clean(input.materialCategory)??'CLAY',validFrom:input.validFrom??null,validTo:input.validTo??null,note:clean(input.note),aaIds};
  }

  return {
    async getContext(principal:AuthPrincipal,lookup:CounterContextLookup){
      assertCounterRole(principal);const c=await crusher(principal,lookup.crusherId);const current=await contextAtNow();
      const requested={operationDate:lookup.operationDate??current.operationDate,shiftCode:lookup.shiftCode??current.shiftCode,crusherId:lookup.crusherId};
      await shiftByCode(requested.shiftCode);
      const [assignments,submittedReportCount]=await Promise.all([repository.listCounterAssignments(requested),repository.countEffectiveSubmittedReports(requested)]);
      return {timezone:COUNTER_TIMEZONE,current:{operationDate:current.operationDate,shiftCode:current.shiftCode,localDate:current.localDate,localTime:current.localTime},requested,canRecord:sameContext(current,requested),crusher:{id:c.id,code:c.code,name:c.name,materialKind:c.materialKind},submittedReportCount,operationalAssignmentCount:assignments.filter(x=>x.assignmentOrigin==='OPERATIONAL').length,assignmentCount:assignments.length};
    },

    async getAssignments(principal:AuthPrincipal,input:CounterContextQuery){
      assertCounterRole(principal);await crusher(principal,input.crusherId);const current=await contextAtNow();const shift=await shiftByCode(input.shiftCode);
      const items=await repository.listCounterAssignments(input);
      return items.map(a=>assignmentDto(a,a.status==='ACTIVE'&&sameContext(current,input)&&assignmentActiveAtLocalMinute(a.validFrom,a.validTo,shift,current.localMinute)));
    },

    async listOperational(principal:AuthPrincipal,query:OperationalAssignmentListQuery){const vendorId=effectiveConfigVendor(principal,query.vendorId);const current=await contextAtNow();const shift=await shiftByCode(query.shiftCode);const items=await repository.listOperationalAssignments({operationDate:query.operationDate,shiftCode:query.shiftCode,vendorId,...(query.crusherId?{crusherId:query.crusherId}:{}),...(query.status?{status:query.status}:{})});return items.map(a=>assignmentDto(a,a.status==='ACTIVE'&&sameContext(current,query)&&assignmentActiveAtLocalMinute(a.validFrom,a.validTo,shift,current.localMinute)));},
    async createOperational(principal:AuthPrincipal,input:OperationalAssignmentInput,requestId?:string){const prepared=await prepareOperational(principal,input);const created=await repository.createOperationalAssignment(prepared,principal.userId);await repository.appendAudit({actorUserId:principal.userId,actorRoleSnapshot:principal.role,action:'OPERATIONAL_ASSIGNMENT_CREATED',entityType:'LOADING_ASSIGNMENT',entityId:created.id,afterJson:created,requestId});const current=await contextAtNow();const shift=await shiftByCode(created.shiftCode);return assignmentDto(created,sameContext(current,created)&&assignmentActiveAtLocalMinute(created.validFrom,created.validTo,shift,current.localMinute));},
    async updateOperational(principal:AuthPrincipal,id:string,input:UpdateOperationalAssignmentRequest,requestId?:string){const before=await repository.getOperationalAssignment(id);if(!before)throw notFound('Operational assignment tidak ditemukan.');effectiveConfigVendor(principal,before.vendorId);if(before.status!=='ACTIVE')throw new AppError(409,'ASSIGNMENT_NOT_ACTIVE','Hanya assignment ACTIVE yang dapat diubah.');const prepared=await prepareOperational(principal,{...input,vendorId:before.vendorId,operationDate:before.operationDate,shiftCode:before.shiftCode},id);const {operationDate:_date,shiftCode:_shift,vendorId:_vendor,...patch}=prepared;const updated=await repository.updateOperationalAssignment(id,patch,principal.userId);await repository.appendAudit({actorUserId:principal.userId,actorRoleSnapshot:principal.role,action:'OPERATIONAL_ASSIGNMENT_UPDATED',entityType:'LOADING_ASSIGNMENT',entityId:id,beforeJson:before,afterJson:updated,requestId});const current=await contextAtNow();const shift=await shiftByCode(updated.shiftCode);return assignmentDto(updated,sameContext(current,updated)&&assignmentActiveAtLocalMinute(updated.validFrom,updated.validTo,shift,current.localMinute));},
    async cancelOperational(principal:AuthPrincipal,id:string,reason:string,requestId?:string){const before=await repository.getOperationalAssignment(id);if(!before)throw notFound('Operational assignment tidak ditemukan.');effectiveConfigVendor(principal,before.vendorId);const updated=await repository.cancelOperationalAssignment(id,principal.userId);await repository.appendAudit({actorUserId:principal.userId,actorRoleSnapshot:principal.role,action:'OPERATIONAL_ASSIGNMENT_CANCELLED',entityType:'LOADING_ASSIGNMENT',entityId:id,beforeJson:before,afterJson:updated,reason,requestId});return assignmentDto(updated,false);},

    async record(principal:AuthPrincipal,input:RecordRetaseEventRequest){
      const existing=await repository.findByRequestId(input.requestId);if(existing){assertRecordIdempotency(existing,principal,input);return {item:eventDto(existing,false),idempotent:true};}
      const current=await assertLive(principal,input);let resolution:AssignmentAaResolutionRecord|null=null;let status:'VALID'|'EXCEPTION_UNASSIGNED'|'AMBIGUOUS'='VALID';
      let manual={vendorId:null as string|null,vendorName:null as string|null,aaId:null as string|null,aaUnitNo:clean(input.unlistedUnitNo)};

      if(input.assignmentAaId){
        const found=await repository.getAssignmentAaById(input.assignmentAaId);if(!found)throw notFound('Assignment AA tidak ditemukan pada effective submitted report.');
        if(found.operationDate!==input.operationDate||found.shiftCode!==input.shiftCode||found.crusherId!==input.crusherId)throw new AppError(409,'ASSIGNMENT_CONTEXT_MISMATCH','Assignment AA tidak sesuai date/shift/crusher counter.');
        if(!(await activeResolution(found,current.localMinute)))throw new AppError(409,'ASSIGNMENT_NOT_ACTIVE','Assignment AA tidak aktif pada waktu dump saat ini.');
        resolution=found;
      }else{
        let aaId=input.aaId??null;
        if(input.vendorId){const v=await master.findVendorById(input.vendorId);if(!v||!v.active)throw notFound('Vendor Unlisted AA tidak ditemukan/aktif.');manual.vendorId=v.id;manual.vendorName=v.name;}
        if(aaId){const aa=await master.findEquipmentById(aaId);if(!aa||!aa.active||aa.type!=='AA')throw notFound('AA tidak ditemukan/aktif.');if(manual.vendorId&&aa.vendorId!==manual.vendorId)throw new AppError(400,'AA_VENDOR_MISMATCH','AA tidak dimiliki vendor yang dipilih.');manual={vendorId:aa.vendorId,vendorName:aa.vendorName,aaId:aa.id,aaUnitNo:aa.unitNo};}
        else if(manual.vendorId&&manual.aaUnitNo){const aa=await master.findEquipmentByBusinessKey(manual.vendorId,'AA',manual.aaUnitNo);if(aa&&aa.active){aaId=aa.id;manual={vendorId:aa.vendorId,vendorName:aa.vendorName,aaId:aa.id,aaUnitNo:aa.unitNo};}}
        if(aaId){
          const candidates=await repository.listAssignmentCandidatesForAa({...input,aaId});const active:AssignmentAaResolutionRecord[]=[];
          for(const candidate of candidates)if(await activeResolution(candidate,current.localMinute))active.push(candidate);
          if(active.length===1){resolution=active[0]!;status='VALID';}
          else if(active.length>1)status='AMBIGUOUS';else status='EXCEPTION_UNASSIGNED';
        }else status='EXCEPTION_UNASSIGNED';
      }

      try{
        const created=await repository.appendEvent(writeFromResolution(input,principal,resolution,status,manual));return {item:eventDto(created,false),idempotent:false};
      }catch(error){
        // Concurrent retry can hit request_id UNIQUE after the first transaction commits.
        const raced=await repository.findByRequestId(input.requestId);if(raced){assertRecordIdempotency(raced,principal,input);return {item:eventDto(raced,false),idempotent:true};}throw error;
      }
    },

    async reverse(principal:AuthPrincipal,eventId:string,input:ReverseRetaseEventRequest){
      const existing=await repository.findByRequestId(input.requestId);if(existing){assertReverseIdempotency(existing,principal,eventId);return {item:eventDto(existing,false),idempotent:true};}
      const original=await repository.getEventById(eventId);if(!original)throw notFound('Retase event tidak ditemukan.');
      if(original.eventType!=='DUMP'||original.delta!==1)throw new AppError(409,'EVENT_NOT_REVERSIBLE','Hanya DUMP +1 yang dapat direversal.');
      if(original.status==='REVERSED')throw new AppError(409,'EVENT_ALREADY_REVERSED','Retase event sudah direversal.');
      await crusher(principal,original.crusherId);
      const consumption=await repository.getEventConsumption(original.id);
      if(consumption&&principal.role==='CRUSHER_OPERATOR')throw new AppError(409,'RETASE_EVENT_CONSUMED',`Event sudah dipakai oleh Mix ${consumption.mixCode??consumption.mixId} dan tidak dapat di-Undo oleh operator.`);
      if(principal.role==='CRUSHER_OPERATOR'){
        const current=await assertLive(principal,original);
        if(original.createdBy!==principal.userId)throw forbidden('Operator hanya dapat Undo event miliknya sendiri.');
        const latest=await repository.findLatestReversibleByActor({operationDate:original.operationDate,shiftCode:original.shiftCode,crusherId:original.crusherId,actorUserId:principal.userId});
        if(!latest||latest.id!==original.id)throw new AppError(409,'UNDO_LAST_ONLY','Operator hanya dapat Undo event terakhir miliknya.');
        if(current && now().getTime()-original.eventTs.getTime()>undoWindowMs)throw new AppError(409,'UNDO_WINDOW_EXPIRED',`Batas Undo operator adalah ${Math.round(undoWindowMs/60000)} menit.`);
      }else if(principal.role!=='SUPERVISOR_ADMIN')throw forbidden();
      const reversal={...original,requestId:input.requestId,delta:-1 as const,eventType:'REVERSAL' as const,status:'VALID' as const,createdBy:principal.userId,reversesEventId:original.id,reason:input.reason.trim(),clientTs:null};
      const created=await repository.reverseEvent({originalEventId:original.id,reversal});return {item:eventDto(created,false),idempotent:false};
    },

    async list(principal:AuthPrincipal,query:{operationDate:string;shiftCode:ShiftCode;crusherId:string;vendorId?:string | undefined;aaId?:string | undefined;limit:number;offset:number}){
      await crusher(principal,query.crusherId);if(!['CRUSHER_OPERATOR','QC_ANALYST','SUPERVISOR_ADMIN'].includes(principal.role))throw forbidden();
      const result=await repository.listEvents(query);let latestId:string|null=null;const current=await contextAtNow();
      if(principal.role==='CRUSHER_OPERATOR'&&sameContext(current,query)){latestId=(await repository.findLatestReversibleByActor({operationDate:query.operationDate,shiftCode:query.shiftCode,crusherId:query.crusherId,actorUserId:principal.userId}))?.id??null;}
      const nowMs=now().getTime();return {items:result.items.map(e=>eventDto(e,principal.role==='SUPERVISOR_ADMIN'?(e.eventType==='DUMP'&&e.status!=='REVERSED'):(principal.role==='CRUSHER_OPERATOR'&&e.id===latestId&&nowMs-e.eventTs.getTime()<=undoWindowMs))),total:result.total};
    },

    async summary(principal:AuthPrincipal,input:CounterContextQuery){await crusher(principal,input.crusherId);if(!['CRUSHER_OPERATOR','QC_ANALYST','SUPERVISOR_ADMIN'].includes(principal.role))throw forbidden();return repository.getSummary(input);},
  };
}

export type RetaseService=ReturnType<typeof createRetaseService>;
