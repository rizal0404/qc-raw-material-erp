import type { MaterialKind } from '@qc/contracts';

function token(value: string): string {
  return value.trim().replace(/\s+/g, '').replace(/[./]/g, '-').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
}

export function buildMixCode(input: {
  materialKind: MaterialKind; operationDate: string; pileCode: string; shiftCode: string; batchNo?: number | null; tiangKe?: string | null; pileCycle: number;
}): string {
  const date = input.operationDate.replaceAll('-', '');
  const pile = token(input.pileCode);
  const shift = token(input.shiftCode);
  const cycle = String(input.pileCycle).padStart(2, '0');
  if (input.materialKind === 'LS') {
    if (!input.batchNo || input.batchNo <= 0) throw new Error('Batch_No wajib untuk Limestone.');
    return `LS-${date}-${pile}-${shift}-B${String(input.batchNo).padStart(2, '0')}-C${cycle}`;
  }
  if (!input.tiangKe?.trim()) throw new Error('Tiang_ke wajib untuk Clay.');
  return `CL-${date}-${pile}-${shift}-T${token(input.tiangKe)}-C${cycle}`;
}
