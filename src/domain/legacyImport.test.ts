import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { buildImportPlan, type ImportPlan, parseSheetDate, type Rows, splitName, summarizeImport } from './legacyImport';

const TODAY = '2026-10-05';
const SINCE = '2026-01-01';

/** Rows from arrays, column A first, starting at row 2 (row 1 is the header). */
function rows(...lines: (string | undefined)[][]): Rows {
  return new Map(
    lines.map((cells, index) => [
      index + 2,
      Object.fromEntries(cells.flatMap((value, column) => (value ? [[String.fromCharCode(65 + column), value]] : []))),
    ]),
  );
}

// Columns R:T of "Pagos Pases": pass type, local price, teacher price (pesos).
const PRICES: [string, string, string][] = [
  ['Libre x 4', '43000', '0'],
  ['Libre x 8', '51000', '0'],
  ['c/Profe x 4', '43000', '27000'],
  ['c/Profe x 8', '51000', '34000'],
  ['x DIA', '17000', '0'],
  ['XDIA + Profe', '17000', '13000'],
  ['Escuelita x4', '43000', '27000'],
  ['Escuelita x DIA', '17000', '13000'],
];

/** "Pagos Pases": payments A..M, with the price table alongside in R:T like the real sheet. */
function payments(...lines: (string | undefined)[][]): Rows {
  const height = Math.max(lines.length, PRICES.length);
  return rows(
    ...Array.from({ length: height }, (_, index) => {
      const line = lines[index] ?? [];
      return [...line, ...Array<undefined>(17 - line.length).fill(undefined), ...(PRICES[index] ?? [])];
    }),
  );
}

// PASES: DNI, name, ficha, start, attendance, type, teacher, notes.
const ANA = ['30111222', 'Ana Roca', '10.01.26', '12.01.26', '3', 'Libre x8', undefined, 'Viene los martes'];

function plan(sheets: Record<string, Rows>): ImportPlan {
  return buildImportPlan(new Map(Object.entries(sheets)), TODAY, SINCE);
}

const client = (result: ImportPlan, name: string) => result.clients.find((c) => `${c.firstName} ${c.lastName}`.trim() === name);
const warnings = (result: ImportPlan) => result.warnings.map((w) => `${w.sheet} ${w.row}: ${w.message}`);

describe('parseSheetDate', () => {
  it('reads day.month.year with any separator and a two or four digit year', () => {
    expect(parseSheetDate('12.01.26')).toBe('2026-01-12');
    expect(parseSheetDate('5.2.26')).toBe('2026-02-05');
    expect(parseSheetDate('04.07.2023')).toBe('2023-07-04');
    expect(parseSheetDate('22/04/25')).toBe('2025-04-22');
    expect(parseSheetDate('22,04,25')).toBe('2025-04-22');
    expect(parseSheetDate('14/10/26 Actualizacion')).toBe('2026-10-14');
  });

  it('reads Excel serial dates', () => {
    expect(parseSheetDate('45950')).toBe('2025-10-20');
  });

  it('gives null for dates without a year, impossible dates and text', () => {
    expect(parseSheetDate('2.08')).toBeNull();
    expect(parseSheetDate('31.02.26')).toBeNull();
    expect(parseSheetDate('Big Bang')).toBeNull();
    expect(parseSheetDate('')).toBeNull();
  });
});

describe('splitName', () => {
  it('takes the first word as the first name and the rest as the last name', () => {
    expect(splitName('Ana Roca')).toEqual({ firstName: 'Ana', lastName: 'Roca' });
    expect(splitName('  Josefina   Romero Vilchez ')).toEqual({ firstName: 'Josefina', lastName: 'Romero Vilchez' });
    expect(splitName('Toto')).toEqual({ firstName: 'Toto', lastName: '' });
  });
});

describe('buildImportPlan', () => {
  it('imports a client with DNI, notes, signed waiver and the current pass, paid in full', () => {
    const result = plan({
      PASES: rows(ANA),
      'Pagos Pases': payments(['10.01.26', '30111222', 'Ana Roca', 'Libre x 8', '1', '51000', 'Transferencia', '51000', undefined, '0', '0', '51000']),
    });
    expect(client(result, 'Ana Roca')).toEqual({
      sheet: 'PASES',
      row: 2,
      firstName: 'Ana',
      lastName: 'Roca',
      dni: '30111222',
      notes: 'Viene los martes',
      waiverSignedAt: '2026-01-10',
      enrolledAt: '2026-01-10',
      pass: {
        planKey: 'free8',
        teacher: null,
        startedAt: '2026-01-12',
        used: 3,
        totalCents: 5_100_000,
        payments: [{ paidAt: '2026-01-10', amountCents: 5_100_000, method: 'transfer' }],
        debtCents: 0,
      },
    });
    expect(result.plans).toEqual([{ key: 'free8', name: 'Libre x8', freePasses: 8, teacherPasses: 0, priceCents: 5_100_000, surchargeCents: 0 }]);
    expect(result.warnings).toEqual([]);
  });

  it('prices a pass with teacher from the table and owes what the payments do not cover', () => {
    const result = plan({
      PASES: rows(['30222333', 'Bruno Sierra', '5.02.26', '5.02.26', '2', 'c/Profe x4', 'fran ']),
      'Pagos Pases': payments(['5.02.26', undefined, 'bruno sierra', 'c/Profe x 4', '1', '43000', 'Efectivo', '43000', 'Fran', '7000', '7000', '50000']),
    });
    expect(client(result, 'Bruno Sierra')?.pass).toMatchObject({
      planKey: 'teacher4',
      teacher: 'Fran',
      totalCents: 7_000_000,
      payments: [{ paidAt: '2026-02-05', amountCents: 5_000_000, method: 'cash' }],
      debtCents: 2_000_000,
    });
    expect(result.plans).toEqual([{ key: 'teacher4', name: 'Con profe x4', freePasses: 0, teacherPasses: 4, priceCents: 4_300_000, surchargeCents: 2_700_000 }]);
    expect(result.teachers).toEqual([{ name: 'Fran', active: true }]);
  });

  it('keeps a client without pass when the pass started before the window, the date is unreadable or the type unknown', () => {
    const result = plan({
      PASES: rows(
        ['30444555', 'Dario Paz', '45950', '20.10.25', '4', 'Libre x4'],
        ['30333444', 'Carla Méndez', '4.07.23', '2.08', '6', 'Libre x4'],
        [undefined, 'Gabi Sol', undefined, '3.03.26', '1', 'Yoga x4'],
        [undefined, 'Hugo Rey', undefined, '3.03.26', '1'],
      ),
    });
    expect(result.clients.map((c) => [c.firstName, c.pass])).toEqual([
      ['Dario', null],
      ['Carla', null],
      ['Gabi', null],
      ['Hugo', null],
    ]);
    expect(client(result, 'Dario Paz')?.waiverSignedAt).toBe('2025-10-20');
    expect(warnings(result)).toEqual([
      'PASES 3: Fecha de inicio ilegible ("2.08"): se importó sin pase.',
      'PASES 4: Tipo de pase desconocido ("Yoga x4"): se importó sin pase.',
    ]);
  });

  it('sends a pass with teacher but no teacher to "Sin asignar", an inactive teacher', () => {
    const result = plan({ PASES: rows(['30555666', 'Eva Luna', '1.09.26', '1.09.26', '1', 'c/Profe x8']) });
    expect(client(result, 'Eva Luna')?.pass?.teacher).toBe('Sin asignar');
    expect(result.teachers).toEqual([{ name: 'Sin asignar', active: false }]);
    expect(warnings(result)).toContain('PASES 2: Pase con profe sin profe: quedó en "Sin asignar".');
  });

  it('rounds partial attendance down and caps it at the pack size, warning about both', () => {
    const result = plan({
      PASES: rows(
        ['1', 'Facundo Gil', undefined, '2.09.26', '5.5', 'Libre x4'],
        ['2', 'Iris Paz', undefined, '2.09.26', '7', 'Libre x4'],
        ['3', 'Juan Gris', undefined, '2.09.26', '∞', 'Libre x4'],
      ),
    });
    expect(result.clients.map((c) => c.pass?.used)).toEqual([4, 4, 0]);
    expect(warnings(result)).toEqual(
      expect.arrayContaining([
        'PASES 2: Asistencia con decimales ("5.5"): se tomó 5.',
        'PASES 3: Asistencia mayor al pase (7 de 4): se tomó 4.',
        'PASES 4: Asistencia ilegible ("∞"): se tomó 0.',
      ]),
    );
  });

  it('matches payments by DNI before the name, uses each payment once and ignores those before the pass', () => {
    const result = plan({
      PASES: rows(
        ['30666777', 'Facundo Gil', undefined, '2.09.26', '1', 'Libre x4'],
        [undefined, 'Ana Roca', undefined, '12.01.26', '1', 'Libre x8'],
        [undefined, 'Ana Roca', undefined, '12.01.26', '1', 'Libre x8'],
      ),
      'Pagos Pases': payments(
        ['3.11.25', undefined, 'Ana Roca', 'Libre x 8', '1', '51000', 'Efectivo', '51000', undefined, '0', '0', '51000'],
        ['10.01.26', undefined, 'Ana Roca', 'Libre x 8', '1', '51000', 'Efectivo', '51000', undefined, '0', '0', '51000'],
        ['2.09.26', '30666777', 'Facu Gil', 'Libre x 4', '1', '43000', 'Debito', '43000', undefined, '0', '0', '43000'],
      ),
    });
    expect(result.clients.map((c) => [c.firstName, c.pass?.payments.map((p) => [p.paidAt, p.method])])).toEqual([
      ['Facundo', [['2026-09-02', 'transfer']]],
      ['Ana', [['2026-01-10', 'cash']]],
      ['Ana', []],
    ]);
    expect(result.clients[2]?.pass?.debtCents).toBe(5_100_000);
    expect(warnings(result)).toEqual(['PASES 4: Sin cobros en Pagos Pases: quedó con la deuda total.']);
  });

  it('caps payments at the pass price and warns about the rest', () => {
    const result = plan({
      PASES: rows(['30666777', 'Facundo Gil', undefined, '2.09.26', '1', 'Libre x4']),
      'Pagos Pases': payments(['2.09.26', '30666777', 'Facu Gil', 'Libre x 4', '1', '43000', 'Debito', '43000', undefined, '0', '0', '50000', 'mas pedulas']),
    });
    expect(result.clients[0]?.pass).toMatchObject({ payments: [{ amountCents: 4_300_000 }], debtCents: 0 });
    expect(warnings(result)).toEqual(['PASES 2: Cobros por encima del precio del pase: se cargó hasta el precio.']);
  });

  it('carries the payment date down, guesses a missing year and falls back to pass plus teacher totals', () => {
    const result = plan({
      PASES: rows(
        [undefined, 'Toto', undefined, '3.03.26', '1', 'xDIA Libre'],
        [undefined, 'Lola Mar', undefined, '3.03.26', '1', 'xDIA Libre'],
      ),
      'Pagos Pases': payments(
        ['1.03.26', undefined, 'Otra Persona', 'x DIA', '1', '17000', 'Efectivo', '17000', undefined, '0', '0', '17000'],
        ['3.03', undefined, 'Toto', 'x DIA', '1', '17000', 'Mercado Pago', '17000', undefined, '0', '0', '#N/A'],
        [undefined, undefined, 'lola mar', 'x DIA', '1', '#N/A', 'efectivo', '#VALUE!', undefined, '#VALUE!', '#VALUE!', '#VALUE!'],
      ),
    });
    expect(result.clients.map((c) => c.pass?.payments)).toEqual([
      [{ paidAt: '2026-03-03', amountCents: 1_700_000, method: 'transfer' }],
      [{ paidAt: '2026-03-03', amountCents: 1_700_000, method: 'cash' }],
    ]);
  });

  it('imports the climbing school with Pipi as teacher, the age and the extra notes, sharing the teacher with PASES', () => {
    const result = plan({
      PASES: rows(['30666777', 'Facundo Gil', undefined, '2.09.26', '1', 'c/Profe x4', 'PIPI']),
      Escuelita: rows(
        ['55111222', 'Juli Soto', '7', 'Pase x 4', '1.08.26', '3.08.26', '2', 'Mama 3511234567'],
        [undefined, 'Benja', '6', 'x Dia', undefined, '5.09.26', '1', undefined, 'Pago hecho'],
        [undefined, 'THE ENCH OF THE FORMULA'],
      ),
      'Pagos Pases': payments(['3.08.26', undefined, 'Juli Soto', 'Escuelita x4', '1', '43000', 'Transferencia', '43000', 'Pipi', '27000', '27000', '70000']),
    });
    expect(client(result, 'Juli Soto')).toMatchObject({
      sheet: 'Escuelita',
      dni: '55111222',
      notes: 'Mama 3511234567\nEdad en la planilla: 7',
      waiverSignedAt: '2026-08-01',
      pass: { planKey: 'school4', teacher: 'Pipi', used: 2, debtCents: 0 },
    });
    expect(client(result, 'Benja')).toMatchObject({ notes: 'Pago hecho\nEdad en la planilla: 6', pass: { planKey: 'schoolDay', teacher: 'Pipi' } });
    expect(result.clients).toHaveLength(3);
    expect(result.teachers).toEqual([{ name: 'Pipi', active: true }]);
  });

  it('skips rows without a name, warning only when they hold something', () => {
    const result = plan({ PASES: rows(ANA, [undefined, undefined, undefined, undefined, '2'], ['Hasta aca funcionan las formulas']) });
    expect(result.clients.map((c) => c.firstName)).toEqual(['Ana']);
    expect(warnings(result)).toEqual(
      expect.arrayContaining(['PASES 3: Fila sin nombre: no se importó.', 'PASES 4: Fila sin nombre: no se importó.']),
    );
  });

  it('lists every teacher named in PASES once, active only with a current pass', () => {
    const result = plan({
      PASES: rows(
        ['1', 'Uno A', undefined, '2.09.26', '1', 'c/Profe x4', 'Lu'],
        ['2', 'Dos B', undefined, '2.09.24', '1', 'c/Profe x4', 'Gasti'],
        ['3', 'Tres C', undefined, '2.09.26', '1', 'c/Profe x4', 'lu'],
      ),
    });
    expect(result.teachers).toEqual([
      { name: 'Lu', active: true },
      { name: 'Gasti', active: false },
    ]);
  });

  it('leaves out a waiver signed in the future and enrolls on the waiver, the pass start or today', () => {
    const result = plan({
      PASES: rows(
        [undefined, 'Toto', '1.12.26', '3.03.26', '1', 'xDIA Libre'],
        [undefined, 'Sin Datos'],
      ),
    });
    expect(result.clients.map((c) => [c.waiverSignedAt, c.enrolledAt])).toEqual([
      [null, '2026-03-03'],
      [null, TODAY],
    ]);
    expect(warnings(result)).toContain('PASES 2: Ficha con fecha futura ("1.12.26"): se importó sin ficha.');
  });

  it('warns once when a plan has no price in the table', () => {
    const result = plan({
      PASES: rows(['1', 'Uno A', undefined, '2.09.26', '1', 'Mes x 40'], ['2', 'Dos B', undefined, '2.09.26', '1', 'Mes x 40']),
    });
    expect(result.plans).toEqual([{ key: 'month40', name: 'Mes x40', freePasses: 40, teacherPasses: 0, priceCents: 0, surchargeCents: 0 }]);
    expect(warnings(result).filter((w) => w.includes('precio'))).toEqual(['Pagos Pases 0: El plan "Mes x40" no tiene precio en la tabla: quedó en $0.']);
  });

  it('needs the PASES sheet', () => {
    expectDomainError(() => plan({ Yoga: rows(ANA) }), 'MISSING_PASES_SHEET');
  });
});

describe('summarizeImport', () => {
  it('counts clients by sheet, teachers, passes and what is owed', () => {
    const result = plan({
      PASES: rows(ANA, ['30222333', 'Bruno Sierra', '5.02.26', '5.02.26', '2', 'c/Profe x4', 'Fran'], [undefined, 'Hugo Rey']),
      Escuelita: rows(['55111222', 'Juli Soto', '7', 'Pase x 4', '1.08.26', '3.08.26', '2']),
      'Pagos Pases': payments(),
    });
    expect(summarizeImport(result)).toEqual({
      clients: 4,
      fromPases: 3,
      fromSchool: 1,
      teachers: 2,
      passes: 3,
      debtors: 3,
      debtCents: 5_100_000 + 7_000_000 + 7_000_000,
      warnings: result.warnings,
    });
  });
});
