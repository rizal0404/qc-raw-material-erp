import { describe, expect, it } from 'vitest';
import { aggregateStockpileMixes, normalizeStockpileRectangle, stockpileRectanglesOverlap, validateStockpileRectangle } from './validation';
import type { StockpileMixSummaryRecord } from './types';

const chemistry={sio2:1,al2o3:1,fe2o3:1,cao:50,mgo:null,k2o:null,na2o:null,so3:null,h2o:null};
function mix(totalTon:number,cao:number):StockpileMixSummaryRecord{return{mixId:crypto.randomUUID(),mixCode:'MIX',materialKind:'LS',operationDate:'2026-08-21',plantId:null,pileId:crypto.randomUUID(),pileCode:'P',pileName:'Pile',className:'Timur',pileCycle:9,batchNo:1,tiangKe:null,totalTon,chemistry:{...chemistry,cao},quality:{lsf:null,sm:null,am:null,naeq:null,r2o3:null}};}

describe('stockpile map geometry',()=>{
  it('normalizes descending coordinates while retaining physical levels',()=>expect(normalizeStockpileRectangle({startPosition:9.5,endPosition:2,bottomLevel:.5,topLevel:2})).toEqual({startPosition:2,endPosition:9.5,bottomLevel:.5,topLevel:2}));
  it('allows fractional positions and rejects values outside the layout',()=>{
    expect(validateStockpileRectangle({axisLength:35,maxLevel:3} as never,{startPosition:1.25,endPosition:8.5,bottomLevel:0,topLevel:1.5}).endPosition).toBe(8.5);
    expect(()=>validateStockpileRectangle({axisLength:35,maxLevel:3} as never,{startPosition:-1,endPosition:8,bottomLevel:0,topLevel:1})).toThrow(/sumbu/);
  });
  it('treats touching rectangles as non-overlapping',()=>{
    expect(stockpileRectanglesOverlap({startPosition:0,endPosition:4,bottomLevel:0,topLevel:1},{startPosition:4,endPosition:8,bottomLevel:0,topLevel:1})).toBe(false);
    expect(stockpileRectanglesOverlap({startPosition:0,endPosition:4,bottomLevel:0,topLevel:1},{startPosition:2,endPosition:6,bottomLevel:.5,topLevel:1.5})).toBe(true);
  });
});

describe('stockpile mix aggregation',()=>{
  it('uses tonnage-weighted chemistry for layers containing multiple mixes',()=>{
    const aggregate=aggregateStockpileMixes([mix(100,50),mix(300,54)]);
    expect(aggregate.totalTon).toBe(400);
    expect(aggregate.chemistry.cao).toBe(53);
    expect(aggregate.mixCount).toBe(2);
  });
});
