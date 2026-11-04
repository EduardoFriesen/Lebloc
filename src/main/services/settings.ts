import type { SettingsInput } from '../../shared/schemas';
import type { Settings } from '../../shared/types';
import type { Context } from '../context';
import { getSetting, setSetting } from '../repos/settings';

const LOW_PASSES_KEY = 'low_passes_threshold';
const EXPIRY_WARNING_KEY = 'expiry_warning_days';
export const DEFAULT_LOW_PASSES_THRESHOLD = 2;
export const DEFAULT_EXPIRY_WARNING_DAYS = 7;

function readInteger(ctx: Context, key: string, fallback: number): number {
  const stored = Number(getSetting(ctx.db, key));
  return Number.isInteger(stored) ? stored : fallback;
}

export function getSettings(ctx: Context): Settings {
  return {
    lowPassesThreshold: readInteger(ctx, LOW_PASSES_KEY, DEFAULT_LOW_PASSES_THRESHOLD),
    expiryWarningDays: readInteger(ctx, EXPIRY_WARNING_KEY, DEFAULT_EXPIRY_WARNING_DAYS),
  };
}

export function updateSettings(ctx: Context, input: SettingsInput): Settings {
  ctx.db.transaction(() => {
    setSetting(ctx.db, LOW_PASSES_KEY, String(input.lowPassesThreshold));
    setSetting(ctx.db, EXPIRY_WARNING_KEY, String(input.expiryWarningDays));
  })();
  return getSettings(ctx);
}
