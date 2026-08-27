import { date, index, integer, numeric, pgTable, text, time, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users, vendors } from './iam';
import { crushers, piles, shifts, sources } from './master';
import { loadingAssignments } from './vendor-operation';
import { materialKindEnum } from './enums';

export const clayShiftReports = pgTable('clay_shift_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  operationDate: date('operation_date').notNull(),
  shiftCode: text('shift_code').notNull().references(() => shifts.code, { onDelete: 'restrict' }),
  materialKind: materialKindEnum('material_kind').notNull().default('CL'),
  crusherId: uuid('crusher_id').notNull().references(() => crushers.id, { onDelete: 'restrict' }),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('DRAFT'),
  operatorUserId: uuid('operator_user_id').references(() => users.id, { onDelete: 'restrict' }),
  operatorNameSnapshot: text('operator_name_snapshot'),
  productionTonnage: numeric('production_tonnage', { precision: 14, scale: 3 }),
  runningMinutes: integer('running_minutes'),
  totalRunningMinutes: integer('total_running_minutes'),
  capacityTph: numeric('capacity_tph', { precision: 14, scale: 3 }),
  stockPercent: numeric('stock_percent', { precision: 7, scale: 3 }),
  pickupLocation: text('pickup_location'),
  weather: text('weather'),
  pileFilling: text('pile_filling'),
  sm: numeric('sm', { precision: 12, scale: 5 }),
  sio2: numeric('sio2', { precision: 12, scale: 5 }),
  h2o: numeric('h2o', { precision: 12, scale: 5 }),
  attendancePresent: integer('attendance_present'),
  attendanceSick: integer('attendance_sick'),
  attendanceOvertime: integer('attendance_overtime'),
  attendancePermission: integer('attendance_permission'),
  attendanceLeave: integer('attendance_leave'),
  note: text('note'),
  revisionReason: text('revision_reason'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
  submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'restrict' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'restrict' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('clay_shift_report_version_uq').on(t.operationDate, t.shiftCode, t.crusherId, t.version),
  index('clay_shift_report_context_idx').on(t.operationDate, t.shiftCode, t.crusherId, t.status),
]);

export const clayReportColumns = pgTable('clay_report_columns', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id').notNull().references(() => clayShiftReports.id, { onDelete: 'cascade' }),
  materialKind: materialKindEnum('material_kind').notNull().default('CL'),
  displayOrder: integer('display_order').notNull(),
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'restrict' }),
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'restrict' }),
  pileId: uuid('pile_id').references(() => piles.id, { onDelete: 'restrict' }),
  vendorNameSnapshot: text('vendor_name_snapshot'),
  sourceNameSnapshot: text('source_name_snapshot'),
  headerPrimary: text('header_primary').notNull(),
  headerSecondary: text('header_secondary'),
  inputMode: text('input_mode').notNull().default('MASTER'),
  status: text('status').notNull().default('CONFIRMED'),
  tonPerRetaseSnapshot: numeric('ton_per_retase_snapshot', { precision: 12, scale: 4 }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('clay_report_column_order_uq').on(t.reportId, t.displayOrder),
  index('clay_report_column_report_idx').on(t.reportId, t.status),
  index('clay_report_column_vendor_idx').on(t.vendorId),
  index('clay_report_column_source_idx').on(t.sourceId),
]);

export const clayReportColumnAssignments = pgTable('clay_report_column_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  columnId: uuid('column_id').notNull().references(() => clayReportColumns.id, { onDelete: 'cascade' }),
  assignmentId: uuid('assignment_id').notNull().references(() => loadingAssignments.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('clay_report_column_assignment_uq').on(t.columnId, t.assignmentId), index('clay_report_assignment_idx').on(t.assignmentId)]);

export const clayReportOperationLogs = pgTable('clay_report_operation_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id').notNull().references(() => clayShiftReports.id, { onDelete: 'cascade' }),
  displayOrder: integer('display_order').notNull(),
  startTime: time('start_time'),
  endTime: time('end_time'),
  category: text('category').notNull().default('NOTE'),
  description: text('description').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('clay_report_log_order_uq').on(t.reportId, t.displayOrder), index('clay_report_log_report_idx').on(t.reportId)]);
