import { formatMoney } from '../shared/money';
import { fold } from '../shared/text';
import { parseIsoDate } from './dates';
import { DomainError } from './errors';

/**
 * The local's spreadsheet, before Lebloc: one row per client in PASES (their latest pass), the payments log in
 * "Pagos Pases" (with the price table in R:T) and the kids in Escuelita. These rules turn it into what the app
 * stores, and say what could not be read. Pure: the caller reads the file and writes the database.
 */

/** One sheet: row number -> { column letter: cell text }. */
export type Rows = Map<number, Record<string, string>>;

export type PlanKey =
  | 'free4'
  | 'free8'
  | 'free12'
  | 'teacher4'
  | 'teacher8'
  | 'teacher12'
  | 'dayFree'
  | 'dayTeacher'
  | 'month31'
  | 'month40'
  | 'school4'
  | 'school8'
  | 'schoolDay';

export interface LegacyPlan {
  key: PlanKey;
  name: string;
  freePasses: number;
  teacherPasses: number;
  priceCents: number;
  /** The teacher's part of the pack, from the table: it depends on the pack, not on the teacher. */
  surchargeCents: number;
}

export interface LegacyPayment {
  paidAt: string;
  amountCents: number;
  method: 'cash' | 'transfer';
}

export interface LegacyPass {
  planKey: PlanKey;
  teacher: string | null;
  startedAt: string;
  used: number;
  totalCents: number;
  payments: LegacyPayment[];
  debtCents: number;
}

export interface LegacyClient {
  sheet: 'PASES' | 'Escuelita';
  row: number;
  firstName: string;
  lastName: string;
  dni: string | null;
  notes: string | null;
  waiverSignedAt: string | null;
  enrolledAt: string;
  pass: LegacyPass | null;
}

export interface LegacyTeacher {
  name: string;
  active: boolean;
}

export interface ImportWarning {
  sheet: string;
  /** 0 for something about the whole sheet. */
  row: number;
  name: string | null;
  message: string;
}

export interface ImportPlan {
  plans: LegacyPlan[];
  teachers: LegacyTeacher[];
  clients: LegacyClient[];
  warnings: ImportWarning[];
}

export interface ImportSummary {
  clients: number;
  fromPases: number;
  fromSchool: number;
  teachers: number;
  passes: number;
  debtors: number;
  debtCents: number;
  warnings: ImportWarning[];
}

interface PlanSpec {
  name: string;
  free: number;
  teacher: number;
  /** Its row in the price table, as `typeKey` leaves it. */
  price: string;
}

const PLAN_SPECS: Record<PlanKey, PlanSpec> = {
  free4: { name: 'Libre x4', free: 4, teacher: 0, price: 'librex4' },
  free8: { name: 'Libre x8', free: 8, teacher: 0, price: 'librex8' },
  free12: { name: 'Libre x12', free: 12, teacher: 0, price: 'librex12' },
  teacher4: { name: 'Con profe x4', free: 0, teacher: 4, price: 'c/profex4' },
  teacher8: { name: 'Con profe x8', free: 0, teacher: 8, price: 'c/profex8' },
  teacher12: { name: 'Con profe x12', free: 0, teacher: 12, price: 'c/profex12' },
  dayFree: { name: 'Día libre', free: 1, teacher: 0, price: 'xdia' },
  dayTeacher: { name: 'Día con profe', free: 0, teacher: 1, price: 'xdia+profe' },
  month31: { name: 'Mes x31', free: 31, teacher: 0, price: 'mesx31' },
  month40: { name: 'Mes x40', free: 40, teacher: 0, price: 'mesx40' },
  school4: { name: 'Escuelita x4', free: 0, teacher: 4, price: 'escuelitax4' },
  school8: { name: 'Escuelita x8', free: 0, teacher: 8, price: 'escuelitax8' },
  schoolDay: { name: 'Escuelita día', free: 0, teacher: 1, price: 'escuelitaxdia' },
};

const PASES_TYPES: Record<string, PlanKey> = {
  librex4: 'free4',
  librex8: 'free8',
  librex12: 'free12',
  'c/profex4': 'teacher4',
  'c/profex8': 'teacher8',
  'c/profex12': 'teacher12',
  xdialibre: 'dayFree',
  'xdiac/profe': 'dayTeacher',
  mesx31: 'month31',
  mesx40: 'month40',
};

const SCHOOL_TYPES: Record<string, PlanKey> = { pasex4: 'school4', pasex8: 'school8', xdia: 'schoolDay' };

interface SheetLayout {
  sheet: LegacyClient['sheet'];
  types: Record<string, PlanKey>;
  dni: string;
  name: string;
  waiver: string;
  start: string;
  used: string;
  type: string;
  notes: string[];
  /** Column with the teacher's name, or the teacher of every pass in the sheet. */
  teacher: { column: string } | { fixed: string };
  age?: string;
}

const PASES_LAYOUT: SheetLayout = {
  sheet: 'PASES',
  types: PASES_TYPES,
  dni: 'A',
  name: 'B',
  waiver: 'C',
  start: 'D',
  used: 'E',
  type: 'F',
  teacher: { column: 'G' },
  notes: ['H'],
};

const SCHOOL_LAYOUT: SheetLayout = {
  sheet: 'Escuelita',
  types: SCHOOL_TYPES,
  dni: 'A',
  name: 'B',
  age: 'C',
  type: 'D',
  waiver: 'E',
  start: 'F',
  used: 'G',
  notes: ['H', 'I'],
  teacher: { fixed: 'Pipi' },
};

const UNASSIGNED = 'Sin asignar';
// Payments up to a week before the start count for the pass: people often pay a few days ahead.
const PAID_AHEAD_DAYS = 7;
const DAY_MS = 86_400_000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const MAX_NAME = 80;
const MAX_DNI = 20;
const MAX_NOTES = 1000;

/** How the sheet's pass names compare: "c/Profe x 8" and "c/profe x8" are the same. */
const typeKey = (text: string) => fold(text).replace(/\s+/g, '');
/** How people's names compare across sheets: no accents, case or extra spaces. */
const personKey = (text: string) => fold(text).trim().split(/\s+/).join(' ');

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const [year, month, day] = parseIsoDate(iso);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** "12.01.26", "4/7/2023", "22,04,25" or an Excel serial number; null without a year or for anything else. */
export function parseSheetDate(text: string): string | null {
  const token = text.trim().split(/\s+/)[0] ?? '';
  if (/^\d{5}$/.test(token)) return new Date(EXCEL_EPOCH + Number(token) * DAY_MS).toISOString().slice(0, 10);
  const match = /^(\d{1,2})[./,-](\d{1,2})[./,-](\d{4}|\d{2})$/.exec(token);
  if (!match) return null;
  const year = Number(match[3]);
  return isoDate(year < 100 ? 2000 + year : year, Number(match[2]), Number(match[1]));
}

/**
 * A date in the payments log: there it is written only on the first row of each day, sometimes without the year.
 * Takes the year from the previous date (the next one when that would go back more than half a year).
 */
function paymentDate(text: string, previous: string | null): string | null {
  const full = parseSheetDate(text);
  if (full) return full;
  const match = /^(\d{1,2})[./,-](\d{1,2})[./,-]?$/.exec(text.trim().split(/\s+/)[0] ?? '');
  if (!match || !previous) return previous;
  const year = Number(previous.slice(0, 4));
  const guess = isoDate(year, Number(match[2]), Number(match[1]));
  if (!guess) return previous;
  return guess < shiftDays(previous, -183) ? (isoDate(year + 1, Number(match[2]), Number(match[1])) ?? previous) : guess;
}

/** The first word is the first name; the rest, the last name (empty for a single word). */
export function splitName(full: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = full.trim().split(/\s+/);
  return { firstName: firstName.slice(0, MAX_NAME), lastName: rest.join(' ').slice(0, MAX_NAME) };
}

/** Pesos as the sheet writes them ("43000", "2900.5"); null for blanks, "#N/A" and other text. */
function cents(text: string | undefined): number | null {
  const value = text?.trim() ?? '';
  return /^\d+(\.\d+)?$/.test(value) ? Math.round(Number(value) * 100) : null;
}

function capitalize(name: string): string {
  const trimmed = name.trim();
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1).toLocaleLowerCase();
}

interface Price {
  local: number;
  teacher: number;
}

function readPrices(payments: Rows | undefined): Map<string, Price> {
  const prices = new Map<string, Price>();
  for (const [row, cells] of payments ?? []) {
    const local = cents(cells.S);
    if (row > 1 && cells.R && local !== null) prices.set(typeKey(cells.R), { local, teacher: cents(cells.T) ?? 0 });
  }
  return prices;
}

interface PaymentRow extends LegacyPayment {
  dni: string;
  name: string;
  /** What the pass cost when the row shows a price typed over the list one; null at list price. */
  pricedCents: number | null;
  taken: boolean;
}

function readPayments(payments: Rows | undefined, prices: Map<string, Price>): PaymentRow[] {
  const found: PaymentRow[] = [];
  let date: string | null = null;
  for (const [row, cells] of payments ?? []) {
    if (row === 1) continue;
    if (cells.A) date = paymentDate(cells.A, date);
    if (!cells.C || !date) continue;
    const quantity = Number(cells.E) > 0 ? Number(cells.E) : 1;
    const listed = prices.get(typeKey(cells.D ?? ''));
    const unit = cents(cells.F);
    const typed = cents(cells.H);
    // Rows lose their formulas (#N/A, #VALUE!, or blank in the newest ones): the missing parts come from the table.
    const local = typed ?? (listed ? listed.local * quantity : null);
    const teacherPart = cents(cells.K) ?? (listed ? listed.teacher * quantity : 0);
    const amountCents = cents(cells.L) ?? (local === null ? null : local + teacherPart);
    if (!amountCents) continue;
    found.push({
      paidAt: date,
      amountCents,
      method: fold(cells.G ?? '').trim() === 'efectivo' ? 'cash' : 'transfer',
      dni: cells.B?.trim() ?? '',
      name: personKey(cells.C),
      // "Total Pase" typed over unit × quantity: sold at another price (an event, a discount), not owed.
      pricedCents: typed !== null && unit !== null && typed !== unit * quantity ? typed + teacherPart : null,
      taken: false,
    });
  }
  return found;
}

type Warn = (message: string) => void;

function parseUsed(text: string | undefined, size: number, warn: Warn): number {
  const raw = text?.trim() ?? '';
  if (!raw) return 0;
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) {
    warn(`Asistencia ilegible ("${raw}"): se tomó 0.`);
    return 0;
  }
  const used = Math.floor(value);
  if (used !== value) warn(`Asistencia con decimales ("${raw}"): se tomó ${used}.`);
  if (used <= size) return used;
  warn(`Asistencia mayor al pase (${used} de ${size}): se tomó ${size}.`);
  return size;
}

/**
 * The payments of this person from a week before the pass on, by DNI first and then by name, each used once, and
 * what the pass cost: the table price, or the one typed in its payment row.
 */
function takePayments(pool: PaymentRow[], dni: string | null, name: string, startedAt: string, today: string, listedCents: number, warn: Warn) {
  const from = shiftDays(startedAt, -PAID_AHEAD_DAYS);
  const open = pool.filter((payment) => !payment.taken && payment.paidAt >= from && payment.paidAt <= today);
  const byDni = dni ? open.filter((payment) => payment.dni === dni) : [];
  const byName = open.filter((payment) => !byDni.includes(payment) && payment.name === name);
  const found = [...byDni, ...byName].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const priced = found.find((payment) => payment.pricedCents !== null)?.pricedCents ?? null;
  const totalCents = priced ?? listedCents;
  if (priced !== null && priced !== listedCents) {
    warn(`Se cobró ${formatMoney(priced)} en vez de ${formatMoney(listedCents)} de la tabla: se tomó lo cobrado como precio.`);
  }
  const payments: LegacyPayment[] = [];
  let left = totalCents;
  for (const payment of found) {
    payment.taken = true;
    const amountCents = Math.min(payment.amountCents, left);
    if (amountCents > 0) payments.push({ paidAt: payment.paidAt, amountCents, method: payment.method });
    left -= amountCents;
  }
  const paid = totalCents - left;
  if (found.reduce((sum, payment) => sum + payment.amountCents, 0) > totalCents) warn('Cobros por encima del precio del pase: se cargó hasta el precio.');
  if (found.length === 0 && totalCents > 0) warn('Sin cobros en Pagos Pases: quedó con la deuda total.');
  else if (paid < totalCents) warn(`Pagó ${formatMoney(paid)} de ${formatMoney(totalCents)}: quedó debiendo ${formatMoney(left)}.`);
  return { payments, totalCents };
}

export function buildImportPlan(sheets: Map<string, Rows>, today: string, since: string): ImportPlan {
  const pases = sheets.get('PASES');
  if (!pases) throw new DomainError('MISSING_PASES_SHEET');
  const prices = readPrices(sheets.get('Pagos Pases'));
  const pool = readPayments(sheets.get('Pagos Pases'), prices);
  const warnings: ImportWarning[] = [];
  const clients: LegacyClient[] = [];
  const teachers = new Map<string, string>();
  const activeTeachers = new Set<string>();
  const usedPlans = new Set<PlanKey>();

  const teacher = (raw: string) => {
    const key = personKey(raw);
    if (!teachers.has(key)) teachers.set(key, capitalize(raw));
    return teachers.get(key) ?? raw;
  };

  function readSheet(rows: Rows, layout: SheetLayout) {
    for (const [row, cells] of rows) {
      if (row === 1) continue;
      const fullName = cells[layout.name]?.trim() ?? '';
      const warn: Warn = (message) => warnings.push({ sheet: layout.sheet, row, name: fullName || null, message });
      if (!fullName) {
        if (Object.values(cells).some((value) => value.trim())) warn('Fila sin nombre: no se importó.');
        continue;
      }
      // The sheets end in a "the formulas work up to here" marker row.
      if (fold(fullName).includes('formula')) continue;
      const named = 'column' in layout.teacher ? cells[layout.teacher.column]?.trim() : undefined;
      if (named) teacher(named);

      const waiverText = cells[layout.waiver]?.trim();
      const waiverDate = waiverText ? parseSheetDate(waiverText) : null;
      if (waiverText && !waiverDate) warn(`Ficha ilegible ("${waiverText}"): se importó sin ficha.`);
      if (waiverDate && waiverDate > today) warn(`Ficha con fecha futura ("${waiverText}"): se importó sin ficha.`);
      const waiverSignedAt = waiverDate && waiverDate <= today ? waiverDate : null;

      const startText = cells[layout.start]?.trim() ?? '';
      const parsedStart = parseSheetDate(startText);
      const startedAt = parsedStart && parsedStart <= today ? parsedStart : null;
      const dni = cells[layout.dni]?.trim().slice(0, MAX_DNI) || null;

      let pass: LegacyPass | null = null;
      const typeText = cells[layout.type]?.trim();
      const planKey = typeText ? layout.types[typeKey(typeText)] : undefined;
      if (typeText && !planKey) warn(`Tipo de pase desconocido ("${typeText}"): se importó sin pase.`);
      else if (planKey && !startText) warn('Sin fecha de inicio: se importó sin pase.');
      else if (planKey && !startedAt) warn(`Fecha de inicio ilegible ("${startText}"): se importó sin pase.`);
      else if (planKey && startedAt && startedAt >= since) {
        const spec = PLAN_SPECS[planKey];
        usedPlans.add(planKey);
        const price = prices.get(spec.price);
        const listedCents = (price?.local ?? 0) + (spec.teacher > 0 ? (price?.teacher ?? 0) : 0);
        let passTeacher: string | null = null;
        if (spec.teacher > 0) {
          const name = 'fixed' in layout.teacher ? layout.teacher.fixed : named;
          if (!name) warn(`Pase con profe sin profe: quedó en "${UNASSIGNED}".`);
          passTeacher = name ? teacher(name) : teacher(UNASSIGNED);
          if (name) activeTeachers.add(personKey(name));
        }
        const { payments, totalCents } = takePayments(pool, dni, personKey(fullName), startedAt, today, listedCents, warn);
        pass = {
          planKey,
          teacher: passTeacher,
          startedAt,
          used: parseUsed(cells[layout.used], spec.free + spec.teacher, warn),
          totalCents,
          payments,
          debtCents: totalCents - payments.reduce((sum, payment) => sum + payment.amountCents, 0),
        };
      }

      const age = layout.age ? cells[layout.age]?.trim() : undefined;
      const notes = [...layout.notes.map((column) => cells[column]?.trim()), age ? `Edad en la planilla: ${age}` : undefined]
        .filter(Boolean)
        .join('\n')
        .slice(0, MAX_NOTES);
      clients.push({
        sheet: layout.sheet,
        row,
        ...splitName(fullName),
        dni,
        notes: notes || null,
        waiverSignedAt,
        enrolledAt: waiverSignedAt ?? startedAt ?? today,
        pass,
      });
    }
  }

  readSheet(pases, PASES_LAYOUT);
  const school = sheets.get('Escuelita');
  if (school) readSheet(school, SCHOOL_LAYOUT);

  const plans = [...usedPlans].map((key): LegacyPlan => {
    const spec = PLAN_SPECS[key];
    const price = prices.get(spec.price);
    if (!price) warnings.push({ sheet: 'Pagos Pases', row: 0, name: null, message: `El plan "${spec.name}" no tiene precio en la tabla: quedó en $0.` });
    return {
      key,
      name: spec.name,
      freePasses: spec.free,
      teacherPasses: spec.teacher,
      priceCents: price?.local ?? 0,
      surchargeCents: spec.teacher > 0 ? (price?.teacher ?? 0) : 0,
    };
  });
  return {
    plans,
    teachers: [...teachers].map(([key, name]) => ({ name, active: activeTeachers.has(key) })),
    clients,
    warnings,
  };
}

export function summarizeImport(plan: ImportPlan): ImportSummary {
  const passes = plan.clients.flatMap((client) => (client.pass ? [client.pass] : []));
  return {
    clients: plan.clients.length,
    fromPases: plan.clients.filter((client) => client.sheet === 'PASES').length,
    fromSchool: plan.clients.filter((client) => client.sheet === 'Escuelita').length,
    teachers: plan.teachers.length,
    passes: passes.length,
    debtors: passes.filter((pass) => pass.debtCents > 0).length,
    debtCents: passes.reduce((sum, pass) => sum + pass.debtCents, 0),
    warnings: plan.warnings,
  };
}
