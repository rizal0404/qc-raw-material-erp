import type { ClayColumnInputMode, ClayColumnStatus, ClayOperationCategory, ClayReportStatus } from './values';

export interface ClayReportRecord {
  id:string;operationDate:string;shiftCode:string;crusherId:string;crusherCode:string;crusherName:string;version:number;status:ClayReportStatus;
  operatorUserId:string|null;operatorNameSnapshot:string|null;productionTonnage:number|null;runningMinutes:number|null;totalRunningMinutes:number|null;
  capacityTph:number|null;stockPercent:number|null;pickupLocation:string|null;weather:string|null;pileFilling:string|null;sm:number|null;sio2:number|null;h2o:number|null;
  attendancePresent:number|null;attendanceSick:number|null;attendanceOvertime:number|null;attendancePermission:number|null;attendanceLeave:number|null;note:string|null;
  createdBy:string;updatedBy:string|null;submittedBy:string|null;submittedAt:Date|null;approvedBy:string|null;approvedAt:Date|null;createdAt:Date;updatedAt:Date;
}
export interface ClayColumnRecord {
  id:string;reportId:string;displayOrder:number;vendorId:string|null;sourceId:string|null;pileId:string|null;vendorNameSnapshot:string|null;sourceNameSnapshot:string|null;
  headerPrimary:string;headerSecondary:string|null;inputMode:ClayColumnInputMode;status:ClayColumnStatus;tonPerRetaseSnapshot:number|null;createdBy:string;updatedBy:string|null;createdAt:Date;updatedAt:Date;
}
export interface ClayOperationLogRecord {id:string;reportId:string;displayOrder:number;startTime:string|null;endTime:string|null;category:ClayOperationCategory;description:string;createdBy:string;createdAt:Date;}
export interface ClayHourlyCellRecord {columnId:string;hour:string;retase:number;tonnage:number;}
