import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { OVERFLOWING, SIDEWAYS } from './overflow';

let app: ElectronApplication;
let page: Page;
let userData: string;

// The sample data (months of sales, 200 clients) fills every table the way a busy local would.
test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'lebloc-e2e-'));
  app = await electron.launch({ args: ['.', '--ozone-platform=x11'], env: { ...process.env, LEBLOC_USER_DATA: userData, LEBLOC_SEED: '1' } });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

const SCREENS = [
  ['/', 'Mostrador'],
  ['/clientes', 'Clientes'],
  ['/planes', 'Planes'],
  ['/kiosco', 'Kiosco'],
  ['/profesores', 'Profesores'],
  ['/empleados', 'Empleados'],
  ['/gastos', 'Gastos'],
  ['/finanzas/ventas', 'Finanzas'],
] as const;

async function problemsOn(route: string, heading: string): Promise<string[]> {
  await page.evaluate(`window.location.hash = '#${route}'`);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0);
  // The data tables behind the charts are part of the layout too.
  for (const toggle of await page.locator('summary', { hasText: 'Ver como tabla' }).all()) await toggle.click();
  const problems = [...(await page.evaluate<string[]>(SIDEWAYS)), ...(await page.evaluate<string[]>(OVERFLOWING))];
  return problems.map((problem) => `${route}: ${problem}`);
}

const SIZES = [
  { label: 'the default window', width: 1280, height: 820, fontSize: 'normal' },
  { label: 'the smallest window', width: 1024, height: 700, fontSize: 'normal' },
  { label: 'the default window with large text', width: 1280, height: 820, fontSize: 'large' },
] as const;

for (const size of SIZES) {
  test(`nothing spills out of its card or scrolls sideways at ${size.label}`, async () => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.evaluate(`localStorage.setItem('lebloc:appearance', JSON.stringify({ theme: 'light', fontSize: '${size.fontSize}' }))`);
    await page.reload();
    const problems: string[] = [];
    for (const [route, heading] of SCREENS) problems.push(...(await problemsOn(route, heading)));
    expect(problems).toEqual([]);
  });
}
