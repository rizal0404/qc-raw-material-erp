import { describe,expect,it } from 'vitest';
import { CrusherReportObservationSchema } from '@qc/contracts';

const oldObservation={fieldPath:'vendors.0.vehicles.0.dtNo',rawText:'07',value:'07',confidence:.7,sourceMethod:'OCR',bbox:[.1,.1,.05,.02],needsReview:true};

describe('photo observation compatibility',()=>{
  it('accepts old observations without geometry or calibration metadata',()=>{
    expect(CrusherReportObservationSchema.parse(oldObservation).polygon).toBeUndefined();
  });
  it('preserves the grid polygon and uncalibrated score marker',()=>{
    const value={...oldObservation,geometry:'GRID',confidenceKind:'UNCALIBRATED',polygon:[[.1,.1],[.15,.1],[.15,.12],[.1,.12]]};
    expect(CrusherReportObservationSchema.parse(value)).toEqual(value);
  });
  it('rejects out-of-image polygon coordinates',()=>{
    expect(CrusherReportObservationSchema.safeParse({...oldObservation,polygon:[[.1,.1],[2,.1],[.15,.12],[.1,.12]]}).success).toBe(false);
  });
});
