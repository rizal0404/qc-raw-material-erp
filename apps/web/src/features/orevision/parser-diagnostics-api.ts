import type { OreVisionDiagnostics } from "@qc/contracts";
import { apiFetch } from "../../lib/api-client";

export function previewPhotoParser(material: "LS" | "CL", importId: string) {
  const base = material === "CL" ? "/clay-report-imports" : "/crusher-report-imports";
  return apiFetch<{ ok: true; diagnostics: OreVisionDiagnostics }>(
    base + "/" + encodeURIComponent(importId) + "/preview",
    {
      method: "POST",
      body: JSON.stringify({ acknowledgeExternalVlm: true }),
    },
  );
}
