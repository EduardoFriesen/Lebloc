import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let userData: string;

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'lebloc-e2e-'));
  // Sample data, so every tab has something to chart.
  app = await electron.launch({ args: ['.', '--ozone-platform=x11'], env: { ...process.env, LEBLOC_USER_DATA: userData, LEBLOC_SEED: '1' } });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

test('read the finance summary and walk through every tab', async () => {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Finanzas' }).click();
  await expect(page.getByRole('heading', { name: 'Finanzas', level: 1 })).toBeVisible();
  await expect(page.getByText('Ingresos', { exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: /Ingresos y egresos/ })).toBeVisible();
  await expect(page.getByText(/Cobrado para profesores/)).toBeVisible();

  await page.getByRole('button', { name: 'Últimos 3 meses' }).click();
  await expect(page.getByRole('button', { name: 'Últimos 3 meses' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Comparado con/)).toBeVisible();

  const tabs = page.getByRole('navigation', { name: 'Secciones de finanzas' });
  await tabs.getByRole('link', { name: 'Ventas' }).click();
  await expect(page.getByRole('figure', { name: /Planes más vendidos/ })).toBeVisible();
  await expect(page.getByRole('figure', { name: /Productos más vendidos/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Últimos 3 meses' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ganancia' }).click();
  await expect(page.getByText(/Los 10 primeros por ganancia/)).toBeVisible();

  await tabs.getByRole('link', { name: 'Afluencia' }).click();
  await expect(page.getByRole('table', { name: /Cuándo viene la gente/ })).toBeVisible();

  await tabs.getByRole('link', { name: 'Profesores' }).click();
  await expect(page.getByRole('figure', { name: /Clases dadas/ })).toBeVisible();

  await tabs.getByRole('link', { name: 'Clientes' }).click();
  await expect(page.getByRole('heading', { name: 'Dejaron de venir' })).toBeVisible();
});

test('falls back to this month on an invalid URL range and shows the empty state for a quiet period', async () => {
  await page.evaluate(() => {
    window.location.hash = '#/finanzas?desde=2026-10-11&hasta=2026-10-01';
  });
  await expect(page.getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Desde', { exact: true }).fill('2020-01-01');
  await expect(page.getByText('El período no puede pasar de 3 años')).toBeVisible();
  await page.getByLabel('Hasta', { exact: true }).fill('2020-01-31');
  await expect(page.getByText('No hay movimientos en este período')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Períodos' }).getByRole('button', { pressed: true })).toHaveCount(0);
});
