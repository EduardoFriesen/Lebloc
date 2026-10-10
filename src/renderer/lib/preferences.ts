import { z } from 'zod';

export type ThemePref = 'light' | 'dark' | 'auto';
export type FontSize = 'small' | 'normal' | 'large' | 'xlarge';
export interface Preferences {
  theme: ThemePref;
  fontSize: FontSize;
}

/** Root font size in px. Tailwind sizes are in rem, so this scales the whole UI. */
export const FONT_SIZES: Record<FontSize, number> = { small: 14, normal: 16, large: 18, xlarge: 20 };
export const DEFAULT_PREFERENCES: Preferences = { theme: 'auto', fontSize: 'normal' };

const STORAGE_KEY = 'lebloc:appearance';
const preferencesSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'auto']).catch(DEFAULT_PREFERENCES.theme),
    fontSize: z.enum(['small', 'normal', 'large', 'xlarge']).catch(DEFAULT_PREFERENCES.fontSize),
  })
  .catch(DEFAULT_PREFERENCES);

export function parsePreferences(raw: string | null): Preferences {
  if (raw === null) return DEFAULT_PREFERENCES;
  try {
    return preferencesSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function resolveTheme(theme: ThemePref, systemDark: boolean): 'light' | 'dark' {
  if (theme === 'auto') return systemDark ? 'dark' : 'light';
  return theme;
}

// Lo que sigue toca el DOM: es una preferencia de esta PC, guardada en localStorage.

const systemDarkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function loadPreferences(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(preferences.theme, systemDarkQuery().matches);
  root.style.fontSize = `${FONT_SIZES[preferences.fontSize]}px`;
}

export function savePreferences(preferences: Preferences): void {
  applyPreferences(preferences);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Sin almacenamiento disponible: el cambio vale solo para esta sesión.
  }
}

/** Applies the stored preferences before the first render and follows the system theme in "auto". */
export function initPreferences(): void {
  applyPreferences(loadPreferences());
  systemDarkQuery().addEventListener('change', () => applyPreferences(loadPreferences()));
}
