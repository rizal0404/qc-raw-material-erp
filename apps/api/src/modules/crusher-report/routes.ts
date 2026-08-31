import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ConfirmCrusherReportSchema,
  IsoDateSchema,
  ShiftCodeSchema,
  UpdateCrusherReportDraftSchema,
} from "@qc/contracts";
import { AppError } from "../../lib/errors";
import { MAX_REPORT_IMAGE_BYTES, type CrusherReportService } from "./service";

const ExternalVlmConsentSchema = z.object({ acknowledgeExternalVlm: z.literal(true) });

export async function registerCrusherReportRoutes(
  app: FastifyInstance,
  service: CrusherReportService,
) {
  await app.register(async (routes) => {
    await routes.register(multipart, {
      limits: {
        fileSize: MAX_REPORT_IMAGE_BYTES,
        files: 1,
        fields: 0,
        parts: 1,
      },
    });
    const auth = {
      onRequest: app.auth.requireRoles(
        "CRUSHER_OPERATOR",
        "QC_ANALYST",
        "SUPERVISOR_ADMIN",
      ),
    };
    const id = (params: unknown) =>
      z.object({ id: z.string().uuid() }).parse(params).id;
    const meta = (summary: string) => ({
      tags: ["Crusher report imports"],
      summary,
    });
    routes.post(
      "/crusher-report-imports",
      {
        ...auth,
        schema: {
          ...meta(
            "Upload one image and extract it inline through the configured vision model",
          ),
          consumes: ["multipart/form-data"],
          querystring: {
            type: "object",
            required: ["crusherId"],
            properties: { crusherId: { type: "string", format: "uuid" } },
          },
        },
      },
      async (request, reply) => {
        const { crusherId } = z
          .object({ crusherId: z.string().uuid() })
          .parse(request.query);
        let uploaded: Awaited<
          ReturnType<CrusherReportService["upload"]>
        > | null = null;
        // Consume all parts before persisting: a second file must not create a partial job.
        const files: Array<{
          filename: string;
          mimetype: string;
          bytes: Buffer;
        }> = [];
        for await (const part of request.parts())
          if (part.type === "file")
            files.push({
              filename: part.filename,
              mimetype: part.mimetype,
              bytes: await part.toBuffer(),
            });
        const file = files[0];
        if (files.length !== 1 || !file)
          throw new AppError(
            400,
            "IMAGE_REQUIRED",
            "Upload tepat satu gambar.",
          );
        uploaded = await service.upload(
          request.principal!,
          crusherId,
          file.filename,
          file.mimetype,
          file.bytes,
        );
        const processed = await service.process(
          request.principal!,
          uploaded.id,
        );
        return reply.code(200).send({ ok: true, item: processed });
      },
    );
    routes.get(
      "/crusher-report-imports",
      {
        ...auth,
        schema: meta(
          "List the most recent 30 imports for an authorized crusher",
        ),
      },
      async (request) => ({
        ok: true,
        items: await service.list(
          request.principal!,
          z.object({ crusherId: z.string().uuid() }).parse(request.query)
            .crusherId,
        ),
      }),
    );
    for (const path of [
      "/crusher-report-imports/:id",
      "/crusher-report-imports/:id/draft",
    ])
      routes.get(
        path,
        {
          ...auth,
          schema: meta(
            "Get import, draft, field observations and validation issues",
          ),
        },
        async (request, reply) => reply.header("Cache-Control", "private, no-store").send({
          ok: true,
          item: await service.get(request.principal!, id(request.params)),
        }),
      );
    routes.post(
      "/crusher-report-imports/:id/preview",
      {
        ...auth,
        schema: {
          ...meta("Preview the current VLM configuration without changing the import or reviewed draft"),
          body: z.toJSONSchema(ExternalVlmConsentSchema, { target: "draft-7" }),
        },
      },
      async (request, reply) => {
        ExternalVlmConsentSchema.parse(request.body);
        return reply.header("Cache-Control", "private, no-store").send({
          ok: true,
          diagnostics: await service.preview(request.principal!, id(request.params)),
        });
      },
    );
    routes.get(
      "/crusher-report-imports/:id/image",
      {
        ...auth,
        schema: meta(
          "Authenticated private source or aligned JPEG; never cached",
        ),
      },
      async (request, reply) => {
        const { aligned } = z
          .object({ aligned: z.enum(["true", "false"]).optional() })
          .parse(request.query);
        const file = await service.file(
          request.principal!,
          id(request.params),
          aligned === "true",
        );
        return reply
          .header("Cache-Control", "private, no-store")
          .header("X-Content-Type-Options", "nosniff")
          .type(file.mimeType)
          .send(file.bytes);
      },
    );
    routes.delete(
      "/crusher-report-imports/:id",
      {
        onRequest: app.auth.requireRoles("SUPERVISOR_ADMIN"),
        schema: meta(
          "Permanently delete an unconfirmed import, its images and extraction data",
        ),
      },
      async (request) => ({
        ok: true,
        ...(await service.remove(request.principal!, id(request.params))),
      }),
    );
    routes.get(
      "/crusher-report-imports/:id/assignments",
      {
        ...auth,
        schema: meta("Effective assignment candidates for review date/shift"),
      },
      async (request) => {
        const input = z
          .object({ operationDate: IsoDateSchema, shiftCode: ShiftCodeSchema })
          .parse(request.query);
        const items = await service.candidates(
          request.principal!,
          id(request.params),
          input,
        );
        return {
          ok: true,
          items: items.map((a) => ({
            ...a,
            updatedAt: a.updatedAt.toISOString(),
            activeNow: false,
            aa: a.aa.map((x) => ({
              ...x,
              lastEventAt: x.lastEventAt?.toISOString() ?? null,
            })),
          })),
        };
      },
    );
    routes.patch(
      "/crusher-report-imports/:id/draft",
      {
        ...auth,
        schema: {
          ...meta(
            "Save reviewed draft with optimistic revision; record each field correction",
          ),
          body: z.toJSONSchema(UpdateCrusherReportDraftSchema, {
            target: "draft-7",
          }),
        },
      },
      async (request) => {
        const input = UpdateCrusherReportDraftSchema.parse(request.body);
        return {
          ok: true,
          item: await service.save(
            request.principal!,
            id(request.params),
            input.revision,
            input.draft,
          ),
        };
      },
    );
    routes.post(
      "/crusher-report-imports/:id/confirm",
      {
        onRequest: app.auth.requireRoles("QC_ANALYST", "SUPERVISOR_ADMIN"),
        schema: {
          ...meta(
            "Atomically confirm report and append IMPORT retase events; idempotent",
          ),
          body: z.toJSONSchema(ConfirmCrusherReportSchema, {
            target: "draft-7",
          }),
        },
      },
      async (request) => {
        const input = ConfirmCrusherReportSchema.parse(request.body);
        return {
          ok: true,
          item: await service.confirm(
            request.principal!,
            id(request.params),
            input.revision,
            input.draft,
          ),
        };
      },
    );
    routes.post(
      "/crusher-report-imports/:id/reparse",
      {
        ...auth,
        schema: meta(
          "Retry a failed parser job without overwriting reviewed drafts",
        ),
      },
      async (request) => ({
        ok: true,
        item: await service.reparse(request.principal!, id(request.params)),
      }),
    );
  });
}
