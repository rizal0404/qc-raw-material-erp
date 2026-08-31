import { describe, expect, it, vi } from "vitest";
import {
  OreVisionDiagnosticsSchema,
  type OreVisionDiagnostics,
} from "@qc/contracts";
import type { AuthPrincipal } from "@qc/domain";
import {
  createClayPhotoReportRepository,
  createCrusherReportRepository,
} from "@qc/db";

const id = "10000000-0000-4000-8000-000000000001";
const lease = "20000000-0000-4000-8000-000000000001";
const actor = {
  userId: id,
  role: "QC_ANALYST",
  crusherIds: [],
} as unknown as AuthPrincipal;

function snapshot(): OreVisionDiagnostics {
  return OreVisionDiagnosticsSchema.parse({
    version: 1,
    capturedAt: "2026-08-30T08:00:00.000Z",
    input: {
      provider: "openai",
      model: "test-vision",
      systemPrompt: "Preserve unreadable values as null.",
      prompt: "Extract the report as JSON.",
      temperature: 0.1,
      topP: null,
      maxOutputTokens: 16000,
      image: { width: 30, height: 40, mimeType: "image/jpeg", bytes: 100 },
      shiftHours: { SHIFT_1: [7, 8] },
    },
    rawOutput: '{"original":true}',
    parsedOutput: { original: true },
    normalizedDraft: { original: true },
    error: null,
  });
}

function storedRow(parsedJson: unknown) {
  return {
    id,
    crusher_id: id,
    file_name: "report.jpg",
    sha256: "a".repeat(64),
    status: "NEEDS_REVIEW",
    revision: 2,
    created_at: "2026-08-30T08:00:00.000Z",
    confirmed_at: null,
    parser_version: "test-1.0",
    template_version: "test-1.0",
    draft_json: { corrected: true },
    parsed_json: parsedJson,
    issues_json: [],
    error: null,
    has_aligned: true,
    report_id: null,
  };
}

type CompiledSql = { sql: string; params: unknown[] };
type Database = Parameters<typeof createCrusherReportRepository>[0];

// Exercise the real repository and Drizzle's SQL compiler without opening a
// connection to an operational database. These queries use raw SQL literals
// and parameters only, so column-name casing is intentionally unused.
function captureDatabase(responses: unknown[][] = []) {
  const queries: CompiledSql[] = [];
  const execute = vi.fn(async (query: unknown) => {
    const compiled = (
      query as { toQuery: (config: unknown) => CompiledSql }
    ).toQuery({
      casing: {},
      escapeName: (value: string) => '"' + value.replaceAll('"', '""') + '"',
      escapeParam: (index: number) => "$" + (index + 1),
      escapeString: (value: string) => "'" + value.replaceAll("'", "''") + "'",
    });
    queries.push({
      ...compiled,
      sql: compiled.sql.replace(/\s+/g, " ").trim(),
    });
    return responses.shift() ?? [];
  });
  const db = {
    execute,
    transaction: async (work: (tx: Database) => Promise<unknown>) => work(db),
  } as unknown as Database;
  return { db, queries };
}

describe.each([
  ["Limestone", createCrusherReportRepository],
  ["Clay", createClayPhotoReportRepository],
] as const)("%s immutable parser diagnostics", (_material, createRepository) => {
  it("exposes a validated original snapshot without replacing the corrected draft", async () => {
    const evidence = snapshot();
    const row = storedRow({
      diagnostics: {
        ...evidence,
        keys: { openai: "must-not-leak" },
        input: { ...evidence.input, apiKey: "must-not-leak" },
      },
      privateEnvelope: "must-not-leak",
    });
    const { db } = captureDatabase([[row], []]);
    const item = await createRepository(db).get(id);
    expect(item?.diagnostics).toEqual(evidence);
    expect(item?.draft).toEqual({ corrected: true });
    expect(item?.diagnostics?.normalizedDraft).toEqual({ original: true });
    expect(JSON.stringify(item)).not.toContain("must-not-leak");
  });

  it.each([null, {}, { diagnostics: { version: 99 } }])(
    "keeps legacy or malformed metadata reviewable: %j",
    async (parsedJson) => {
      const { db } = captureDatabase([[storedRow(parsedJson)], []]);
      const item = await createRepository(db).get(id);
      expect(item?.diagnostics).toBeNull();
      expect(item?.draft).toEqual({ corrected: true });
    },
  );

  it("omits diagnostic bodies from the lightweight import history", async () => {
    const { db, queries } = captureDatabase([
      [storedRow({ diagnostics: snapshot() })],
    ]);
    const [item] = await createRepository(db).list(id);
    expect(item).not.toHaveProperty("diagnostics");
    expect(item?.draft).toBeNull();
    expect(queries[0]?.sql).not.toMatch(/SELECT\s+(?:i\.)?\*/);
    expect(queries[0]?.sql).not.toContain("parsed_json");
    expect(queries[0]?.sql).not.toContain("draft_json");
  });

  it("persists failed output with the same import/status/lease guard", async () => {
    const evidence = snapshot();
    evidence.parsedOutput = null;
    evidence.normalizedDraft = null;
    evidence.rawOutput = '{"broken":';
    evidence.error = {
      code: "OREVISION_REPORT_INVALID",
      message: "Hasil AI tidak sesuai struktur laporan.",
    };
    const { db, queries } = captureDatabase();
    await createRepository(db).fail(id, lease, evidence.error.message, evidence);
    expect(queries).toHaveLength(1);
    const query = queries[0]!;
    expect(query.sql).toContain("parsed_json=");
    expect(query.sql).toContain("status='FAILED'");
    expect(query.sql).toContain("AND lease_token=");
    expect(query.sql).toContain("AND status='PROCESSING'");
    expect(query.sql).not.toContain("draft_json=");
    expect(query.sql).not.toContain(evidence.rawOutput);
    expect(query.params).toContain(id);
    expect(query.params).toContain(lease);
    expect(query.params).toContain(JSON.stringify({ diagnostics: evidence }));
  });

  it("clears stale metadata when failure occurs before diagnostic capture", async () => {
    const { db, queries } = captureDatabase();
    await createRepository(db).fail(id, lease, "Sanitized failure");
    expect(queries[0]?.sql).toContain("parsed_json=NULL");
    expect(queries[0]?.sql).toContain("AND lease_token=");
    expect(queries[0]?.sql).not.toContain("draft_json=");
  });

  it("clears old evidence atomically with a successful retry claim", async () => {
    const { db, queries } = captureDatabase([
      [],
      [{ id, lease_token: lease }],
      [{ bytes: Buffer.from("source"), mime_type: "image/jpeg" }],
    ]);
    const job = await createRepository(db).claim(id);
    expect(job?.leaseToken).toBe(lease);
    expect(job?.bytes).toEqual(Buffer.from("source"));
    const claim = queries.find((query) =>
      query.sql.includes("SET status='PROCESSING'"),
    );
    expect(claim?.sql).toContain("parsed_json=NULL");
    expect(claim?.sql).toContain("AND status='QUEUED'");
    expect(claim?.sql).not.toContain("draft_json=");
  });

  it("removes previous failure metadata when explicitly requeued", async () => {
    const { db, queries } = captureDatabase();
    await createRepository(db).requeue(id);
    expect(queries[0]?.sql).toContain("parsed_json=NULL");
    expect(queries[0]?.sql).toContain("AND status='FAILED'");
    expect(queries[0]?.sql).not.toContain("draft_json=");
  });

  it("retains original extraction evidence when review corrections are saved", async () => {
    const { db, queries } = captureDatabase([
      [storedRow({ diagnostics: snapshot() })],
      [],
    ]);
    await createRepository(db).saveDraft(
      id,
      { corrected: false } as never,
      [],
      actor,
    );
    const update = queries.find((query) => query.sql.startsWith("UPDATE "));
    expect(update?.sql).toContain("draft_json=");
    expect(update?.sql).not.toContain("parsed_json");
    expect(queries.some((query) => query.sql.includes("corrections"))).toBe(true);
  });
});
