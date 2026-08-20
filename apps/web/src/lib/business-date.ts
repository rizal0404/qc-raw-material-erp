export const BUSINESS_TIMEZONE = 'Asia/Makassar';

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value ?? '';
}

export function businessDateToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`;
}

export function businessMonthToday(date = new Date()) {
  return businessDateToday(date).slice(0, 7);
}
