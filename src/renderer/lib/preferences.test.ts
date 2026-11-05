import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, FONT_SIZES, parsePreferences, resolveTheme } from './preferences';

describe('appearance preferences', () => {
  it('falls back to automatic theme and normal size when nothing valid is stored', () => {
    expect(DEFAULT_PREFERENCES).toEqual({ theme: 'auto', fontSize: 'normal' });
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('{not json')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('{"theme":"neon","fontSize":"huge"}')).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps each valid field and defaults only the broken one', () => {
    expect(parsePreferences('{"theme":"dark","fontSize":"large"}')).toEqual({ theme: 'dark', fontSize: 'large' });
    expect(parsePreferences('{"theme":"light","fontSize":"huge"}')).toEqual({ theme: 'light', fontSize: 'normal' });
  });

  it('resolves the automatic theme from the system setting', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('maps each font size to a root size in px, growing from small to extra large', () => {
    expect(FONT_SIZES.normal).toBe(16);
    expect(FONT_SIZES.small).toBeLessThan(FONT_SIZES.normal);
    expect(FONT_SIZES.large).toBeGreaterThan(FONT_SIZES.normal);
    expect(FONT_SIZES.xlarge).toBeGreaterThan(FONT_SIZES.large);
  });
});
