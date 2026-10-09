import type { SettingsInput } from '../../shared/schemas';
import type { Settings } from '../../shared/types';
import type { Context } from '../context';
import { getSetting, setSetting } from '../repos/settings';

const LOW_PASSES_KEY = 'low_passes_threshold';
const WAIVER_MONTHS_KEY = 'waiver_validity_months';
export const DEFAULT_LOW_PASSES_THRESHOLD = 2;
export const DEFAULT_WAIVER_VALIDITY_MONTHS = 12;

function readInteger(ctx: Context, key: string, fallback: number): number {
  const stored = Number(getSetting(ctx.db, key));
  return Number.isInteger(stored) ? stored : fallback;
}

export function getSettings(ctx: Context): Settings {
  return {
    lowPassesThreshold: readInteger(ctx, LOW_PASSES_KEY, DEFAULT_LOW_PASSES_THRESHOLD),
    waiverValidityMonths: readInteger(ctx, WAIVER_MONTHS_KEY, DEFAULT_WAIVER_VALIDITY_MONTHS),
  };
}

export function updateSettings(ctx: Context, input: SettingsInput): Settings {
  ctx.db.transaction(() => {
    setSetting(ctx.db, LOW_PASSES_KEY, String(input.lowPassesThreshold));
    setSetting(ctx.db, WAIVER_MONTHS_KEY, String(input.waiverValidityMonths));
  })();
  return getSettings(ctx);
}
