import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api-client";
import { previewPhotoParser } from "./parser-diagnostics-api";

vi.mock("../../lib/api-client", () => ({ apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("preview parser API", () => {
  it.each([["LS", "/crusher-report-imports"], ["CL", "/clay-report-imports"]] as const)("uses the scoped %s preview endpoint with explicit consent and no draft mutation", async (material, base) => {
    await previewPhotoParser(material, "import-id");
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith(base + "/import-id/preview", {
      method: "POST", body: JSON.stringify({ acknowledgeExternalVlm: true }),
    });
  });
});
