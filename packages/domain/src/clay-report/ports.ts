import type { AuditWriteInput } from '../master/types';
import type { ClayColumnRecord, ClayHourlyCellRecord, ClayOperationLogRecord, ClayReportRecord } from './types';
import type { ClayColumnInputMode, ClayColumnStatus, ClayOperationCategory, ClayReportStatus } from './values';

export interface ClayReportRepository {
  findCurrent(context:{operationDate:string;shiftCode:string;crusherId:string}):Promise<ClayReportRecord|null>;
  findReport(id:string):Promise<ClayReportRecord|null>;
  createReport(input:{operationDate:string;shiftCode:string;crusherId:string;operatorUserId:string|null;operatorNameSnapshot:string|null;createdBy:string}):Promise<ClayReportRecord>;
  updateReport(id:string,patch:Partial<{operatorNameSnapshot:string|null;productionTonnage:number|null;runningMinutes:number|null;totalRunningMinutes:number|null;capacityTph:number|null;stockPercent:number|null;pickupLocation:string|null;weather:string|null;pileFilling:string|null;sm:number|null;sio2:number|null;h2o:number|null;attendancePresent:number|null;attendanceSick:number|null;attendanceOvertime:number|null;attendancePermission:number|null;attendanceLeave:number|null;note:string|null;status:ClayReportStatus;revisionReason:string|null;updatedBy:string;submittedBy:string|null;submittedAt:Date|null;approvedBy:string|null;approvedAt:Date|null}>):Promise<ClayReportRecord|null>;
  listColumns(reportId:string):Promise<ClayColumnRecord[]>;
  findColumn(id:string):Promise<ClayColumnRecord|null>;
  createColumn(input:{reportId:string;displayOrder:number;vendorId:string|null;sourceId:string|null;pileId:string|null;vendorNameSnapshot:string|null;sourceNameSnapshot:string|null;headerPrimary:string;headerSecondary:string|null;inputMode:ClayColumnInputMode;status:ClayColumnStatus;tonPerRetaseSnapshot:number|null;createdBy:string}):Promise<ClayColumnRecord>;
  updateColumn(id:string,patch:Partial<{displayOrder:number;vendorId:string|null;sourceId:string|null;pileId:string|null;vendorNameSnapshot:string|null;sourceNameSnapshot:string|null;headerPrimary:string;headerSecondary:string|null;inputMode:ClayColumnInputMode;status:ClayColumnStatus;tonPerRetaseSnapshot:number|null;updatedBy:string}>):Promise<ClayColumnRecord|null>;
  listOperationLogs(reportId:string):Promise<ClayOperationLogRecord[]>;
  createOperationLog(input:{reportId:string;displayOrder:number;startTime:string|null;endTime:string|null;category:ClayOperationCategory;description:string;createdBy:string}):Promise<ClayOperationLogRecord>;
  listHourly(reportId:string):Promise<ClayHourlyCellRecord[]>;
  appendHourly(input:{requestId:string;batchId:string;report:ClayReportRecord;column:ClayColumnRecord;eventAt:Date;delta:number;reason:string;createdBy:string}):Promise<void>;
  appendAudit(input:AuditWriteInput):Promise<void>;
}
