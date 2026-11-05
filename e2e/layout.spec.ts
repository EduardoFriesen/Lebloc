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
  ['/pases', 'Pases'],
  ['/pases/movimientos', 'Pases'],
  ['/clientes', 'Clientes'],
  ['/planes', 'Planes'],
  ['/planes/ventas', 'Planes'],
  ['/kiosco', 'Kiosco'],
  ['/kiosco/productos', 'Kiosco'],
  ['/kiosco/entregas', 'Kiosco'],
  ['/profesores', 'Profesores'],
  ['/empleados', 'Empleados'],
  ['/empleados/turnos', 'Empleados'],
  ['/gastos', 'Gastos'],
  ['/finanzas/ventas', 'Finanzas'],
  ['/clientes/1', 'Pases'],
  ['/profesores/1', 'Pagos al profesor'],
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

// WCAG AA for the small numbers inside the visits heatmap, measured on the colors the browser actually paints.
const HEAT_CONTRAST = `(() => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => v / 255); };
  const lum = ([r, g, b]) => { const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  return [...document.querySelectorAll('td[style]')].filter((cell) => cell.textContent.trim()).map((cell) => {
    const cs = getComputedStyle(cell);
    const a = lum(rgb(cs.color)), b = lum(rgb(cs.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
})()`;

for (const theme of ['light', 'dark'] as const) {
  test(`the heatmap numbers stand out from every cell color in the ${theme} theme`, async () => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.evaluate(`localStorage.setItem('lebloc:appearance', JSON.stringify({ theme: '${theme}', fontSize: 'normal' }))`);
    await page.reload();
    await page.evaluate("window.location.hash = '#/finanzas/afluencia'");
    await expect(page.getByRole('heading', { name: 'Finanzas', exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0);
    await expect.poll(async () => (await page.evaluate<number[]>(HEAT_CONTRAST)).length).toBeGreaterThan(0);
    expect(Math.min(...(await page.evaluate<number[]>(HEAT_CONTRAST)))).toBeGreaterThanOrEqual(4.5);
  });
}

// Every Tab stop shows where the focus is: on the element itself or on the row or card it opens.
const FOCUS_SHOWN = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return true;
  for (let e = el, i = 0; e && i < 4; e = e.parentElement, i++) {
    const cs = getComputedStyle(e);
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) return true;
  }
  return el.tagName + ' ' + (el.getAttribute('type') || '') + ' ' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
})()`;

test('the keyboard focus is always visible, date fields included', async () => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.evaluate(`localStorage.setItem('lebloc:appearance', JSON.stringify({ theme: 'light', fontSize: 'normal' }))`);
  await page.reload();
  const hidden: string[] = [];
  for (const route of ['/gastos', '/finanzas', '/kiosco', '/clientes/1']) {
    await page.evaluate(`window.location.hash = '#${route}'`);
    await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0);
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    for (let stop = 0; stop < 30; stop++) {
      await page.keyboard.press('Tab');
      const shown = await page.evaluate<true | string>(FOCUS_SHOWN);
      if (shown !== true) hidden.push(`${route}: ${shown}`);
    }
  }
  expect([...new Set(hidden)]).toEqual([]);
});

// Every button looks like one: a fill or a drawn frame. Not counted: the stretched title or row buttons (the card or
// row around them is the frame), the options of a segmented control (its pill is) and buttons styled as a link.
const UNFRAMED = `(() => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const alpha = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'transparent'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return ctx.getImageData(0, 0, 1, 1).data[3]; };
  return [...document.querySelectorAll('main button')]
    .filter((b) => b.checkVisibility() && !b.matches('[class*="after:absolute"], [role=group] button'))
    .filter((b) => {
      const cs = getComputedStyle(b);
      if (cs.textDecorationLine.includes('underline')) return false;
      const border = parseFloat(cs.borderTopWidth) > 0 && alpha(cs.borderTopColor) > 0;
      return alpha(cs.backgroundColor) === 0 && cs.boxShadow === 'none' && !border;
    })
    .map((b) => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 40));
})()`;

test('every button has a fill or a frame, in the screens and in the dialogs', async () => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.evaluate(`localStorage.setItem('lebloc:appearance', JSON.stringify({ theme: 'light', fontSize: 'normal' }))`);
  await page.reload();
  const unframed: string[] = [];
  const check = async (where: string) => unframed.push(...(await page.evaluate<string[]>(UNFRAMED)).map((name) => `${where}: ${name}`));
  for (const [route, heading] of SCREENS) {
    await page.evaluate(`window.location.hash = '#${route}'`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0);
    await check(route);
  }
  await page.evaluate("window.location.hash = '#/planes'");
  await page.getByRole('button', { name: 'Nuevo plan' }).click();
  await check('Nuevo plan');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await page.evaluate("window.location.hash = '#/kiosco/entregas'");
  await page.getByRole('button', { name: /^Ver entrega del/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Detalle de la entrega' }).getByRole('table').first()).toBeVisible();
  await check('Detalle de la entrega');
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  expect([...new Set(unframed)]).toEqual([]);
});

// The example text inside a field (search boxes, "0,00") is read too: WCAG AA like any other text.
const PLACEHOLDER_CONTRAST = `(() => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'transparent'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255]; };
  const lum = ([r, g, b]) => { const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  return [...document.querySelectorAll('input[placeholder]')].filter((input) => input.checkVisibility()).map((input) => {
    const bg = rgb(getComputedStyle(input).backgroundColor);
    const ph = rgb(getComputedStyle(input, '::placeholder').color);
    const fg = ph.map((v, i) => (i < 3 ? v * ph[3] + bg[i] * (1 - ph[3]) : 1));
    const a = lum(fg), b = lum(bg);
    return [input.placeholder, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)];
  });
})()`;

for (const theme of ['light', 'dark'] as const) {
  test(`the example text in the fields is readable in the ${theme} theme`, async () => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.evaluate(`localStorage.setItem('lebloc:appearance', JSON.stringify({ theme: '${theme}', fontSize: 'normal' }))`);
    await page.reload();
    const faint: string[] = [];
    for (const route of ['/pases', '/planes', '/empleados']) {
      await page.evaluate(`window.location.hash = '#${route}'`);
      await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0);
      const found = await page.evaluate<[string, number][]>(PLACEHOLDER_CONTRAST);
      expect(found.length).toBeGreaterThan(0);
      for (const [text, ratio] of found) if (ratio < 4.5) faint.push(`${route} "${text}": ${ratio.toFixed(2)}`);
    }
    expect(faint).toEqual([]);
  });
}

