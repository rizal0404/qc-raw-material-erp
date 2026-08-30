import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  OREVISION_PROVIDERS,
  OreVisionSettingsSchema,
  type OreVisionProvider,
  type OreVisionSettingsInput,
  type OreVisionSettingsView,
} from "@qc/contracts";
import { AppError } from "../../lib/errors";
import { geminiModelId } from "./gemini-model";

const providers = Object.keys(OREVISION_PROVIDERS) as OreVisionProvider[];
const storedSchema = OreVisionSettingsSchema.omit({ apiKey: true }).extend({
  keys: z.record(z.string(), z.string().max(1000)),
});
export type EngineSettings = z.infer<typeof storedSchema>;
export function createOreVisionSettings(env: NodeJS.ProcessEnv = process.env) {
  // Private API-local storage. On Vercel, prefer environment configuration
  // unless an explicitly persistent OREVISION_SETTINGS_FILE is mounted.
  const path = resolve(
    env.OREVISION_SETTINGS_FILE ||
      (env.VERCEL
        ? `${tmpdir()}/orevision/settings.json`
        : "../../.runtime/orevision/settings.json"),
  );
  const customEndpoints = (env.OREVISION_CUSTOM_ENDPOINTS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const keys: Record<string, string> = {
    gemini: env.OREVISION_GEMINI_API_KEY || "",
    openai: env.OREVISION_OPENAI_API_KEY || "",
    openrouter: env.OREVISION_OPENROUTER_API_KEY || "",
    custom: env.OREVISION_CUSTOM_API_KEY || "",
  };
  async function read(): Promise<EngineSettings> {
    try {
      const stored = storedSchema.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
      // Keep legacy invalid IDs visible/editable; validate on save or use, not GET.
      if (stored.provider === "gemini")
        stored.model = stored.model.replace(/^models\//, "") || stored.model;
      return stored;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new AppError(
          503,
          "OREVISION_CONFIG_INVALID",
          "Konfigurasi OreVision tidak dapat dibaca. Hubungi administrator.",
        );
      const provider = (env.OREVISION_PROVIDER ||
        "gemini") as OreVisionProvider;
      return storedSchema.parse({
        provider,
        model:
          provider === "gemini"
            ? (env.OREVISION_MODEL || OREVISION_PROVIDERS.gemini.model).replace(
                /^models\//,
                "",
              )
            : env.OREVISION_MODEL || OREVISION_PROVIDERS[provider]?.model,
        customEndpoint:
          customEndpoints[0] || OREVISION_PROVIDERS.custom.endpoint,
        keys,
      });
    }
  }
  function view(settings: EngineSettings): OreVisionSettingsView {
    return {
      provider: settings.provider,
      model: settings.model,
      customEndpoint: settings.customEndpoint,
      hasApiKey: !!settings.keys[settings.provider],
      configuredProviders: providers.filter((p) => !!settings.keys[p]),
      customEndpoints,
    };
  }
  function checkEndpoint(
    settings: Pick<EngineSettings, "provider" | "customEndpoint">,
  ) {
    if (settings.provider !== "custom") return;
    const url = new URL(settings.customEndpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !customEndpoints.includes(settings.customEndpoint)
    ) {
      throw new AppError(
        400,
        "OREVISION_ENDPOINT_NOT_ALLOWED",
        "Endpoint custom harus tercantum persis di OREVISION_CUSTOM_ENDPOINTS pada server.",
      );
    }
  }
  async function resolveInput(input: OreVisionSettingsInput) {
    const parsed = OreVisionSettingsSchema.parse(input),
      previous = await read();
    const settings = {
      provider: parsed.provider,
      model:
        parsed.provider === "gemini"
          ? geminiModelId(parsed.model)
          : parsed.model,
      customEndpoint: parsed.customEndpoint,
      keys: {
        ...previous.keys,
        ...(parsed.apiKey !== undefined
          ? { [parsed.provider]: parsed.apiKey }
          : {}),
      },
    };
    checkEndpoint(settings);
    return settings;
  }
  // Serialize writes within an API process and replace the file atomically.
  let pending: Promise<unknown> = Promise.resolve();
  function save(input: OreVisionSettingsInput) {
    const task = pending.then(async () => {
      const settings = await resolveInput(input);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(settings), {
          mode: 0o600,
          flag: "wx",
        });
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
      return view(settings);
    });
    pending = task.catch(() => undefined);
    return task;
  }
  return { read, view, save, resolveInput, checkEndpoint };
}
