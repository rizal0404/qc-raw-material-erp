// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EngineSettings } from "./engine-settings";
import { apiFetch } from "../../lib/api-client";
vi.mock("../../lib/api-client", () => ({ apiFetch: vi.fn() }));
const settings = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  customEndpoint: "http://localhost:11434/v1/chat/completions",
  hasApiKey: false,
  configuredProviders: [],
  customEndpoints: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockImplementation(async (path, init) => {
    if (path === "/orevision/test") return { message: "Koneksi berhasil" };
    return {
      item:
        init?.method === "PUT"
          ? {
              ...settings,
              ...JSON.parse(String(init.body)),
              apiKey: undefined,
              hasApiKey: true,
            }
          : settings,
    };
  });
});
afterEach(cleanup);
async function setup(canManage: boolean) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <EngineSettings canManage={canManage} />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: /Pengaturan AI · Google Gemini/ });
  fireEvent.click(screen.getByRole("button", { name: /Pengaturan AI/ }));
  await screen.findByLabelText("Model vision");
}
describe("OreVision settings UI", () => {
  it("switches providers, masks keys, tests the unsaved selection and persists server-side", async () => {
    await setup(true);
    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    expect(
      (screen.getByLabelText("Model vision") as HTMLInputElement).value,
    ).toBe("gpt-4o");
    fireEvent.change(screen.getByLabelText("API key OreVision"), {
      target: { value: "test-key" },
    });
    expect(
      (screen.getByLabelText("API key OreVision") as HTMLInputElement).type,
    ).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Tampilkan key" }));
    expect(
      (screen.getByLabelText("API key OreVision") as HTMLInputElement).type,
    ).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Uji koneksi" }));
    await screen.findByText("Koneksi berhasil");
    expect(apiFetch).toHaveBeenCalledWith(
      "/orevision/test",
      expect.objectContaining({ body: expect.stringContaining("test-key") }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Simpan konfigurasi" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/orevision/settings",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"provider":"openai"'),
        }),
      ),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("API key OreVision") as HTMLInputElement).value,
      ).toBe(""),
    );
    expect(localStorage.getItem("orevision_llm_keys")).toBeNull();
  });
  it("lets reviewers inspect settings without editing or testing server credentials", async () => {
    await setup(false);
    expect(
      (screen.getByLabelText("Model vision") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.queryByLabelText("API key OreVision")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Simpan konfigurasi" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Uji koneksi" })).toBeNull();
    expect(screen.getByLabelText("System prompt tambahan").matches(":disabled")).toBe(true);
    expect(screen.getByLabelText("Temperature VLM").matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Reset parameter & prompt" })).toBeNull();
  });
  it("sends the configured prompt and sampling parameters to both test and save", async () => {
    await setup(true);
    fireEvent.change(screen.getByLabelText("API key OreVision"), { target: { value: "test-key" } });
    fireEvent.change(screen.getByLabelText("System prompt tambahan"), { target: { value: "Jangan menebak angka yang tidak terbaca." } });
    fireEvent.change(screen.getByLabelText("Temperature VLM"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Top-p VLM"), { target: { value: "0.85" } });
    fireEvent.change(screen.getByLabelText("Batas output token VLM"), { target: { value: "4096" } });
    fireEvent.click(screen.getByRole("button", { name: "Uji koneksi" }));
    await screen.findByText("Koneksi berhasil");
    const expected = { systemPrompt: "Jangan menebak angka yang tidak terbaca.", temperature: 0, topP: 0.85, maxOutputTokens: 4096 };
    const testBody = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/orevision/test")![1]!.body;
    expect(JSON.parse(String(testBody))).toMatchObject(expected);
    fireEvent.click(screen.getByRole("button", { name: "Simpan konfigurasi" }));
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const savedBody = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === "PUT")![1]!.body;
    expect(JSON.parse(String(savedBody))).toMatchObject(expected);
    await screen.findByText(/hasil dan koreksi lama tidak berubah otomatis/);
  });
  it("validates numeric bounds and allows explicit reset to engine defaults", async () => {
    await setup(true);
    fireEvent.change(screen.getByLabelText("Temperature VLM"), { target: { value: "2.5" } });
    expect(screen.getByRole("alert").textContent).toContain("Temperature harus antara 0 dan 2");
    expect((screen.getByRole("button", { name: "Simpan konfigurasi" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Temperature VLM"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Top-p VLM"), { target: { value: "0" } });
    expect(screen.getByRole("alert").textContent).toContain("Top-p harus lebih dari 0");
    fireEvent.change(screen.getByLabelText("Top-p VLM"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Batas output token VLM"), { target: { value: "512.5" } });
    expect(screen.getByRole("alert").textContent).toContain("bilangan bulat");
    fireEvent.change(screen.getByLabelText("System prompt tambahan"), { target: { value: "prompt sementara" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset parameter & prompt" }));
    expect((screen.getByLabelText("System prompt tambahan") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText("Batas output token VLM") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Simpan konfigurasi" }));
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const body = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === "PUT")![1]!.body;
    expect(JSON.parse(String(body))).toMatchObject({ systemPrompt: "", temperature: null, topP: null, maxOutputTokens: null });
  });
  it("requires a provider key before testing and loads Gemini IDs using the unsaved key", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) =>
      path === "/orevision/models"
        ? { items: [{ id: "gemini-available", name: "Gemini available" }] }
        : path === "/orevision/test"
          ? { message: "PONG berhasil" }
          : { item: settings },
    );
    await setup(true);
    expect(
      (screen.getByRole("button", { name: "Uji koneksi" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Muat model Gemini",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("API key OreVision"), {
      target: { value: "draft-gemini-key" },
    });
    fireEvent.change(screen.getByLabelText("Model vision"), {
      target: { value: "https://incorrect-model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Muat model Gemini" }));
    await screen.findByLabelText("Model tersedia dari API Gemini");
    expect(apiFetch).toHaveBeenCalledWith(
      "/orevision/models",
      expect.objectContaining({
        body: expect.stringContaining('"apiKey":"draft-gemini-key"'),
      }),
    );
    fireEvent.change(screen.getByLabelText("Model tersedia dari API Gemini"), {
      target: { value: "gemini-available" },
    });
    expect(
      (screen.getByLabelText("Model vision") as HTMLInputElement).value,
    ).toBe("gemini-available");
    fireEvent.click(screen.getByRole("button", { name: "Uji koneksi" }));
    await screen.findByText("PONG berhasil");
    expect(apiFetch).toHaveBeenCalledWith(
      "/orevision/test",
      expect.objectContaining({
        body: expect.stringContaining('"model":"gemini-available"'),
      }),
    );
    expect(
      vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });
  it("keeps a saved key when clearing a replacement input and only deletes it explicitly", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) =>
      path === "/orevision/test"
        ? { message: "Koneksi key tersimpan berhasil" }
        : {
            item: {
              ...settings,
              hasApiKey: true,
              configuredProviders: ["gemini"],
            },
          },
    );
    await setup(true);
    fireEvent.change(screen.getByLabelText("API key OreVision"), {
      target: { value: "replacement" },
    });
    fireEvent.change(screen.getByLabelText("API key OreVision"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Uji koneksi" }));
    await screen.findByText("Koneksi key tersimpan berhasil");
    const body = vi
      .mocked(apiFetch)
      .mock.calls.find(([path]) => path === "/orevision/test")![1]!.body;
    expect(JSON.parse(String(body))).not.toHaveProperty("apiKey");
    fireEvent.click(
      screen.getByRole("button", { name: "Hapus key saat simpan" }),
    );
    expect(
      (screen.getByRole("button", { name: "Uji koneksi" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Simpan konfigurasi" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/orevision/settings",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"apiKey":""'),
        }),
      ),
    );
  });
  it("shows actionable Gemini 404 guidance instead of reporting connection success", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/orevision/test")
        throw new Error(
          "Model Gemini tidak ditemukan. Klik Muat model Gemini.",
        );
      return {
        item: { ...settings, hasApiKey: true, configuredProviders: ["gemini"] },
      };
    });
    await setup(true);
    fireEvent.click(screen.getByRole("button", { name: "Uji koneksi" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Muat model Gemini",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
