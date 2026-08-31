import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./iam";
import { crushers } from "./master";
import { clayShiftReports } from "./clay-report";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const clayReportImports = pgTable(
  "clay_report_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crusherId: uuid("crusher_id")
      .notNull()
      .references(() => crushers.id),
    fileName: text("file_name").notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").notNull().default("QUEUED"),
    revision: integer("revision").notNull().default(1),
    parsedJson: jsonb("parsed_json"),
    draftJson: jsonb("draft_json"),
    issuesJson: jsonb("issues_json").notNull().default([]),
    parserVersion: text("parser_version"),
    templateVersion: text("template_version"),
    error: text("error"),
    leaseToken: uuid("lease_token"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    reportId: uuid("report_id")
      .unique()
      .references(() => clayShiftReports.id),
  },
  (table) => [
    uniqueIndex("clay_report_import_hash_uq").on(
      table.crusherId,
      table.sha256,
    ),
    index("clay_report_import_created_idx").on(
      table.crusherId,
      table.createdAt,
    ),
  ],
);

export const clayReportImportFiles = pgTable("clay_report_import_files", {
  importId: uuid("import_id")
    .primaryKey()
    .references(() => clayReportImports.id),
  mimeType: text("mime_type").notNull(),
  sourceBytes: bytea("source_bytes").notNull(),
  alignedBytes: bytea("aligned_bytes"),
});

export const clayReportImportObservations = pgTable(
  "clay_report_import_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => clayReportImports.id),
    parserRun: integer("parser_run").notNull(),
    fieldPath: text("field_path").notNull(),
    observation: jsonb("observation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const clayReportImportCorrections = pgTable(
  "clay_report_import_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => clayReportImports.id),
    revision: integer("revision").notNull(),
    fieldPath: text("field_path").notNull(),
    predictedValue: jsonb("predicted_value"),
    correctedValue: jsonb("corrected_value"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
