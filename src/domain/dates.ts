const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function parseIsoDate(iso: string): [number, number, number] {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`Invalid ISO date: ${iso}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function utcDay(iso: string): number {
  const [year, month, day] = parseIsoDate(iso);
  return Date.UTC(year, month - 1, day);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcDay(toIso) - utcDay(fromIso)) / DAY_MS);
}

export function addMonths(iso: string, months: number): string {
  const [year, month, day] = parseIsoDate(iso);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay)));
  return target.toISOString().slice(0, 10);
}
