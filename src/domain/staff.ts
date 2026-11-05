const HOURS_PATTERN = /^\d+([.,]\d+)?$/;

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/** Cost of a shift at the given hourly rate, rounded once to the cent. */
export function shiftCostCents(minutes: number, hourlyRateCents: number): number {
  return Math.round((minutes * hourlyRateCents) / 60);
}

/** "4,5" or "4.5" → 270 minutes; anything that isn't a non-negative number → null. */
export function parseHoursInput(text: string): number | null {
  const cleaned = text.trim();
  if (!HOURS_PATTERN.test(cleaned)) return null;
  return hoursToMinutes(Number(cleaned.replace(',', '.')));
}
