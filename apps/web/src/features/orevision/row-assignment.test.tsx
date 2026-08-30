// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RowAssignment } from "./row-assignment";
import * as master from "../master/master-api";
import * as retase from "../retase/retase-api";
vi.mock("../master/master-api", () => ({
  masterKeys: { lookups: ["master", "lookups"] },
  createMaster: vi.fn(),
}));
vi.mock("../retase/retase-api", () => ({
  createOperationalAssignment: vi.fn(),
}));
const equipment = [
  {
    id: "am",
    vendorId: "vendor",
    type: "AM",
    unitNo: "AM-7",
    aliases: [],
    active: true,
    materialKinds: ["LS"],
    label: "AM-7",
  },
] as any;
const draft = {
  schemaVersion: "1.0",
  reportDate: "2026-08-28",
  shiftCode: "SHIFT_3",
  timezone: "Asia/Makassar",
  hours: [23, 0, 1, 2, 3, 4, 5, 6],
  header: { day: null, operatorName: null, crusherCode: null },
  vendors: [],
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
} as any;
const row = {
  rowIndex: 1,
  dtNo: "DT 007",
  equipmentId: null,
  retase: 1,
  assignmentAaId: null,
  reviewed: false,
};
function mount(props: Partial<Parameters<typeof RowAssignment>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const defaults = {
    row,
    vendorId: "vendor",
    assignments: [],
    equipment,
    draft,
    crusherId: "crusher",
    sources: [{ id: "source", active: true, materialKind: "LS", label: "B9" }],
    canCreate: true,
    disabled: false,
    demo: false,
    onApply: vi.fn(),
    onBusy: vi.fn(),
    onRefresh: vi.fn(async () => undefined),
  };
  const value = { ...defaults, ...props };
  render(
    <QueryClientProvider client={client}>
      <RowAssignment {...(value as any)} />
    </QueryClientProvider>,
  );
  return value;
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
describe("DT registration and AM assignment from photo review", () => {
  it("performs no database write until the user explicitly registers a missing DT", async () => {
    const value = mount();
    expect(master.createMaster).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Hubungkan DT baris 1" }),
    );
    expect(screen.getByText(/belum cocok dengan equipment/)).toBeTruthy();
    expect(master.createMaster).not.toHaveBeenCalled();
    vi.mocked(master.createMaster).mockResolvedValue({
      item: {
        id: "aa",
        vendorId: "vendor",
        type: "AA",
        unitNo: "7",
        aliases: [],
        active: true,
        materialKinds: ["LS"],
      },
    } as any);
    fireEvent.click(screen.getByRole("button", { name: /Daftarkan DT/ }));
    await waitFor(() =>
      expect(master.createMaster).toHaveBeenCalledWith(
        "equipment",
        expect.objectContaining({
          vendorId: "vendor",
          type: "AA",
          unitNo: "DT 007",
        }),
      ),
    );
    expect(
      await screen.findByText(/tersimpan di database equipment/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Alat Muat (AM)"), {
      target: { value: "am" },
    });
    fireEvent.change(screen.getByLabelText("Source assignment foto"), {
      target: { value: "source" },
    });
    vi.mocked(retase.createOperationalAssignment).mockResolvedValue({
      item: { aa: [{ aaId: "aa", assignmentAaId: "assignment" }] },
    } as any);
    fireEvent.click(
      screen.getByRole("button", { name: "Buat assignment & gunakan" }),
    );
    await waitFor(() =>
      expect(retase.createOperationalAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          operationDate: "2026-08-28",
          shiftCode: "SHIFT_3",
          crusherId: "crusher",
          amId: "am",
          sourceId: "source",
          aaIds: ["aa"],
        }),
      ),
    );
    expect(value.onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        equipmentId: "aa",
        assignmentAaId: "assignment",
        reviewed: false,
      }),
    );
  });
  it("keeps registration disabled for operators and demo mode", () => {
    mount({ canCreate: false });
    fireEvent.click(
      screen.getByRole("button", { name: "Hubungkan DT baris 1" }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: /Daftarkan DT/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    cleanup();
    mount({ demo: true });
    expect(
      (
        screen.getByRole("button", {
          name: "Hubungkan DT baris 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(master.createMaster).not.toHaveBeenCalled();
  });
});
