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
const staffTab = (name: string) => page.getByRole('navigation', { name: 'Secciones de empleados' }).getByRole('link', { name, exact: true }).click();

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

test('tick an expense as paid by clicking its row, and untick it', async () => {
  const paid = page.getByRole('checkbox', { name: /^Pagado: Alquiler/ });
  await expect(paid).not.toBeChecked();
  await page.getByRole('row').filter({ has: paid }).getByRole('cell', { name: 'Octubre' }).click();
  await expect(paid).toBeChecked();

  // It stays after leaving the screen.
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Pases', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Gastos' }).click();
  await expect(paid).toBeChecked();

  await paid.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Desmarcar' }).click();
  await expect(paid).not.toBeChecked();
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
  await expect(page.getByRole('dialog')).toBeHidden();
  // The card picks her shifts out of the month's.
  await page.getByRole('button', { name: 'Lucía Paz', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Secciones de empleados' }).getByRole('link', { name: 'Turnos', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('row', { name: /Lucía Paz.*4,5 h/ })).toBeVisible();
  await page.getByRole('button', { name: 'Quitar filtro: Lucía Paz' }).click();
  await staffTab('Equipo');
  await expect(summary()).toContainText(/Costo del mes\s*\$\s22\.500,00/);

  await page.getByRole('navigation').getByRole('link', { name: 'Gastos' }).click();
  await expect(summary()).toContainText(/Sueldos del mes\s*\$\s22\.500,00/);
});

test("show an employee's payslip for a range of dates", async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Empleados' }).click();
  await page.getByRole('button', { name: 'Liquidar sueldo de Lucía Paz' }).click();
  const slip = page.getByRole('dialog');
  await expect(slip.getByRole('heading', { name: 'Liquidación de sueldo' })).toBeVisible();
  await expect(slip).toContainText(/Horas a pagar\s*4,5 h/);
  await expect(slip).toContainText(/Total a pagar\s*\$\s22\.500,00/);
  await expect(slip.getByRole('table', { name: 'Turnos de la liquidación' }).getByRole('row', { name: /4,5 h/ })).toBeVisible();

  await slip.getByLabel('Desde', { exact: true }).fill('2099-01-01');
  await expect(slip.getByText('El inicio tiene que ser anterior al fin')).toBeVisible();
  await slip.getByLabel('Desde', { exact: true }).fill('2020-01-01');
  await slip.getByLabel('Hasta', { exact: true }).fill('2020-01-31');
  await expect(slip.getByText('No tiene turnos sin pagar entre el 01/01/2020 y el 31/01/2020.')).toBeVisible();
  await slip.getByRole('button', { name: 'Cerrar' }).click();
  await expect(slip).toBeHidden();
});

test('settle the hours owed to an employee and void the settlement', async () => {
  await expect(summary()).toContainText(/A pagar\s*\$\s22\.500,00/);
  await page.getByRole('button', { name: 'Liquidar sueldo de Lucía Paz' }).click();
  const slip = page.getByRole('dialog', { name: 'Liquidación de sueldo' });
  await label('Medio de pago').selectOption('transfer');
  await slip.getByRole('button', { name: 'Confirmar liquidación' }).click();
  await expect(slip.getByText(/No tiene turnos sin pagar/)).toBeVisible();
  await expect(slip.getByRole('row', { name: /Transferencia.*22\.500,00/ })).toBeVisible();
  await slip.getByRole('button', { name: 'Cerrar' }).click();

  await expect(summary()).toContainText(/A pagar\s*\$\s0,00/);
  await staffTab('Turnos');
  await expect(page.getByRole('row', { name: /Lucía Paz.*4,5 h.*Pagado/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Anular turno de Lucía Paz/ })).toBeHidden();
  await staffTab('Equipo');

  await page.getByRole('button', { name: 'Liquidar sueldo de Lucía Paz' }).click();
  await slip.getByRole('button', { name: /^Anular liquidación del/ }).click();
  await page.getByRole('dialog', { name: 'Anular liquidación' }).getByRole('button', { name: 'Anular liquidación' }).click();
  await expect(slip).toContainText(/Total a pagar\s*\$\s22\.500,00/);
  await expect(slip.getByRole('row', { name: /Anulada/ })).toBeVisible();
  await slip.getByRole('button', { name: 'Cerrar' }).click();
  await expect(summary()).toContainText(/A pagar\s*\$\s22\.500,00/);
});

test('search the employees by name, in the team and in the shifts', async () => {
  await page.getByRole('button', { name: 'Nuevo empleado' }).click();
  await label('Nombre').fill('Tomás');
  await label('Apellido').fill('Río');
  await label('Valor hora').fill('4.000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Cargar horas de Tomás Río' }).click();
  await label('Horas').fill('2');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Accents and case don't matter.
  await label('Buscar empleado').fill('lucia');
  const team = page.getByRole('list', { name: 'Empleados' });
  await expect(team.getByRole('heading', { name: 'Lucía Paz' })).toBeVisible();
  await expect(team.getByRole('heading', { name: 'Tomás Río' })).toHaveCount(0);

  await staffTab('Turnos');
  await expect(label('Buscar empleado')).toHaveValue('lucia');
  await expect(page.getByRole('row', { name: /Lucía Paz/ }).first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Tomás Río/ })).toHaveCount(0);
  await label('Buscar empleado').fill('nadie');
  await expect(page.getByText('Ningún turno coincide con “nadie”')).toBeVisible();

  await staffTab('Equipo');
  await expect(page.getByText('Ningún empleado coincide con “nadie”')).toBeVisible();
  await label('Buscar empleado').fill('');
  await expect(team.getByRole('heading', { name: 'Tomás Río' })).toBeVisible();
});
