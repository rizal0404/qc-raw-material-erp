import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ConfirmClayPhotoReportSchema,
  UpdateClayPhotoReportDraftSchema,
} from "@qc/contracts";
import { AppError } from "../../lib/errors";
import {
  MAX_CLAY_REPORT_IMAGE_BYTES,
  type ClayPhotoReportService,
} from "./service";

const ExternalVlmConsentSchema = z.object({
  acknowledgeExternalVlm: z.literal(true),
});

export async function registerClayPhotoReportRoutes(
  app: FastifyInstance,
  service: ClayPhotoReportService,
) {
  await app.register(async (routes) => {
    await routes.register(multipart, {
      limits: {
        fileSize: MAX_CLAY_REPORT_IMAGE_BYTES,
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
      tags: ["Clay report image imports"],
      summary,
    });

    routes.post(
      "/clay-report-imports",
      {
        ...auth,
        schema: {
          ...meta("Privately store one Clay daily report image"),
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
        const item = await service.upload(
          request.principal!,
          crusherId,
          file.filename,
          file.mimetype,
          file.bytes,
        );
        return reply.code(200).send({ ok: true, item });
      },
    );

    routes.post(
      "/clay-report-imports/:id/process",
      {
        ...auth,
        schema: {
          ...meta(
            "Send a stored image to the configured VLM after explicit acknowledgement",
          ),
          body: z.toJSONSchema(ExternalVlmConsentSchema, {
            target: "draft-7",
          }),
        },
      },
      async (request) => {
        ExternalVlmConsentSchema.parse(request.body);
        return {
          ok: true,
          item: await service.process(
            request.principal!,
            id(request.params),
          ),
        };
      },
    );

    routes.get(
      "/clay-report-imports",
      { ...auth, schema: meta("List recent Clay image imports") },
      async (request) => ({
        ok: true,
        items: await service.list(
          request.principal!,
          z.object({ crusherId: z.string().uuid() }).parse(request.query)
            .crusherId,
        ),
      }),
    );

    routes.get(
      "/clay-report-imports/:id",
      { ...auth, schema: meta("Get Clay image import and reviewed draft") },
      async (request, reply) => reply.header("Cache-Control", "private, no-store").send({
        ok: true,
        item: await service.get(request.principal!, id(request.params)),
      }),
    );

    routes.post(
      "/clay-report-imports/:id/preview",
      {
        ...auth,
        schema: {
          ...meta("Preview the current Clay VLM configuration without changing the reviewed draft"),
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
      "/clay-report-imports/:id/image",
      {
        ...auth,
        schema: meta("Authenticated private source or normalized image"),
      },
      async (request, reply) => {
        const { aligned } = z
          .object({ aligned: z.enum(["true", "false"]).optional() })
          .parse(request.query);
        const source = await service.file(
          request.principal!,
          id(request.params),
          aligned === "true",
        );
        return reply
          .header("Cache-Control", "private, no-store")
          .header("X-Content-Type-Options", "nosniff")
          .type(source.mimeType)
          .send(source.bytes);
      },
    );

    routes.patch(
      "/clay-report-imports/:id/draft",
      {
        ...auth,
        schema: {
          ...meta("Save reviewed Clay photo draft with optimistic revision"),
          body: z.toJSONSchema(UpdateClayPhotoReportDraftSchema, {
            target: "draft-7",
          }),
        },
      },
      async (request) => {
        const input = UpdateClayPhotoReportDraftSchema.parse(request.body);
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
      "/clay-report-imports/:id/confirm",
      {
        onRequest: app.auth.requireRoles("QC_ANALYST", "SUPERVISOR_ADMIN"),
        schema: {
          ...meta(
            "Atomically confirm Clay photo data into the shift report and workbench",
          ),
          body: z.toJSONSchema(ConfirmClayPhotoReportSchema, {
            target: "draft-7",
          }),
        },
      },
      async (request) => {
        const input = ConfirmClayPhotoReportSchema.parse(request.body);
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
      "/clay-report-imports/:id/reparse",
      {
        ...auth,
        schema: {
          ...meta(
            "Retry a failed Clay VLM parser after explicit acknowledgement",
          ),
          body: z.toJSONSchema(ExternalVlmConsentSchema, {
            target: "draft-7",
          }),
        },
      },
      async (request) => {
        ExternalVlmConsentSchema.parse(request.body);
        return {
          ok: true,
          item: await service.reparse(
            request.principal!,
            id(request.params),
          ),
        };
      },
    );

    routes.delete(
      "/clay-report-imports/:id",
      {
        onRequest: app.auth.requireRoles("SUPERVISOR_ADMIN"),
        schema: meta("Delete an unconfirmed Clay image import"),
      },
      async (request) => ({
        ok: true,
        ...(await service.remove(request.principal!, id(request.params))),
      }),
    );
  });
}
