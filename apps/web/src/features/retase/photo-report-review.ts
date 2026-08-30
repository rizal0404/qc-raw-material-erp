import type { CrusherReportDraft, CrusherReportObservation } from '@qc/contracts';

const sourceBlocks = ['upper-left', 'upper-right', 'lower-left', 'lower-right'];
type Row = CrusherReportDraft['vendors'][number]['vehicles'][number];
export type PhotoRowFilter = 'all' | 'low' | 'unreadable' | 'geometry' | 'mapping';

export function rowObservation(observations: CrusherReportObservation[], blockKey: string, rowIndex: number, field: 'dtNo' | 'retase') {
  const vision = observations.find(o => o.sourceBlockKey === blockKey && o.sourceRowIndex === rowIndex && o.fieldPath.endsWith(`.${field}`));
  if (vision) return vision;
  const block = sourceBlocks.indexOf(blockKey);
  if (block < 0) return undefined;
  return observations.find(o => o.fieldPath === `vendors.${block}.vehicles.${rowIndex - 1}.${field}`);
}

export function scoreDescription(observation: CrusherReportObservation | undefined, value: unknown): string {
  if (!observation) return 'tanpa observasi';
  const corrected = observation.value !== value;
  if (observation.confidenceKind === 'NOT_PROVIDED') return `${corrected ? 'dikoreksi · ' : ''}AI vision · tanpa skor`;
  const unreadable = observation.value === null || observation.value === '';
  return `${corrected ? 'dikoreksi · skor awal ' : unreadable ? 'tidak terbaca · ' : ''}${Math.round(observation.confidence * 100)}/100`;
}

export function matchesPhotoRowFilter(row: Row, filter: PhotoRowFilter, dt?: CrusherReportObservation, retase?: CrusherReportObservation): boolean {
  switch (filter) {
    case 'low': return [dt, retase].some(o => !o || o.value === null || o.value === '' || o.confidence < .5);
    case 'unreadable': return !row.dtNo.trim() || row.retase === null;
    case 'geometry': return [dt, retase].some(o => !o?.geometry || o.geometry !== 'GRID');
    case 'mapping': return (row.retase ?? 0) > 0 && !row.assignmentAaId;
    default: return true;
  }
}
