import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let userData: string;

// A fresh, empty database: the spreadsheet only goes into one without clients.
test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'lebloc-e2e-'));
  app = await electron.launch({ args: ['.', '--ozone-platform=x11'], env: { ...process.env, LEBLOC_USER_DATA: userData } });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

test("imports the local's spreadsheet from Ajustes after checking its summary", async () => {
  const fixture = join(__dirname, '..', 'src', 'main', 'import', 'fixtures', 'planilla-ejemplo.xlsx');
  // The native open dialog cannot be driven from the page: answer it from the main process.
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, fixture);

  await page.getByRole('link', { name: 'Ajustes' }).click();
  const panel = page.getByRole('region', { name: 'Importar planilla' });
  await panel.getByRole('button', { name: 'Elegir planilla…' }).click();
  await expect(panel.getByText('planilla-ejemplo.xlsx')).toBeVisible();
  await expect(panel.getByText(/Clientes \(PASES 7 · Escuelita 2\)/)).toBeVisible();
  await expect(panel.getByText(/\$\s135\.000,00/)).toBeVisible();
  const review = panel.getByRole('list', { name: /Para revisar/ });
  await expect(review.getByText('Pase con profe sin profe: quedó en "Sin asignar".')).toBeVisible();

  await panel.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Importar' }).click();
  await expect(panel.getByText('Listo: se importaron 9 clientes y 7 pases.')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Registro de auditoría' }).getByRole('cell', { name: 'Planilla importada' })).toBeVisible();

  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  await page.getByLabel('Buscar', { exact: true }).fill('30222333');
  await page.getByRole('list', { name: 'Clientes' }).getByRole('link', { name: 'Bruno Sierra' }).click();
  await expect(page.getByText(/Deuda: \$\s20\.000,00/)).toBeVisible();

  await page.getByRole('link', { name: 'Profesores' }).click();
  await expect(page.getByRole('list', { name: 'Profesores' }).getByRole('link', { name: 'Fran' })).toBeVisible();
});
