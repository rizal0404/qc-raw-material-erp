import { z } from "zod";
import { IsoDateSchema } from "./dates";

const text = z.string().max(500).nullable();
const count = z.number().int().min(0).max(5000).nullable();
const number = z.number().finite().min(0).nullable();
export const OreVisionLogSchema = z.object({
  time: text,
  text: z.string().max(5000),
  type: z.enum(["info", "warning", "stop"]),
});
export const OreVisionDocumentSchema = z.object({
  title: text,
  company: text,
  shiftText: text,
  startStop: text,
  location: text,
  signedBy: text,
  logs: z.array(OreVisionLogSchema).max(100),
  provider: z.string().max(40),
  model: z.string().max(200),
});

// Original OreVision JSON format; missing/illegible values are not zeroes.
export const OreVisionReportSchema = z.object({
  header: z.object({
    title: text,
    company: text,
    date: IsoDateSchema.nullable(),
    opRoom: text,
    shift: text,
    startStop: text,
  }),
  hours: z.array(z.number().int().min(0).max(23)).min(1).max(24).optional(),
  vendors: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().max(80),
        records: z
          .array(
            z
              .object({
                id: z.string().max(64),
                dt: z.string().max(64).nullable(),
                manualTotal: count,
              })
              .catchall(count),
          )
          .max(100),
        manualHeaderTotal: count,
      }),
    )
    .min(1)
    .max(12),
  logs: z.array(OreVisionLogSchema).max(100),
  footer: z.object({
    pileTon: number,
    fillerTon: number,
    totalTon: number,
    runningTime: number,
    capacityPerHour: number,
    stockPileBarat: number,
    stockPileTimur: number,
    totalStock: number,
    location: text,
    signedBy: text,
  }),
});
export type OreVisionReport = z.infer<typeof OreVisionReportSchema>;

export const OreVisionProviderSchema = z.enum([
  "gemini",
  "openai",
  "openrouter",
  "custom",
]);
export type OreVisionProvider = z.infer<typeof OreVisionProviderSchema>;
export const OREVISION_PROVIDERS = {
  gemini: {
    name: "Google Gemini",
    model: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    docUrl: "https://aistudio.google.com/app/apikey",
  },
  openai: {
    name: "OpenAI",
    model: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini"],
    endpoint: "https://api.openai.com/v1/chat/completions",
    docUrl: "https://platform.openai.com/api-keys",
  },
  openrouter: {
    name: "OpenRouter",
    model: "anthropic/claude-3.5-sonnet",
    models: ["anthropic/claude-3.5-sonnet", "google/gemini-2.5-flash"],
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    docUrl: "https://openrouter.ai/keys",
  },
  custom: {
    name: "Custom / Ollama / vLLM",
    model: "llama3.2-vision:latest",
    models: ["llama3.2-vision:latest", "qwen2-vl:7b"],
    endpoint: "http://localhost:11434/v1/chat/completions",
    docUrl: "",
  },
} as const;
export const OreVisionSettingsSchema = z.object({
  provider: OreVisionProviderSchema,
  model: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9_.:/-]+$/),
  customEndpoint: z.string().url().max(2000),
  // Omitted: keep provider key. Empty: clear provider key.
  apiKey: z.string().trim().max(1000).optional(),
});
export type OreVisionSettingsInput = z.infer<typeof OreVisionSettingsSchema>;
export type OreVisionSettingsView = Omit<OreVisionSettingsInput, "apiKey"> & {
  hasApiKey: boolean;
  configuredProviders: OreVisionProvider[];
  customEndpoints: string[];
};
