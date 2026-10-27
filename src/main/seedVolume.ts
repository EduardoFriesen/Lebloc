import { daysBetween, toIsoDate } from '../domain/dates';
import { defaultExpiry } from '../domain/passes';
import type { ExpenseCategory, PaymentMethod } from '../shared/types';
import type { Context } from './context';
import { createClient, listClients } from './services/clients';
import { consume } from './services/consumptions';
import { createEmployee, recordShift } from './services/employees';
import { createExpense } from './services/expenses';
import { sellCounter } from './services/counterSales';
import { sellKiosk, voidKioskSale } from './services/kiosk';
import { registerPayment } from './services/payments';
import { createProduct, listProducts } from './services/products';
import { sellPlan } from './services/sales';
import { signWaiver } from './services/waivers';

const pesos = (amount: number) => amount * 100;

/** Moves the seed clock to `daysAgo` days before now, at hour:minute, and returns that date as ISO. */
export type SeedClock = (daysAgo: number, hour?: number, minute?: number) => string;

export interface VolumePlan {
  id: number;
  free: number;
  teacher: number;
  /** How often it's picked, relative to the others. */
  weight: number;
}

/** Deterministic PRNG (mulberry32): the same seed gives the same data on every run. */
function random(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  // Skewed towards the start of the list, so a few items are clearly the most popular.
  const popular = <T>(items: readonly T[]): T => items[Math.floor(next() ** 2 * items.length)] as T;
  return { next, int, pick, popular };
}

const FIRST_NAMES = [
  'Martín', 'Lucía', 'Santiago', 'Valeria', 'Federico', 'Micaela', 'Ignacio', 'Florencia', 'Matías', 'Agustina',
  'Tomás', 'Carolina', 'Facundo', 'Daniela', 'Leandro', 'Romina', 'Gastón', 'Melina', 'Ezequiel', 'Natalia',
  'Pablo', 'Antonella', 'Rodrigo', 'Brenda', 'Maximiliano', 'Guadalupe', 'Emiliano', 'Rocío', 'Julián', 'Milagros',
  'Andrés', 'Belén', 'Cristian', 'Abril', 'Diego', 'Josefina', 'Sebastián', 'Paula', 'Nahuel', 'Candela',
];
const LAST_NAMES = [
  'González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Pérez', 'Gómez', 'Sánchez', 'Romero', 'Sosa',
  'Torres', 'Álvarez', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Suárez', 'Herrera',
  'Aguirre', 'Pereyra', 'Gutiérrez', 'Giménez', 'Molina', 'Silva', 'Castro', 'Rojas', 'Ortiz', 'Núñez',
  'Luna', 'Juárez', 'Cabrera', 'Ríos', 'Morales', 'Godoy', 'Moreno', 'Ferreyra', 'Domínguez', 'Carrizo',
];
const RELATIONS = ['Madre', 'Padre', 'Hermano', 'Hermana', 'Pareja', 'Amigo'];

// [name, units per pack, pack cost in pesos, markup %]
const PRODUCTS: [string, number, number, number][] = [
  ['Agua 1,5 L', 6, 9_000, 40], ['Agua saborizada', 6, 8_400, 50], ['Gaseosa lata', 6, 7_200, 60], ['Gaseosa 500 ml', 12, 16_800, 50],
  ['Jugo en caja', 18, 10_800, 60], ['Bebida isotónica 1 L', 6, 13_200, 40], ['Energizante sin azúcar', 6, 13_800, 40], ['Café', 50, 25_000, 150],
  ['Té', 50, 7_500, 200], ['Mate cocido', 50, 6_000, 200], ['Chocolatada', 12, 9_600, 60], ['Licuado de banana', 8, 12_000, 70],
  ['Alfajor triple', 6, 7_200, 60], ['Alfajor de maicena', 12, 7_800, 70], ['Turrón', 25, 7_500, 80], ['Chocolate en barra', 10, 9_000, 60],
  ['Galletitas de agua', 10, 6_000, 70], ['Galletitas dulces', 10, 7_000, 70], ['Barrita proteica', 12, 21_600, 50], ['Mix de frutos secos', 10, 15_000, 60],
  ['Banana', 20, 6_000, 80], ['Manzana', 20, 7_000, 80], ['Sándwich de miga', 12, 18_000, 60], ['Tostado', 10, 15_000, 70],
  ['Medialuna', 24, 9_600, 100], ['Budín', 8, 9_600, 70], ['Turrón de maní', 20, 6_000, 80], ['Caramelos', 100, 5_000, 100],
  ['Chicles', 20, 4_000, 100], ['Cinta deportiva 3,8 cm', 4, 9_600, 50], ['Cinta deportiva 2,5 cm', 6, 10_800, 50], ['Magnesio líquido', 6, 27_000, 45],
  ['Bola de magnesio', 10, 20_000, 50], ['Cepillo para presas', 6, 9_000, 60], ['Lima para callos', 10, 8_000, 70], ['Crema para manos', 6, 15_000, 60],
  ['Bolsa de magnesio', 4, 24_000, 50], ['Medias de escalada', 10, 20_000, 60], ['Llavero Le Bloc', 20, 12_000, 120], ['Remera Le Bloc', 5, 40_000, 80],
  ['Sticker Le Bloc', 50, 5_000, 200], ['Botella reutilizable', 6, 30_000, 70], ['Toalla chica', 6, 18_000, 60],
];
const INACTIVE_PRODUCTS = new Set(['Mate cocido', 'Tostado', 'Lima para callos', 'Toalla chica']);

/**
 * Adds volume on top of the hand-written scenarios: ~180 more clients with their purchases, payments and climbs,
 * the rest of the 50 kiosk products, two months of tickets and walk-in day passes. Everything goes through the
 * services and only into the past (or earlier today), so it obeys the same rules as the UI.
 */
export function seedVolume(ctx: Context, at: SeedClock, now: Date, refs: { plans: VolumePlan[]; teachers: number[] }): void {
  const rng = random(20261011);
  const nowHour = now.getHours();
  const method = (): PaymentMethod => (rng.next() < 0.6 ? 'cash' : 'transfer');
  const totalWeight = refs.plans.reduce((sum, plan) => sum + plan.weight, 0);
  const pickPlan = () => {
    let roll = rng.next() * totalWeight;
    return refs.plans.find((plan) => (roll -= plan.weight) < 0) ?? (refs.plans[0] as VolumePlan);
  };

  // Clientes hasta llegar a 200.
  const existing = listClients(ctx, { search: '', includeArchived: true, onlyDebtors: false, onlyWithPasses: false, onlyPendingWaiver: false }).length;
  for (let index = existing; index < 200; index += 1) {
    const firstName = rng.pick(FIRST_NAMES);
    const lastName = rng.pick(LAST_NAMES);
    const minor = rng.next() < 0.12;
    const age = minor ? rng.int(8, 16) : rng.int(18, 55);
    const birthDate = `${now.getFullYear() - age - 1}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;
    const phone = `11 ${rng.int(4100, 6999)}-${String(rng.int(0, 9999)).padStart(4, '0')}`;
    const contact = rng.next() < 0.7;
    const enrolledDaysAgo = rng.int(3, 360);
    const clientId = createClient(ctx, {
      firstName,
      lastName,
      birthDate,
      // From the index, not the generator, so the rest of the sample data stays the same.
      dni: String(30_000_000 + index * 48_611),
      notes: null,
      address: rng.next() < 0.4 ? `${rng.pick(['Mitre', 'Sarmiento', 'Belgrano', 'Rivadavia', 'San Martín', 'Moreno'])} ${rng.int(100, 3999)}` : null,
      phone: minor ? null : phone,
      emergencyName: contact || minor ? `${rng.pick(FIRST_NAMES)} ${lastName}` : null,
      emergencyPhone: contact || minor ? `11 ${rng.int(4100, 6999)}-${String(rng.int(0, 9999)).padStart(4, '0')}` : null,
      emergencyRelation: contact || minor ? rng.pick(RELATIONS) : null,
      guardians: minor ? [{ firstName: rng.pick(FIRST_NAMES), lastName, dni: String(rng.int(25_000_000, 40_000_000)), phone, relation: rng.pick(['Madre', 'Padre']) }] : [],
      enrolledAt: at(enrolledDaysAgo, 11),
    }).id;
    if (rng.next() < 0.85) signWaiver(ctx, { clientId, signedAt: at(enrolledDaysAgo, 11) });
    if (rng.next() < 0.1) continue; // Se anotó y todavía no compró nada.

    let day = enrolledDaysAgo;
    for (let purchase = rng.int(1, 3); purchase > 0 && day >= 1; purchase -= 1) {
      const plan = pickPlan();
      const teacherId = plan.teacher > 0 ? rng.pick(refs.teachers) : null;
      const soldAt = at(day, 17);
      const sale = sellPlan(ctx, { clientId, planId: plan.id, teacherId, splitRule: 'proportional', soldAt, expiresAt: defaultExpiry(soldAt), initialPayment: null });
      const paying = rng.next();
      if (paying < 0.75) {
        registerPayment(ctx, { saleId: sale.id, amountCents: sale.totalCents, method: method(), paidAt: at(day, 17, rng.int(0, 59)) });
      } else if (paying < 0.92) {
        // En cuotas: la mitad al comprar y, a veces, el resto unos días después.
        const half = Math.round(sale.totalCents / 2 / pesos(100)) * pesos(100);
        registerPayment(ctx, { saleId: sale.id, amountCents: half, method: method(), paidAt: at(day, 17, rng.int(0, 59)) });
        const later = day - rng.int(5, 20);
        if (later >= 1 && rng.next() < 0.5) {
          registerPayment(ctx, { saleId: sale.id, amountCents: sale.totalCents - half, method: method(), paidAt: at(later, 18, rng.int(0, 59)) });
        }
      } // El resto queda debiendo todo.

      // Usa los pases cada pocos días; la última compra puede quedar a medio usar.
      const left = { free: plan.free, teacher: plan.teacher };
      const uses = purchase === 1 ? Math.floor((plan.free + plan.teacher) * rng.next()) : plan.free + plan.teacher;
      for (let use = 0; use < uses; use += 1) {
        day -= rng.int(1, 6);
        if (day < 1) break;
        // Se le vencieron los que le quedaban.
        if (at(day, rng.int(9, 21), rng.int(0, 59)) > sale.expiresAt) break;
        const kind = left.free > 0 && (left.teacher === 0 || rng.next() < 0.5) ? 'free' : 'teacher';
        left[kind] -= 1;
        consume(ctx, { clientId, kind, note: null });
      }
      day -= rng.int(1, 10);
    }
  }

  // Kiosco: el resto de los 50 productos (algunos discontinuados).
  at(120, 10);
  for (const [name, packSize, packCost, markupPercent] of PRODUCTS) {
    const suggested = (packCost * (100 + markupPercent)) / (packSize * 100);
    createProduct(ctx, {
      name,
      packSize,
      packCostCents: pesos(packCost),
      markupPercent,
      priceCents: pesos(Math.ceil(suggested / 100) * 100),
      active: !INACTIVE_PRODUCTS.has(name),
    });
  }
  const forSale = listProducts(ctx, false).map((product) => product.id);

  // Dos meses de tickets del kiosco y de pases sueltos; hoy solo hasta la hora actual.
  for (let daysAgo = 60; daysAgo >= 0; daysAgo -= 1) {
    const lastHour = daysAgo === 0 ? nowHour - 1 : 21;
    if (lastHour < 9) continue;
    for (let count = rng.int(daysAgo === 0 ? 2 : 4, daysAgo === 0 ? 6 : 14); count > 0; count -= 1) {
      at(daysAgo, rng.int(9, lastHour), rng.int(0, 59));
      const items = new Map<number, number>();
      for (let lines = rng.int(1, 3); lines > 0; lines -= 1) items.set(rng.popular(forSale), rng.int(1, 3));
      const ticket = sellKiosk(ctx, { items: [...items].map(([productId, quantity]) => ({ productId, quantity })), method: method() });
      if (rng.next() < 0.03) voidKioskSale(ctx, ticket.id);
    }
    if (daysAgo === 0) continue; // Los pases sueltos de hoy los cargan los casos a mano.
    for (let count = rng.int(0, 5); count > 0; count -= 1) {
      at(daysAgo, rng.int(10, 21), rng.int(0, 59));
      sellCounter(ctx, { kinds: rng.next() < 0.6 ? ['day_pass', 'shoe_rental'] : ['day_pass'], method: method() });
    }
    if (rng.next() < 0.3) {
      at(daysAgo, rng.int(10, 21), rng.int(0, 59));
      sellCounter(ctx, { kinds: ['shoe_rental'], method: method() });
    }
  }

  // Empleados por hora: dos estables de lunes a sábado y uno ocasional algunos sábados; turnos hasta ayer.
  at(75, 10);
  const person = { dni: null, address: null, active: true };
  const lucia = createEmployee(ctx, { ...person, firstName: 'Lucía', lastName: 'Paz', phone: '11 4567-8901', kind: 'staff', hourlyRateCents: pesos(5_000) }).id;
  const bruno = createEmployee(ctx, { ...person, firstName: 'Bruno', lastName: 'Díaz', phone: '11 5678-1234', kind: 'staff', hourlyRateCents: pesos(5_000) }).id;
  const nico = createEmployee(ctx, { ...person, firstName: 'Nico', lastName: 'Ferro', phone: null, kind: 'casual', hourlyRateCents: pesos(4_000) }).id;
  const halfHours = (min: number, max: number) => rng.int(min * 2, max * 2) * 30;
  for (let daysAgo = 60; daysAgo >= 1; daysAgo -= 1) {
    const workedOn = at(daysAgo, 22);
    const weekday = new Date(`${workedOn}T12:00:00`).getDay();
    if (weekday === 0) continue; // Los domingos está cerrado.
    recordShift(ctx, { employeeId: lucia, workedOn, minutes: halfHours(4, 6), note: null });
    recordShift(ctx, { employeeId: bruno, workedOn, minutes: halfHours(3, 5), note: null });
    if (weekday === 6 && rng.next() < 0.5) recordShift(ctx, { employeeId: nico, workedOn, minutes: halfHours(4, 6), note: 'Refuerzo del sábado' });
  }

  // Gastos fijos del mes pasado y de este, sin pasarse de hoy.
  const today = toIsoDate(now);
  for (const monthsAgo of [1, 0]) {
    const pay = (day: number, category: ExpenseCategory, amount: number, paidWith: PaymentMethod, description: string | null) => {
      const paidAt = toIsoDate(new Date(now.getFullYear(), now.getMonth() - monthsAgo, day));
      if (paidAt > today) return;
      at(daysBetween(paidAt, today), 8);
      createExpense(ctx, { category, description, amountCents: pesos(amount), method: paidWith, paidAt });
    };
    pay(1, 'rent', 450_000, 'transfer', 'Alquiler del mes');
    pay(5, 'internet', 18_000, 'transfer', null);
    pay(8, 'electricity', rng.int(60, 90) * 1_000, 'transfer', 'Factura de luz');
    pay(9, 'gas', rng.int(25, 50) * 1_000, 'cash', null);
    if (monthsAgo === 1) {
      pay(12, 'taxes', 22_000, 'transfer', 'Tasa municipal');
      pay(15, 'maintenance', 35_000, 'cash', 'Cambio de presas');
    }
  }
}
