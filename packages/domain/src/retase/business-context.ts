import type { ShiftCode } from '@qc/contracts';
import type { ShiftRecord } from '../master/types';

const TZ = 'Asia/Makassar';

function pad2(value:number){ return String(value).padStart(2,'0'); }
function minuteOfDay(value:string):number{
  const [h,m]=value.slice(0,5).split(':').map(Number);
  if (h === undefined || m === undefined || !Number.isInteger(h) || !Number.isInteger(m)) throw new Error(`Format waktu tidak valid: ${value}`);
  return h*60+m;
}
function shiftContains(minute:number, shift:ShiftRecord):boolean{
  const start=minuteOfDay(shift.startTime), end=minuteOfDay(shift.endTime);
  if(shift.crossesMidnight)return minute>=start || minute<end;
  return minute>=start && minute<end;
}
function addDays(isoDate:string,delta:number):string{
  const d=new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate()+delta);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
}

export interface BusinessContext {
  operationDate:string;
  shiftCode:ShiftCode;
  localDate:string;
  localTime:string;
  localMinute:number;
}

export function localPartsAt(now:Date,timeZone=TZ):{date:string;time:string;minute:number}{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  const date=`${get('year')}-${get('month')}-${get('day')}`;
  const time=`${get('hour')}:${get('minute')}`;
  return {date,time,minute:minuteOfDay(time)};
}

export function businessContextAt(now:Date,shifts:ShiftRecord[],timeZone=TZ):BusinessContext{
  const local=localPartsAt(now,timeZone);
  const shift=shifts.find(s=>s.active&&shiftContains(local.minute,s));
  if(!shift)throw new Error(`Tidak ada shift aktif untuk ${local.time}.`);
  let operationDate=local.date;
  if(shift.crossesMidnight && local.minute < minuteOfDay(shift.endTime)) operationDate=addDays(local.date,-1);
  return {operationDate,shiftCode:shift.code as ShiftCode,localDate:local.date,localTime:local.time,localMinute:local.minute};
}

export function assignmentActiveAtLocalMinute(validFrom:string|null,validTo:string|null,shift:ShiftRecord,localMinute:number):boolean{
  if(!validFrom||!validTo)return true;
  const start=minuteOfDay(shift.startTime);
  const norm=(value:number)=>shift.crossesMidnight&&value<start?value+1440:value;
  const point=norm(localMinute), from=norm(minuteOfDay(validFrom)), to=norm(minuteOfDay(validTo));
  return point>=from && point<to;
}

export const COUNTER_TIMEZONE=TZ;
export const OPERATOR_UNDO_WINDOW_MS=10*60*1000;
