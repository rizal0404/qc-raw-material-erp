// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OreVisionDiagnostics, OreVisionSettingsView } from "@qc/contracts";
import { ParserDiagnostics } from "./parser-diagnostics";
import { previewPhotoParser } from "./parser-diagnostics-api";
import { apiFetch } from "../../lib/api-client";

vi.mock("./engine-settings", () => ({ EngineSettings: () => <span>Pengaturan engine</span> }));
vi.mock("./parser-diagnostics-api", () => ({ previewPhotoParser: vi.fn() }));
vi.mock("../../lib/api-client", () => ({ apiFetch: vi.fn() }));

const settings: OreVisionSettingsView = {
  provider: "gemini", model: "gemini-2.5-flash",
  customEndpoint: "http://localhost:11434/v1/chat/completions",
  systemPrompt: "Instruksi tersimpan", temperature: null, topP: null, maxOutputTokens: null,
  hasApiKey: true, configuredProviders: ["gemini"], customEndpoints: [],
};
const diagnostics: OreVisionDiagnostics = {
  version: 1, capturedAt: "2026-08-30T10:00:00.000Z",
  input: {
    provider: "gemini", model: "gemini-2.5-flash", systemPrompt: "Instruksi saat ekstraksi asli",
    prompt: "Format laporan Limestone", temperature: 0, topP: null, maxOutputTokens: 8192,
    image: { width: 1200, height: 1600, mimeType: "image/jpeg", bytes: 102400 },
    shiftHours: { SHIFT_1: [7, 8, 9] },
  },
  rawOutput: "```json\n{\"header\":{\"date\":\"2026-08-29\"}}\n```",
  rawOutputTruncated: false,
  parsedOutput: { header: { date: "2026-08-29" } },
  normalizedDraft: { reportDate: "2026-08-29", note: "Draft asli sebelum koreksi" },
  error: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockResolvedValue({ item: settings });
  vi.mocked(previewPhotoParser).mockResolvedValue({ ok: true, diagnostics: { ...diagnostics, rawOutput: "hasil eksperimen baru" } });
});
afterEach(cleanup);

function setup(props: Partial<Parameters<typeof ParserDiagnostics>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const renderPanel = (overrides = props) => (
    <QueryClientProvider client={client}>
      <ParserDiagnostics diagnostics={diagnostics} importId="import-1" material="LS" status="NEEDS_REVIEW" canManage {...overrides} />
    </QueryClientProvider>
  );
  const result = render(renderPanel());
  return { ...result, client, rerenderPanel: (overrides: typeof props) => result.rerender(renderPanel(overrides)) };
}

async function openPanel() {
  fireEvent.click(screen.getByText("Input / output VLM & tuning parser"));
  await screen.findByRole("heading", { name: "Diagnostik ekstraksi" });
  await screen.findByText(/Konfigurasi tersimpan:/);
}

describe("Parser diagnostics", () => {
  it("shows input, raw text, parsed JSON, and original draft separately without calling the VLM", async () => {
    setup();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    await openPanel();
    expect(screen.getByRole("tabpanel").textContent).toContain("Instruksi saat ekstraksi asli");
    fireEvent.click(screen.getByRole("tab", { name: "Output VLM mentah" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("```json");
    fireEvent.click(screen.getByRole("tab", { name: "Hasil parsing VLM" }));
    expect(screen.getByRole("tabpanel").textContent).toContain('"date": "2026-08-29"');
    expect(screen.getByRole("tabpanel").textContent).not.toContain("```json");
    fireEvent.click(screen.getByRole("tab", { name: "Draft hasil parser" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("Draft asli sebelum koreksi");
    expect(previewPhotoParser).not.toHaveBeenCalled();
  });

  it("requires consent before preview and labels the response as an unsaved experiment", async () => {
    setup({ material: "CL", status: "CONFIRMED" });
    await openPanel();
    const button = screen.getByRole("button", { name: "Jalankan uji parser" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Saya menyetujui pengiriman ulang/ }));
    fireEvent.click(button);
    await screen.findByText(/Hasil eksperimen saja/);
    expect(previewPhotoParser).toHaveBeenCalledExactlyOnceWith("CL", "import-1");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "Output VLM mentah" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("hasil eksperimen baru");
    fireEvent.click(screen.getByRole("button", { name: "Arsip ekstraksi laporan" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("```json");
    expect(screen.getByRole("tabpanel").textContent).not.toContain("hasil eksperimen baru");
  });

  it("clears experiments and consent when saved parameters change", async () => {
    const { client } = setup();
    await openPanel();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Jalankan uji parser" }));
    await screen.findByText(/Hasil eksperimen saja/);
    act(() => client.setQueryData(["orevision-settings"], { item: { ...settings, systemPrompt: "Konfigurasi baru" } }));
    await waitFor(() => expect(screen.queryByText(/Hasil eksperimen saja/)).toBeNull());
    expect((screen.getByRole("button", { name: "Eksperimen terakhir" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("keeps failed raw responses visible even when parsing produced no draft", async () => {
    const raw = '<script>alert("vlm text")</script>';
    setup({ status: "FAILED", diagnostics: { ...diagnostics, rawOutput: raw, rawOutputTruncated: true, parsedOutput: null, normalizedDraft: null, error: { code: "INVALID_JSON", message: "JSON tidak valid", issues: [{ path: "header.date", code: "invalid_type", message: "Tanggal wajib berupa string" }] } } });
    await openPanel();
    expect(screen.getByRole("alert").textContent).toContain("INVALID_JSON");
    expect(screen.getByText(/snapshot hanya menyimpan sebagian output/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Output VLM mentah" }));
    expect(screen.getByRole("tabpanel").textContent).toContain(raw);
    expect(document.querySelector("script")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Validasi parser" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("header.date");
  });

  it("handles old imports without fabricated raw output and blocks concurrent processing previews", async () => {
    setup({ diagnostics: null, status: "PROCESSING" });
    await openPanel();
    expect(screen.getByText(/Import lama tidak menyimpan respons VLM/)).toBeTruthy();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Jalankan uji parser" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not attach a late preview response to another import", async () => {
    let finish!: (result: { ok: true; diagnostics: OreVisionDiagnostics }) => void;
    vi.mocked(previewPhotoParser).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { rerenderPanel } = setup();
    await openPanel();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Jalankan uji parser" }));
    await waitFor(() => expect(previewPhotoParser).toHaveBeenCalled());
    rerenderPanel({ importId: "import-2" });
    await act(async () => finish({ ok: true, diagnostics: { ...diagnostics, rawOutput: "Wrong import" } }));
    expect(screen.queryByText(/Hasil eksperimen saja/)).toBeNull();
    const sources = screen.getByRole("group", { name: "Sumber diagnostik" });
    expect((within(sources).getByRole("button", { name: "Eksperimen terakhir" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
