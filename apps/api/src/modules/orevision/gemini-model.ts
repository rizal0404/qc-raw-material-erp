import { AppError } from "../../lib/errors";

// Google returns resource names (models/...), while users also enter bare IDs.
export function geminiModelId(model: string): string {
  const id = model.trim().replace(/^models\//, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id))
    throw new AppError(
      400,
      "OREVISION_MODEL_INVALID",
      "Gunakan ID model Gemini atau models/ID, bukan URL maupun ID OpenRouter. Klik Muat model Gemini untuk melihat model yang tersedia.",
    );
  return id;
}
