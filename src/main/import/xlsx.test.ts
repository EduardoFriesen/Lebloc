import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { readWorkbook } from './xlsx';

const fixture = readFileSync(join(__dirname, 'fixtures', 'planilla-ejemplo.xlsx'));

describe('readWorkbook', () => {
  it('reads every sheet by name', () => {
    expect([...readWorkbook(fixture).keys()]).toEqual(['PASES', 'Pagos Pases', 'Escuelita']);
  });

  it('gives each row its cells by column, as text', () => {
    const pases = readWorkbook(fixture).get('PASES');
    expect(pases?.get(1)?.B).toBe('Nombre y Apellido');
    expect(pases?.get(3)).toEqual({ A: '30222333', B: 'Bruno Sierra', C: '5.02.26', D: '5.02.26', E: '2', F: 'c/Profe x4', G: 'Fran' });
  });

  it('joins rich text runs, reads inline strings and keeps cached formula errors', () => {
    const book = readWorkbook(fixture);
    expect(book.get('PASES')?.get(2)?.B).toBe('Ana Roca');
    expect(book.get('PASES')?.get(10)).toEqual({ A: 'Hasta aca funcionan las formulas' });
    expect(book.get('Pagos Pases')?.get(5)?.L).toBe('#N/A');
  });

  it('decodes XML entities and accents', () => {
    expect(readWorkbook(fixture).get('PASES')?.get(5)?.B).toBe('Carla Méndez');
  });

  it('skips empty rows', () => {
    expect(readWorkbook(fixture).get('PASES')?.has(11)).toBe(false);
  });

  it('rejects a file that is not a spreadsheet', () => {
    expectDomainError(() => readWorkbook(Buffer.from('no soy un zip')), 'INVALID_SPREADSHEET');
  });
});
