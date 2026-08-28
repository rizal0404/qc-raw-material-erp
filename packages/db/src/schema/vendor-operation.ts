import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, pgTable, text, time, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { materialKindEnum, reportStatusEnum, assignmentStatusEnum } from './enums';
import { users, vendors } from './iam';
import { crushers, equipment, piles, shifts, sources } from './master';

export const vendorShiftReports = pgTable('vendor_shift_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  operationDate: date('operation_date').notNull(),
  shiftCode: text('shift_code').notNull().references(() => shifts.code, { onDelete: 'restrict' }),
  materialKind: materialKindEnum('material_kind').notNull().default('LS'),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  version: integer('version').notNull().default(1),
  status: reportStatusEnum('status').notNull().default('DRAFT'),
  amTotal: integer('am_total').notNull().default(0),
  amOperating: integer('am_operating').notNull().default(0),
  amStandby: integer('am_standby').notNull().default(0),
  amBreakdown: integer('am_breakdown').notNull().default(0),
  amRepair: integer('am_repair').notNull().default(0),
  amOther: integer('am_other').notNull().default(0),
  aaTotal: integer('aa_total').notNull().default(0),
  aaOperating: integer('aa_operating').notNull().default(0),
  aaStandby: integer('aa_standby').notNull().default(0),
  aaBreakdown: integer('aa_breakdown').notNull().default(0),
  aaRepair: integer('aa_repair').notNull().default(0),
  aaOther: integer('aa_other').notNull().default(0),
  note: text('note'),
  revisionReason: text('revision_reason'),
  revisesReportId: uuid('revises_report_id'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'restrict' }),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),
  supersededBy: uuid('superseded_by').references(() => users.id, { onDelete: 'restrict' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('vendor_shift_reports_id_kind_uq').on(t.id,t.materialKind),
  uniqueIndex('vendor_shift_report_version_uq').on(t.operationDate, t.shiftCode, t.materialKind, t.vendorId, t.version),
  index('vendor_shift_current_idx').on(t.operationDate, t.shiftCode, t.materialKind, t.vendorId, t.status),
]);

export const loadingAssignments = pgTable('loading_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id').references(() => vendorShiftReports.id, { onDelete: 'cascade' }),
  assignmentOrigin: text('assignment_origin').notNull().default('SHIFT_REPORT'),
  operationDate: date('operation_date').notNull(),
  shiftCode: text('shift_code').notNull().references(() => shifts.code, { onDelete: 'restrict' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  amId: uuid('am_id').notNull().references(() => equipment.id, { onDelete: 'restrict' }),
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'restrict' }),
  blockSnapshot: text('block_snapshot'),
  materialCategory: text('material_category').notNull(),
  materialKind: materialKindEnum('material_kind').notNull(),
  crusherId: uuid('crusher_id').references(() => crushers.id, { onDelete: 'restrict' }),
  pileId: uuid('pile_id').references(() => piles.id, { onDelete: 'restrict' }),
  validFrom: time('valid_from'),
  validTo: time('valid_to'),
  status: assignmentStatusEnum('status').notNull().default('ACTIVE'),
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('loading_assignment_destination_ck', sql`${t.crusherId} IS NOT NULL OR (${t.assignmentOrigin} = 'SHIFT_REPORT' AND ${t.pileId} IS NULL)`),
  uniqueIndex('loading_assignments_id_kind_uq').on(t.id,t.materialKind),
  index('loading_assignment_report_idx').on(t.reportId),
  index('loading_assignment_counter_idx').on(t.operationDate, t.shiftCode, t.crusherId, t.status),
  index('loading_assignment_operational_idx').on(t.assignmentOrigin, t.operationDate, t.shiftCode, t.vendorId, t.status),
]);

export const loadingAssignmentAas = pgTable('loading_assignment_aas', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull().references(() => loadingAssignments.id, { onDelete: 'cascade' }),
  aaId: uuid('aa_id').notNull().references(() => equipment.id, { onDelete: 'restrict' }),
  materialKind: materialKindEnum('material_kind').notNull(),
  validFrom: time('valid_from'),
  validTo: time('valid_to'),
  active: boolean('active').notNull().default(true),
  note: text('note'),
}, (t) => [uniqueIndex('assignment_aa_uq').on(t.assignmentId, t.aaId), index('assignment_aa_lookup_idx').on(t.aaId, t.assignmentId)]);
