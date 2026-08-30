import { z } from "zod";
import { OREVISION_PROVIDERS } from "@qc/contracts";
import { AppError } from "../../lib/errors";
import type { EngineSettings } from "./settings";
import { geminiModelId } from "./gemini-model";

async function readJson(
  res: Response,
  limit = 4 * 1024 * 1024,
): Promise<unknown> {
  if (!res.body) throw new Error("Empty response");
  const reader = res.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Oversized response");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function providerError(res: Response, gemini: boolean): Promise<never> {
  // Read only a bounded error body; never echo provider text, credentials or prompts.
  const body = await readJson(res, 64 * 1024).catch(() => null);
  const reason = z
    .object({ error: z.object({ status: z.string().optional() }) })
    .safeParse(body);
  const invalidKey =
    reason.success && reason.data.error.status === "UNAUTHENTICATED";
  const details = { upstreamStatus: res.status };
  if (res.status === 404)
    throw new AppError(
      400,
      "OREVISION_MODEL_NOT_FOUND",
      gemini
        ? "Model Gemini tidak ditemukan atau tidak mendukung generateContent pada API v1beta. Klik Muat model Gemini, pilih ID yang tersedia untuk key ini, lalu uji kembali."
        : "Model atau endpoint provider tidak ditemukan (HTTP 404). Periksa ID model dan endpoint yang dipilih.",
      details,
    );
  if (res.status === 401 || res.status === 403 || invalidKey)
    throw new AppError(
      400,
      "OREVISION_KEY_REJECTED",
      "API key ditolak atau tidak memiliki akses ke model. Periksa key, izin API, dan pembatasan project pada provider.",
      details,
    );
  if (res.status === 429)
    throw new AppError(
      429,
      "OREVISION_QUOTA_EXCEEDED",
      "Kuota atau batas permintaan provider tercapai. Periksa kuota/billing dan coba lagi setelah batas direset.",
      details,
    );
  if (res.status === 400)
    throw new AppError(
      400,
      "OREVISION_REQUEST_REJECTED",
      "Provider menolak key atau parameter permintaan. Periksa validitas key, model, dan dukungan gambar/JSON; key Gemini harus berasal dari Google AI Studio / Gemini Developer API.",
      details,
    );
  if (res.status >= 500)
    throw new AppError(
      503,
      "OREVISION_PROVIDER_UNAVAILABLE",
      "Layanan provider AI sedang tidak tersedia. Coba lagi beberapa saat; konfigurasi dan draft tidak diubah.",
      details,
    );
  throw new AppError(
    502,
    "OREVISION_PROVIDER_ERROR",
    `Provider menolak permintaan (HTTP ${res.status}). Periksa konfigurasi provider.`,
    details,
  );
}

function requireKey(settings: EngineSettings) {
  const key = settings.keys[settings.provider]?.trim() || "";
  if (!key && settings.provider !== "custom")
    throw new AppError(
      400,
      "OREVISION_KEY_REQUIRED",
      `API key ${OREVISION_PROVIDERS[settings.provider].name} belum diisi. Masukkan key atau gunakan key provider ini yang sudah tersimpan.`,
    );
  return key;
}

async function requestProvider(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
) {
  try {
    return await fetcher(url, init);
  } catch (error) {
    const timeout =
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name);
    throw new AppError(
      503,
      timeout ? "OREVISION_PROVIDER_TIMEOUT" : "OREVISION_PROVIDER_UNREACHABLE",
      timeout
        ? "Provider terlalu lama merespons. Coba kembali atau pilih model yang lebih cepat."
        : "Server tidak dapat menghubungi provider AI. Periksa koneksi internet, proxy, dan alamat endpoint server.",
    );
  }
}

function geminiConnectionTestThinking(model: string) {
  const id = geminiModelId(model);
  if (/^gemini-3(?:\.|-)/.test(id)) return { thinkingLevel: "low" };
  if (/^gemini-2\.5-flash(?:$|-)/.test(id)) return { thinkingBudget: 0 };
  return undefined;
}

export async function listGeminiModels(
  settings: EngineSettings,
  fetcher: typeof fetch = fetch,
) {
  if (settings.provider !== "gemini")
    throw new AppError(
      400,
      "OREVISION_MODELS_UNSUPPORTED",
      "Daftar model otomatis tersedia untuk Gemini.",
    );
  const key = requireKey(settings);
  const schema = z.object({
    models: z
      .array(
        z.object({
          name: z.string(),
          displayName: z.string().optional(),
          supportedGenerationMethods: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    nextPageToken: z.string().optional(),
  });
  const models = new Map<string, { id: string; name: string }>();
  const seen = new Set<string>();
  let token = "";
  // Model discovery is metadata-only but can still cross a slow proxy. Keep it
  // comfortably below the Vercel request budget without producing a false 503.
  const signal = AbortSignal.timeout(60_000);
  try {
    do {
      const url = new URL(`${OREVISION_PROVIDERS.gemini.endpoint}/models`);
      url.searchParams.set("pageSize", "1000");
      if (token) url.searchParams.set("pageToken", token);
      const res = await requestProvider(
        url.toString(),
        { headers: { "x-goog-api-key": key }, redirect: "error", signal },
        fetcher,
      );
      if (!res.ok) await providerError(res, true);
      const page = schema.parse(await readJson(res));
      for (const model of page.models) {
        if (!model.supportedGenerationMethods?.includes("generateContent"))
          continue;
        const id = geminiModelId(model.name);
        models.set(id, { id, name: model.displayName || id });
      }
      token = page.nextPageToken || "";
      if (token && (seen.has(token) || seen.size >= 20))
        throw new Error("Invalid pagination");
      seen.add(token);
    } while (token);
    return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      "OREVISION_MODELS_INVALID",
      "Daftar model Gemini tidak dapat dibaca. Coba lagi atau masukkan ID model secara manual.",
    );
  }
}

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
                thought: z.boolean().optional(),
              }),
            ),
          })
          .optional(),
      }),
    )
    .optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .optional(),
});
export async function callVision(
  settings: EngineSettings,
  prompt: string,
  image?: Buffer,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const key = requireKey(settings);
  const gemini = settings.provider === "gemini";
  const endpoint = gemini
    ? `${OREVISION_PROVIDERS.gemini.endpoint}/models/${encodeURIComponent(geminiModelId(settings.model))}:generateContent`
    : settings.provider === "custom"
      ? settings.customEndpoint
      : OREVISION_PROVIDERS[settings.provider].endpoint;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key)
    headers[gemini ? "x-goog-api-key" : "Authorization"] = gemini
      ? key
      : `Bearer ${key}`;
  if (settings.provider === "openrouter")
    headers["X-Title"] = "QC Raw Material - OreVision";
  const body = gemini
    ? {
        contents: [
          {
            parts: [
              { text: prompt },
              ...(image
                ? [
                    {
                      inlineData: {
                        mimeType: "image/jpeg",
                        data: image.toString("base64"),
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
        generationConfig: {
          ...(image ? { responseMimeType: "application/json" } : {}),
          ...(!image
            ? { thinkingConfig: geminiConnectionTestThinking(settings.model) }
            : {}),
          // Thinking models share the output budget with internal reasoning.
          maxOutputTokens: image ? 24000 : 4096,
        },
      }
    : {
        model: settings.model,
        messages: [
          {
            role: "user",
            content: image
              ? [
                  { type: "text", text: prompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${image.toString("base64")}`,
                      detail: "high",
                    },
                  },
                ]
              : prompt,
          },
        ],
        ...(image ? { response_format: { type: "json_object" } } : {}),
        max_tokens: image
          ? settings.provider === "openai"
            ? 16000
            : 8192
          : 128,
      };
  try {
    const res = await requestProvider(
      endpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        // Leave time for image normalization and database finalization inside a
        // 300 second Vercel invocation.
        // A Gemini 3 connection check can legitimately take longer than 30s
        // even with low thinking. Image extraction retains the larger budget.
        signal: AbortSignal.timeout(image ? 240_000 : 90_000),
      },
      fetcher,
    );
    if (!res.ok) await providerError(res, gemini);
    const result = responseSchema.parse(await readJson(res));
    const candidate = result.candidates?.[0],
      choice = result.choices?.[0];
    if (
      candidate?.finishReason === "MAX_TOKENS" ||
      choice?.finish_reason === "length"
    )
      throw new AppError(
        502,
        "OREVISION_RESPONSE_TRUNCATED",
        "Respons model terpotong karena batas token. Pilih model dengan kapasitas output lebih besar atau coba kembali; hasil parsial tidak digunakan.",
      );
    if (
      gemini
        ? candidate?.finishReason !== "STOP"
        : choice?.finish_reason !== "stop" || !!choice?.message.refusal
    )
      throw new Error("Incomplete or refused response");
    const content = gemini
      ? candidate?.content?.parts
          .filter((p) => !p.thought)
          .map((p) => p.text ?? "")
          .join("")
      : choice?.message.content;
    if (!content?.trim()) throw new Error("Empty content");
    return content.trim();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      "OREVISION_RESPONSE_INVALID",
      "Respons OreVision terputus, ditolak, terlalu besar, atau tidak valid. Tidak ada data contoh yang digunakan.",
    );
  }
}
