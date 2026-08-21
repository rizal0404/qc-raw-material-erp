import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role_code', ['VENDOR','CRUSHER_OPERATOR','QC_ANALYST','SUPERVISOR_ADMIN']);
export const userStatusEnum = pgEnum('user_status', ['ACTIVE','DEACTIVATED']);
export const materialKindEnum = pgEnum('material_kind', ['LS','CL']);
export const equipmentTypeEnum = pgEnum('equipment_type', ['AM','AA']);
export const reportStatusEnum = pgEnum('shift_report_status', ['DRAFT','SUBMITTED','SUPERSEDED','LOCKED','REVISED']);
export const assignmentStatusEnum = pgEnum('assignment_status', ['ACTIVE','CLOSED','CANCELLED']);
export const retaseEventTypeEnum = pgEnum('retase_event_type', ['DUMP','REVERSAL','MANUAL_CORRECTION']);
export const retaseEventStatusEnum = pgEnum('retase_event_status', ['VALID','EXCEPTION_UNASSIGNED','AMBIGUOUS','REVERSED']);
export const mappingStatusEnum = pgEnum('mapping_status', ['UNMAPPED','SUGGESTED','AMBIGUOUS','CONFIRMED','CONSUMED','REVIEW_REQUIRED']);
export const mixStatusEnum = pgEnum('mix_status', ['ACTIVE','REPLACED','VOID']);

export const tonPerRetaseRuleTypeEnum = pgEnum('ton_per_retase_rule_type', ['DEFAULT','MATCH_KEY']);
export const stockpileLotStatusEnum = pgEnum('stockpile_lot_status', ['ACTIVE','RECLAIMED']);
export const stockpileLotNoModeEnum = pgEnum('stockpile_lot_no_mode', ['PILE_CYCLE','MANUAL']);
export const warehouseZoneKindEnum = pgEnum('warehouse_zone_kind', ['FILLER','HOPPER','LOADER_FEED','DIVIDER','TRACK','LABEL']);
