import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let userData: string;

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'lebloc-e2e-'));
  app = await electron.launch({ args: ['.', '--ozone-platform=x11'], env: { ...process.env, LEBLOC_USER_DATA: userData } });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

const label = (text: string) => page.getByLabel(text, { exact: true });
const summary = () => page.getByRole('complementary');

test('record an expense, repeat it and void the copy', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Gastos' }).click();
  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  await label('Categoría').selectOption('rent');
  await label('Detalle').fill('Octubre');
  await label('Importe').fill('450.000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('row', { name: /Alquiler.*Octubre/ })).toBeVisible();
  await expect(summary()).toContainText(/Total del mes\s*\$\s450\.000,00/);

  await page.getByRole('button', { name: /^Repetir/ }).first().click();
  await expect(label('Importe')).toHaveValue('450.000,00');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(summary()).toContainText(/Total del mes\s*\$\s900\.000,00/);

  await page.getByRole('button', { name: /^Anular/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular gasto' }).click();
  await expect(summary()).toContainText(/Total del mes\s*\$\s450\.000,00/);
  await expect(page.getByRole('row', { name: /Anulado/ })).toBeVisible();
});

test('add an employee and record a shift', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Empleados' }).click();
  await page.getByRole('button', { name: 'Nuevo empleado' }).click();
  await label('Nombre').fill('Lucía');
  await label('Apellido').fill('Paz');
  await label('Valor hora').fill('5.000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lucía Paz' })).toBeVisible();

  await page.getByRole('button', { name: 'Cargar horas de Lucía Paz' }).click();
  await label('Horas').fill('4,5');
  await expect(page.getByText(/Costo estimado \$\s22\.500,00/)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('row', { name: /Lucía Paz.*4,5 h/ })).toBeVisible();
  await expect(summary()).toContainText(/Costo del mes\s*\$\s22\.500,00/);

  await page.getByRole('navigation').getByRole('link', { name: 'Gastos' }).click();
  await expect(summary()).toContainText(/Sueldos del mes\s*\$\s22\.500,00/);
});
