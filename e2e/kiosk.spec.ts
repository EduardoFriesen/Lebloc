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
const kioskToday = () => page.getByRole('region', { name: 'Resumen' }).getByRole('listitem').filter({ hasText: 'Kiosco hoy' });

test('create a product, sell it at the counter and void the ticket', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Kiosco', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await label('Nombre').fill('Agua');
  await label('Unidades por paquete').fill('12');
  await label('Costo del paquete').fill('12.000');
  await label('% de ganancia').fill('40');
  await expect(page.getByText(/Costo unitario \$\s1\.000,00 · Sugerido \$\s1\.400,00/)).toBeVisible();
  await page.getByRole('button', { name: 'Usar sugerido' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('row', { name: /Agua/ })).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await label('Nombre').fill('Magnesio');
  await label('Unidades por paquete').fill('10');
  await label('Costo del paquete').fill('15.000');
  await label('% de ganancia').fill('60');
  await page.getByRole('button', { name: 'Usar sugerido' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('row', { name: /Magnesio/ })).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Mostrador' }).click();
  const product = page.getByRole('button', { name: /^Agua ·/ });
  await product.click();
  await product.click();
  await expect(page.getByRole('button', { name: /Cobrar/ })).toHaveText(/\$\s2\.800,00/);
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await expect(page.getByText(/Venta registrada: \$\s2\.800,00/)).toBeVisible();
  await expect(kioskToday()).toContainText('1');
  await expect(kioskToday()).toContainText(/\$\s2\.800,00/);

  await expect(page.getByRole('heading', { name: 'Más vendidos' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Agua ·/ })).toBeVisible();

  const movements = page.getByRole('region', { name: 'Movimientos de hoy' });
  await expect(movements.getByRole('row', { name: /Kiosco.*2 × Agua/ })).toBeVisible();
  await expect(movements).toContainText(/Total \$\s2\.800,00/);

  await page.getByRole('navigation').getByRole('link', { name: 'Kiosco', exact: true }).click();
  await expect(page.getByRole('row', { name: /2 × Agua/ })).toBeVisible();
  await page.getByRole('button', { name: /Anular ticket/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular venta' }).click();
  await expect(page.getByText('Anulado')).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Mostrador' }).click();
  await expect(kioskToday()).toHaveText(/0/);
  await expect(kioskToday()).not.toContainText('$');
  await expect(movements.getByRole('row', { name: /2 × Agua/ })).toHaveCount(0);
  await expect(movements).not.toContainText(/Total \$\s2\.800,00/);

  // A product that was never sold is found by searching and can be charged.
  await label('Buscar producto').fill('magn');
  await page.getByRole('button', { name: /^Magnesio ·/ }).click();
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await expect(page.getByText(/Venta registrada: \$\s2\.400,00/)).toBeVisible();
  await expect(movements.getByRole('row', { name: /Kiosco.*1 × Magnesio/ })).toBeVisible();
});

test('the main menu collapses and expands', async () => {
  const menu = page.getByRole('navigation', { name: 'Principal' });
  await menu.getByRole('button', { name: 'Ocultar menú' }).click();
  await expect(menu.getByRole('link', { name: 'Kiosco', exact: true })).toBeHidden();
  await menu.getByRole('button', { name: 'Mostrar menú' }).click();
  await expect(menu.getByRole('link', { name: 'Kiosco', exact: true })).toBeVisible();
});

test('a walk-in day pass with shoes is priced in Planes and lands in today movements', async () => {
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await nav.getByRole('link', { name: 'Mostrador', exact: true }).click();
  await expect(page.getByRole('button', { name: /Pase del día/ })).toBeDisabled();

  await nav.getByRole('link', { name: 'Planes', exact: true }).click();
  await label('Pase libre del día').fill('8.000');
  await label('Alquiler de pédulas').fill('3.000');
  await page.getByRole('button', { name: 'Guardar precios' }).click();
  await expect(page.getByText('Precios guardados.')).toBeVisible();

  await nav.getByRole('link', { name: 'Mostrador', exact: true }).click();
  await page.getByRole('button', { name: /Pase del día/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Medio de pago').selectOption('transfer');
  await dialog.getByRole('button', { name: /Sí, con pédulas/ }).click();
  await expect(dialog).toBeHidden();

  const movements = page.getByRole('table', { name: 'Movimientos de hoy' });
  await expect(movements.getByRole('row', { name: /Pase del día/ })).toContainText('Transferencia');
  await expect(movements.getByRole('row', { name: /Pédulas/ })).toContainText(/3\.000/);
  await expect(page.getByText(/Pases sueltos \$\s11\.000,00/)).toBeVisible();

  await movements.getByRole('button', { name: /Anular pédulas/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular', exact: true }).click();
  await expect(movements.getByRole('row', { name: /Pédulas/ })).toHaveCount(0);
  await expect(page.getByText(/Pases sueltos \$\s8\.000,00/)).toBeVisible();
});
