import type { SettingsInput } from '../../shared/schemas';
import type { Settings } from '../../shared/types';
import type { Context } from '../context';
import { getSetting, setSetting } from '../repos/settings';

const LOW_PASSES_KEY = 'low_passes_threshold';
export const DEFAULT_LOW_PASSES_THRESHOLD = 2;

export function getSettings(ctx: Context): Settings {
  const stored = Number(getSetting(ctx.db, LOW_PASSES_KEY));
  return { lowPassesThreshold: Number.isInteger(stored) ? stored : DEFAULT_LOW_PASSES_THRESHOLD };
}

export function updateSettings(ctx: Context, input: SettingsInput): Settings {
  setSetting(ctx.db, LOW_PASSES_KEY, String(input.lowPassesThreshold));
  return getSettings(ctx);
}
