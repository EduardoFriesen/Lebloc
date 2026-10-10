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

test('sell with teacher, pay in parts, consume, void the last payment and pay the teacher', async () => {
  await page.getByRole('link', { name: 'Planes' }).click();
  await page.getByRole('button', { name: 'Nuevo plan' }).click();
  await label('Nombre').fill('Pack 2+2');
  await label('Pases libres').fill('2');
  await label('Pases con profesor').fill('2');
  await label('Precio del local').fill('20.000');
  await page.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(page.getByRole('link', { name: 'Pack 2+2', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Profesores' }).click();
  await page.getByRole('link', { name: 'Nuevo profesor' }).click();
  await label('Nombre').fill('Juan');
  await label('Apellido').fill('Pared');
  await label('Importe por clase').fill('5.000');
  await page.getByRole('button', { name: 'Guardar profesor' }).click();
  await expect(page.getByRole('heading', { name: 'Juan Pared' })).toBeVisible();

  await page.getByRole('link', { name: 'Clientes' }).click();
  await page.getByRole('link', { name: 'Nuevo cliente' }).click();
  await label('Nombre').fill('Ana');
  await label('Apellido').fill('Roca');
  await label('Fecha de nacimiento').fill('1990-05-10');
  await page.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(page.getByRole('heading', { name: 'Ana Roca' })).toBeVisible();

  await page.getByRole('button', { name: 'Vender plan' }).click();
  await label('Plan').selectOption({ label: 'Pack 2+2' });
  await label('Profesor').selectOption({ label: 'Juan Pared' });
  await page.getByLabel('Pago parcial').check();
  await label('Monto del pago').fill('15.000');
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page.getByText(/Deuda: \$\s15\.000,00/)).toBeVisible();

  await page.getByRole('button', { name: 'Consumir con profesor' }).click();
  await expect(page.getByText('Con profesor restantes: 1')).toBeVisible();

  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await label('Monto').fill('15.000');
  await page.getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Saldada')).toBeVisible();

  await page.getByRole('button', { name: 'Anular último pago' }).click();
  await page.getByRole('button', { name: 'Anular pago' }).click();
  await expect(page.getByText(/Deuda: \$\s15\.000,00/)).toBeVisible();

  await page.getByRole('link', { name: 'Profesores' }).click();
  await page.getByRole('link', { name: 'Juan Pared', exact: true }).click();
  await expect(page.getByTestId('teacher-balance')).toHaveText(/5\.000,00/);
  await page.getByRole('button', { name: 'Registrar liquidación' }).click();
  await page.getByRole('button', { name: 'Confirmar liquidación' }).click();
  await expect(page.getByTestId('teacher-balance')).toHaveText(/\$\s0,00/);
});

test('sell fully paid by default, renew an exhausted plan, sign the waiver and go back', async () => {
  await page.getByRole('link', { name: 'Planes' }).click();
  await page.getByRole('button', { name: 'Nuevo plan' }).click();
  await label('Nombre').fill('Pase suelto');
  await label('Pases libres').fill('1');
  await label('Pases con profesor').fill('0');
  await label('Precio del local').fill('5.000');
  await page.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(page.getByRole('link', { name: 'Pase suelto', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Clientes' }).click();
  await page.getByRole('link', { name: 'Nuevo cliente' }).click();
  await label('Nombre').fill('Bruno');
  await label('Apellido').fill('Sierra');
  await label('Fecha de nacimiento').fill('1988-02-20');
  await page.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(page.getByRole('heading', { name: 'Bruno Sierra' })).toBeVisible();
  await expect(page.getByText('Sin ficha firmada')).toBeVisible();

  await page.getByRole('button', { name: 'Vender plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Plan', { exact: true }).selectOption({ label: 'Pase suelto' });
  await expect(dialog.getByLabel('Pago completo')).toBeChecked();
  await dialog.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page.getByText('Saldada')).toBeVisible();

  await page.getByRole('button', { name: 'Consumir libre' }).click();
  await page.getByRole('button', { name: 'Renovar' }).click();
  await expect(dialog.getByRole('heading', { name: 'Renovar plan' })).toBeVisible();
  await expect(dialog.getByLabel('Plan', { exact: true })).toHaveValue(/\d+/);
  await dialog.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page.getByText('Plan renovado.')).toBeVisible();
  await expect(page.getByText('Libres restantes: 1')).toBeVisible();

  await page.getByRole('button', { name: 'Registrar firma' }).click();
  await dialog.getByRole('button', { name: 'Registrar firma' }).click();
  await expect(page.getByText(/Ficha vigente hasta/)).toBeVisible();

  await page.getByRole('button', { name: '← Volver' }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
});

test('switch to the dark theme and a larger font, and keep both after reloading', async () => {
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await page.getByRole('radio', { name: 'Oscuro' }).check();
  await page.getByRole('radio', { name: 'Grande', exact: true }).check();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveCSS('font-size', '18px');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveCSS('font-size', '18px');
  await expect(page.getByRole('radio', { name: 'Oscuro' })).toBeChecked();
});

test('cards open from anywhere, not only from the name', async () => {
  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  const card = page.getByRole('list', { name: 'Clientes' }).getByRole('listitem').filter({ hasText: 'Ana Roca' });
  // The stretched title link covers the whole card, so a real click on the stats lands on it; `force`
  // skips Playwright's "covered by another element" check and clicks at those coordinates.
  await card.getByText('Pases libres').click({ force: true });
  await expect(page.getByRole('heading', { name: 'Ana Roca' })).toBeVisible();

  await page.getByRole('link', { name: 'Planes' }).click();
  await page.getByRole('list', { name: 'Planes' }).getByRole('listitem').filter({ hasText: 'Pack 2+2' }).getByText(/Precio del local/).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Pack 2+2', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Editar plan' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('link', { name: 'Profesores' }).click();
  await page.getByRole('link', { name: 'Editar Juan Pared' }).click();
  await expect(page.getByLabel('Importe por clase', { exact: true })).toBeVisible();
});

test('debtors live in Clientes behind "Solo con deuda", linked from the counter summary', async () => {
  await page.getByRole('link', { name: 'Mostrador' }).click();
  await page.getByRole('region', { name: 'Resumen' }).getByRole('link', { name: 'Deudores' }).click();
  await expect(page.getByLabel('Solo con deuda')).toBeChecked();
  const cards = page.getByRole('list', { name: 'Clientes' });
  await expect(cards.getByRole('link', { name: 'Ana Roca' })).toBeVisible();
  await expect(cards.getByRole('link', { name: 'Bruno Sierra' })).toHaveCount(0);
  await expect(cards.getByText(/^Debe \$\s15\.000,00 · desde hoy$/)).toBeVisible();
  await expect(page.getByText(/Total adeudado/)).toBeVisible();

  // The filter lives in the URL; react-router applies it in a transition, so wait for the new state.
  await page.getByLabel('Solo con deuda').click();
  await expect(page.getByLabel('Solo con deuda')).not.toBeChecked();
  await expect(cards.getByRole('link', { name: 'Bruno Sierra' })).toBeVisible();
});

test('the counter tints clients by passes left, lists who has to renew, and Clientes follows the same colors', async () => {
  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  await page.getByRole('link', { name: 'Nuevo cliente' }).click();
  await label('Nombre').fill('Clara');
  await label('Apellido').fill('Nube');
  await label('Fecha de nacimiento').fill('1995-01-01');
  await page.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(page.getByRole('heading', { name: 'Clara Nube' })).toBeVisible();

  await page.getByRole('link', { name: 'Mostrador' }).click();
  const results = page.getByRole('list', { name: 'Resultados' });
  await label('Buscar cliente').fill('Clara');
  await expect(results.getByRole('listitem').filter({ hasText: 'Clara Nube' }).getByText('Sin pases')).toBeVisible();
  await label('Buscar cliente').fill('Bruno');
  await expect(results.getByRole('listitem').filter({ hasText: 'Bruno Sierra' }).getByText('Pocos pases')).toBeVisible();

  await label('Buscar cliente').fill('');
  await expect(page.getByRole('list', { name: 'Tienen que renovar' }).getByRole('link', { name: 'Bruno Sierra' })).toBeVisible();

  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  const clara = page.getByRole('list', { name: 'Clientes' }).getByRole('listitem').filter({ hasText: 'Clara Nube' });
  await expect(clara.getByText('Sin pases')).toBeVisible();
});

test("a plan and a teacher list this month's enrollments", async () => {
  await page.getByRole('link', { name: 'Planes' }).click();
  await page.getByRole('link', { name: 'Pack 2+2', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Inscriptos en / })).toBeVisible();
  await expect(page.getByRole('list', { name: /^Inscriptos en / }).getByRole('link', { name: 'Ana Roca' })).toBeVisible();

  await page.getByRole('link', { name: 'Profesores' }).click();
  await page.getByRole('link', { name: 'Juan Pared', exact: true }).click();
  const enrolled = page.getByRole('list', { name: /^Inscriptos en / });
  await expect(enrolled.getByRole('link', { name: 'Ana Roca' })).toBeVisible();
  await expect(enrolled.getByText(/Pack 2\+2 · vendido el/)).toBeVisible();
});

test('the counter summary opens the detail behind each number', async () => {
  await page.getByRole('link', { name: 'Mostrador' }).click();
  const summary = page.getByRole('region', { name: 'Resumen' });
  const clients = page.getByRole('list', { name: 'Clientes' });

  await summary.getByRole('link', { name: 'Deudores' }).click();
  await expect(page.getByLabel('Solo con deuda')).toBeChecked();
  await expect(clients.getByRole('link', { name: 'Ana Roca' })).toBeVisible();

  await page.getByRole('link', { name: 'Mostrador' }).click();
  await summary.getByRole('link', { name: 'Clientes con pases' }).click();
  await expect(page.getByLabel('Solo con pases')).toBeChecked();
  await expect(clients.getByRole('link', { name: 'Ana Roca' })).toBeVisible();
  await expect(clients.getByRole('link', { name: 'Clara Nube' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Mostrador' }).click();
  await summary.getByRole('link', { name: 'Fichas por firmar' }).click();
  await expect(page.getByLabel('Ficha por firmar')).toBeChecked();
  await expect(clients.getByRole('link', { name: 'Clara Nube' })).toBeVisible();
  await expect(clients.getByRole('link', { name: 'Bruno Sierra' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Mostrador' }).click();
  await summary.getByRole('link', { name: 'Saldo con profesores' }).click();
  const juan = page.getByRole('list', { name: 'Profesores' }).getByRole('listitem').filter({ hasText: 'Juan Pared' });
  await expect(juan.getByText('Saldo')).toBeVisible();
});
