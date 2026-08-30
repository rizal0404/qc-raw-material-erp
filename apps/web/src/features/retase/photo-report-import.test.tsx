// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CrusherReportDraft, CrusherReportImport } from "@qc/contracts";
import { PhotoReportImport } from "./photo-report-import";
import * as api from "./photo-report-api";
import { ApiClientError } from "../../lib/api-client";
import * as cropApi from "../orevision/image-crop";
vi.mock("../master/master-api", () => ({
  masterKeys: { lookups: ["master", "lookups"] },
  createMaster: vi.fn(),
  equipmentLookupQueryOptions: (vendorId: string) => ({
    queryKey: ["test-equipment", vendorId],
    queryFn: async () => ({
      items: [
        {
          id: "aa",
          vendorId: "vendor",
          type: "AA",
          unitNo: "24",
          aliases: ["DT 024"],
          active: true,
          materialKinds: ["LS"],
          label: "24",
        },
      ],
    }),
  }),
}));
const fixtures = vi.hoisted(() => ({ role: "QC_ANALYST" }));
vi.mock("../auth/auth-query", () => ({
  authQueryOptions: {
    queryKey: ["test-auth"],
    queryFn: async () => ({
      user: { role: fixtures.role, crusherIds: ["crusher"] },
    }),
  },
}));
vi.mock("../navigation/material-context", () => ({
  useMaterialLookups: () => ({
    data: {
      crushers: [
        { id: "crusher", label: "LS 5", materialKind: "LS", active: true },
      ],
      vendors: [{ id: "vendor", label: "Vendor A", active: true }],
      shifts: [
        {
          code: "SHIFT_2",
          label: "Shift 2",
          startTime: "15:30",
          endTime: "22:30",
        },
      ],
    },
  }),
}));
vi.mock("./photo-report-api", () => ({
  listPhotoReports: vi.fn(),
  getPhotoReport: vi.fn(),
  getPhotoReportImage: vi.fn(),
  deletePhotoReport: vi.fn(),
  getPhotoAssignments: vi.fn(),
  uploadPhotoReport: vi.fn(),
  savePhotoDraft: vi.fn(),
  confirmPhotoReport: vi.fn(),
  reparsePhotoReport: vi.fn(),
}));
vi.mock("../orevision/image-crop", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../orevision/image-crop")
  >();
  return {
    ...actual,
    cropPhotoReportImage: vi.fn(async (file: File) => file),
  };
});
const draft: CrusherReportDraft = {
  schemaVersion: "1.0",
  reportDate: "2026-08-18",
  shiftCode: "SHIFT_2",
  timezone: "Asia/Makassar",
  hours: [15, 16, 17, 18, 19, 20, 21, 22],
  header: { day: "Selasa", operatorName: null, crusherCode: null },
  vendors: [
    {
      blockKey: "upper-left",
      vendorCode: "BATARA",
      vendorId: "vendor",
      retaseTotal: 1,
      hourly: [15, 16, 17, 18, 19, 20, 21, 22].map((hour, i) => ({
        hour,
        retase: i === 0 ? 1 : 0,
      })),
      vehicles: [
        {
          rowIndex: 1,
          dtNo: "24",
          retase: 1,
          assignmentAaId: "assignment-aa",
          reviewed: true,
        },
      ],
    },
  ],
  production: {
    pileTon: null,
    fillerTon: null,
    totalTon: null,
    runningTimeHours: null,
    capacityTph: null,
  },
  pile: { baratPercent: null, timurPercent: null, totalPercent: null },
  notes: { raw: null },
  reportRetaseTotal: 1,
};
let item: CrusherReportImport;
beforeEach(() => {
  vi.resetAllMocks();
  fixtures.role = "QC_ANALYST";
  item = {
    id: "import",
    crusherId: "crusher",
    fileName: "test.jpg",
    sha256: "a".repeat(64),
    status: "READY",
    revision: 2,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    parserVersion: "test",
    templateVersion: "test",
    draft: structuredClone(draft),
    observations: [],
    issues: [],
    error: null,
    hasAlignedImage: true,
    reportId: null,
  };
  vi.mocked(api.listPhotoReports).mockImplementation(async () => ({
    items: [item],
  }));
  vi.mocked(api.getPhotoReport).mockImplementation(async () => ({ item }));
  vi.mocked(api.getPhotoReportImage).mockResolvedValue(
    new Blob(["image"], { type: "image/jpeg" }),
  );
  vi.mocked(api.deletePhotoReport).mockResolvedValue({
    ok: true,
    deletedId: "import",
  });
  vi.mocked(api.getPhotoAssignments).mockResolvedValue({
    items: [
      {
        id: "assignment",
        vendorId: "vendor",
        amUnitNo: "07",
        status: "ACTIVE",
        sourceName: "B9",
        validFrom: null,
        aa: [{ assignmentAaId: "assignment-aa", aaId: "aa", unitNo: "24" }],
      } as any,
    ],
  });
  vi.mocked(api.uploadPhotoReport).mockImplementation(async () => ({ item }));
  vi.mocked(api.savePhotoDraft).mockImplementation(
    async (_id, _revision, draft) => ({
      item: { ...item, draft, revision: 3 },
    }),
  );
  vi.mocked(api.confirmPhotoReport).mockImplementation(async () => ({
    item: { ...item, status: "CONFIRMED", revision: 4, reportId: "report" },
  }));
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(cleanup);
async function setup(details = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PhotoReportImport />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("option", { name: /test.jpg/ })).toBeTruthy(),
  );
  fireEvent.change(screen.getByLabelText("Riwayat import foto"), {
    target: { value: "import" },
  });
  await screen.findByLabelText("Retase baris 1");
  if (details) {
    fireEvent.click(screen.getByText(/Metadata laporan, produksi & catatan/));
    await screen.findByLabelText("Retase baris 1");
  }
  return queryClient;
}
const confirmButton = () =>
  screen.getByRole("button", {
    name: "Verifikasi & kirim ke rekonsiliasi",
  }) as HTMLButtonElement;
describe("photo report review UI", () => {
  it("preserves side-by-side vendor tabs with exactly one DT/retase review and logs/production below", async () => {
    await setup(false);
    expect(
      (
        document.querySelector(
          ".orevision-review-details",
        ) as HTMLDetailsElement
      ).open,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Buka data contoh" }));
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("table", { name: "Turus BATARA" })).toBeTruthy();
    expect(screen.getByText("Semua turus dan subtotal cocok")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Turus 15 DT baris 1"), {
      target: { value: "2" },
    });
    expect(
      (screen.getByLabelText("Retase baris 1") as HTMLInputElement).value,
    ).toBe("5");
    expect(screen.getByText(/Ada selisih turus/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simpan draft" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Simpan draft",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    expect(api.savePhotoDraft).not.toHaveBeenCalled();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[1]!.getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(
      document.querySelector(".orevision-review-summary .orevision-log-list"),
    ).toBeTruthy();
    expect(
      document.querySelector(".orevision-production-metrics"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Metadata laporan" }));
    expect(
      (
        document.querySelector(
          ".orevision-review-details",
        ) as HTMLDetailsElement
      ).open,
    ).toBe(true);
    expect(confirmButton().disabled).toBe(true);
  }, 20000);
  it("preserves extracted hourly values when resolving a missing shift with matching columns", async () => {
    item.draft!.shiftCode = null;
    item.draft!.vendors[0]!.vehicles[0]!.hourly = item.draft!.hours.map(
      (hour, i) => ({ hour, retase: i === 0 ? 1 : 0 }),
    );
    await setup();
    fireEvent.change(screen.getByLabelText("Shift"), {
      target: { value: "SHIFT_2" },
    });
    expect(
      (screen.getByLabelText("Turus 15 DT baris 1") as HTMLInputElement).value,
    ).toBe("1");
    expect(
      (screen.getByLabelText("Jam 15 upper-left") as HTMLInputElement).value,
    ).toBe("1");
    expect(
      (screen.getByLabelText("Review baris 1") as HTMLInputElement).checked,
    ).toBe(false);
  });
  it("keeps demo isolated, recalculates hourly edits, saves locally and exports the edited payload", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "Buka data contoh" }));
    expect(screen.getAllByLabelText("DT baris 1")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Turus 15 DT baris 1"), {
      target: { value: "2" },
    });
    expect(
      (screen.getByLabelText("Retase baris 1") as HTMLInputElement).value,
    ).toBe("5");
    fireEvent.click(screen.getByRole("button", { name: "Simpan draft" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Simpan draft",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    expect(api.savePhotoDraft).not.toHaveBeenCalled();
    expect(confirmButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Analitik ritase" }));
    expect(screen.getByText("Kontribusi ritase per vendor")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ekspor & API" }));
    const payload = JSON.parse(document.querySelector("pre")!.textContent!);
    expect(payload.vendors[0].records[0].h15).toBe(2);
    expect(payload.vendors[0].records[0].manualTotal).toBe(5);
    expect(api.confirmPhotoReport).not.toHaveBeenCalled();
  }, 20000);
  it("provides zoom, grid and contrast controls without changing source evidence", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "Perbesar gambar" }));
    expect(screen.getByText("125%")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Grid bantu"));
    fireEvent.click(screen.getByLabelText("Kontras tinggi"));
    expect(document.querySelector(".orevision-grid-overlay")).toBeTruthy();
    expect(
      (
        screen.getByRole("img", {
          name: "Sumber laporan harian Limestone",
        }) as HTMLImageElement
      ).style.filter,
    ).toContain("contrast");
    fireEvent.click(screen.getByRole("button", { name: "Reset tampilan" }));
    expect(screen.getByText("100%")).toBeTruthy();
    expect(document.querySelector(".orevision-grid-overlay")).toBeNull();
    expect(api.savePhotoDraft).not.toHaveBeenCalled();
  });
  it("submits the current reviewed draft in a single confirmation without a second review or save", async () => {
    await setup();
    expect(screen.queryByLabelText(/Saya sudah memeriksa/)).toBeNull();
    expect(screen.getAllByLabelText("DT baris 1")).toHaveLength(1);
    expect(screen.getAllByLabelText("Retase baris 1")).toHaveLength(1);
    expect(confirmButton().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Retase baris 1"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Total upper-left"), {
      target: { value: "2" },
    });
    expect(confirmButton().disabled).toBe(true);
    expect(
      (screen.getByLabelText("Review baris 1") as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.click(screen.getByLabelText("Review baris 1"));
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(api.confirmPhotoReport).toHaveBeenCalledWith(
        "import",
        2,
        expect.objectContaining({
          vendors: [
            expect.objectContaining({
              vehicles: [
                expect.objectContaining({
                  retase: 2,
                  assignmentAaId: "assignment-aa",
                  reviewed: true,
                }),
              ],
            }),
          ],
        }),
      ),
    );
    expect(api.savePhotoDraft).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("link", { name: "Buka rekonsiliasi retase" }),
    ).toBeTruthy();
  });
  it("retains dirty corrections when the API disconnects and reconnects without replaying writes", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Retase baris 1"), {
      target: { value: "9" },
    });
    vi.mocked(api.savePhotoDraft).mockRejectedValueOnce(
      new ApiClientError(
        0,
        "API_UNREACHABLE",
        "API aplikasi tidak dapat dihubungi.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Simpan draft" }));
    await screen.findByText("API aplikasi tidak dapat dihubungi.");
    fireEvent.click(
      screen.getByRole("button", { name: "Coba hubungkan lagi" }),
    );
    await waitFor(() => expect(api.getPhotoReport).toHaveBeenCalledTimes(2));
    expect(
      (screen.getByLabelText("Retase baris 1") as HTMLInputElement).value,
    ).toBe("9");
    expect(api.savePhotoDraft).toHaveBeenCalledTimes(1);
    expect(api.confirmPhotoReport).not.toHaveBeenCalled();
  });
  it("automatically links a unique vendor-report DT to AM and keeps manual editing available", async () => {
    item.draft!.vendors[0]!.vehicles[0]!.assignmentAaId = null;
    await setup();
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Assignment baris 1") as HTMLSelectElement)
          .value,
      ).toBe("assignment-aa"),
    );
    expect(
      screen.getByRole("option", {
        name: "Terhubung ke AM no '07' · B9",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Assignment baris 1"), {
      target: { value: "" },
    });
    expect(
      (screen.getByLabelText("Assignment baris 1") as HTMLSelectElement).value,
    ).toBe("");
    fireEvent.change(screen.getByLabelText("Assignment baris 1"), {
      target: { value: "assignment-aa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Simpan draft" }));
    await waitFor(() =>
      expect(api.savePhotoDraft).toHaveBeenCalledWith(
        "import",
        2,
        expect.objectContaining({
          vendors: [
            expect.objectContaining({
              vehicles: [
                expect.objectContaining({
                  equipmentId: "aa",
                  assignmentAaId: "assignment-aa",
                  reviewed: false,
                }),
              ],
            }),
          ],
        }),
      ),
    );
  });
  it("blocks final confirmation for operators and blocking issues", async () => {
    fixtures.role = "CRUSHER_OPERATOR";
    item.issues = [
      {
        code: "TEST",
        path: "vendors.0",
        severity: "BLOCKING",
        message: "Total tidak sesuai",
      },
    ];
    await setup();
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByText(/Total tidak sesuai/)).toBeTruthy();
  });
  it("does not lose dirty corrections when abandoning a report is declined", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Retase baris 1"), {
      target: { value: "9" },
    });
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.change(screen.getByLabelText("Riwayat import foto"), {
      target: { value: "" },
    });
    expect(
      (screen.getByLabelText("Retase baris 1") as HTMLInputElement).value,
    ).toBe("9");
  });
  it("shows permanent cleanup only to supervisors and deletes an unconfirmed import", async () => {
    fixtures.role = "SUPERVISOR_ADMIN";
    await setup(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Hapus file & data" }),
    );
    await waitFor(() =>
      expect(api.deletePhotoReport).toHaveBeenCalledWith("import"),
    );
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Hapus permanen"),
    );
    expect(
      await screen.findByText(
        "File gambar dan data laporan yang belum diverifikasi telah dihapus.",
      ),
    ).toBeTruthy();
  });
  it("does not offer cleanup to QC", async () => {
    await setup(false);
    expect(
      screen.queryByRole("button", { name: "Hapus file & data" }),
    ).toBeNull();
  });
  it("keeps confirmed reports visibly retained for supervisors", async () => {
    fixtures.role = "SUPERVISOR_ADMIN";
    item.status = "CONFIRMED";
    item.reportId = "report";
    await setup(false);
    expect(
      screen.queryByRole("button", { name: "Hapus file & data" }),
    ).toBeNull();
    expect(
      screen.getByText(
        "Arsip terverifikasi dilindungi dan tidak dapat dihapus.",
      ),
    ).toBeTruthy();
  });
  it("previews locally and uploads only after crop confirmation", async () => {
    await setup();
    vi.mocked(api.uploadPhotoReport).mockRejectedValueOnce(
      new Error("Gambar tidak valid"),
    );
    fireEvent.change(screen.getByLabelText("Upload foto laporan"), {
      target: {
        files: [new File(["test"], "test.jpg", { type: "image/jpeg" })],
      },
    });
    expect(api.uploadPhotoReport).not.toHaveBeenCalled();
    expect(
      screen.getByRole("img", { name: "Preview laporan yang akan di-crop" }),
    ).toBeTruthy();
    expect(screen.getByText(/File masih lokal/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Potong margin 5%" }));
    expect((screen.getByLabelText("Crop kiri") as HTMLInputElement).value).toBe(
      "5",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Crop & kirim ke VLM" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Gambar tidak valid",
      ),
    );
    expect(api.uploadPhotoReport).toHaveBeenCalledTimes(1);
    expect(cropApi.cropPhotoReportImage).toHaveBeenCalledWith(
      expect.any(File),
      { x: 5, y: 5, width: 90, height: 90 },
    );
  });
  it("can cancel a local preview without uploading it", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Upload foto laporan"), {
      target: {
        files: [new File(["test"], "cancel.jpg", { type: "image/jpeg" })],
      },
    });
    expect(
      screen.getByRole("img", { name: "Preview laporan yang akan di-crop" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(
      screen.queryByRole("img", { name: "Preview laporan yang akan di-crop" }),
    ).toBeNull();
    expect(api.uploadPhotoReport).not.toHaveBeenCalled();
  });
  it("clears DT-to-AM mapping when date context changes", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Tanggal laporan"), {
      target: { value: "2026-08-19" },
    });
    expect(
      (screen.getByLabelText("Assignment baris 1") as HTMLSelectElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Review baris 1") as HTMLInputElement).checked,
    ).toBe(false);
  });
  it("shows separate uncalibrated DT and retase scores and the crop of the focused field", async () => {
    item.observations = [
      {
        fieldPath: "vendors.0.vehicles.0.dtNo",
        rawText: "24",
        value: "24",
        confidence: 0.12,
        sourceMethod: "OCR",
        bbox: [0.1, 0.1, 0.06, 0.02],
        needsReview: true,
        geometry: "GRID",
        polygon: [
          [0.1, 0.1],
          [0.16, 0.1],
          [0.16, 0.12],
          [0.1, 0.12],
        ],
      },
      {
        fieldPath: "vendors.0.vehicles.0.retase",
        rawText: "1",
        value: 1,
        confidence: 0.7,
        sourceMethod: "OCR",
        bbox: [0.35, 0.1, 0.04, 0.02],
        needsReview: true,
      },
    ];
    await setup();
    expect(screen.getByLabelText("Skor DT baris 1").textContent).toContain(
      "12/100",
    );
    expect(screen.getByLabelText("Skor retase baris 1").textContent).toContain(
      "70/100",
    );
    expect(screen.getByText(/bukan persentase peluang benar/)).toBeTruthy();
    fireEvent.focus(screen.getByLabelText("DT baris 1"));
    expect(
      await screen.findByRole("img", { name: "Crop field terpilih" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("DT baris 1"), {
      target: { value: "25" },
    });
    expect(screen.getByLabelText("Skor DT baris 1").textContent).toContain(
      "dikoreksi",
    );
    fireEvent.click(screen.getByLabelText("Gambar normalisasi"));
    expect(
      screen.queryByRole("img", { name: "Crop field terpilih" }),
    ).toBeNull();
  });
  it("highlights warning tally data amber and blocking DT data pink", async () => {
    item.issues = [
      {
        code: "ROW_HOURLY_TOTAL_MATCH",
        path: "vendors.0.vehicles.0.retase",
        severity: "WARNING",
        message: "Jumlah turus per jam berbeda dari total retase DT.",
      },
      {
        code: "DT_REQUIRED",
        path: "vendors.0.vehicles.0.dtNo",
        severity: "BLOCKING",
        message: "No DT belum terbaca.",
      },
    ];
    await setup(false);
    expect(
      screen
        .getByLabelText("Retase baris 1")
        .classList.contains("orevision-warning-cell"),
    ).toBe(true);
    expect(
      screen
        .getByLabelText("DT baris 1")
        .classList.contains("orevision-blocking-cell"),
    ).toBe(true);
  });
  it("filters low OCR score independently from whether the row was reviewed", async () => {
    item.observations = ["dtNo", "retase"].map((field, i) => ({
      fieldPath: `vendors.0.vehicles.0.${field}`,
      rawText: i ? "1" : "24",
      value: i ? 1 : "24",
      confidence: i ? 0.7 : 0.1,
      sourceMethod: "OCR",
      bbox: null,
      needsReview: true,
    }));
    await setup();
    fireEvent.change(screen.getByLabelText("Filter masalah OCR"), {
      target: { value: "low" },
    });
    expect(screen.getByLabelText("DT baris 1")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Tampilkan hanya baris/));
    expect(screen.queryByLabelText("DT baris 1")).toBeNull();
    fireEvent.click(screen.getByLabelText(/Tampilkan hanya baris/));
    fireEvent.change(screen.getByLabelText("Filter masalah OCR"), {
      target: { value: "unreadable" },
    });
    expect(screen.queryByLabelText("DT baris 1")).toBeNull();
  });
  it("keeps source evidence attached to the physical row after another row is removed", async () => {
    item.draft!.vendors[0]!.vehicles.push({
      ...item.draft!.vendors[0]!.vehicles[0]!,
      rowIndex: 2,
    });
    item.observations = [
      {
        fieldPath: "vendors.0.vehicles.1.dtNo",
        rawText: "24",
        value: "24",
        confidence: 0.31,
        sourceMethod: "OCR",
        bbox: [0.1, 0.2, 0.04, 0.02],
        needsReview: true,
      },
    ];
    await setup();
    const row = screen.getByLabelText("DT baris 1").closest("tr")!;
    fireEvent.click(within(row).getByText("Bukti / aksi"));
    fireEvent.click(within(row).getByRole("button", { name: "Hapus" }));
    expect(screen.getByLabelText("Skor DT baris 2").textContent).toContain(
      "31/100",
    );
    fireEvent.focus(screen.getByLabelText("DT baris 2"));
    expect(screen.getByText(/vendors.0.vehicles.1.dtNo/)).toBeTruthy();
  });
});
