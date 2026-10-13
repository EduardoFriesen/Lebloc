import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let userData: string;
let teacherId: number;

// Strings run in the page as is: the e2e tsconfig has no DOM types.
const TODAY = `(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()`;

/** Pesos big enough to stress every card and tile: a $99.999/h shift, a $999.999 class and a $99.999.999 plan and expense. */
const SEED = `(async () => {
  const today = ${TODAY};
  const call = async (channel, input) => {
    const result = await window.lebloc.invoke(channel, input);
    if (!result.success) throw new Error(channel + ': ' + result.error.message);
    return result.data;
  };
  const teacher = await call('teachers:create', { firstName: 'Mara', lastName: 'Cumbre', address: null, phone: null, socials: [], classRateCents: 99999900, active: true, schedules: [] });
  const plan = await call('plans:create', { name: 'Pack grande', freePasses: 0, teacherPasses: 2, priceCents: 9999999900, active: true });
  const client = await call('clients:create', { firstName: 'Ana', lastName: 'Grande', birthDate: '1990-01-01', address: null, phone: null, emergencyName: null, emergencyPhone: null, emergencyRelation: null, enrolledAt: '2020-01-01', guardians: [] });
  const total = 9999999900 + 2 * 99999900;
  await call('sales:create', { clientId: client.id, planId: plan.id, teacherId: teacher.id, splitRule: 'proportional', soldAt: today, initialPayment: { amountCents: total, method: 'cash', paidAt: today } });
  const employee = await call('employees:create', { firstName: 'Bruno', lastName: 'Largo', dni: null, phone: null, address: null, kind: 'staff', hourlyRateCents: 9999900, active: true });
  await call('shifts:create', { employeeId: employee.id, workedOn: today, minutes: 1200, note: null });
  await call('expenses:create', { category: 'rent', description: null, amountCents: 9999999900, method: 'transfer', paidAt: today });
  return teacher.id;
})()`;

/**
 * Every visible text that sticks out of its card or tile (anything drawn with rounded-2xl), measured on the text itself.
 * Screen-reader-only text and closed "Ver como tabla" panels are not drawn, so they are skipped.
 */
const OVERFLOWING = `[...document.querySelectorAll('[class*="rounded-2xl"]')].flatMap((box) => {
  const right = box.getBoundingClientRect().right;
  const out = [];
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest('.sr-only, details:not([open]) > :not(summary)')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.right > right + 0.5) out.push(node.textContent.trim());
  }
  return out;
})`;

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'lebloc-e2e-'));
  app = await electron.launch({ args: ['.', '--ozone-platform=x11'], env: { ...process.env, LEBLOC_USER_DATA: userData } });
  page = await app.firstWindow();
  // The default window size: big amounts have to fit where the app opens.
  await page.setViewportSize({ width: 1280, height: 820 });
  teacherId = await page.evaluate<number>(SEED);
});

test.afterAll(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

async function overflowingOn(route: string, ready: string): Promise<string[]> {
  await page.evaluate(`window.location.hash = '#${route}'`);
  await expect(page.getByRole('heading', { name: ready }).first()).toBeVisible();
  // The numbers arrive after the skeleton; wait for the biggest one before measuring.
  await page.waitForLoadState('networkidle');
  return page.evaluate<string[]>(OVERFLOWING);
}

test('big amounts stay inside the employee cards', async () => {
  const overflowing = await overflowingOn('/empleados', 'Empleados');
  await expect(page.getByText('$ 1.999.980,00').first()).toBeVisible();
  expect(await page.evaluate<string[]>(OVERFLOWING), String(overflowing)).toEqual([]);
});

test('big amounts stay inside the teacher cards and the teacher account tiles', async () => {
  await overflowingOn('/profesores', 'Profesores');
  await expect(page.getByText('$ 1.999.998,00').first()).toBeVisible();
  expect(await page.evaluate<string[]>(OVERFLOWING)).toEqual([]);

  await overflowingOn(`/profesores/${teacherId}`, 'Mara Cumbre');
  await expect(page.getByText('$ 1.999.998,00').first()).toBeVisible();
  expect(await page.evaluate<string[]>(OVERFLOWING)).toEqual([]);
});

test('big amounts stay inside the finance tiles and the counter summary', async () => {
  await overflowingOn('/finanzas', 'Finanzas');
  await expect(page.getByText('$ 99.999.999,00').first()).toBeVisible();
  expect(await page.evaluate<string[]>(OVERFLOWING)).toEqual([]);

  await overflowingOn('/', 'Mostrador');
  await expect(page.getByRole('region', { name: 'Resumen' })).toBeVisible();
  expect(await page.evaluate<string[]>(OVERFLOWING)).toEqual([]);
});
