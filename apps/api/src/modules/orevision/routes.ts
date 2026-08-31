import type { FastifyInstance } from "fastify";
import type { OreVisionSettingsInput } from "@qc/contracts";
import { createOreVisionSettings } from "./settings";
import { callVision, listGeminiModels } from "./provider";
import { AppError } from "../../lib/errors";

export async function registerOreVisionRoutes(app: FastifyInstance) {
  const store = createOreVisionSettings();
  const admin = { onRequest: app.auth.requireRoles("SUPERVISOR_ADMIN") };
  app.get(
    "/orevision/settings",
    {
      onRequest: app.auth.requireRoles(
        "CRUSHER_OPERATOR",
        "QC_ANALYST",
        "SUPERVISOR_ADMIN",
      ),
    },
    async () => ({ ok: true, item: store.view(await store.read()) }),
  );
  app.put("/orevision/settings", admin, async (request) => ({
    ok: true,
    item: await store.save(request.body as OreVisionSettingsInput),
  }));
  let testing = false;
  app.post("/orevision/models", admin, async (request) => {
    const settings = await store.resolveInput(
      request.body as OreVisionSettingsInput,
    );
    return { ok: true, items: await listGeminiModels(settings) };
  });
  app.post("/orevision/test", admin, async (request) => {
    if (testing)
      throw new AppError(
        429,
        "OREVISION_TEST_BUSY",
        "Uji koneksi sedang berjalan.",
      );
    testing = true;
    try {
      const settings = await store.resolveInput(
        request.body as OreVisionSettingsInput,
      );
      await callVision(
        settings,
        "Connection test. Return a short confirmation.",
      );
      return {
        ok: true,
        message: `Koneksi ${settings.provider} / ${settings.model} berhasil. Dukungan vision diuji saat ekstraksi foto.`,
      };
    } finally {
      testing = false;
    }
  });
}
