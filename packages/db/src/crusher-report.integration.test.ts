import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import type { AuthPrincipal, SaveMixRepositoryInput } from "@qc/domain";
import type { CrusherReportDraft } from "@qc/contracts";
import { loadMigrationDatabaseConfig } from "./migration-config";
import * as schema from "./schema/index";
import { createMasterRepository } from "./repositories/master.repository";
import { createVendorOperationRepository } from "./repositories/vendor-operation.repository";
import { createCrusherReportRepository } from "./repositories/crusher-report.repository";
import { createRetaseRepository } from "./repositories/retase.repository";
import { createReconciliationRepository } from "./repositories/reconciliation.repository";
import { createQcRepository } from "./repositories/qc.repository";
import { createMasterService } from "../../../apps/api/src/modules/master/service";
import { createVendorOperationService } from "../../../apps/api/src/modules/vendor-operation/service";
import { createCrusherReportService } from "../../../apps/api/src/modules/crusher-report/service";
import { createRetaseService } from "../../../apps/api/src/modules/retase/service";
import { createReconciliationService } from "../../../apps/api/src/modules/reconciliation/service";

test("photo draft, review, confirm, reconciliation and exact mixing consumption", async (t) => {
  const config = loadMigrationDatabaseConfig();
  // Explicit opt-in only. Fixture changes always roll back.
  const client = postgres(config.url, {
      max: 1,
      prepare: false,
      ...(config.ssl ? { ssl: "require" as const } : {}),
    }),
    db = drizzle(client, { schema });
  const suffix = randomUUID(),
    rollback = new Error("ROLLBACK_PHOTO_TEST");
  try {
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout='15s'`);
        const [user] = await tx
          .insert(schema.users)
          .values({
            username: `photo_${suffix}`,
            displayName: "Photo test",
            passwordHash: "not-a-login",
            role: "SUPERVISOR_ADMIN",
          })
          .returning();
        assert.ok(user);
        const actor = {
          userId: user.id,
          role: "SUPERVISOR_ADMIN",
          crusherIds: [],
          vendorId: null,
        } as unknown as AuthPrincipal;
        const masterRepo = createMasterRepository(tx),
          master = createMasterService(masterRepo);
        const vendor = await master.createVendor(actor, {
          code: `V_${suffix}`,
          name: "Vendor Photo",
          aliases: [],
          materialKinds: ["LS"],
        });
        const am = await master.createEquipment(actor, {
          vendorId: vendor.id,
          type: "AM",
          unitNo: "07",
          aliases: [],
          materialKinds: ["LS"],
        });
        const aa = await master.createEquipment(actor, {
          vendorId: vendor.id,
          type: "AA",
          unitNo: "24",
          aliases: [],
          materialKinds: ["LS"],
        });
        const source = await master.createSource(actor, {
          code: `S_${suffix}`,
          name: "B9",
          block: "B9",
          materialKind: "LS",
          materialCategory: "PILE",
          aliases: [],
        });
        const crusher = await master.createCrusher(actor, {
          code: `C_${suffix}`,
          name: "Photo crusher",
          materialKind: "LS",
        });
        const pile = await master.createPile(actor, {
          code: `P_${suffix}`,
          name: "Photo pile",
          materialKind: "LS",
        });
        const context = {
          operationDate: "2026-08-18",
          shiftCode: "SHIFT_2" as const,
          crusherId: crusher.id,
        };
        const reports = createVendorOperationService(
            createVendorOperationRepository(tx),
            masterRepo,
          ),
          fleet = {
            total: 1,
            operating: 1,
            standby: 0,
            breakdown: 0,
            repair: 0,
            other: 0,
          };
        const report = await reports.createDraft(actor, {
          ...context,
          vendorId: vendor.id,
          materialKind: "LS",
          am: fleet,
          aa: fleet,
          assignments: [
            {
              amId: am.id,
              sourceId: source.id,
              crusherId: null,
              aaIds: [aa.id],
            },
          ],
        });
        await reports.submit(actor, report.id, "Photo fixture");
        const assignment = report.assignments[0]!;
        const repo = createCrusherReportRepository(tx),
          service = createCrusherReportService(repo, masterRepo),
          retase = createRetaseRepository(tx);
        const sourceBytes = Buffer.from("private source fixture");
        const importId = await repo.create({
          crusherId: crusher.id,
          fileName: "test.jpg",
          mimeType: "image/jpeg",
          sha256: "a".repeat(64),
          bytes: sourceBytes,
          actorId: user.id,
        });
        assert.equal(
          await repo.create({
            crusherId: crusher.id,
            fileName: "duplicate.jpg",
            mimeType: "image/jpeg",
            sha256: "a".repeat(64),
            bytes: sourceBytes,
            actorId: user.id,
          }),
          importId,
        );
        assert.deepEqual(
          (await repo.file(importId, false))?.bytes,
          sourceBytes,
        );
        await tx.execute(
          sql`DELETE FROM crusher_report_import_files WHERE import_id=${importId}::uuid`,
        );
        assert.equal((await repo.get(importId))?.id, importId);
        assert.equal(await repo.file(importId, false), null);
        assert.equal(
          await repo.create({
            crusherId: crusher.id,
            fileName: "recovered.jpg",
            mimeType: "image/jpeg",
            sha256: "a".repeat(64),
            bytes: sourceBytes,
            actorId: user.id,
          }),
          importId,
        );
        assert.deepEqual(
          (await repo.file(importId, false))?.bytes,
          sourceBytes,
        );
        const disposableId = await repo.create({
          crusherId: crusher.id,
          fileName: "disposable.jpg",
          mimeType: "image/jpeg",
          sha256: "b".repeat(64),
          bytes: Buffer.from("disposable source"),
          actorId: user.id,
        });
        await tx.execute(
          sql`INSERT INTO parser_field_observations(import_id,parser_run,field_path,observation)
              VALUES(${disposableId}::uuid,1,'header.day','{}'::jsonb)`,
        );
        await tx.execute(
          sql`INSERT INTO parser_field_corrections(import_id,revision,field_path,created_by)
              VALUES(${disposableId}::uuid,1,'header.day',${user.id}::uuid)`,
        );
        assert.deepEqual(await service.remove(actor, disposableId), {
          deletedId: disposableId,
        });
        assert.equal(await repo.get(disposableId), null);
        assert.equal(await repo.file(disposableId, false), null);
        assert.equal(
          (
            await tx.execute(
              sql`SELECT id FROM parser_field_observations WHERE import_id=${disposableId}::uuid
                  UNION ALL
                  SELECT id FROM parser_field_corrections WHERE import_id=${disposableId}::uuid`,
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await tx.execute(
              sql`SELECT id FROM audit_logs WHERE action='CRUSHER_REPORT_IMPORT_DELETED' AND entity_id=${disposableId}`,
            )
          ).length,
          1,
        );
        const job = await repo.claim(importId);
        assert.equal(job?.id, importId);
        assert.ok(job);
        assert.equal(await repo.claim(importId), null);
        const draft: CrusherReportDraft = {
          schemaVersion: "1.0",
          reportDate: context.operationDate,
          shiftCode: context.shiftCode,
          timezone: "Asia/Makassar",
          hours: [15, 16, 17, 18, 19, 20, 21, 22],
          header: { day: "Selasa", operatorName: null, crusherCode: null },
          vendors: [
            {
              blockKey: "upper-left",
              vendorCode: "VENDOR",
              vendorId: vendor.id,
              retaseTotal: 3,
              hourly: [15, 16, 17, 18, 19, 20, 21, 22].map((hour, i) => ({
                hour,
                retase: i === 0 ? 3 : 0,
              })),
              vehicles: [
                {
                  rowIndex: 1,
                  dtNo: "024",
                  retase: 1,
                  assignmentAaId: assignment.aa[0]!.assignmentAaId,
                  reviewed: false,
                },
                {
                  rowIndex: 2,
                  dtNo: "24",
                  retase: 2,
                  assignmentAaId: assignment.aa[0]!.assignmentAaId,
                  reviewed: false,
                },
              ],
            },
          ],
          production: {
            pileTon: 7338,
            fillerTon: null,
            totalTon: 7338,
            runningTimeHours: 5.3,
            capacityTph: 1384,
          },
          pile: { baratPercent: 20, timurPercent: 25, totalPercent: 45 },
          notes: { raw: "Source note" },
          reportRetaseTotal: 3,
        };
        const observation = {
          fieldPath: "vendors.0.vehicles.0.retase",
          rawText: "1",
          value: 1,
          confidence: 0.55,
          sourceMethod: "OCR" as const,
          bbox: [0.1, 0.1, 0.1, 0.1] as [number, number, number, number],
          needsReview: true,
        };
        await repo.finish(
          importId,
          randomUUID(),
          {
            draft,
            observations: [observation],
            issues: [],
            parserVersion: "test",
            templateVersion: "test",
          },
          sourceBytes,
        );
        assert.equal((await repo.get(importId))?.status, "PROCESSING");
        await repo.finish(
          importId,
          job.leaseToken,
          {
            draft,
            observations: [observation],
            issues: [],
            parserVersion: "test",
            templateVersion: "test",
          },
          sourceBytes,
        );
        let item = (await repo.get(importId))!;
        assert.equal(item.status, "NEEDS_REVIEW");
        await assert.rejects(
          service.confirm(actor, importId, item.revision),
          /blocking/,
        );
        draft.vendors[0]!.vehicles.forEach((r) => {
          r.reviewed = true;
        });
        item = await service.save(actor, importId, item.revision, draft);
        assert.equal(item.status, "READY");
        assert.equal((await retase.getSummary(context)).totalNet, 0);
        assert.deepEqual(item.observations, [observation]);
        const corrections = await tx.execute(
          sql`SELECT * FROM parser_field_corrections WHERE import_id=${importId}::uuid`,
        );
        assert.equal(corrections.length, 2);
        await t.test(
          "a photo cannot append over existing live retase and failed confirmation rolls back atomically",
          async () => {
            const undoLive = new Error("ROLLBACK_LIVE_CONFLICT_FIXTURE");
            await assert.rejects(
              tx.transaction(async (sp) => {
                const scopedMaster = createMasterRepository(sp),
                  scopedRetase = createRetaseRepository(sp),
                  scopedImports = createCrusherReportRepository(sp);
                const live = createRetaseService(scopedRetase, scopedMaster, {
                  now: () => new Date("2026-08-18T08:00:00Z"),
                });
                await live.record(actor, {
                  ...context,
                  requestId: randomUUID(),
                  assignmentAaId: assignment.aa[0]!.assignmentAaId,
                });
                const importing = createCrusherReportService(
                  scopedImports,
                  scopedMaster,
                );
                await assert.rejects(
                  importing.confirm(actor, importId, item.revision),
                  (e) =>
                    String(
                      (e as any).cause?.constraint_name ??
                        (e as any).constraint_name,
                    ) === "crusher_photo_duplicate",
                );
                assert.equal(
                  (await scopedImports.get(importId))?.status,
                  "READY",
                );
                assert.equal(
                  (await scopedRetase.getSummary(context)).totalNet,
                  1,
                );
                assert.equal(
                  (
                    await sp.execute(
                      sql`SELECT id FROM crusher_reports WHERE import_id=${importId}::uuid`,
                    )
                  ).length,
                  0,
                );
                throw undoLive;
              }),
              (e) => e === undoLive,
            );
          },
        );
        await t.test(
          "confirmed report creates exact events, retains duplicate source rows and is idempotent",
          async () => {
            const confirmed = await service.confirm(
              actor,
              importId,
              item.revision,
            );
            assert.equal(confirmed.status, "CONFIRMED");
            assert.equal(
              (await service.confirm(actor, importId, item.revision)).reportId,
              confirmed.reportId,
            );
            await assert.rejects(
              service.remove(actor, importId),
              (error: any) => error.code === "REPORT_RETENTION_REQUIRED",
            );
            assert.deepEqual(
              (await repo.file(importId, false))?.bytes,
              sourceBytes,
            );
            const events = await retase.listEvents({
              ...context,
              limit: 100,
              offset: 0,
            });
            assert.equal(events.total, 3);
            assert.ok(
              events.items.every(
                (e) =>
                  e.entrySource === "IMPORT" &&
                  e.assignmentId === assignment.id &&
                  e.entryBatchId === importId,
              ),
            );
            assert.equal(
              (
                await tx.execute(
                  sql`SELECT * FROM crusher_report_vehicle_rows WHERE report_id=${confirmed.reportId}::uuid`,
                )
              ).length,
              2,
            );
            const summary = await retase.getSummary(context);
            assert.equal(summary.totalNet, 3);
            assert.deepEqual(summary.hourly, []);
          },
        );
        await t.test(
          "live counter cannot double-count an already imported AA",
          async () => {
            const counter = createRetaseService(retase, masterRepo, {
              now: () => new Date("2026-08-18T08:00:00Z"),
            });
            await assert.rejects(
              tx.transaction(async (sp) => {
                const service = createRetaseService(
                  createRetaseRepository(sp),
                  createMasterRepository(sp),
                  { now: () => new Date("2026-08-18T08:00:00Z") },
                );
                await service.record(actor, {
                  ...context,
                  requestId: randomUUID(),
                  assignmentAaId: assignment.aa[0]!.assignmentAaId,
                });
              }),
              (e) =>
                String(
                  (e as any).cause?.constraint_name ??
                    (e as any).constraint_name,
                ) === "crusher_photo_duplicate",
            );
            assert.equal((await retase.getSummary(context)).totalNet, 3);
          },
        );
        const reconciliationRepo = createReconciliationRepository(tx),
          reconciliation = createReconciliationService(reconciliationRepo);
        const [sample] = await tx
          .insert(schema.rawSamples)
          .values({
            sampleId: `LS_${suffix}`,
            operationDate: context.operationDate,
            materialKind: "LS",
            vendorId: vendor.id,
            sio2: "12",
            al2o3: "3",
            fe2o3: "2",
            cao: "45",
          })
          .returning();
        assert.ok(sample);
        const allocation = await reconciliation.createAllocation(actor, {
          assignmentId: assignment.id,
          sampleId: sample.id,
          approvedRetase: 3,
        });
        await reconciliation.confirm(actor, allocation.id, {});
        assert.equal(
          (
            await reconciliation.workbenchSuggestions(actor, {
              ...context,
              materialKind: "LS",
            })
          )[0]?.mappedRetase,
          3,
        );
        const mix: SaveMixRepositoryInput = {
          mixCode: `MIX_${suffix}`,
          operationDate: context.operationDate,
          shiftCode: context.shiftCode,
          materialKind: "LS",
          pileId: pile.id,
          batchNo: 1,
          tiangKe: null,
          pileCycle: 1,
          defaultTonPerRetase: 20,
          note: null,
          createdBy: user.id,
          items: [
            {
              rawSampleId: sample.id,
              retase: 3,
              tonPerRetase: 20,
              note: null,
              oxideChangeNote: null,
              retaseOverrideReason: null,
              retaseAllocationIds: [allocation.id],
              clayRetaseSources: [],
              chemistry: {
                sio2: 12,
                al2o3: 3,
                fe2o3: 2,
                cao: 45,
                mgo: null,
                k2o: null,
                na2o: null,
                so3: null,
                h2o: null,
              },
            },
          ],
        };
        await createQcRepository(tx).saveMix(mix);
        const bindings = await tx.execute(
          sql`SELECT re.id,re.entry_batch_id FROM qc_retase_allocation_events link JOIN retase_events re ON re.id=link.event_id WHERE link.allocation_id=${allocation.id}::uuid AND link.active`,
        );
        assert.equal(bindings.length, 3);
        assert.ok(bindings.every((r) => r.entry_batch_id === importId));
        assert.equal(
          (await reconciliationRepo.getAllocation(allocation.id))
            ?.consumedRetase,
          3,
        );
        assert.equal(
          (
            await reconciliation.workbenchSuggestions(actor, {
              ...context,
              materialKind: "LS",
            })
          ).length,
          0,
        );
        throw rollback;
      }),
      (e) => e === rollback,
    );
  } finally {
    await client.end();
  }
});
