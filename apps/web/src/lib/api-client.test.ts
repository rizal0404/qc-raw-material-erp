// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiClientError } from "./api-client";
afterEach(() => vi.restoreAllMocks());
describe("API network failures", () => {
  it("reports an unreachable API without replaying writes or expiring the session", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const expired = vi.fn();
    window.addEventListener("qc:auth-expired", expired);
    await expect(
      apiFetch("/write", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({ status: 0, code: "API_UNREACHABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener("qc:auth-expired", expired);
  });
  it("keeps HTTP provider errors distinct from network outages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "PROVIDER_REJECTED",
          message: "Provider menolak permintaan",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(
      apiFetch("/orevision/test", { method: "POST", body: "{}" }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 400,
        code: "PROVIDER_REJECTED",
      }),
    );
  });
});
