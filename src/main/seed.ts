import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { toIsoDate } from '../domain/dates';
import type { PassKind } from '../domain/passes';
import type { ClientInput, PlanInput, SaleInput, TeacherInput } from '../shared/schemas';
import type { PaymentMethod } from '../shared/types';
import { writeBackupFile } from './backup';
import type { Context } from './context';
import { type Db, openDatabase } from './db/connection';
import { archiveClient, createClient } from './services/clients';
import { consume, voidConsumption } from './services/consumptions';
import { registerPayment, voidPayment } from './services/payments';
import { getTeacherAccount, registerPayout, voidPayout } from './services/payouts';
import { createPlan, updatePlan } from './services/plans';
import { sellPlan, voidSale } from './services/sales';
import { updateSettings } from './services/settings';
import { createTeacher, updateTeacher } from './services/teachers';
import { signWaiver, voidWaiver } from './services/waivers';

const pesos = (amount: number) => amount * 100;

/**
 * Copies the current database to `backupDir/before-seed-<timestamp>.db` and deletes it, so the app
 * starts on a fresh file. The name doesn't match the rotation pattern, so the copy is never pruned
 * and can be brought back with "Restaurar backup".
 */
export async function setAsideForSeed(dbPath: string, backupDir: string, now: Date): Promise<void> {
  if (!existsSync(dbPath)) return;
  const db = openDatabase(dbPath);
  try {
    await mkdir(backupDir, { recursive: true });
    await writeBackupFile(db, join(backupDir, `before-seed-${now.toISOString().replace(/[:.]/g, '-')}.db`));
  } finally {
    db.close();
  }
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${dbPath}${suffix}`, { force: true })));
}

/**
 * Dev-only: fills an empty database with a few months of realistic history so every screen
 * and alert has something to show. Goes through the services, so the data obeys the same rules
 * as the UI; the clock is moved back in time for each step.
 */
export function seedDatabase(db: Db, now: Date): void {
  let current = now;
  const ctx: Context = { db, clock: { now: () => current } };

  /** Moves the clock to `daysAgo` days before `now` at `hour` and returns that date as ISO. */
  function at(daysAgo: number, hour = 18): string {
    current = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, (daysAgo * 7) % 60);
    return toIsoDate(current);
  }

  function client(enrolledDaysAgo: number, input: Pick<ClientInput, 'firstName' | 'lastName' | 'birthDate'> & Partial<ClientInput>) {
    const enrolledAt = at(enrolledDaysAgo, 11);
    return createClient(ctx, {
      address: null,
      phone: null,
      emergencyName: null,
      emergencyPhone: null,
      emergencyRelation: null,
      guardians: [],
      enrolledAt,
      ...input,
    }).id;
  }

  function sell(clientId: number, planId: number, daysAgo: number, extra: Partial<SaleInput> = {}) {
    const soldAt = at(daysAgo, 17);
    return sellPlan(ctx, { clientId, planId, teacherId: null, splitRule: 'proportional', soldAt, initialPayment: null, ...extra });
  }

  function pay(saleId: number, amountCents: number, method: PaymentMethod, daysAgo: number) {
    return registerPayment(ctx, { saleId, amountCents, method, paidAt: at(daysAgo, 17) });
  }

  function sellPaid(clientId: number, planId: number, daysAgo: number, method: PaymentMethod, extra: Partial<SaleInput> = {}) {
    const sale = sell(clientId, planId, daysAgo, extra);
    pay(sale.id, sale.totalCents, method, daysAgo);
    return sale;
  }

  function climb(clientId: number, kind: PassKind, days: number[], note: string | null = null) {
    return days.map((daysAgo, index) => {
      at(daysAgo, 10 + ((index * 3 + daysAgo) % 10));
      return consume(ctx, { clientId, kind, note });
    });
  }

  function sign(clientId: number, daysAgo: number) {
    return signWaiver(ctx, { clientId, signedAt: at(daysAgo, 11) });
  }

  function payoutPart(teacherId: number, share: number, method: PaymentMethod, daysAgo: number, note: string | null) {
    const paidAt = at(daysAgo, 20);
    const { balanceCents } = getTeacherAccount(ctx, teacherId);
    const amountCents = Math.floor((balanceCents * share) / pesos(100)) * pesos(100);
    return registerPayout(ctx, { teacherId, amountCents, method, paidAt, note });
  }

  db.transaction(() => {
    at(160, 9);
    updateSettings(ctx, { lowPassesThreshold: 2, waiverValidityMonths: 12 });

    // Profesores
    const martinaInput: TeacherInput = {
      firstName: 'Martina',
      lastName: 'Grieta',
      address: 'Av. Belgrano 1450',
      phone: '11 5555-2001',
      socials: [{ network: 'Instagram', handle: '@marti.escala' }],
      classRateCents: pesos(3_500),
      active: true,
      schedules: [
        { weekday: 1, startTime: '18:00', endTime: '20:00' },
        { weekday: 3, startTime: '18:00', endTime: '20:00' },
      ],
    };
    const facundoInput: TeacherInput = {
      firstName: 'Facundo',
      lastName: 'Laja',
      address: null,
      phone: '11 5555-2002',
      socials: [
        { network: 'Instagram', handle: '@facu.laja' },
        { network: 'TikTok', handle: '@facubloc' },
      ],
      classRateCents: pesos(4_000),
      active: true,
      schedules: [
        { weekday: 2, startTime: '19:00', endTime: '21:00' },
        { weekday: 4, startTime: '19:00', endTime: '21:00' },
      ],
    };
    const solInput: TeacherInput = {
      firstName: 'Sol',
      lastName: 'Ibarra',
      address: null,
      phone: '11 5555-2003',
      socials: [{ network: 'Instagram', handle: '@sol.escuelita' }],
      classRateCents: pesos(3_000),
      active: true,
      schedules: [{ weekday: 6, startTime: '10:00', endTime: '12:00' }],
    };
    const diegoInput: TeacherInput = {
      firstName: 'Diego',
      lastName: 'Fisura',
      address: 'Calle 9 de Julio 320',
      phone: '11 5555-2004',
      socials: [],
      classRateCents: pesos(3_500),
      active: true,
      schedules: [{ weekday: 5, startTime: '18:00', endTime: '20:00' }],
    };
    const martina = createTeacher(ctx, martinaInput).id;
    const facundo = createTeacher(ctx, facundoInput).id;
    const sol = createTeacher(ctx, solInput).id;
    const diego = createTeacher(ctx, diegoInput).id;

    // Planes
    const promoInput: PlanInput = { name: 'Promo verano 10 libres', freePasses: 10, teacherPasses: 0, priceCents: pesos(35_000), active: true };
    const suelto = createPlan(ctx, { name: 'Pase libre suelto', freePasses: 1, teacherPasses: 0, priceCents: pesos(7_000), active: true }).id;
    const pack8 = createPlan(ctx, { name: 'Pack 8 libres', freePasses: 8, teacherPasses: 0, priceCents: pesos(40_000), active: true }).id;
    const pack12 = createPlan(ctx, { name: 'Pack 12 libres', freePasses: 12, teacherPasses: 0, priceCents: pesos(54_000), active: true }).id;
    const escuelita = createPlan(ctx, { name: 'Escuelita 4 clases', freePasses: 0, teacherPasses: 4, priceCents: pesos(20_000), active: true }).id;
    const mixto = createPlan(ctx, { name: 'Mensual 4 libres + 4 con profe', freePasses: 4, teacherPasses: 4, priceCents: pesos(28_000), active: true }).id;
    const dosPorSemana = createPlan(ctx, { name: 'Mensual 2x semana con profe', freePasses: 0, teacherPasses: 8, priceCents: pesos(30_000), active: true }).id;
    const promo = createPlan(ctx, promoInput).id;

    // Mateo: socio de hace un año, la ficha está por vencer.
    const mateo = client(360, { firstName: 'Mateo', lastName: 'Acosta', birthDate: '1989-12-12', phone: '11 4000-0120', emergencyName: 'Paula Acosta', emergencyPhone: '11 4000-0121', emergencyRelation: 'Esposa' });
    sign(mateo, 358);

    // Carla: socia vieja con la ficha vencida y deuda en su último pack.
    const carla = client(420, { firstName: 'Carla', lastName: 'Méndez', birthDate: '1995-02-14', phone: '11 4000-0103', emergencyName: 'Rosa Méndez', emergencyPhone: '11 4000-0104', emergencyRelation: 'Madre' });
    sign(carla, 400);

    // Hernán: compró, usó todo y después se archivó.
    const hernan = client(140, { firstName: 'Hernán', lastName: 'Quiroga', birthDate: '1980-08-08', phone: '11 4000-0114' });
    sign(hernan, 140);
    sellPaid(hernan, pack8, 138, 'cash');
    climb(hernan, 'free', [137, 130, 123, 116, 109, 102, 95, 88]);

    // Ana: agotó un plan mixto y lo renovó.
    const ana = client(150, { firstName: 'Ana', lastName: 'Roca', birthDate: '1990-05-10', address: 'Mitre 845', phone: '11 4000-0101', emergencyName: 'Luis Roca', emergencyPhone: '11 4000-0102', emergencyRelation: 'Hermano' });
    sign(ana, 150);
    sellPaid(ana, mixto, 140, 'cash', { teacherId: martina });
    climb(ana, 'teacher', [138, 131, 124, 117]);
    climb(ana, 'free', [135, 120, 98, 61]);
    sellPaid(ana, mixto, 45, 'transfer', { teacherId: martina });
    climb(ana, 'teacher', [40, 33]);
    climb(ana, 'free', [26]);

    // Joaquín: viene de vez en cuando y paga el pase suelto.
    const joaquin = client(130, { firstName: 'Joaquín', lastName: 'Ortiz', birthDate: '1993-04-28', phone: '11 4000-0108' });
    sign(joaquin, 130);
    for (const daysAgo of [128, 75, 12]) {
      sellPaid(joaquin, suelto, daysAgo, daysAgo === 75 ? 'transfer' : 'cash');
      climb(joaquin, 'free', [daysAgo]);
    }

    // Pedro: compró la promo de verano (después se desactivó el plan) y la agotó.
    const pedro = client(125, { firstName: 'Pedro', lastName: 'Almada', birthDate: '1985-03-19', phone: '11 4000-0112' });
    sign(pedro, 125);
    sellPaid(pedro, promo, 118, 'cash');
    climb(pedro, 'free', [117, 112, 108, 101, 96, 89, 83, 77, 70, 62]);

    // Rocío: plan mixto con Diego, que después dejó de dar clases.
    const rocio = client(115, { firstName: 'Rocío', lastName: 'Villalba', birthDate: '1994-10-02', phone: '11 4000-0113', emergencyName: 'Martín Villalba', emergencyPhone: '11 4000-0130', emergencyRelation: 'Padre' });
    sign(rocio, 115);
    sellPaid(rocio, mixto, 112, 'transfer', { teacherId: diego });
    climb(rocio, 'teacher', [111, 104, 97, 90]);
    climb(rocio, 'free', [108, 100, 93, 87]);

    // Camila: usó su pack completo y no renovó (0 pases).
    const camila = client(100, { firstName: 'Camila', lastName: 'Ibáñez', birthDate: '1990-03-03', phone: '11 4000-0123' });
    sign(camila, 100);
    sellPaid(camila, pack8, 100, 'cash');
    climb(camila, 'free', [99, 92, 85, 78, 71, 64, 57, 50]);

    // Gonzalo: la ficha se cargó por error y se anuló, así que le falta.
    const gonzalo = client(90, { firstName: 'Gonzalo', lastName: 'Peralta', birthDate: '1996-11-11', phone: '11 4000-0117' });
    const wrongWaiver = sign(gonzalo, 88);
    at(87, 10);
    voidWaiver(ctx, wrongWaiver.id);
    sellPaid(gonzalo, pack12, 88, 'transfer');
    climb(gonzalo, 'free', [86, 70, 55, 41, 20]);

    // Termina el verano: la promo se desactiva.
    at(90, 12);
    updatePlan(ctx, { id: promo, ...promoInput, active: false });

    // Diego: se le liquida todo lo que se le debe y se lo da de baja.
    payoutPart(diego, 1, 'cash', 86, 'Liquidación final');
    at(85, 12);
    updateTeacher(ctx, { id: diego, ...diegoInput, active: false });

    // Luz: plan mixto con Martina, pagado al contado.
    const luz = client(80, { firstName: 'Luz', lastName: 'Cabrera', birthDate: '1992-07-21', phone: '11 4000-0122', emergencyName: 'Ana Cabrera', emergencyPhone: '11 4000-0131', emergencyRelation: 'Hermana' });
    sign(luz, 80);
    sellPaid(luz, mixto, 22, 'cash', { teacherId: martina });
    climb(luz, 'free', [20, 13]);
    climb(luz, 'teacher', [19, 12]);

    // Julieta: un consumo se marcó por error y se anuló.
    const julieta = client(70, { firstName: 'Julieta', lastName: 'Navarro', birthDate: '2000-06-11', phone: '11 4000-0111', emergencyName: 'Sergio Navarro', emergencyPhone: '11 4000-0132', emergencyRelation: 'Padre' });
    sign(julieta, 70);
    sellPaid(julieta, pack12, 65, 'transfer');
    const [, mistaken] = climb(julieta, 'free', [63, 63, 56, 49, 42, 35, 28, 14], null);
    if (mistaken) {
      at(63, 21);
      voidConsumption(ctx, mistaken.id);
    }

    // Mía (menor, dos tutores): escuelita en dos cuotas, la terminó y renovó sin pagar.
    const mia = client(60, {
      firstName: 'Mía',
      lastName: 'Ferreyra',
      birthDate: '2013-08-19',
      phone: null,
      emergencyName: 'Pablo Ferreyra',
      emergencyPhone: '11 4000-0105',
      emergencyRelation: 'Padre',
      guardians: [
        { firstName: 'Pablo', lastName: 'Ferreyra', dni: '28456789', phone: '11 4000-0105', relation: 'Padre' },
        { firstName: 'Gabriela', lastName: 'Sosa', dni: '30987654', phone: '11 4000-0106', relation: 'Madre' },
      ],
    });
    sign(mia, 60);
    const miaSale = sell(mia, escuelita, 58, { teacherId: sol, initialPayment: { amountCents: pesos(10_000), method: 'cash', paidAt: at(58, 17) } });
    pay(miaSale.id, miaSale.totalCents - pesos(10_000), 'transfer', 30);
    climb(mia, 'teacher', [56, 49, 42, 35]);
    sell(mia, escuelita, 3, { teacherId: sol });

    // Ramiro (17 años): dos veces por semana con Facundo, en dos cuotas.
    const ramiro = client(55, {
      firstName: 'Ramiro',
      lastName: 'Giménez',
      birthDate: '2008-12-20',
      phone: '11 4000-0124',
      emergencyName: 'Silvia Giménez',
      emergencyPhone: '11 4000-0125',
      emergencyRelation: 'Madre',
      guardians: [{ firstName: 'Silvia', lastName: 'Giménez', dni: '27111333', phone: '11 4000-0125', relation: 'Madre' }],
    });
    sign(ramiro, 55);
    const ramiroSale = sell(ramiro, dosPorSemana, 55, { teacherId: facundo, initialPayment: { amountCents: pesos(20_000), method: 'cash', paidAt: at(55, 17) } });
    pay(ramiroSale.id, ramiroSale.totalCents - pesos(20_000), 'transfer', 25);
    climb(ramiro, 'teacher', [54, 52, 47, 45, 40, 38]);

    // Lucas: primero se le paga al profesor; pagó una parte.
    const lucas = client(50, { firstName: 'Lucas', lastName: 'Benítez', birthDate: '1999-07-07', phone: '11 4000-0109', emergencyName: 'Marta Benítez', emergencyPhone: '11 4000-0133', emergencyRelation: 'Madre' });
    sign(lucas, 50);
    sell(lucas, dosPorSemana, 35, { teacherId: facundo, splitRule: 'teacher_first', initialPayment: { amountCents: pesos(25_000), method: 'transfer', paidAt: at(35, 17) } });
    climb(lucas, 'teacher', [33, 31, 26, 24, 19]);

    // Mateo sigue viniendo.
    sellPaid(mateo, pack8, 50, 'cash');
    climb(mateo, 'free', [48, 41, 34, 27, 6]);

    // Valentina: primero se le paga al local; pagó una parte.
    const valentina = client(45, { firstName: 'Valentina', lastName: 'Ruiz', birthDate: '2001-12-03', phone: '11 4000-0110' });
    sign(valentina, 45);
    sell(valentina, mixto, 40, { teacherId: facundo, splitRule: 'local_first', initialPayment: { amountCents: pesos(20_000), method: 'cash', paidAt: at(40, 17) } });
    climb(valentina, 'free', [38, 30]);
    climb(valentina, 'teacher', [36, 29, 22]);

    // Bruno: le quedan pocos pases.
    const bruno = client(40, { firstName: 'Bruno', lastName: 'Díaz', birthDate: '1987-11-22', phone: '11 4000-0107', emergencyName: 'Clara Díaz', emergencyPhone: '11 4000-0134', emergencyRelation: 'Esposa' });
    sign(bruno, 40);
    sellPaid(bruno, pack8, 20, 'cash');
    climb(bruno, 'free', [19, 17, 14, 12, 9, 5]);

    // Sofía: la primera venta fue un error y se anuló; después se cargó la correcta.
    const sofia = client(35, { firstName: 'Sofía', lastName: 'Castro', birthDate: '1997-09-15', phone: '11 4000-0115' });
    sign(sofia, 35);
    const wrongSale = sell(sofia, pack8, 34);
    at(34, 18);
    voidSale(ctx, wrongSale.id);
    sellPaid(sofia, pack12, 34, 'transfer');
    climb(sofia, 'free', [32, 25, 11]);

    // Carla: pack en dos pagos parciales, todavía debe.
    const carlaSale = sell(carla, pack12, 30, { initialPayment: { amountCents: pesos(20_000), method: 'cash', paidAt: at(30, 17) } });
    pay(carlaSale.id, pesos(10_000), 'transfer', 15);
    climb(carla, 'free', [28, 24, 20, 13]);

    // Tomás (menor): escuelita sin pagar todavía.
    const tomas = client(30, {
      firstName: 'Tomás',
      lastName: 'Paz',
      birthDate: '2015-03-02',
      phone: null,
      emergencyName: 'Laura Paz',
      emergencyPhone: '11 4000-0126',
      emergencyRelation: 'Madre',
      guardians: [{ firstName: 'Laura', lastName: 'Paz', dni: '33222111', phone: '11 4000-0126', relation: 'Madre' }],
    });
    sign(tomas, 30);
    sell(tomas, escuelita, 25, { teacherId: sol });
    climb(tomas, 'teacher', [24, 17]);

    // Nicolás: el pago se cargó mal, se anuló y se registró el correcto.
    const nicolas = client(28, { firstName: 'Nicolás', lastName: 'Herrera', birthDate: '1991-01-30', phone: '11 4000-0116' });
    sign(nicolas, 28);
    const nicoSale = sell(nicolas, pack8, 27);
    const wrongPayment = pay(nicoSale.id, nicoSale.totalCents, 'cash', 27);
    at(27, 19);
    voidPayment(ctx, wrongPayment.id);
    pay(nicoSale.id, pesos(30_000), 'cash', 27);
    climb(nicolas, 'free', [26, 18, 8]);

    // Liquidaciones: a Martina una parte, a Facundo una mal cargada y anulada, a Sol todo.
    payoutPart(martina, 0.6, 'transfer', 10, 'Adelanto del mes');
    const wrongPayout = payoutPart(facundo, 1, 'cash', 8, null);
    at(7, 12);
    voidPayout(ctx, wrongPayout.id);
    payoutPart(facundo, 0.5, 'transfer', 6, 'Mitad del saldo');
    payoutPart(sol, 1, 'cash', 3, null);

    // Emilia y Franco: recién llegados, todavía sin ficha firmada.
    const emilia = client(6, { firstName: 'Emilia', lastName: 'Godoy', birthDate: '2003-05-25', phone: '11 4000-0118' });
    sell(emilia, pack8, 5);
    climb(emilia, 'free', [2]);
    const franco = client(4, { firstName: 'Franco', lastName: 'Ledesma', birthDate: '1998-02-02', phone: '11 4000-0119' });
    sellPaid(franco, mixto, 4, 'transfer', { teacherId: martina });
    climb(franco, 'teacher', [2]);

    // Agustina y Bianca (menor): se anotaron pero todavía no compraron nada.
    client(3, { firstName: 'Agustina', lastName: 'Molina', birthDate: '2002-01-17', phone: '11 4000-0127' });
    client(2, {
      firstName: 'Bianca',
      lastName: 'Suárez',
      birthDate: '2016-06-06',
      phone: null,
      guardians: [{ firstName: 'Diego', lastName: 'Suárez', dni: '31555666', phone: '11 4000-0128', relation: 'Padre' }],
    });

    at(70, 12);
    archiveClient(ctx, hernan);
  })();
}
