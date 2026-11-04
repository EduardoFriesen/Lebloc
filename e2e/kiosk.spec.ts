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
const kioskTab = (name: string) => page.getByRole('navigation', { name: 'Secciones del kiosco' }).getByRole('link', { name, exact: true }).click();
const passesTab = (name: string) => page.getByRole('navigation', { name: 'Secciones de pases' }).getByRole('link', { name, exact: true }).click();
test('create a product, sell it from the kiosk screen and void the ticket', async () => {
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await nav.getByRole('link', { name: 'Kiosco', exact: true }).click();
  await kioskTab('Productos');
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await label('Nombre').fill('Agua');
  await label('Costo unitario').fill('1.000');
  await label('% de ganancia').fill('40');
  await expect(page.getByText(/Sugerido \$\s1\.400,00/)).toBeVisible();
  await page.getByRole('button', { name: 'Usar sugerido' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('row', { name: /Agua/ })).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await label('Nombre').fill('Magnesio');
  await label('Costo unitario').fill('1.500');
  await label('% de ganancia').fill('60');
  await page.getByRole('button', { name: 'Usar sugerido' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('row', { name: /Magnesio/ })).toBeVisible();

  await kioskTab('Ventas');
  const product = page.getByRole('button', { name: /^Agua ·/ });
  await product.click();
  await product.click();
  await expect(page.getByRole('button', { name: /Cobrar/ })).toHaveText(/\$\s2\.800,00/);
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await expect(page.getByText(/Venta registrada: \$\s2\.800,00/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Más vendidos' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Agua ·/ })).toBeVisible();

  const sales = page.getByRole('table', { name: 'Ventas del día' });
  await expect(sales.getByRole('row', { name: /2 × Agua/ })).toBeVisible();
  // Agua costs $1.000 a unit and sells at $1.400: 2 units leave $800.
  const summary = page.getByRole('complementary', { name: 'Resumen' });
  await expect(summary.getByRole('row', { name: /Ventas de hoy/ })).toContainText(/\$\s2\.800,00/);
  await expect(summary.getByRole('row', { name: /Ganancia de hoy/ })).toContainText(/\$\s800,00/);
  await page.getByRole('button', { name: /Anular ticket/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular venta' }).click();
  await expect(sales.getByText('Anulado')).toBeVisible();
  await expect(summary.getByRole('row', { name: /Ventas de hoy/ })).not.toContainText('$');

  // The counter is only for passes: no kiosk checkout and no tickets in its movements.
  await nav.getByRole('link', { name: 'Pases', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pases', exact: true })).toBeVisible();
  await expect(label('Buscar producto')).toHaveCount(0);
  await passesTab('Movimientos');
  await expect(page.getByRole('region', { name: 'Movimientos de hoy' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Movimientos de hoy' }).getByRole('row', { name: /Agua/ })).toHaveCount(0);

  // A product that was never sold is found by searching and can be charged.
  await nav.getByRole('link', { name: 'Kiosco', exact: true }).click();
  await label('Buscar producto').fill('magn');
  await page.getByRole('button', { name: /^Magnesio ·/ }).click();
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await expect(page.getByText(/Venta registrada: \$\s2\.400,00/)).toBeVisible();
  await expect(sales.getByRole('row', { name: /1 × Magnesio/ })).toBeVisible();
});

test('a supplier delivery paid in parts: its detail, an edit, the rest paid, and its payments in Gastos', async () => {
  const nav = page.getByRole('navigation', { name: 'Principal' });
  const products = page.getByRole('table', { name: 'Productos', exact: true });
  const deliveries = page.getByRole('table', { name: 'Entregas del proveedor', exact: true });
  const merchandise = () => page.getByRole('complementary', { name: 'Resumen' }).getByRole('row', { name: /Mercadería del kiosco/ });

  await nav.getByRole('link', { name: 'Kiosco', exact: true }).click();
  await kioskTab('Entregas');
  await page.getByRole('button', { name: 'Cargar entrega del proveedor' }).click();
  const dialog = page.getByRole('dialog', { name: 'Entrega del proveedor' });
  const first = dialog.getByRole('group', { name: 'Línea 1' });
  await first.getByLabel('Producto').selectOption({ label: 'Agua' });
  await first.getByLabel('Cantidad').fill('24');
  await first.getByLabel('Costo total').fill('26.400');
  await expect(first).toContainText(/\$\s1\.100,00 c\/u \(antes \$\s1\.000,00\)/);

  // A product the supplier brings for the first time is created right there; Escape closes only its dialog.
  await dialog.getByRole('button', { name: 'Nuevo producto' }).click();
  const newProduct = page.getByRole('dialog', { name: 'Nuevo producto' });
  await expect(newProduct.getByLabel('Costo unitario')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(newProduct).toBeHidden();
  await expect(first.getByLabel('Cantidad')).toHaveValue('24');
  await dialog.getByRole('button', { name: 'Nuevo producto' }).click();
  await newProduct.getByLabel('Nombre', { exact: true }).fill('Chicle');
  await newProduct.getByLabel('% de ganancia').fill('100');
  await newProduct.getByLabel('Precio de venta').fill('500');
  await newProduct.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(newProduct).toBeHidden();
  const second = dialog.getByRole('group', { name: 'Línea 2' });
  await expect(second.getByLabel('Producto').locator('option:checked')).toHaveText('Chicle');
  await second.getByLabel('Cantidad').fill('20');
  await second.getByLabel('Costo total').fill('4.000');
  await expect(dialog).toContainText(/Total: \$\s30\.400,00/);
  // Paid in part: the rest is owed to the supplier.
  await dialog.getByLabel('Pago parcial').check();
  await dialog.getByLabel('Monto del pago').fill('10.000');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toBeHidden();

  await kioskTab('Productos');
  await expect(products.getByRole('row', { name: /Agua/ })).toContainText(/\$\s1\.100,00/);
  await expect(products.getByRole('row', { name: /Chicle/ })).toContainText(/\$\s200,00/);
  await kioskTab('Entregas');
  const row = deliveries.getByRole('row', { name: /24 × Agua, 20 × Chicle/ });
  await expect(row).toContainText(/\$\s30\.400,00\s*\$\s20\.400,00/);
  await expect(page.getByText(/Se le debe al proveedor: \$\s20\.400,00/)).toBeVisible();

  // The row opens the delivery: what came in and how it was paid.
  await row.getByRole('cell', { name: '24 × Agua, 20 × Chicle' }).click();
  const detail = page.getByRole('dialog', { name: 'Detalle de la entrega' });
  await expect(detail.getByRole('table', { name: 'Productos de la entrega' })).toContainText(/Chicle\s*20\s*\$\s4\.000,00\s*\$\s200,00/);
  await expect(detail.getByRole('table', { name: 'Pagos de la entrega' })).toContainText(/Efectivo\s*\$\s10\.000,00/);
  await expect(detail).toContainText(/Debe \$\s20\.400,00/);

  // Half the gum came: the delivery is fixed and what is owed follows.
  await detail.getByRole('button', { name: 'Modificar' }).click();
  const edit = page.getByRole('dialog', { name: 'Modificar entrega' });
  await expect(edit.getByLabel('Pago parcial')).toHaveCount(0);
  await edit.getByRole('group', { name: 'Línea 2' }).getByLabel('Cantidad').fill('10');
  await edit.getByRole('group', { name: 'Línea 2' }).getByLabel('Costo total').fill('2.000');
  await edit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(detail).toContainText(/Debe \$\s18\.400,00/);

  await detail.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(detail.getByLabel('Monto')).toHaveValue('18.400,00');
  await detail.getByLabel('Medio de pago').selectOption('transfer');
  await detail.getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(detail.getByText('Pagada', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/Se le debe al proveedor: \$\s0,00/)).toBeVisible();

  // Each payment is an expense of the month, and opens its delivery.
  await nav.getByRole('link', { name: 'Gastos', exact: true }).click();
  await expect(merchandise()).toContainText(/\$\s28\.400,00/);
  const paid = page.getByRole('table', { name: 'Gastos del mes' }).getByRole('row', { name: /Mercadería del kiosco/ });
  await expect(paid).toHaveCount(2);
  await paid.first().getByRole('button', { name: /^Ver entrega/ }).click();
  await expect(page.getByRole('dialog', { name: 'Detalle de la entrega' })).toContainText('Agua');
  await page.keyboard.press('Escape');

  // Voiding: its payments first, then the delivery; Gastos goes back to nothing for the stock.
  await nav.getByRole('link', { name: 'Kiosco', exact: true }).click();
  await kioskTab('Entregas');
  await deliveries.getByRole('row', { name: /24 × Agua, 10 × Chicle/ }).getByRole('button', { name: /^Ver entrega/ }).click();
  for (let left = 2; left > 0; left--) {
    await detail.getByRole('button', { name: /^Anular pago de/ }).first().click();
    await page.getByRole('dialog', { name: 'Anular pago' }).getByRole('button', { name: 'Anular pago' }).click();
    await expect(page.getByRole('dialog', { name: 'Anular pago' })).toBeHidden();
  }
  await detail.getByRole('button', { name: 'Anular entrega' }).click();
  await page.getByRole('dialog', { name: 'Anular entrega' }).getByRole('button', { name: 'Anular entrega' }).click();
  await expect(detail).toContainText('Anulada');
  await page.keyboard.press('Escape');
  await kioskTab('Productos');
  await expect(products.getByRole('row', { name: /Agua/ })).toContainText(/\$\s1\.100,00/);
  await nav.getByRole('link', { name: 'Gastos', exact: true }).click();
  await expect(merchandise()).toContainText(/\$\s0,00/);
});

test('a product created from a delivery shows up even if the delivery is cancelled', async () => {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Kiosco', exact: true }).click();
  await kioskTab('Entregas');
  await page.getByRole('button', { name: 'Cargar entrega del proveedor' }).click();
  const dialog = page.getByRole('dialog', { name: 'Entrega del proveedor' });
  await dialog.getByRole('button', { name: 'Nuevo producto' }).click();
  const newProduct = page.getByRole('dialog', { name: 'Nuevo producto' });
  await newProduct.getByLabel('Nombre', { exact: true }).fill('Turrón');
  await newProduct.getByLabel('% de ganancia').fill('50');
  await newProduct.getByLabel('Precio de venta').fill('800');
  await newProduct.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(newProduct).toBeHidden();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();

  await kioskTab('Productos');
  await expect(page.getByRole('table', { name: 'Productos', exact: true }).getByRole('row', { name: /Turrón/ })).toBeVisible();
  await kioskTab('Ventas');
  await label('Buscar producto').fill('turr');
  await expect(page.getByRole('button', { name: /^Turrón ·/ })).toBeVisible();
  await label('Buscar producto').fill('');
});

test('the main menu collapses and expands', async () => {
  const menu = page.getByRole('navigation', { name: 'Principal' });
  await menu.getByRole('button', { name: 'Ocultar menú' }).click();
  await expect(menu.getByRole('link', { name: 'Kiosco', exact: true })).toBeHidden();
  await menu.getByRole('button', { name: 'Mostrar menú' }).click();
  await expect(menu.getByRole('link', { name: 'Kiosco', exact: true })).toBeVisible();
});

test("the built app drops Electron's default English menu", async () => {
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null)).toBe(true);
});

test('a walk-in day pass with shoes is priced in Planes and lands in today movements', async () => {
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await nav.getByRole('link', { name: 'Pases', exact: true }).click();
  await expect(page.getByRole('button', { name: /Pase del día/ })).toBeDisabled();

  await nav.getByRole('link', { name: 'Planes', exact: true }).click();
  await label('Pase libre del día').fill('8.000');
  await label('Alquiler de pédulas').fill('3.000');
  await page.getByRole('button', { name: 'Guardar precios' }).click();
  await expect(page.getByText('Precios guardados.')).toBeVisible();

  await nav.getByRole('link', { name: 'Pases', exact: true }).click();
  await page.getByRole('button', { name: /Pase del día/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Medio de pago').selectOption('transfer');
  await dialog.getByRole('button', { name: /Sí, con pédulas/ }).click();
  await expect(dialog).toBeHidden();
  // The walk-in is an entry of the day; the shoes are not.
  await expect(page.getByRole('table', { name: 'Ingresos de hoy' }).getByRole('row', { name: /Pase suelto/ })).toHaveCount(1);

  await passesTab('Movimientos');
  const movements = page.getByRole('table', { name: 'Movimientos de hoy' });
  await expect(movements.getByRole('row', { name: /Pase del día/ })).toContainText('Transferencia');
  await expect(movements.getByRole('row', { name: /Pase del día/ })).toContainText(/\d{2}:\d{2}/);
  await expect(movements.getByRole('row', { name: /Pédulas/ })).toContainText(/3\.000/);
  await expect(page.getByText(/Pases sueltos \$\s11\.000,00/)).toBeVisible();

  await movements.getByRole('button', { name: /Anular pédulas/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular', exact: true }).click();
  await expect(movements.getByRole('row', { name: /Pédulas/ })).toHaveCount(0);
  await expect(page.getByText(/Pases sueltos \$\s8\.000,00/)).toBeVisible();

  // The window never scrolls: with the movements filled in, only the counter's own column does.
  await page.mouse.wheel(0, 5000);
  expect(await page.evaluate('[document.scrollingElement.scrollTop, document.documentElement.scrollHeight <= innerHeight]')).toEqual([0, true]);
});
