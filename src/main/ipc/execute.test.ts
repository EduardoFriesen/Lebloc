import { describe, expect, it, vi } from 'vitest';
import { ERROR_MESSAGES } from '../../domain/errors';
import { createTestContext, freePlan } from '../test-context';
import { execute, type Handlers } from './execute';
import { createHandlers, type BackupOps } from './handlers';
import { isTrustedSender } from './register';

const backup: BackupOps = {
  exportBackup: async () => ({ status: 'cancelled' }),
  restoreBackup: async () => ({ status: 'cancelled' }),
};

describe('execute', () => {
  const handlers = createHandlers(createTestContext(), backup);

  it('wraps successful results', async () => {
    const result = await execute('plans:create', freePlan, handlers, vi.fn());
    expect(result).toMatchObject({ success: true, data: { name: 'Pack 8 libres', freePasses: 8 } });
  });

  it('applies schema defaults before calling the handler', async () => {
    const result = await execute('clients:list', {}, handlers, vi.fn());
    expect(result).toEqual({ success: true, data: [] });
  });

  it('returns VALIDATION_ERROR with field details for invalid input', async () => {
    const result = await execute('plans:create', { ...freePlan, name: '' }, handlers, vi.fn());
    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    if (!result.success) {
      expect(result.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'name' })]));
    }
  });

  it('maps domain errors to their code and Spanish message', async () => {
    const result = await execute('payments:void', { id: 999 }, handlers, vi.fn());
    expect(result).toEqual({ success: false, error: { code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND } });
  });

  it('hides unexpected errors from the renderer and logs them', async () => {
    const logError = vi.fn();
    const failing: Handlers = {
      ...handlers,
      'plans:list': () => {
        throw new Error('SQLITE_CORRUPT: secret internal detail');
      },
    };
    const result = await execute('plans:list', {}, failing, logError);
    expect(result).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe('isTrustedSender', () => {
  const fileApp = 'file:///opt/lebloc/out/renderer/index.html';
  const devApp = 'http://localhost:5173';

  it('accepts the exact bundled index.html, ignoring hash and query', () => {
    expect(isTrustedSender(fileApp, fileApp)).toBe(true);
    expect(isTrustedSender(`${fileApp}#/clientes?x=1`, fileApp)).toBe(true);
  });

  it('rejects any other file, scheme or missing url in production', () => {
    expect(isTrustedSender('file:///tmp/dropped.html', fileApp)).toBe(false);
    expect(isTrustedSender('file:///opt/lebloc/out/renderer/other.html', fileApp)).toBe(false);
    expect(isTrustedSender('https://evil.example', fileApp)).toBe(false);
    expect(isTrustedSender(undefined, fileApp)).toBe(false);
  });

  it('matches the exact dev origin only', () => {
    expect(isTrustedSender('http://localhost:5173/#/clientes', devApp)).toBe(true);
    expect(isTrustedSender('http://localhost:51730/', devApp)).toBe(false);
    expect(isTrustedSender('http://localhost:5173.evil.example/', devApp)).toBe(false);
    expect(isTrustedSender('file:///tmp/x.html', devApp)).toBe(false);
  });
});
