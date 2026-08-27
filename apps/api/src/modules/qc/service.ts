import type {
  Chemistry, CreateRawSampleRequest, ImportRawSamplesRequest, MaterialKind, ReplaceMixRequest, SaveMixRequest, UpdateRawSampleRequest,
} from '@qc/contracts';
import {
  aggregateWeightedChemistry, buildMixCode, calculateQuality, chemistryEquals, qafStatus, qafTargetText, resolveTonPerRetase,
} from '@qc/domain';
import type { AuthPrincipal, MasterRepository, MixSummaryRecord, QcRepository, RawSampleRecord, RawSampleWriteInput, SaveMixRepositoryInput } from '@qc/domain';
import { AppError, conflict, notFound } from '../../lib/errors';

function nullable(value: string | null | undefined): string | null { return value === undefined ? null : value; }
function iso(value: Date): string { return value.toISOString(); }
function sampleJson(row: RawSampleRecord) {
  return { ...row, quality: calculateQuality(row.chemistry), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mixJson(row: Awaited<ReturnType<QcRepository['getMixByCode']>>) {
  if (!row) return null;
  return { ...row, createdAt:iso(row.createdAt), updatedAt:iso(row.updatedAt), items:row.items.map((x)=>x) };
}
function qafAggregation(rows: MixSummaryRecord[]) {
  return aggregateWeightedChemistry(rows.map((r)=>({tonnage:r.totalTon,chemistry:r.chemistry})));
}
function datesOfMonth(month: string) { const [y,m]=month.split('-').map(Number); const days=new Date(Date.UTC(y!,m!,0)).getUTCDate(); return Array.from({length:days},(_,i)=>`${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`); }
function mapRetaseConsumptionError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Retase Allocation tidak ditemukan')) throw notFound(message);
  if (message.includes('harus CONFIRMED')) throw conflict('RETASE_ALLOCATION_NOT_AVAILABLE', message);
  if (message.includes('tidak sesuai Sample_ID')) throw conflict('RETASE_SAMPLE_MISMATCH', message);
  if (message.includes('melebihi mapped/approved')) throw conflict('RETASE_EXCEEDS_APPROVED', message);
  if (message.includes('Reason wajib')) throw new AppError(400, 'RETASE_OVERRIDE_REASON_REQUIRED', message);
  if (message.includes('Retase valid yang belum digunakan tidak cukup')) throw conflict('RETASE_EVENT_NOT_AVAILABLE', message);
  if (message.includes('gagal dialokasikan')) throw conflict('RETASE_ALLOCATION_FAILED', message);
  throw error;
}

export function createQcService(repository: QcRepository, masterRepository: MasterRepository) {
  type SampleReferenceInput = {
    materialKind?: MaterialKind | undefined;
    vendorId?: string | null | undefined;
    vendorSnapshot?: string | null | undefined;
    sourceId?: string | null | undefined;
    sourceSnapshot?: string | null | undefined;
    plantId?: string | null | undefined;
  };
  async function resolveReferences(input: SampleReferenceInput, current?: RawSampleRecord): Promise<Partial<RawSampleWriteInput>> {
    const materialKind=input.materialKind ?? current?.materialKind;
    const out: Partial<RawSampleWriteInput>={};
    if ('vendorId' in input) {
      if (input.vendorId) { const v=await masterRepository.findVendorById(input.vendorId); if(!v)throw notFound('Vendor tidak ditemukan.');if(materialKind&&!v.materialKinds.includes(materialKind))throw new AppError(400,'MATERIAL_SCOPE_MISMATCH','Vendor tidak sesuai material sample.'); out.vendorId=v.id;out.vendorSnapshot=input.vendorSnapshot ?? v.name; }
      else { out.vendorId=null;out.vendorSnapshot=input.vendorSnapshot ?? null; }
    } else if ('vendorSnapshot' in input) out.vendorSnapshot=input.vendorSnapshot ?? null;
    if ('sourceId' in input) {
      if (input.sourceId) { const s=await masterRepository.findSourceById(input.sourceId);if(!s)throw notFound('Source tidak ditemukan.');if(materialKind&&s.materialKind!==materialKind)throw new AppError(400,'MATERIAL_KIND_MISMATCH','Source tidak sesuai material sample.');out.sourceId=s.id;out.sourceSnapshot=input.sourceSnapshot ?? s.name; }
      else {out.sourceId=null;out.sourceSnapshot=input.sourceSnapshot ?? null;}
    } else if ('sourceSnapshot' in input) out.sourceSnapshot=input.sourceSnapshot ?? null;
    if ('plantId' in input) {
      if(input.plantId){const p=await masterRepository.findPlantById(input.plantId);if(!p)throw notFound('Plant tidak ditemukan.');if(materialKind&&!p.materialKinds.includes(materialKind))throw new AppError(400,'MATERIAL_SCOPE_MISMATCH','Plant tidak sesuai material sample.');out.plantId=p.id;}else out.plantId=null;
    }
    return out;
  }
  function baseSampleInput(input: CreateRawSampleRequest): RawSampleWriteInput {
    return {
      sampleId:input.sampleId,materialKind:input.materialKind,operationDate:input.operationDate,noSample:nullable(input.noSample),sourceShift:nullable(input.sourceShift),typeGrade:nullable(input.typeGrade),
      vendorId:input.vendorId ?? null,vendorSnapshot:nullable(input.vendorSnapshot),sourceId:input.sourceId ?? null,sourceSnapshot:nullable(input.sourceSnapshot),plantId:input.plantId ?? null,
      loaderUnitNo:nullable(input.loaderUnitNo),block:nullable(input.block),direction:nullable(input.direction),chemistry:input.chemistry,note:nullable(input.note),
    };
  }
  async function prepareSample(input: CreateRawSampleRequest): Promise<RawSampleWriteInput> { return {...baseSampleInput(input),...await resolveReferences(input)}; }

  async function prepareMix(actor:AuthPrincipal,input:SaveMixRequest) {
    const pile=await masterRepository.findPileById(input.pileId);if(!pile)throw notFound('Pile tidak ditemukan.');if(!pile.active)throw new AppError(409,'PILE_INACTIVE','Pile sudah nonaktif.');if(pile.materialKind!==input.materialKind)throw new AppError(400,'MATERIAL_KIND_MISMATCH','Material pile tidak sesuai material mix.');
    const duplicate=new Set<string>(); const items:SaveMixRepositoryInput['items']=[];
    for(const item of input.items){
      if(duplicate.has(item.rawSampleId))throw new AppError(400,'DUPLICATE_SAMPLE','Sample yang sama hanya boleh satu kali dalam mix.');
      duplicate.add(item.rawSampleId);
      const raw=await repository.findRawSampleById(item.rawSampleId);
      if(!raw)throw notFound('Raw sample pada mix tidak ditemukan.');
      if(raw.materialKind!==input.materialKind)throw new AppError(400,'MATERIAL_KIND_MISMATCH',`Sample ${raw.sampleId} berbeda material.`);
      if(raw.operationDate!==input.operationDate)throw new AppError(400,'SAMPLE_DATE_MISMATCH',`Tanggal sample ${raw.sampleId} berbeda dari Operation Date mix.`);
      const allocationIds=[...new Set(item.retaseAllocationIds??[])];
      const clayRetaseSources=item.clayRetaseSources??[];
      if(input.materialKind==='CL'){
        if(allocationIds.length)throw new AppError(400,'CLAY_DIRECT_RETASE_REQUIRED','Clay memakai retase laporan crusher, bukan rekonsiliasi.');
        if(!clayRetaseSources.length||clayRetaseSources.reduce((sum,x)=>sum+x.retase,0)!==item.retase)throw new AppError(400,'CLAY_DIRECT_RETASE_REQUIRED',`Pilih retase laporan crusher untuk ${raw.sampleId}. Jumlah pemakaian harus sama dengan Retase mix.`);
        if(new Set(clayRetaseSources.map(x=>x.columnId)).size!==clayRetaseSources.length)throw new AppError(400,'DUPLICATE_CLAY_COLUMN','Kolom laporan yang sama hanya boleh satu kali per sample.');
      }else{
        if(clayRetaseSources.length)throw new AppError(400,'MATERIAL_KIND_MISMATCH','Retase laporan Clay tidak boleh dipakai untuk Limestone.');
        if(item.retase>0&&!allocationIds.length&&await repository.hasConfirmedRetaseAllocation(item.rawSampleId,input.operationDate))throw conflict('MAPPED_RETASE_REQUIRED',`Sample ${raw.sampleId} memiliki confirmed mapped retase. Apply mapping dari Reconciliation sebelum Save Mix.`);
      }
      const chemistry=item.chemistry??raw.chemistry,changed=!chemistryEquals(raw.chemistry,chemistry);
      if(changed&&!item.oxideChangeNote)throw new AppError(400,'OXIDE_NOTE_REQUIRED',`Note perubahan oksida wajib untuk ${raw.sampleId}.`);
      items.push({rawSampleId:item.rawSampleId,retase:item.retase,tonPerRetase:item.tonPerRetase,chemistry,note:nullable(item.note),oxideChangeNote:changed?(item.oxideChangeNote??null):null,retaseAllocationIds:allocationIds,clayRetaseSources,retaseOverrideReason:nullable(item.retaseOverrideReason)});
    }
    const mixCode=buildMixCode({materialKind:input.materialKind,operationDate:input.operationDate,pileCode:pile.code,shiftCode:input.shiftCode,batchNo:input.batchNo??null,tiangKe:input.tiangKe??null,pileCycle:input.pileCycle});
    return {mixCode,materialKind:input.materialKind,operationDate:input.operationDate,pileId:input.pileId,shiftCode:input.shiftCode,batchNo:input.batchNo??null,tiangKe:input.tiangKe??null,pileCycle:input.pileCycle,defaultTonPerRetase:input.defaultTonPerRetase,note:nullable(input.note),createdBy:actor.userId,items};
  }

  return {
    loadClayRetase:(operationDate:string,shiftCode:string)=>repository.listClayWorkbenchSources(operationDate,shiftCode),
    async listSamples(filter:Parameters<QcRepository['listRawSamples']>[0]){const result=await repository.listRawSamples(filter);return{items:result.items.map(sampleJson),total:result.total};},
    async getSample(id:string){const row=await repository.findRawSampleById(id);if(!row)throw notFound('Raw sample tidak ditemukan.');return sampleJson(row);},
    async createSample(actor:AuthPrincipal,input:CreateRawSampleRequest,requestId?:string){if(await repository.findRawSampleBySampleId(input.sampleId))throw conflict('SAMPLE_ID_EXISTS','Sample_ID sudah digunakan.');const created=await repository.createRawSample(await prepareSample(input));await repository.appendAudit({actorUserId:actor.userId,actorRoleSnapshot:actor.role,action:'CREATE',entityType:'RAW_SAMPLE',entityId:created.id,afterJson:sampleJson(created),requestId});return sampleJson(created);},
    async updateSample(actor:AuthPrincipal,id:string,input:UpdateRawSampleRequest,requestId?:string){const current=await repository.findRawSampleById(id);if(!current)throw notFound('Raw sample tidak ditemukan.');if(input.sampleId&&input.sampleId.toLowerCase()!==current.sampleId.toLowerCase()&&await repository.findRawSampleBySampleId(input.sampleId))throw conflict('SAMPLE_ID_EXISTS','Sample_ID sudah digunakan.');const {reason,...patch}=input;const refs=await resolveReferences(patch,current);const normalized:Partial<RawSampleWriteInput>={...refs};const fields=['sampleId','materialKind','operationDate','noSample','sourceShift','typeGrade','loaderUnitNo','block','direction','chemistry','note'] as const;for(const key of fields)if(key in patch)(normalized as Record<string,unknown>)[key]=(patch as Record<string,unknown>)[key]??null;const updated=await repository.updateRawSample(id,normalized);if(!updated)throw notFound('Raw sample tidak ditemukan.');await repository.appendAudit({actorUserId:actor.userId,actorRoleSnapshot:actor.role,action:'UPDATE',entityType:'RAW_SAMPLE',entityId:id,beforeJson:sampleJson(current),afterJson:sampleJson(updated),reason,requestId});return sampleJson(updated);},
    async importSamples(actor:AuthPrincipal,input:ImportRawSamplesRequest,requestId?:string){const vendorCache=new Map<string,ReturnType<MasterRepository['findVendorById']>>(),sourceCache=new Map<string,ReturnType<MasterRepository['findSourceById']>>(),plantCache=new Map<string,ReturnType<MasterRepository['findPlantById']>>();const rows:RawSampleWriteInput[]=[];for(const raw of input.rows){let row=baseSampleInput(raw);if(raw.vendorId){if(!vendorCache.has(raw.vendorId))vendorCache.set(raw.vendorId,masterRepository.findVendorById(raw.vendorId));const v=await vendorCache.get(raw.vendorId)!;if(!v)throw notFound(`Vendor ${raw.vendorId} tidak ditemukan.`);if(!v.materialKinds.includes(raw.materialKind))throw new AppError(400,'MATERIAL_SCOPE_MISMATCH',`Vendor untuk ${raw.sampleId} tidak sesuai material.`);row={...row,vendorSnapshot:raw.vendorSnapshot??v.name};}if(raw.sourceId){if(!sourceCache.has(raw.sourceId))sourceCache.set(raw.sourceId,masterRepository.findSourceById(raw.sourceId));const s=await sourceCache.get(raw.sourceId)!;if(!s)throw notFound(`Source ${raw.sourceId} tidak ditemukan.`);if(s.materialKind!==raw.materialKind)throw new AppError(400,'MATERIAL_KIND_MISMATCH',`Source untuk ${raw.sampleId} tidak sesuai material.`);row={...row,sourceSnapshot:raw.sourceSnapshot??s.name};}if(raw.plantId){if(!plantCache.has(raw.plantId))plantCache.set(raw.plantId,masterRepository.findPlantById(raw.plantId));const p=await plantCache.get(raw.plantId)!;if(!p)throw notFound(`Plant ${raw.plantId} tidak ditemukan.`);if(!p.materialKinds.includes(raw.materialKind))throw new AppError(400,'MATERIAL_SCOPE_MISMATCH',`Plant untuk ${raw.sampleId} tidak sesuai material.`);}rows.push(row);}const result=await repository.importRawSamples(rows,input.mode);await repository.appendAudit({actorUserId:actor.userId,actorRoleSnapshot:actor.role,action:'IMPORT',entityType:'RAW_SAMPLE',entityId:'BULK',afterJson:{...result,mode:input.mode,rowCount:rows.length},reason:input.reason,requestId});return result;},
    async loadWorkbenchSamples(materialKind:MaterialKind,operationDate:string){const [samples,rules]=await Promise.all([repository.listRawSamples({materialKind,operationDate,limit:500,offset:0}),repository.listTonPerRetaseRules(materialKind)]);return samples.items.map((s)=>({...sampleJson(s),defaultTonPerRetase:resolveTonPerRetase({materialKind,vendor:s.vendorSnapshot,source:s.sourceSnapshot,rules}),mappedRetase:null,retaseSource:'MANUAL'}));},
    async listMixes(filter:Parameters<QcRepository['listMixes']>[0]){const r=await repository.listMixes(filter);return{...r,items:r.items.map((x)=>({...x,createdAt:iso(x.createdAt),updatedAt:iso(x.updatedAt)}))};},
    async getMix(mixCode:string){const mix=await repository.getMixByCode(mixCode);if(!mix)throw notFound('Mix aktif tidak ditemukan.');return mixJson(mix);},
    async saveMix(actor:AuthPrincipal,input:SaveMixRequest,requestId?:string){const prepared=await prepareMix(actor,input);if(await repository.getMixByCode(prepared.mixCode))throw conflict('MIX_CODE_EXISTS','Mix_ID sudah digunakan. Gunakan Recall/Replace.');const mix=await repository.saveMix(prepared).catch(mapRetaseConsumptionError);await repository.appendAudit({actorUserId:actor.userId,actorRoleSnapshot:actor.role,action:'CREATE',entityType:'MIX',entityId:mix.id,afterJson:{mixCode:mix.mixCode,itemCount:mix.items.length},requestId});return mixJson(mix);},
    async replaceMix(actor:AuthPrincipal,currentMixCode:string,input:ReplaceMixRequest,requestId?:string){const current=await repository.getMixByCode(currentMixCode);if(!current)throw notFound('Mix aktif yang akan direvisi tidak ditemukan.');const {reason,...body}=input;const prepared=await prepareMix(actor,body);const other=await repository.getMixByCode(prepared.mixCode);if(other&&other.id!==current.id)throw conflict('MIX_CODE_EXISTS','Mix_ID target sudah digunakan oleh mix lain.');const mix=await repository.replaceMix(current.id,prepared,reason,actor.userId,actor.role,requestId).catch(mapRetaseConsumptionError);return mixJson(mix);},
    async reviseChemistry(actor:AuthPrincipal,mixItemId:string,chemistry:Chemistry,reason:string,requestId?:string){const mix=await repository.reviseMixItemChemistry(mixItemId,chemistry,reason,actor.userId,actor.role,requestId);if(!mix)throw notFound('Mix item tidak ditemukan.');return mixJson(mix);},
    async chemistryHistory(mixItemId:string){return (await repository.listMixItemRevisions(mixItemId)).map(r=>({...r,changedAt:iso(r.changedAt)}));},
    async mixSummary(filter:Parameters<QcRepository['listMixSummaries']>[0]){const rows=await repository.listMixSummaries(filter);return rows.map((r)=>({...r,createdAt:iso(r.createdAt)}));},
    async pileCumulative(input:{materialKind:MaterialKind;cutoffDate?:string | undefined;plantId?:string | undefined;className?:string | undefined}){const [pileResult,summaries]=await Promise.all([masterRepository.listPiles({materialKind:input.materialKind,active:true,limit:250,offset:0,...(input.plantId?{plantId:input.plantId}:{})}),repository.listMixSummaries({materialKind:input.materialKind,...(input.cutoffDate?{dateTo:input.cutoffDate}:{}),...(input.plantId?{plantId:input.plantId}:{})})]);const out=[];for(const pile of pileResult.items.filter((p)=>!input.className||p.className===input.className)){const rows=summaries.filter((r)=>r.pileId===pile.id);if(!rows.length){out.push({plantId:pile.plantId,plantCode:pile.plantCode,pileId:pile.id,pileCode:pile.code,pileName:pile.name,className:pile.className,materialKind:input.materialKind,pileCycle:null,totalTon:0,chemistry:null,quality:null,status:'NO DATA',lastDate:null});continue;}const cycle=Math.max(...rows.map((r)=>r.pileCycle));const cycleRows=rows.filter((r)=>r.pileCycle===cycle);const agg=qafAggregation(cycleRows);const rules=await repository.getQafRules(pile.plantId??undefined);const lastDate=cycleRows.map((r)=>r.operationDate).sort().at(-1)??null;out.push({plantId:pile.plantId,plantCode:pile.plantCode,pileId:pile.id,pileCode:pile.code,pileName:pile.name,className:pile.className,materialKind:input.materialKind,pileCycle:cycle,totalTon:agg.tonnage,chemistry:agg.chemistry,quality:agg.quality,status:qafStatus(input.materialKind,pile.className,agg.tonnage,agg.quality,rules),lastDate});}return out;},
    async qaf(input:{materialKind:MaterialKind;month:string;plantId:string}){const dates=datesOfMonth(input.month);const rows=await repository.listMixSummaries({materialKind:input.materialKind,dateFrom:dates[0]!,dateTo:dates.at(-1)!,plantId:input.plantId});const rules=await repository.getQafRules(input.plantId);const defs=input.materialKind==='LS'?[{label:'Barat / Utara',classes:['Barat','Utara'],priority:['Barat','Utara']},{label:'Timur / Selatan',classes:['Timur','Selatan'],priority:['Timur','Selatan']},{label:'Filler',classes:['Filler'],priority:['Filler']}]:[{label:'Utara',classes:['Utara'],priority:['Utara']},{label:'Selatan',classes:['Selatan'],priority:['Selatan']}];const output=[];for(const date of dates){for(const def of defs){const matching=rows.filter((r)=>r.operationDate===date&&r.className!==null&&def.classes.includes(r.className));const agg=qafAggregation(matching);let last:MixSummaryRecord|undefined;for(const cls of def.priority){const subset=matching.filter((r)=>r.className===cls).sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime());if(subset.length){last=subset.at(-1);break;}}const cls=def.label==='Filler'?'Filler':def.label;output.push({date,pileId:last?.pileId??null,pileCode:last?.pileCode??null,classGroup:def.label,pileCycle:last?.pileCycle??null,totalTon:agg.tonnage,chemistry:agg.chemistry,quality:agg.quality,status:qafStatus(input.materialKind,cls,agg.tonnage,agg.quality,rules),target:agg.tonnage?qafTargetText(input.materialKind,cls,rules):'',mixCode:last?.mixCode??null});}}return output;},
  };
}

export type QcService = ReturnType<typeof createQcService>;
