# Lebloc Core (subproyecto 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicación de escritorio offline para el mostrador de un local de escalada que gestiona clientes, profesores, planes (packs de pases), ventas con recargo de profesor, pagos parciales con reparto local/profesor, consumo de pases, deudores y cuenta corriente de profesores.

**Architecture:** Electron con tres capas aisladas. `src/domain` es TypeScript puro con todas las reglas de negocio. `src/main` contiene SQLite, repos, services e IPC validado con Zod. `src/renderer` es React y solo hace vista. El renderer habla con main únicamente a través de un bridge tipado (`window.lebloc.invoke`) con una lista blanca de canales. El dinero se maneja en centavos enteros, los derivados se calculan a partir de los movimientos y nada se borra: se anula.

**Tech Stack:** Electron 44, electron-vite 5 (Vite 7), React 19, React Router 7 (HashRouter), Tailwind 4, TypeScript 5.9 (strict), better-sqlite3 13, Zod 4, electron-log 5, Vitest 5 (ejecutado con el runtime de Electron), Playwright 1.63, ESLint 10 + typescript-eslint 8.

**Spec:** `docs/superpowers/specs/2026-10-05-lebloc-core-design.md`

## Global Constraints

- Dinero: siempre `number` entero en centavos. Prohibido usar floats para montos. La UI formatea con `formatMoney` y parsea con `parseMoneyInput` (`src/shared/money.ts`).
- Fechas de negocio (`sold_at`, `paid_at`, `enrolled_at`, `birth_date`): `YYYY-MM-DD`. Timestamps (`updated_at`, `consumed_at`, `voided_at`, `archived_at`, `anonymized_at`): ISO 8601 de `Date.toISOString()`.
- Nada se borra: pagos, consumos, liquidaciones y ventas se anulan con `voided_at`; los clientes se archivan con `archived_at`. La única excepción es la anonimización, que borra datos personales y tutores.
- Contrato IPC: `{ success: true, data }` o `{ success: false, error: { code, message, details? } }`. Mensajes en español. Sin stack traces ni SQL hacia el renderer.
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP estricta. El renderer nunca recibe rutas de archivos para abrir ni accede a la base de datos.
- TypeScript estricto con `noUncheckedIndexedAccess`; sin `any` y sin `!` (non-null assertion: la regla de lint lo prohíbe).
- Código, identificadores y commits en inglés; textos de UI y mensajes de error en español.
- Conventional Commits: un cambio lógico por commit, en la rama `feat/core` (creada a partir de `docs/core-spec`). Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npm test` corre Vitest con el binario de Electron (`ELECTRON_RUN_AS_NODE=1`), porque `better-sqlite3` está compilado para el ABI de Electron. No hay que ejecutar Vitest con el `node` del sistema.
- Dependencias (justificación, según el CLAUDE.md global):
  - `better-sqlite3`: SQLite síncrono y transaccional.
  - `zod`: validación compartida entre el IPC y los formularios.
  - `electron-log`: logs locales de errores.
  - `react-router-dom`: navegación.
  - `@electron/rebuild`: recompilar el módulo nativo para Electron.
  - `electron-vite`: build unificado de main, preload y renderer.
  - El resto son herramientas de desarrollo estándar.
  - Después de instalar, correr `npm audit --audit-level=high`.

## Review Focus

1. Un pago del medio anulado (no el último): tiene que rechazarse con `ONLY_LAST_PAYMENT_VOIDABLE` y no tocar los repartos guardados. Test en la Task 9.
2. Consumo con varias ventas, una de ellas anulada: el FIFO tiene que saltear la venta anulada aunque sea la más vieja. Test en la Task 10.
3. Restaurar un archivo que no es un backup válido: tiene que rechazarse con `INVALID_BACKUP` y la base actual tiene que quedar intacta y abierta. Test en la Task 12.
4. Editar un cliente menor quitándole todos los tutores: el update también aplica `MINOR_REQUIRES_GUARDIAN`, no solo el alta. Test en la Task 7.
5. Liquidación después de anular un pago ya liquidado: el saldo del profesor queda negativo y cualquier liquidación nueva se rechaza con `PAYOUT_EXCEEDS_BALANCE`. Test en la Task 11.

---

## File Structure

```
package.json, electron.vite.config.ts, vitest.config.ts, eslint.config.mjs,
tsconfig.node.json, tsconfig.web.json, playwright.config.ts, .gitignore
src/
  domain/                    # puro, sin I/O
    errors.ts                # DomainError + códigos + mensajes en español
    dates.ts                 # toIsoDate, parseIsoDate, daysBetween
    client.ts                # ageFrom, isMinor, assertGuardianRule
    sale.ts                  # SplitRule, computeSurcharge, buildSaleSnapshot
    allocation.ts            # allocatePayment
    ledger.ts                # saleDebt, assertPaymentVoidable, assertSaleVoidable, teacherBalance, assertPayoutFits
    passes.ts                # PassKind, remainingPasses, isLowOnPasses, pickSaleForConsumption
  shared/                    # usado por main y renderer
    money.ts                 # formatMoney, parseMoneyInput
    schemas.ts               # esquemas Zod de entrada
    types.ts                 # DTOs de salida
    channels.ts              # lista blanca de canales IPC
    api.ts                   # apiSchemas, ApiOutputs, ApiResult, LeblocBridge
  test/helpers.ts            # must, expectDomainError, expectDomainErrorAsync
  main/
    index.ts                 # app, ventana, wiring
    context.ts               # Context, Clock, nowIso, today
    test-context.ts          # createTestContext + fixtures
    backup.ts                # createBackup, pruneBackups, validateBackupFile
    db/connection.ts         # openDatabase, DatabaseHolder
    db/migrations.ts         # MIGRATIONS, migrate
    db/migrations/001_initial.ts
    repos/                   # SQL por agregado
      saleStats.ts clients.ts teachers.ts plans.ts sales.ts payments.ts
      consumptions.ts payouts.ts settings.ts
    services/                # casos de uso
      clients.ts teachers.ts plans.ts sales.ts payments.ts consumptions.ts
      account.ts payouts.ts dashboard.ts settings.ts
    ipc/execute.ts           # validación + mapeo de errores
    ipc/register.ts          # ipcMain.handle + verificación del sender
    ipc/handlers.ts          # canal → service
  preload/index.ts           # contextBridge con lista blanca
  renderer/
    index.html, main.tsx, styles.css, global.d.ts
    lib/api.ts, lib/useAsync.ts, lib/format.ts, lib/formErrors.ts
    components/ui/*.tsx      # Button, Field, Dialog, States, Notice, PageHeader, MoneyField
    components/Layout.tsx
    pages/                   # HomePage, ClientsPage, ClientFormPage, ClientDetailPage,
                             # SellPlanDialog, PaymentDialog, PlansPage, TeachersPage,
                             # TeacherFormPage, TeacherAccountPage, DebtorsPage, SettingsPage
e2e/core-flow.spec.ts
```

---

### Task 1: Scaffolding del proyecto

**Files:**
- Create: `package.json`, `.gitignore`, `tsconfig.node.json`, `tsconfig.web.json`, `electron.vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`
- Create: `src/main/index.ts` (mínimo, se reemplaza en la Task 13), `src/preload/index.ts` (mínimo), `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/styles.css`
- Test: `src/main/db/sqlite.smoke.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: scripts `npm test`, `npm run typecheck`, `npm run lint`, `npm run dev`, `npm run build`, `npm run test:e2e`, `npm run audit`.

- [ ] **Step 1: Crear la rama de trabajo**

```bash
git checkout docs/core-spec && git checkout -b feat/core
```

- [ ] **Step 2: Crear `package.json`**

```json
{
  "name": "lebloc",
  "version": "0.1.0",
  "private": true,
  "description": "Sistema de gestión para un local de escalada",
  "author": "EduardoFriesen",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "postinstall": "electron-rebuild -f -w better-sqlite3",
    "test": "ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run",
    "test:watch": "ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs",
    "test:e2e": "electron-vite build && playwright test",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "lint": "eslint .",
    "audit": "npm audit --audit-level=high"
  },
  "dependencies": {
    "better-sqlite3": "^13.0.3",
    "electron-log": "^5.4.4",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-router-dom": "^7.18.4",
    "zod": "^4.3.3"
  },
  "devDependencies": {
    "@electron/rebuild": "^4.2.0",
    "@eslint/js": "^10.0.1",
    "@playwright/test": "^1.63.0",
    "@tailwindcss/vite": "^4.3.3",
    "@types/better-sqlite3": "^9.6.0",
    "@types/node": "^24.19.1",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^5.2.0",
    "electron": "^44.5.1",
    "electron-vite": "^5.0.0",
    "eslint": "^10.12.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "globals": "^17.13.0",
    "tailwindcss": "^4.3.3",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.71.0",
    "vite": "^7.3.6",
    "vitest": "^5.0.3"
  }
}
```

Notas de compatibilidad, ya verificadas:
- electron-vite 5 acepta Vite ≤ 7, por eso Vite queda fijo en 7.
- typescript-eslint 8.71 exige TypeScript < 6.1, por eso TypeScript queda en `~5.9.3`.

- [ ] **Step 3: Crear `.gitignore`**

```
node_modules/
out/
dist/
.vite/
.env
.env.*
*.db
*.db-wal
*.db-shm
playwright-report/
test-results/
```

- [ ] **Step 4: Crear las configuraciones de TypeScript**

`tsconfig.node.json` (main, preload, domain, shared, tests):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src/main/**/*",
    "src/preload/**/*",
    "src/domain/**/*",
    "src/shared/**/*",
    "src/test/**/*",
    "e2e/**/*",
    "electron.vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts"
  ]
}
```

`tsconfig.web.json` (renderer):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": [],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/renderer/**/*", "src/shared/**/*", "src/domain/**/*"]
}
```

- [ ] **Step 5: Crear las configuraciones de build, test y lint**

`electron.vite.config.ts` (electron-vite 5 externaliza las dependencias de main y preload por defecto, así que `better-sqlite3` no se bundlea):

```ts
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: 'src/renderer',
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

`eslint.config.mjs`:

```js
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['out/', 'dist/', 'node_modules/', 'playwright-report/', 'test-results/']),
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'e2e/**/*.ts', '*.config.*'],
    languageOptions: { globals: globals.node },
  },
]);
```

- [ ] **Step 6: Crear los entry points mínimos**

`src/main/index.ts` (temporal; la Task 13 lo reemplaza completo):

```ts
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

void app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
```

`src/preload/index.ts` (temporal):

```ts
export {};
```

`src/renderer/index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'"
    />
    <title>Lebloc</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/renderer/styles.css`:

```css
@import 'tailwindcss';

@theme {
  --color-chalk: #f6f3ee;
  --color-chalk-deep: #ebe5db;
  --color-granite: #1f2326;
  --color-granite-soft: #4a5157;
  --color-volt: #ff5a1f;
  --color-volt-ink: #a8380c;
  --color-moss: #2f6f52;
  --color-ochre: #8a5a12;
  --color-danger: #a8231a;
  --font-display: 'Barlow Condensed', 'Arial Narrow', 'Roboto Condensed', ui-sans-serif, sans-serif;
  --font-sans: ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif;
}

body {
  @apply bg-chalk text-granite font-sans antialiased;
}

:focus-visible {
  outline: 3px solid var(--color-volt);
  outline-offset: 2px;
}
```

`src/renderer/main.tsx` (temporal; la Task 14 lo reemplaza):

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <h1 className="p-8 font-display text-4xl">LEBLOC</h1>
  </StrictMode>,
);
```

- [ ] **Step 7: Escribir el smoke test de SQLite**

`src/main/db/sqlite.smoke.test.ts`:

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

describe('better-sqlite3 under the Electron runtime', () => {
  it('opens an in-memory database', () => {
    const db = new Database(':memory:');
    expect(db.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 });
    db.close();
  });
});
```

- [ ] **Step 8: Instalar las dependencias y correr el smoke test**

Run: `npm install && npm test`
Expected: `postinstall` recompila `better-sqlite3` para Electron y el smoke test pasa (1 passed).
Si falla con `NODE_MODULE_VERSION`, correr `npx electron-rebuild -f -w better-sqlite3` y repetir.

- [ ] **Step 9: Verificar typecheck, lint, build, audit y que la app abra**

Run: `npm run typecheck && npm run lint && npm run build && npm run audit`
Expected: los cuatro comandos terminan sin errores.
Run: `npm run dev`
Expected: se abre una ventana con el título "LEBLOC". Cerrarla.

- [ ] **Step 10: Documentar los comandos en `CLAUDE.md`**

Reemplazar la sección "Estado del proyecto" de `CLAUDE.md` por:

````markdown
## Estado del proyecto

Lebloc es un sistema de gestión para un local de escalada. Es una app de escritorio offline para una sola PC de mostrador. Requisitos en `lebloc.md`; diseño en `docs/superpowers/specs/`; planes en `docs/superpowers/plans/`. Hay 4 subproyectos: 1) núcleo (clientes, profesores, planes, ventas, pagos y pases), 2) kiosco, 3) gastos y empleados, 4) balance y análisis. Cada uno tiene su propia spec.

## Comandos

```bash
npm run dev          # app en modo desarrollo (electron-vite)
npm test             # Vitest con el runtime de Electron (better-sqlite3 está compilado para Electron)
npm test -- src/domain/allocation.test.ts -t "proportional"   # un archivo / un test
npm run typecheck    # tsc sobre tsconfig.node.json y tsconfig.web.json
npm run lint
npm run test:e2e     # build + Playwright sobre Electron
npm run audit        # npm audit --audit-level=high
```

No correr Vitest con el `node` del sistema: falla con `NODE_MODULE_VERSION`. Si se reinstaló algo, `npx electron-rebuild -f -w better-sqlite3`.

## Arquitectura

- `src/domain/`: reglas de negocio puras, sin I/O. Toda regla nueva va acá, con su test.
- `src/main/`: `db/` (conexión y migraciones numeradas, versión en `PRAGMA user_version`), `repos/` (solo SQL), `services/` (casos de uso, transacciones, invocan reglas de `domain`), `ipc/` (validación Zod → service → `{ success, data | error }`).
- `src/preload/`: expone `window.lebloc.invoke(channel, input)` con lista blanca de `src/shared/channels.ts`.
- `src/shared/`: esquemas Zod, DTOs y helpers de dinero, compartidos por main y renderer.
- `src/renderer/`: React + Tailwind, solo vista. Llama a main con `call()` (`lib/api.ts`) y maneja los 4 estados con `useAsync` + `AsyncView`.
- Para agregar un canal: nombre en `shared/channels.ts`, esquema en `shared/api.ts` (`apiSchemas` y `ApiOutputs`), handler en `main/ipc/handlers.ts`.
- El dinero va en centavos enteros. Los derivados (deuda, pases restantes, saldo de profesor) no se guardan: se calculan desde los movimientos. Las ventas guardan un snapshot del plan y del profesor. Los movimientos se anulan (`voided_at`), nunca se borran.
````

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .gitignore tsconfig.node.json tsconfig.web.json electron.vite.config.ts vitest.config.ts eslint.config.mjs src CLAUDE.md
git commit -m "feat: scaffold electron app with sqlite, vitest and lint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dominio — errores, fechas y clientes

**Files:**
- Create: `src/domain/errors.ts`, `src/domain/dates.ts`, `src/domain/client.ts`, `src/test/helpers.ts`
- Test: `src/domain/errors.test.ts`, `src/domain/dates.test.ts`, `src/domain/client.test.ts`

**Interfaces:**
- Produces:
  - `class DomainError extends Error { readonly code: DomainErrorCode }`, `type DomainErrorCode`, `ERROR_MESSAGES`
  - `toIsoDate(date: Date): string`, `parseIsoDate(iso: string): [number, number, number]`, `daysBetween(fromIso: string, toIso: string): number`
  - `ADULT_AGE = 18`, `ageFrom(birthDate: string, today: string): number`, `isMinor(birthDate: string, today: string): boolean`, `assertGuardianRule(birthDate: string, guardianCount: number, today: string): void`
  - Test helpers: `must<T>(value: T | null | undefined): T`, `expectDomainError(fn: () => unknown, code: DomainErrorCode): void`, `expectDomainErrorAsync(fn: () => Promise<unknown>, code: DomainErrorCode): Promise<void>`

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DomainError, ERROR_MESSAGES } from './errors';

describe('DomainError', () => {
  it('carries a code and its Spanish message', () => {
    const error = new DomainError('PAYMENT_EXCEEDS_DEBT');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('PAYMENT_EXCEEDS_DEBT');
    expect(error.message).toBe(ERROR_MESSAGES.PAYMENT_EXCEEDS_DEBT);
    expect(error.name).toBe('DomainError');
  });
});
```

`src/domain/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { daysBetween, parseIsoDate, toIsoDate } from './dates';

describe('dates', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('parses an ISO date and rejects malformed input', () => {
    expect(parseIsoDate('2026-10-05')).toEqual([2026, 10, 5]);
    expect(() => parseIsoDate('05/10/2026')).toThrow(RangeError);
  });

  it('counts calendar days between two dates', () => {
    expect(daysBetween('2026-09-30', '2026-10-05')).toBe(5);
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0);
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
  });
});
```

`src/domain/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { ageFrom, assertGuardianRule, isMinor } from './client';

describe('ageFrom', () => {
  it('does not count the birthday until it happens', () => {
    expect(ageFrom('2008-10-06', '2026-10-05')).toBe(17);
    expect(ageFrom('2008-10-05', '2026-10-05')).toBe(18);
    expect(ageFrom('2008-11-01', '2026-10-05')).toBe(17);
  });

  it('handles leap-day birthdays', () => {
    expect(ageFrom('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageFrom('2008-02-29', '2026-03-01')).toBe(18);
  });
});

describe('isMinor', () => {
  it('is true below 18 and false from 18 on', () => {
    expect(isMinor('2008-10-06', '2026-10-05')).toBe(true);
    expect(isMinor('2008-10-05', '2026-10-05')).toBe(false);
  });
});

describe('assertGuardianRule', () => {
  it('requires at least one guardian for minors', () => {
    expectDomainError(() => assertGuardianRule('2015-01-01', 0, '2026-10-05'), 'MINOR_REQUIRES_GUARDIAN');
    expect(() => assertGuardianRule('2015-01-01', 1, '2026-10-05')).not.toThrow();
  });

  it('does not require guardians for adults', () => {
    expect(() => assertGuardianRule('1990-01-01', 0, '2026-10-05')).not.toThrow();
  });
});
```

`src/test/helpers.ts`:

```ts
import { expect } from 'vitest';
import { DomainError, type DomainErrorCode } from '../domain/errors';

export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a value');
  return value;
}

export function expectDomainError(fn: () => unknown, code: DomainErrorCode): void {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError ${code}, but nothing was thrown`);
}

export async function expectDomainErrorAsync(fn: () => Promise<unknown>, code: DomainErrorCode): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError ${code}, but nothing was thrown`);
}
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/domain`
Expected: FAIL; no se pueden resolver `./errors`, `./dates` ni `./client`.

- [ ] **Step 3: Implementar**

`src/domain/errors.ts`:

```ts
export const ERROR_MESSAGES = {
  INVALID_AMOUNT: 'El monto tiene que ser mayor a cero.',
  PAYMENT_EXCEEDS_DEBT: 'El pago supera la deuda de la venta.',
  PAYOUT_EXCEEDS_BALANCE: 'La liquidación supera el saldo del profesor.',
  ONLY_LAST_PAYMENT_VOIDABLE: 'Solo se puede anular el último pago activo de la venta.',
  SALE_HAS_ACTIVE_PAYMENTS: 'La venta tiene pagos activos. Anulalos primero.',
  SALE_HAS_ACTIVE_CONSUMPTIONS: 'La venta tiene consumos activos. Anulalos primero.',
  SALE_VOIDED: 'La venta está anulada.',
  NO_PASSES_AVAILABLE: 'El cliente no tiene pases disponibles de ese tipo.',
  MINOR_REQUIRES_GUARDIAN: 'Un cliente menor de edad necesita al menos un tutor.',
  TEACHER_REQUIRED: 'Este plan incluye clases con profesor: elegí un profesor.',
  TEACHER_NOT_ALLOWED: 'Este plan no incluye clases con profesor.',
  INACTIVE_PLAN: 'El plan está inactivo.',
  INACTIVE_TEACHER: 'El profesor está inactivo.',
  ALREADY_VOIDED: 'El registro ya está anulado.',
  CLIENT_ARCHIVED: 'El cliente está archivado.',
  CLIENT_NOT_ARCHIVED: 'Solo se puede anonimizar un cliente archivado.',
  CLIENT_ANONYMIZED: 'El cliente fue anonimizado y no se puede modificar.',
  INVALID_BACKUP: 'El archivo no es un backup válido de Lebloc.',
  NOT_FOUND: 'No se encontró el registro.',
} as const;

export type DomainErrorCode = keyof typeof ERROR_MESSAGES;

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'DomainError';
    this.code = code;
  }
}
```

`src/domain/dates.ts`:

```ts
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function parseIsoDate(iso: string): [number, number, number] {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`Invalid ISO date: ${iso}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function utcDay(iso: string): number {
  const [year, month, day] = parseIsoDate(iso);
  return Date.UTC(year, month - 1, day);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcDay(toIso) - utcDay(fromIso)) / DAY_MS);
}
```

`src/domain/client.ts`:

```ts
import { parseIsoDate } from './dates';
import { DomainError } from './errors';

export const ADULT_AGE = 18;

export function ageFrom(birthDate: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = parseIsoDate(birthDate);
  const [year, month, day] = parseIsoDate(today);
  const hadBirthday = month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (hadBirthday ? 0 : 1);
}

export function isMinor(birthDate: string, today: string): boolean {
  return ageFrom(birthDate, today) < ADULT_AGE;
}

export function assertGuardianRule(birthDate: string, guardianCount: number, today: string): void {
  if (isMinor(birthDate, today) && guardianCount === 0) throw new DomainError('MINOR_REQUIRES_GUARDIAN');
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/domain`
Expected: PASS (todos los tests de errors, dates y client).

- [ ] **Step 5: Commit**

```bash
git add src/domain src/test
git commit -m "feat: add domain errors, date helpers and guardian rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dominio — snapshot de venta y reparto de pagos

**Files:**
- Create: `src/domain/sale.ts`, `src/domain/allocation.ts`
- Test: `src/domain/sale.test.ts`, `src/domain/allocation.test.ts`

**Interfaces:**
- Consumes: `DomainError` (Task 2), `expectDomainError` (Task 2)
- Produces:
  - `type SplitRule = 'proportional' | 'teacher_first' | 'local_first'`, `SPLIT_RULES: readonly SplitRule[]`
  - `interface PlanForSale { id: number; name: string; freePasses: number; teacherPasses: number; priceCents: number; active: boolean }`
  - `interface TeacherForSale { id: number; classRateCents: number; active: boolean }`
  - `interface SaleSnapshot { planId: number; planName: string; freePasses: number; teacherPasses: number; localPriceCents: number; teacherId: number | null; teacherRateCents: number; teacherSurchargeCents: number; totalCents: number; splitRule: SplitRule }`
  - `computeSurcharge(teacherPasses: number, rateCents: number): number`
  - `buildSaleSnapshot(plan: PlanForSale, teacher: TeacherForSale | null, splitRule: SplitRule): SaleSnapshot`
  - `interface AllocationInput { totalCents: number; surchargeCents: number; splitRule: SplitRule; allocatedLocalCents: number; allocatedTeacherCents: number; amountCents: number }`
  - `interface Allocation { localCents: number; teacherCents: number }`
  - `allocatePayment(input: AllocationInput): Allocation`

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/sale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { buildSaleSnapshot, computeSurcharge, type PlanForSale, type TeacherForSale } from './sale';

const freePlan: PlanForSale = { id: 1, name: 'Pack 8 libres', freePasses: 8, teacherPasses: 0, priceCents: 2_000_000, active: true };
const mixedPlan: PlanForSale = { id: 2, name: 'Pack 4+4', freePasses: 4, teacherPasses: 4, priceCents: 2_000_000, active: true };
const teacher: TeacherForSale = { id: 7, classRateCents: 250_000, active: true };

describe('computeSurcharge', () => {
  it('multiplies teacher passes by the class rate', () => {
    expect(computeSurcharge(4, 250_000)).toBe(1_000_000);
    expect(computeSurcharge(0, 250_000)).toBe(0);
  });
});

describe('buildSaleSnapshot', () => {
  it('snapshots a free plan without teacher', () => {
    expect(buildSaleSnapshot(freePlan, null, 'proportional')).toEqual({
      planId: 1,
      planName: 'Pack 8 libres',
      freePasses: 8,
      teacherPasses: 0,
      localPriceCents: 2_000_000,
      teacherId: null,
      teacherRateCents: 0,
      teacherSurchargeCents: 0,
      totalCents: 2_000_000,
      splitRule: 'proportional',
    });
  });

  it('adds the teacher surcharge to the total', () => {
    const snapshot = buildSaleSnapshot(mixedPlan, teacher, 'teacher_first');
    expect(snapshot.teacherId).toBe(7);
    expect(snapshot.teacherRateCents).toBe(250_000);
    expect(snapshot.teacherSurchargeCents).toBe(1_000_000);
    expect(snapshot.totalCents).toBe(3_000_000);
    expect(snapshot.splitRule).toBe('teacher_first');
  });

  it('requires a teacher when the plan has teacher passes', () => {
    expectDomainError(() => buildSaleSnapshot(mixedPlan, null, 'proportional'), 'TEACHER_REQUIRED');
  });

  it('rejects a teacher when the plan has no teacher passes', () => {
    expectDomainError(() => buildSaleSnapshot(freePlan, teacher, 'proportional'), 'TEACHER_NOT_ALLOWED');
  });

  it('rejects inactive plans and teachers', () => {
    expectDomainError(() => buildSaleSnapshot({ ...freePlan, active: false }, null, 'proportional'), 'INACTIVE_PLAN');
    expectDomainError(() => buildSaleSnapshot(mixedPlan, { ...teacher, active: false }, 'proportional'), 'INACTIVE_TEACHER');
  });
});
```

`src/domain/allocation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { allocatePayment, type Allocation } from './allocation';
import { SPLIT_RULES, type SplitRule } from './sale';

function payInSequence(splitRule: SplitRule, totalCents: number, surchargeCents: number, amounts: number[]): Allocation[] {
  let allocatedLocalCents = 0;
  let allocatedTeacherCents = 0;
  return amounts.map((amountCents) => {
    const allocation = allocatePayment({ totalCents, surchargeCents, splitRule, allocatedLocalCents, allocatedTeacherCents, amountCents });
    allocatedLocalCents += allocation.localCents;
    allocatedTeacherCents += allocation.teacherCents;
    return allocation;
  });
}

describe('allocatePayment', () => {
  it('proportional: splits by the plan ratio', () => {
    expect(payInSequence('proportional', 3_000_000, 1_000_000, [1_500_000])).toEqual([{ localCents: 1_000_000, teacherCents: 500_000 }]);
  });

  it('proportional: cumulative rounding pays the teacher exactly the surcharge', () => {
    const allocations = payInSequence('proportional', 10_001, 3_333, [1_234, 4_321, 99, 4_347]);
    expect(allocations.reduce((sum, a) => sum + a.teacherCents, 0)).toBe(3_333);
    expect(allocations.reduce((sum, a) => sum + a.localCents, 0)).toBe(6_668);
    for (const allocation of allocations) {
      expect(allocation.teacherCents).toBeGreaterThanOrEqual(0);
      expect(allocation.localCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('proportional: one-cent payments never lose a cent', () => {
    expect(payInSequence('proportional', 3, 1, [1, 1, 1]).map((a) => a.teacherCents)).toEqual([0, 1, 0]);
  });

  it('teacher_first: covers the surcharge before the local share', () => {
    expect(payInSequence('teacher_first', 3_000_000, 1_000_000, [1_500_000, 1_500_000])).toEqual([
      { localCents: 500_000, teacherCents: 1_000_000 },
      { localCents: 1_500_000, teacherCents: 0 },
    ]);
  });

  it('local_first: covers the local share before the surcharge', () => {
    expect(payInSequence('local_first', 3_000_000, 1_000_000, [1_500_000, 1_500_000])).toEqual([
      { localCents: 1_500_000, teacherCents: 0 },
      { localCents: 500_000, teacherCents: 1_000_000 },
    ]);
  });

  it('gives everything to the local when there is no surcharge', () => {
    for (const rule of SPLIT_RULES) {
      expect(payInSequence(rule, 1_000, 0, [400])).toEqual([{ localCents: 400, teacherCents: 0 }]);
    }
  });

  it('rejects payments above the remaining debt', () => {
    expectDomainError(() => payInSequence('proportional', 1_000, 0, [600, 500]), 'PAYMENT_EXCEEDS_DEBT');
  });

  it('rejects zero, negative and fractional amounts', () => {
    for (const amount of [0, -100, 10.5]) {
      expectDomainError(() => payInSequence('proportional', 1_000, 0, [amount]), 'INVALID_AMOUNT');
    }
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/domain/sale.test.ts src/domain/allocation.test.ts`
Expected: FAIL; no se pueden resolver `./sale` ni `./allocation`.

- [ ] **Step 3: Implementar**

`src/domain/sale.ts`:

```ts
import { DomainError } from './errors';

export type SplitRule = 'proportional' | 'teacher_first' | 'local_first';
export const SPLIT_RULES: readonly SplitRule[] = ['proportional', 'teacher_first', 'local_first'];

export interface PlanForSale {
  id: number;
  name: string;
  freePasses: number;
  teacherPasses: number;
  priceCents: number;
  active: boolean;
}

export interface TeacherForSale {
  id: number;
  classRateCents: number;
  active: boolean;
}

export interface SaleSnapshot {
  planId: number;
  planName: string;
  freePasses: number;
  teacherPasses: number;
  localPriceCents: number;
  teacherId: number | null;
  teacherRateCents: number;
  teacherSurchargeCents: number;
  totalCents: number;
  splitRule: SplitRule;
}

export function computeSurcharge(teacherPasses: number, rateCents: number): number {
  return teacherPasses * rateCents;
}

export function buildSaleSnapshot(plan: PlanForSale, teacher: TeacherForSale | null, splitRule: SplitRule): SaleSnapshot {
  if (!plan.active) throw new DomainError('INACTIVE_PLAN');
  if (plan.teacherPasses > 0 && !teacher) throw new DomainError('TEACHER_REQUIRED');
  if (plan.teacherPasses === 0 && teacher) throw new DomainError('TEACHER_NOT_ALLOWED');
  if (teacher && !teacher.active) throw new DomainError('INACTIVE_TEACHER');

  const teacherRateCents = teacher?.classRateCents ?? 0;
  const teacherSurchargeCents = computeSurcharge(plan.teacherPasses, teacherRateCents);
  return {
    planId: plan.id,
    planName: plan.name,
    freePasses: plan.freePasses,
    teacherPasses: plan.teacherPasses,
    localPriceCents: plan.priceCents,
    teacherId: teacher?.id ?? null,
    teacherRateCents,
    teacherSurchargeCents,
    totalCents: plan.priceCents + teacherSurchargeCents,
    splitRule,
  };
}
```

`src/domain/allocation.ts`:

```ts
import { DomainError } from './errors';
import type { SplitRule } from './sale';

export interface AllocationInput {
  totalCents: number;
  surchargeCents: number;
  splitRule: SplitRule;
  allocatedLocalCents: number;
  allocatedTeacherCents: number;
  amountCents: number;
}

export interface Allocation {
  localCents: number;
  teacherCents: number;
}

export function allocatePayment(input: AllocationInput): Allocation {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError('INVALID_AMOUNT');
  const paidBefore = input.allocatedLocalCents + input.allocatedTeacherCents;
  if (input.amountCents > input.totalCents - paidBefore) throw new DomainError('PAYMENT_EXCEEDS_DEBT');

  const teacherCents = teacherShare(input, paidBefore);
  return { localCents: input.amountCents - teacherCents, teacherCents };
}

function teacherShare(input: AllocationInput, paidBefore: number): number {
  switch (input.splitRule) {
    case 'teacher_first':
      return Math.min(input.amountCents, input.surchargeCents - input.allocatedTeacherCents);
    case 'local_first': {
      const localPending = input.totalCents - input.surchargeCents - input.allocatedLocalCents;
      return input.amountCents - Math.min(input.amountCents, localPending);
    }
    case 'proportional': {
      if (input.surchargeCents === 0) return 0;
      // Cumulative target so rounding never drifts: once the sale is settled
      // the teacher has received exactly the surcharge.
      const target = Math.round(((paidBefore + input.amountCents) * input.surchargeCents) / input.totalCents);
      return target - input.allocatedTeacherCents;
    }
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: add sale snapshot and payment allocation rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dominio — deuda, anulaciones, pases y saldo de profesor

**Files:**
- Create: `src/domain/ledger.ts`, `src/domain/passes.ts`
- Test: `src/domain/ledger.test.ts`, `src/domain/passes.test.ts`

**Interfaces:**
- Consumes: `DomainError`, `expectDomainError` (Task 2)
- Produces:
  - `saleDebt(totalCents: number, paidCents: number): number`
  - `interface PaymentState { id: number; voidedAt: string | null }`
  - `assertPaymentVoidable(paymentId: number, salePayments: readonly PaymentState[]): void`
  - `assertSaleVoidable(sale: { voidedAt: string | null }, active: { payments: number; consumptions: number }): void`
  - `teacherBalance(earnedCents: number, paidOutCents: number): number`
  - `assertPayoutFits(balanceCents: number, amountCents: number): void`
  - `type PassKind = 'free' | 'teacher'`, `interface PassCounts { free: number; teacher: number }`
  - `remainingPasses(granted: PassCounts, used: PassCounts): PassCounts`
  - `totalPasses(counts: PassCounts): number`
  - `isLowOnPasses(remainingTotal: number, threshold: number): boolean`
  - `interface SaleAvailability { saleId: number; soldAt: string; remaining: PassCounts }`
  - `pickSaleForConsumption(sales: readonly SaleAvailability[], kind: PassKind): number`

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/ledger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { assertPaymentVoidable, assertPayoutFits, assertSaleVoidable, saleDebt, teacherBalance } from './ledger';

describe('saleDebt', () => {
  it('is the total minus what was paid', () => {
    expect(saleDebt(3_000_000, 1_500_000)).toBe(1_500_000);
    expect(saleDebt(3_000_000, 3_000_000)).toBe(0);
  });
});

describe('assertPaymentVoidable', () => {
  const payments = [
    { id: 1, voidedAt: null },
    { id: 2, voidedAt: null },
    { id: 3, voidedAt: '2026-10-05T12:00:00.000Z' },
  ];

  it('allows voiding the last active payment', () => {
    expect(() => assertPaymentVoidable(2, payments)).not.toThrow();
  });

  it('rejects voiding a payment that is not the last active one', () => {
    expectDomainError(() => assertPaymentVoidable(1, payments), 'ONLY_LAST_PAYMENT_VOIDABLE');
  });

  it('rejects already voided and unknown payments', () => {
    expectDomainError(() => assertPaymentVoidable(3, payments), 'ALREADY_VOIDED');
    expectDomainError(() => assertPaymentVoidable(99, payments), 'NOT_FOUND');
  });
});

describe('assertSaleVoidable', () => {
  it('allows voiding a sale without active payments or consumptions', () => {
    expect(() => assertSaleVoidable({ voidedAt: null }, { payments: 0, consumptions: 0 })).not.toThrow();
  });

  it('rejects voided sales and sales with active movements', () => {
    expectDomainError(() => assertSaleVoidable({ voidedAt: '2026-10-05T12:00:00.000Z' }, { payments: 0, consumptions: 0 }), 'ALREADY_VOIDED');
    expectDomainError(() => assertSaleVoidable({ voidedAt: null }, { payments: 1, consumptions: 0 }), 'SALE_HAS_ACTIVE_PAYMENTS');
    expectDomainError(() => assertSaleVoidable({ voidedAt: null }, { payments: 0, consumptions: 2 }), 'SALE_HAS_ACTIVE_CONSUMPTIONS');
  });
});

describe('teacher balance and payouts', () => {
  it('balance is earned minus paid out and may be negative', () => {
    expect(teacherBalance(500_000, 200_000)).toBe(300_000);
    expect(teacherBalance(0, 200_000)).toBe(-200_000);
  });

  it('rejects payouts above the balance or not positive', () => {
    expect(() => assertPayoutFits(300_000, 300_000)).not.toThrow();
    expectDomainError(() => assertPayoutFits(300_000, 300_001), 'PAYOUT_EXCEEDS_BALANCE');
    expectDomainError(() => assertPayoutFits(-100, 1), 'PAYOUT_EXCEEDS_BALANCE');
    expectDomainError(() => assertPayoutFits(300_000, 0), 'INVALID_AMOUNT');
  });
});
```

`src/domain/passes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { isLowOnPasses, pickSaleForConsumption, remainingPasses, totalPasses, type SaleAvailability } from './passes';

describe('remainingPasses', () => {
  it('subtracts used passes per kind', () => {
    expect(remainingPasses({ free: 4, teacher: 4 }, { free: 1, teacher: 3 })).toEqual({ free: 3, teacher: 1 });
    expect(totalPasses({ free: 3, teacher: 1 })).toBe(4);
  });
});

describe('isLowOnPasses', () => {
  it('is true at or below the threshold', () => {
    expect(isLowOnPasses(2, 2)).toBe(true);
    expect(isLowOnPasses(0, 2)).toBe(true);
    expect(isLowOnPasses(3, 2)).toBe(false);
  });
});

describe('pickSaleForConsumption', () => {
  const sales: SaleAvailability[] = [
    { saleId: 3, soldAt: '2026-09-10', remaining: { free: 2, teacher: 0 } },
    { saleId: 1, soldAt: '2026-08-01', remaining: { free: 0, teacher: 1 } },
    { saleId: 2, soldAt: '2026-09-10', remaining: { free: 5, teacher: 0 } },
  ];

  it('picks the oldest sale with passes of that kind (FIFO, then by id)', () => {
    expect(pickSaleForConsumption(sales, 'free')).toBe(2);
    expect(pickSaleForConsumption(sales, 'teacher')).toBe(1);
  });

  it('fails when no sale has passes of that kind', () => {
    expectDomainError(() => pickSaleForConsumption([{ saleId: 1, soldAt: '2026-08-01', remaining: { free: 0, teacher: 0 } }], 'free'), 'NO_PASSES_AVAILABLE');
    expectDomainError(() => pickSaleForConsumption([], 'teacher'), 'NO_PASSES_AVAILABLE');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/domain/ledger.test.ts src/domain/passes.test.ts`
Expected: FAIL; no se pueden resolver `./ledger` ni `./passes`.

- [ ] **Step 3: Implementar**

`src/domain/ledger.ts`:

```ts
import { DomainError } from './errors';

export interface PaymentState {
  id: number;
  voidedAt: string | null;
}

export function saleDebt(totalCents: number, paidCents: number): number {
  return totalCents - paidCents;
}

export function assertPaymentVoidable(paymentId: number, salePayments: readonly PaymentState[]): void {
  const target = salePayments.find((payment) => payment.id === paymentId);
  if (!target) throw new DomainError('NOT_FOUND');
  if (target.voidedAt) throw new DomainError('ALREADY_VOIDED');
  // Allocations depend on earlier payments, so only the newest active one can go.
  const lastActiveId = Math.max(...salePayments.filter((payment) => !payment.voidedAt).map((payment) => payment.id));
  if (paymentId !== lastActiveId) throw new DomainError('ONLY_LAST_PAYMENT_VOIDABLE');
}

export function assertSaleVoidable(sale: { voidedAt: string | null }, active: { payments: number; consumptions: number }): void {
  if (sale.voidedAt) throw new DomainError('ALREADY_VOIDED');
  if (active.payments > 0) throw new DomainError('SALE_HAS_ACTIVE_PAYMENTS');
  if (active.consumptions > 0) throw new DomainError('SALE_HAS_ACTIVE_CONSUMPTIONS');
}

export function teacherBalance(earnedCents: number, paidOutCents: number): number {
  return earnedCents - paidOutCents;
}

export function assertPayoutFits(balanceCents: number, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('INVALID_AMOUNT');
  if (amountCents > balanceCents) throw new DomainError('PAYOUT_EXCEEDS_BALANCE');
}
```

`src/domain/passes.ts`:

```ts
import { DomainError } from './errors';

export type PassKind = 'free' | 'teacher';

export interface PassCounts {
  free: number;
  teacher: number;
}

export interface SaleAvailability {
  saleId: number;
  soldAt: string;
  remaining: PassCounts;
}

export function remainingPasses(granted: PassCounts, used: PassCounts): PassCounts {
  return { free: granted.free - used.free, teacher: granted.teacher - used.teacher };
}

export function totalPasses(counts: PassCounts): number {
  return counts.free + counts.teacher;
}

export function isLowOnPasses(remainingTotal: number, threshold: number): boolean {
  return remainingTotal <= threshold;
}

export function pickSaleForConsumption(sales: readonly SaleAvailability[], kind: PassKind): number {
  const [oldest] = sales
    .filter((sale) => sale.remaining[kind] > 0)
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt) || a.saleId - b.saleId);
  if (!oldest) throw new DomainError('NO_PASSES_AVAILABLE');
  return oldest.saleId;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: add debt, voiding, passes and teacher balance rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shared — dinero, esquemas Zod, DTOs y contrato IPC

**Files:**
- Create: `src/shared/money.ts`, `src/shared/schemas.ts`, `src/shared/types.ts`, `src/shared/channels.ts`, `src/shared/api.ts`
- Test: `src/shared/money.test.ts`, `src/shared/schemas.test.ts`

**Interfaces:**
- Consumes: `SplitRule` (Task 3), `PassKind` (Task 4)
- Produces:
  - `formatMoney(cents: number): string`, `formatMoneyInput(cents: number): string`, `parseMoneyInput(text: string): number | null`
  - Esquemas: `idInput`, `emptyInput`, `guardianInput`, `clientInput`, `clientUpdate`, `clientListInput`, `socialInput`, `scheduleInput`, `teacherInput`, `teacherUpdate`, `activeListInput`, `planInput`, `planUpdate`, `saleInput`, `paymentInput`, `consumptionInput`, `payoutInput`, `settingsInput`, `paymentMethodSchema`, `splitRuleSchema`, `passKindSchema`
  - Tipos inferidos: `GuardianInput`, `ClientInput`, `ClientUpdate`, `ClientListInput`, `ScheduleInput`, `TeacherInput`, `TeacherUpdate`, `PlanInput`, `PlanUpdate`, `SaleInput`, `PaymentInput`, `ConsumptionInput`, `PayoutInput`, `SettingsInput`
  - DTOs en `types.ts`: `PaymentMethod`, `Guardian`, `Client`, `ClientSummary`, `Social`, `TeacherSchedule`, `Teacher`, `Plan`, `Sale`, `Payment`, `Consumption`, `ClientAccount`, `TeacherPayout`, `TeacherShare`, `TeacherBalance`, `TeacherAccount`, `Debtor`, `LowPassesAlert`, `Dashboard`, `Settings`, `BackupOutcome`
  - `CHANNELS`, `type Channel`
  - `apiSchemas`, `interface ApiOutputs`, `ApiInput<C>`, `ApiParsedInput<C>`, `ApiError`, `ApiResult<T>`, `LeblocBridge`

- [ ] **Step 1: Escribir los tests que fallan**

`src/shared/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyInput, parseMoneyInput } from './money';

describe('parseMoneyInput', () => {
  it('parses Argentine-formatted amounts into cents', () => {
    expect(parseMoneyInput('1500')).toBe(150_000);
    expect(parseMoneyInput('1.500')).toBe(150_000);
    expect(parseMoneyInput('1.500,50')).toBe(150_050);
    expect(parseMoneyInput('15000,5')).toBe(1_500_050);
    expect(parseMoneyInput(' $ 2.000 ')).toBe(200_000);
    expect(parseMoneyInput('0')).toBe(0);
  });

  it('rejects anything that is not an amount', () => {
    for (const text of ['', 'abc', '1,234', '1.50', '-100', '1.5000', '12,']) {
      expect(parseMoneyInput(text)).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('formats cents as ARS currency', () => {
    expect(formatMoney(150_050)).toMatch(/\$\s1\.500,50/);
  });

  it('formats cents for an editable input that parses back to the same value', () => {
    expect(formatMoneyInput(2_000_000)).toBe('20.000,00');
    expect(parseMoneyInput(formatMoneyInput(123_456_789))).toBe(123_456_789);
  });
});
```

`src/shared/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clientInput, clientListInput, paymentInput, planInput, scheduleInput } from './schemas';

const client = {
  firstName: '  Ana ',
  lastName: 'Roca',
  birthDate: '1990-05-10',
  address: '   ',
  phone: null,
  emergencyName: null,
  emergencyPhone: null,
  emergencyRelation: null,
  enrolledAt: '2026-10-01',
  guardians: [],
};

describe('schemas', () => {
  it('trims names and turns blank optional text into null', () => {
    const parsed = clientInput.parse(client);
    expect(parsed.firstName).toBe('Ana');
    expect(parsed.address).toBeNull();
  });

  it('rejects empty names and malformed dates', () => {
    expect(clientInput.safeParse({ ...client, firstName: ' ' }).success).toBe(false);
    expect(clientInput.safeParse({ ...client, birthDate: '10/05/1990' }).success).toBe(false);
  });

  it('rejects plans without passes, pointing at freePasses', () => {
    const result = planInput.safeParse({ name: 'Vacío', freePasses: 0, teacherPasses: 0, priceCents: 1000, active: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['freePasses']);
  });

  it('rejects schedules that end before they start', () => {
    expect(scheduleInput.safeParse({ weekday: 1, startTime: '18:00', endTime: '17:00' }).success).toBe(false);
    expect(scheduleInput.safeParse({ weekday: 1, startTime: '18:00', endTime: '19:30' }).success).toBe(true);
  });

  it('accepts only positive integer cents for payments', () => {
    const base = { saleId: 1, method: 'cash', paidAt: '2026-10-05' };
    expect(paymentInput.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
    expect(paymentInput.safeParse({ ...base, amountCents: 10.5 }).success).toBe(false);
    expect(paymentInput.safeParse({ ...base, amountCents: 100 }).success).toBe(true);
  });

  it('applies list defaults', () => {
    expect(clientListInput.parse({})).toEqual({ search: '', includeArchived: false });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/shared`
Expected: FAIL; no se pueden resolver `./money` ni `./schemas`.

- [ ] **Step 3: Implementar `money.ts` y `schemas.ts`**

`src/shared/money.ts`:

```ts
const CURRENCY = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const INPUT_NUMBER = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONEY_PATTERN = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;

export function formatMoney(cents: number): string {
  return CURRENCY.format(cents / 100);
}

export function formatMoneyInput(cents: number): string {
  return INPUT_NUMBER.format(cents / 100);
}

export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(/\$/g, '').replace(/\s/g, '');
  if (!MONEY_PATTERN.test(cleaned)) return null;
  const [integerPart = '0', decimalPart = ''] = cleaned.replace(/\./g, '').split(',');
  return Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'));
}
```

`src/shared/schemas.ts`:

```ts
import { z } from 'zod';

z.config(z.locales.es());

const MAX_CENTS = 100_000_000_000;
const REQUIRED = 'Obligatorio';

const id = z.number().int().positive();
const isoDate = z.iso.date({ error: 'Fecha inválida' });
const personName = z.string().trim().min(1, REQUIRED).max(80);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));
const cents = z.number().int().min(0).max(MAX_CENTS);
const positiveCents = z.number().int().positive().max(MAX_CENTS);
const passCount = z.number().int().min(0).max(500);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');

export const paymentMethodSchema = z.enum(['cash', 'transfer']);
export const splitRuleSchema = z.enum(['proportional', 'teacher_first', 'local_first']);
export const passKindSchema = z.enum(['free', 'teacher']);

export const idInput = z.object({ id });
export const emptyInput = z.object({});
export const activeListInput = z.object({ includeInactive: z.boolean().default(false) });

export const guardianInput = z.object({
  firstName: personName,
  lastName: personName,
  dni: optionalText(20),
  phone: optionalText(30),
  relation: optionalText(40),
});

const clientFields = {
  firstName: personName,
  lastName: personName,
  birthDate: isoDate,
  address: optionalText(200),
  phone: optionalText(30),
  emergencyName: optionalText(120),
  emergencyPhone: optionalText(30),
  emergencyRelation: optionalText(40),
  enrolledAt: isoDate,
  guardians: z.array(guardianInput).max(4),
};
export const clientInput = z.object(clientFields);
export const clientUpdate = z.object({ id, ...clientFields });
export const clientListInput = z.object({
  search: z.string().trim().max(80).default(''),
  includeArchived: z.boolean().default(false),
});

export const socialInput = z.object({
  network: z.string().trim().min(1, REQUIRED).max(30),
  handle: z.string().trim().min(1, REQUIRED).max(80),
});
export const scheduleInput = z
  .object({ weekday: z.number().int().min(0).max(6), startTime: hhmm, endTime: hhmm })
  .refine((schedule) => schedule.startTime < schedule.endTime, {
    message: 'La hora de fin tiene que ser posterior al inicio',
    path: ['endTime'],
  });

const teacherFields = {
  firstName: personName,
  lastName: personName,
  address: optionalText(200),
  phone: optionalText(30),
  socials: z.array(socialInput).max(10),
  classRateCents: cents,
  active: z.boolean(),
  schedules: z.array(scheduleInput).max(30),
};
export const teacherInput = z.object(teacherFields);
export const teacherUpdate = z.object({ id, ...teacherFields });

const planFields = {
  name: z.string().trim().min(1, REQUIRED).max(80),
  freePasses: passCount,
  teacherPasses: passCount,
  priceCents: cents,
  active: z.boolean(),
};
const hasPasses = (plan: { freePasses: number; teacherPasses: number }) => plan.freePasses + plan.teacherPasses > 0;
const hasPassesIssue = { message: 'El plan tiene que tener al menos un pase', path: ['freePasses'] };
export const planInput = z.object(planFields).refine(hasPasses, hasPassesIssue);
export const planUpdate = z.object({ id, ...planFields }).refine(hasPasses, hasPassesIssue);

const newPaymentFields = { amountCents: positiveCents, method: paymentMethodSchema, paidAt: isoDate };
export const saleInput = z.object({
  clientId: id,
  planId: id,
  teacherId: id.nullable(),
  splitRule: splitRuleSchema,
  soldAt: isoDate,
  initialPayment: z.object(newPaymentFields).nullable(),
});
export const paymentInput = z.object({ saleId: id, ...newPaymentFields });
export const consumptionInput = z.object({ clientId: id, kind: passKindSchema, note: optionalText(200) });
export const payoutInput = z.object({ teacherId: id, ...newPaymentFields, note: optionalText(200) });
export const settingsInput = z.object({ lowPassesThreshold: z.number().int().min(0).max(100) });

export type GuardianInput = z.infer<typeof guardianInput>;
export type ClientInput = z.infer<typeof clientInput>;
export type ClientUpdate = z.infer<typeof clientUpdate>;
export type ClientListInput = z.infer<typeof clientListInput>;
export type ScheduleInput = z.infer<typeof scheduleInput>;
export type TeacherInput = z.infer<typeof teacherInput>;
export type TeacherUpdate = z.infer<typeof teacherUpdate>;
export type PlanInput = z.infer<typeof planInput>;
export type PlanUpdate = z.infer<typeof planUpdate>;
export type SaleInput = z.infer<typeof saleInput>;
export type PaymentInput = z.infer<typeof paymentInput>;
export type ConsumptionInput = z.infer<typeof consumptionInput>;
export type PayoutInput = z.infer<typeof payoutInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/shared`
Expected: PASS.

- [ ] **Step 5: Crear los DTOs, los canales y el contrato del IPC**

`src/shared/types.ts`:

```ts
import type { PassKind } from '../domain/passes';
import type { SplitRule } from '../domain/sale';

export type PaymentMethod = 'cash' | 'transfer';

export interface Guardian {
  id: number;
  clientId: number;
  firstName: string;
  lastName: string;
  dni: string | null;
  phone: string | null;
  relation: string | null;
}

export interface Client {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  address: string | null;
  phone: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  enrolledAt: string;
  updatedAt: string;
  archivedAt: string | null;
  anonymizedAt: string | null;
  guardians: Guardian[];
}

export interface ClientSummary {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  archivedAt: string | null;
  activeSales: number;
  remainingFree: number;
  remainingTeacher: number;
  debtCents: number;
}

export interface Social {
  network: string;
  handle: string;
}

export interface TeacherSchedule {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
  address: string | null;
  phone: string | null;
  socials: Social[];
  classRateCents: number;
  active: boolean;
  schedules: TeacherSchedule[];
}

export interface Plan {
  id: number;
  name: string;
  freePasses: number;
  teacherPasses: number;
  priceCents: number;
  active: boolean;
}

export interface Sale {
  id: number;
  clientId: number;
  soldAt: string;
  planId: number;
  planName: string;
  freePasses: number;
  teacherPasses: number;
  localPriceCents: number;
  teacherId: number | null;
  teacherName: string | null;
  teacherRateCents: number;
  teacherSurchargeCents: number;
  totalCents: number;
  splitRule: SplitRule;
  voidedAt: string | null;
  paidCents: number;
  debtCents: number;
  remainingFree: number;
  remainingTeacher: number;
}

export interface Payment {
  id: number;
  saleId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  localCents: number;
  teacherCents: number;
  voidedAt: string | null;
}

export interface Consumption {
  id: number;
  saleId: number;
  kind: PassKind;
  consumedAt: string;
  note: string | null;
  voidedAt: string | null;
}

export interface ClientAccount {
  client: Client;
  sales: Sale[];
  payments: Payment[];
  consumptions: Consumption[];
  remainingFree: number;
  remainingTeacher: number;
  debtCents: number;
  lowOnPasses: boolean;
}

export interface TeacherPayout {
  id: number;
  teacherId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  note: string | null;
  voidedAt: string | null;
}

export interface TeacherShare {
  paymentId: number;
  saleId: number;
  paidAt: string;
  clientName: string;
  planName: string;
  teacherCents: number;
}

export interface TeacherBalance {
  teacherId: number;
  teacherName: string;
  earnedCents: number;
  paidOutCents: number;
  balanceCents: number;
}

export interface TeacherAccount extends TeacherBalance {
  teacher: Teacher;
  payouts: TeacherPayout[];
  shares: TeacherShare[];
}

export interface Debtor {
  saleId: number;
  clientId: number;
  clientName: string;
  planName: string;
  soldAt: string;
  totalCents: number;
  debtCents: number;
  daysSinceSale: number;
}

export interface LowPassesAlert {
  clientId: number;
  clientName: string;
  remainingFree: number;
  remainingTeacher: number;
}

export interface Dashboard {
  lowPasses: LowPassesAlert[];
  debtors: Debtor[];
  teacherBalances: TeacherBalance[];
}

export interface Settings {
  lowPassesThreshold: number;
}

export type BackupOutcome = { status: 'done'; path: string } | { status: 'cancelled' };
```

`src/shared/channels.ts`:

```ts
export const CHANNELS = [
  'clients:list',
  'clients:get',
  'clients:create',
  'clients:update',
  'clients:archive',
  'clients:unarchive',
  'clients:anonymize',
  'clients:account',
  'teachers:list',
  'teachers:get',
  'teachers:create',
  'teachers:update',
  'teachers:account',
  'plans:list',
  'plans:create',
  'plans:update',
  'sales:create',
  'sales:void',
  'payments:create',
  'payments:void',
  'consumptions:create',
  'consumptions:void',
  'payouts:create',
  'payouts:void',
  'debtors:list',
  'dashboard:get',
  'settings:get',
  'settings:update',
  'backup:export',
  'backup:restore',
] as const;

export type Channel = (typeof CHANNELS)[number];
```

`src/shared/api.ts`:

```ts
import type { z } from 'zod';
import type { Channel } from './channels';
import * as schemas from './schemas';
import type * as T from './types';

export const apiSchemas = {
  'clients:list': schemas.clientListInput,
  'clients:get': schemas.idInput,
  'clients:create': schemas.clientInput,
  'clients:update': schemas.clientUpdate,
  'clients:archive': schemas.idInput,
  'clients:unarchive': schemas.idInput,
  'clients:anonymize': schemas.idInput,
  'clients:account': schemas.idInput,
  'teachers:list': schemas.activeListInput,
  'teachers:get': schemas.idInput,
  'teachers:create': schemas.teacherInput,
  'teachers:update': schemas.teacherUpdate,
  'teachers:account': schemas.idInput,
  'plans:list': schemas.activeListInput,
  'plans:create': schemas.planInput,
  'plans:update': schemas.planUpdate,
  'sales:create': schemas.saleInput,
  'sales:void': schemas.idInput,
  'payments:create': schemas.paymentInput,
  'payments:void': schemas.idInput,
  'consumptions:create': schemas.consumptionInput,
  'consumptions:void': schemas.idInput,
  'payouts:create': schemas.payoutInput,
  'payouts:void': schemas.idInput,
  'debtors:list': schemas.emptyInput,
  'dashboard:get': schemas.emptyInput,
  'settings:get': schemas.emptyInput,
  'settings:update': schemas.settingsInput,
  'backup:export': schemas.emptyInput,
  'backup:restore': schemas.emptyInput,
} satisfies Record<Channel, z.ZodType>;

export interface ApiOutputs {
  'clients:list': T.ClientSummary[];
  'clients:get': T.Client;
  'clients:create': T.Client;
  'clients:update': T.Client;
  'clients:archive': T.Client;
  'clients:unarchive': T.Client;
  'clients:anonymize': T.Client;
  'clients:account': T.ClientAccount;
  'teachers:list': T.Teacher[];
  'teachers:get': T.Teacher;
  'teachers:create': T.Teacher;
  'teachers:update': T.Teacher;
  'teachers:account': T.TeacherAccount;
  'plans:list': T.Plan[];
  'plans:create': T.Plan;
  'plans:update': T.Plan;
  'sales:create': T.Sale;
  'sales:void': T.Sale;
  'payments:create': T.Payment;
  'payments:void': T.Payment;
  'consumptions:create': T.Consumption;
  'consumptions:void': T.Consumption;
  'payouts:create': T.TeacherPayout;
  'payouts:void': T.TeacherPayout;
  'debtors:list': T.Debtor[];
  'dashboard:get': T.Dashboard;
  'settings:get': T.Settings;
  'settings:update': T.Settings;
  'backup:export': T.BackupOutcome;
  'backup:restore': T.BackupOutcome;
}

export type ApiInput<C extends Channel> = z.input<(typeof apiSchemas)[C]>;
export type ApiParsedInput<C extends Channel> = z.output<(typeof apiSchemas)[C]>;

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResult<TData> = { success: true; data: TData } | { success: false; error: ApiError };

export interface LeblocBridge {
  invoke<C extends Channel>(channel: C, input: ApiInput<C>): Promise<ApiResult<ApiOutputs[C]>>;
}
```

- [ ] **Step 6: Verificar tipos, lint y tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sin errores; todos los tests pasan.

- [ ] **Step 7: Commit**

```bash
git add src/shared
git commit -m "feat: add shared money helpers, zod schemas and ipc contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Base de datos — conexión, migraciones y contexto

**Files:**
- Create: `src/main/db/connection.ts`, `src/main/db/migrations.ts`, `src/main/db/migrations/001_initial.ts`, `src/main/context.ts`, `src/main/test-context.ts`
- Delete: `src/main/db/sqlite.smoke.test.ts` (lo reemplaza `migrations.test.ts`)
- Test: `src/main/db/migrations.test.ts`

**Interfaces:**
- Consumes: `toIsoDate` (Task 2), tipos `ClientInput`, `PlanInput`, `TeacherInput` (Task 5)
- Produces:
  - `type Db = Database.Database`, `openDatabase(filename: string): Db`
  - `MIGRATIONS: readonly string[]`, `migrate(db: Db): void`
  - `interface Clock { now(): Date }`, `systemClock`, `interface Context { readonly db: Db; readonly clock: Clock }`, `nowIso(ctx: Context): string`, `today(ctx: Context): string`
  - `TEST_NOW`, `interface MutableClock extends Clock { set(date: Date): void }`, `interface TestContext extends Context { readonly clock: MutableClock }`, `createTestContext(now?: Date): TestContext`
  - Fixtures: `adultClient: ClientInput`, `minorClient: ClientInput`, `basicTeacher: TeacherInput`, `freePlan: PlanInput`, `mixedPlan: PlanInput`

- [ ] **Step 1: Escribir el test que falla**

`src/main/db/migrations.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection';
import { MIGRATIONS, migrate } from './migrations';

describe('migrations', () => {
  it('applies every migration and records the version', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
  });

  it('can reopen an existing file without reapplying migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lebloc-db-'));
    try {
      const file = join(dir, 'lebloc.db');
      openDatabase(file).close();
      const reopened = openDatabase(file);
      expect(reopened.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      db.prepare("INSERT INTO guardians (client_id, first_name, last_name) VALUES (999, 'Laura', 'Roca')").run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('rejects plans without passes at the database level', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      db.prepare("INSERT INTO plans (name, free_passes, teacher_passes, price_cents) VALUES ('Vacío', 0, 0, 100)").run(),
    ).toThrow(/CHECK/);
  });

  it('seeds the low passes threshold', () => {
    const db = openDatabase(':memory:');
    expect(db.prepare("SELECT value FROM settings WHERE key = 'low_passes_threshold'").get()).toEqual({ value: '2' });
  });

  it('refuses a database created by a newer app version', () => {
    const db = openDatabase(':memory:');
    db.pragma('user_version = 99');
    expect(() => migrate(db)).toThrow(/newer/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- src/main/db`
Expected: FAIL; no se pueden resolver `./connection` ni `./migrations`.

- [ ] **Step 3: Implementar la migración, el runner y la conexión**

`src/main/db/migrations/001_initial.ts`:

```ts
export const migration001 = `
CREATE TABLE clients (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT,
  address TEXT,
  phone TEXT,
  emergency_name TEXT,
  emergency_phone TEXT,
  emergency_relation TEXT,
  enrolled_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  anonymized_at TEXT
);

CREATE TABLE guardians (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dni TEXT,
  phone TEXT,
  relation TEXT
);
CREATE INDEX idx_guardians_client ON guardians(client_id);

CREATE TABLE teachers (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  socials TEXT NOT NULL DEFAULT '[]',
  class_rate_cents INTEGER NOT NULL CHECK (class_rate_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE teacher_schedules (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  CHECK (start_time < end_time)
);
CREATE INDEX idx_teacher_schedules_teacher ON teacher_schedules(teacher_id);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  free_passes INTEGER NOT NULL CHECK (free_passes >= 0),
  teacher_passes INTEGER NOT NULL CHECK (teacher_passes >= 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  CHECK (free_passes + teacher_passes > 0)
);

CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  sold_at TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  free_passes INTEGER NOT NULL CHECK (free_passes >= 0),
  teacher_passes INTEGER NOT NULL CHECK (teacher_passes >= 0),
  local_price_cents INTEGER NOT NULL CHECK (local_price_cents >= 0),
  teacher_id INTEGER REFERENCES teachers(id),
  teacher_rate_cents INTEGER NOT NULL CHECK (teacher_rate_cents >= 0),
  teacher_surcharge_cents INTEGER NOT NULL CHECK (teacher_surcharge_cents >= 0),
  total_cents INTEGER NOT NULL,
  split_rule TEXT NOT NULL CHECK (split_rule IN ('proportional', 'teacher_first', 'local_first')),
  voided_at TEXT,
  CHECK (total_cents = local_price_cents + teacher_surcharge_cents),
  CHECK ((teacher_passes = 0) = (teacher_id IS NULL))
);
CREATE INDEX idx_sales_client ON sales(client_id);
CREATE INDEX idx_sales_teacher ON sales(teacher_id);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  paid_at TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  local_cents INTEGER NOT NULL CHECK (local_cents >= 0),
  teacher_cents INTEGER NOT NULL CHECK (teacher_cents >= 0),
  voided_at TEXT,
  CHECK (local_cents + teacher_cents = amount_cents)
);
CREATE INDEX idx_payments_sale ON payments(sale_id);

CREATE TABLE consumptions (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  kind TEXT NOT NULL CHECK (kind IN ('free', 'teacher')),
  consumed_at TEXT NOT NULL,
  note TEXT,
  voided_at TEXT
);
CREATE INDEX idx_consumptions_sale ON consumptions(sale_id);

CREATE TABLE teacher_payouts (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  paid_at TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  note TEXT,
  voided_at TEXT
);
CREATE INDEX idx_teacher_payouts_teacher ON teacher_payouts(teacher_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('low_passes_threshold', '2');
`;
```

`src/main/db/migrations.ts`:

```ts
import type { Db } from './connection';
import { migration001 } from './migrations/001_initial';

export const MIGRATIONS: readonly string[] = [migration001];

export function migrate(db: Db): void {
  const current = Number(db.pragma('user_version', { simple: true }));
  if (current > MIGRATIONS.length) {
    throw new Error(`Database version ${current} is newer than this app supports (${MIGRATIONS.length})`);
  }
  MIGRATIONS.slice(current).forEach((sql, offset) => {
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${current + offset + 1}`);
    })();
  });
}
```

`src/main/db/connection.ts`:

```ts
import Database from 'better-sqlite3';
import { migrate } from './migrations';

export type Db = Database.Database;

export function openDatabase(filename: string): Db {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
```

- [ ] **Step 4: Implementar el contexto y el contexto de test**

`src/main/context.ts`:

```ts
import { toIsoDate } from '../domain/dates';
import type { Db } from './db/connection';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface Context {
  readonly db: Db;
  readonly clock: Clock;
}

export function nowIso(ctx: Context): string {
  return ctx.clock.now().toISOString();
}

export function today(ctx: Context): string {
  return toIsoDate(ctx.clock.now());
}
```

`src/main/test-context.ts`:

```ts
import type { ClientInput, PlanInput, TeacherInput } from '../shared/schemas';
import type { Clock, Context } from './context';
import { openDatabase } from './db/connection';

export const TEST_NOW = new Date(2026, 9, 5, 12, 0, 0);

export interface MutableClock extends Clock {
  set(date: Date): void;
}

export interface TestContext extends Context {
  readonly clock: MutableClock;
}

export function createTestContext(now: Date = TEST_NOW): TestContext {
  let current = now;
  return {
    db: openDatabase(':memory:'),
    clock: {
      now: () => current,
      set: (date) => {
        current = date;
      },
    },
  };
}

export const adultClient: ClientInput = {
  firstName: 'Ana',
  lastName: 'Roca',
  birthDate: '1990-05-10',
  address: null,
  phone: '1155550000',
  emergencyName: 'Luis Roca',
  emergencyPhone: '1155550001',
  emergencyRelation: 'Hermano',
  enrolledAt: '2026-10-01',
  guardians: [],
};

export const minorClient: ClientInput = {
  ...adultClient,
  firstName: 'Tomi',
  birthDate: '2014-03-02',
  guardians: [{ firstName: 'Laura', lastName: 'Roca', dni: '30111222', phone: '1155550002', relation: 'Madre' }],
};

export const basicTeacher: TeacherInput = {
  firstName: 'Juan',
  lastName: 'Pared',
  address: null,
  phone: null,
  socials: [],
  classRateCents: 250_000,
  active: true,
  schedules: [],
};

export const freePlan: PlanInput = { name: 'Pack 8 libres', freePasses: 8, teacherPasses: 0, priceCents: 2_000_000, active: true };
export const mixedPlan: PlanInput = { name: 'Pack 4+4', freePasses: 4, teacherPasses: 4, priceCents: 2_000_000, active: true };
```

- [ ] **Step 5: Borrar el smoke test y correr los tests**

Run: `git rm -q src/main/db/sqlite.smoke.test.ts && npm test -- src/main/db`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main
git commit -m "feat: add sqlite schema, migration runner and service context

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Clientes — repo y service

**Files:**
- Create: `src/main/repos/saleStats.ts`, `src/main/repos/clients.ts`, `src/main/services/clients.ts`
- Test: `src/main/services/clients.test.ts`

**Interfaces:**
- Consumes: `Context`, `nowIso`, `today` (Task 6), `assertGuardianRule` (Task 2), `DomainError` (Task 2), esquemas y DTOs (Task 5)
- Produces:
  - `SALE_STATS_CTE: string`: CTE `sale_stats(id, client_id, sold_at, plan_name, free_passes, teacher_passes, total_cents, paid_cents, used_free, used_teacher)` de las ventas no anuladas
  - `escapeLike(value: string): string`
  - `getClient(ctx: Context, id: number): Client`
  - `requireActiveClient(ctx: Context, id: number): Client` (lanza `CLIENT_ARCHIVED`)
  - `listClients(ctx: Context, input: ClientListInput): ClientSummary[]`
  - `createClient(ctx: Context, input: ClientInput): Client`
  - `updateClient(ctx: Context, input: ClientUpdate): Client`
  - `archiveClient(ctx: Context, id: number): Client`, `unarchiveClient(ctx: Context, id: number): Client`, `anonymizeClient(ctx: Context, id: number): Client`

- [ ] **Step 1: Escribir el test que falla**

`src/main/services/clients.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { adultClient, createTestContext, minorClient, TEST_NOW, type TestContext } from '../test-context';
import {
  anonymizeClient,
  archiveClient,
  createClient,
  getClient,
  listClients,
  unarchiveClient,
  updateClient,
} from './clients';

describe('clients service', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it('creates an adult without guardians and stamps updatedAt', () => {
    const client = createClient(ctx, adultClient);
    expect(client.id).toBeGreaterThan(0);
    expect(client.firstName).toBe('Ana');
    expect(client.guardians).toEqual([]);
    expect(client.updatedAt).toBe(TEST_NOW.toISOString());
  });

  it('creates a minor with guardians', () => {
    const client = createClient(ctx, minorClient);
    expect(client.guardians).toHaveLength(1);
    expect(client.guardians[0]?.relation).toBe('Madre');
  });

  it('rejects a minor without guardians on create', () => {
    expectDomainError(() => createClient(ctx, { ...minorClient, guardians: [] }), 'MINOR_REQUIRES_GUARDIAN');
  });

  it('rejects removing every guardian from a minor on update', () => {
    const client = createClient(ctx, minorClient);
    expectDomainError(() => updateClient(ctx, { ...minorClient, id: client.id, guardians: [] }), 'MINOR_REQUIRES_GUARDIAN');
    expect(getClient(ctx, client.id).guardians).toHaveLength(1);
  });

  it('updates fields, replaces guardians and stamps updatedAt', () => {
    const client = createClient(ctx, minorClient);
    const later = new Date(2026, 9, 6, 9, 0, 0);
    ctx.clock.set(later);
    const updated = updateClient(ctx, {
      ...minorClient,
      id: client.id,
      phone: '1166660000',
      guardians: [{ firstName: 'Pablo', lastName: 'Roca', dni: null, phone: null, relation: 'Padre' }],
    });
    expect(updated.phone).toBe('1166660000');
    expect(updated.guardians.map((g) => g.firstName)).toEqual(['Pablo']);
    expect(updated.updatedAt).toBe(later.toISOString());
  });

  it('searches by name in either order and hides archived clients by default', () => {
    const ana = createClient(ctx, adultClient);
    createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' });
    expect(listClients(ctx, { search: 'roca', includeArchived: false }).map((c) => c.id)).toEqual([ana.id]);
    expect(listClients(ctx, { search: 'Roca Ana', includeArchived: false }).map((c) => c.id)).toEqual([ana.id]);
    archiveClient(ctx, ana.id);
    expect(listClients(ctx, { search: '', includeArchived: false }).map((c) => c.lastName)).toEqual(['Sierra']);
    expect(listClients(ctx, { search: '', includeArchived: true })).toHaveLength(2);
  });

  it('treats LIKE wildcards in the search as plain text', () => {
    createClient(ctx, adultClient);
    expect(listClients(ctx, { search: '%', includeArchived: false })).toEqual([]);
  });

  it('summarizes a client without sales as zero passes and zero debt', () => {
    createClient(ctx, adultClient);
    expect(listClients(ctx, { search: '', includeArchived: false })[0]).toMatchObject({
      activeSales: 0,
      remainingFree: 0,
      remainingTeacher: 0,
      debtCents: 0,
    });
  });

  it('blocks edits on archived clients and allows unarchiving', () => {
    const client = createClient(ctx, adultClient);
    archiveClient(ctx, client.id);
    expectDomainError(() => updateClient(ctx, { ...adultClient, id: client.id }), 'CLIENT_ARCHIVED');
    expect(unarchiveClient(ctx, client.id).archivedAt).toBeNull();
  });

  it('anonymizes only archived clients, wiping personal data and guardians', () => {
    const client = createClient(ctx, minorClient);
    expectDomainError(() => anonymizeClient(ctx, client.id), 'CLIENT_NOT_ARCHIVED');
    archiveClient(ctx, client.id);
    const anonymized = anonymizeClient(ctx, client.id);
    expect(anonymized).toMatchObject({
      firstName: 'Cliente',
      lastName: `anonimizado #${client.id}`,
      birthDate: null,
      phone: null,
      emergencyName: null,
      guardians: [],
    });
    expect(anonymized.anonymizedAt).toBe(TEST_NOW.toISOString());
    expectDomainError(() => unarchiveClient(ctx, client.id), 'CLIENT_ANONYMIZED');
  });

  it('fails with NOT_FOUND for unknown clients', () => {
    expectDomainError(() => getClient(ctx, 999), 'NOT_FOUND');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- src/main/services/clients.test.ts`
Expected: FAIL; no se puede resolver `./clients`.

- [ ] **Step 3: Implementar el CTE de estadísticas y el repo**

`src/main/repos/saleStats.ts`:

```ts
// Aggregates per non-voided sale. Use as `WITH ${SALE_STATS_CTE} SELECT ... FROM sale_stats`.
export const SALE_STATS_CTE = `sale_stats AS (
  SELECT
    s.id, s.client_id, s.sold_at, s.plan_name, s.free_passes, s.teacher_passes, s.total_cents,
    COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id = s.id AND p.voided_at IS NULL), 0) AS paid_cents,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'free') AS used_free,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'teacher') AS used_teacher
  FROM sales s
  WHERE s.voided_at IS NULL
)`;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
```

`src/main/repos/clients.ts`:

```ts
import type { ClientInput, GuardianInput } from '../../shared/schemas';
import type { Client, ClientSummary, Guardian } from '../../shared/types';
import type { Db } from '../db/connection';
import { escapeLike, SALE_STATS_CTE } from './saleStats';

export type ClientFields = Omit<ClientInput, 'guardians'>;
export type ClientRow = Omit<Client, 'guardians'>;

const CLIENT_COLUMNS = `id, first_name AS firstName, last_name AS lastName, birth_date AS birthDate, address, phone,
  emergency_name AS emergencyName, emergency_phone AS emergencyPhone, emergency_relation AS emergencyRelation,
  enrolled_at AS enrolledAt, updated_at AS updatedAt, archived_at AS archivedAt, anonymized_at AS anonymizedAt`;

function clientParams(fields: ClientFields) {
  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    birthDate: fields.birthDate,
    address: fields.address,
    phone: fields.phone,
    emergencyName: fields.emergencyName,
    emergencyPhone: fields.emergencyPhone,
    emergencyRelation: fields.emergencyRelation,
    enrolledAt: fields.enrolledAt,
  };
}

export function insertClient(db: Db, fields: ClientFields, now: string): number {
  const result = db
    .prepare(
      `INSERT INTO clients (first_name, last_name, birth_date, address, phone, emergency_name, emergency_phone,
         emergency_relation, enrolled_at, updated_at)
       VALUES (@firstName, @lastName, @birthDate, @address, @phone, @emergencyName, @emergencyPhone,
         @emergencyRelation, @enrolledAt, @now)`,
    )
    .run({ ...clientParams(fields), now });
  return Number(result.lastInsertRowid);
}

export function updateClient(db: Db, id: number, fields: ClientFields, now: string): void {
  db.prepare(
    `UPDATE clients SET first_name = @firstName, last_name = @lastName, birth_date = @birthDate, address = @address,
       phone = @phone, emergency_name = @emergencyName, emergency_phone = @emergencyPhone,
       emergency_relation = @emergencyRelation, enrolled_at = @enrolledAt, updated_at = @now
     WHERE id = @id`,
  ).run({ ...clientParams(fields), now, id });
}

export function findClientRow(db: Db, id: number): ClientRow | undefined {
  return db.prepare<[number], ClientRow>(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = ?`).get(id);
}

export function listGuardians(db: Db, clientId: number): Guardian[] {
  return db
    .prepare<[number], Guardian>(
      `SELECT id, client_id AS clientId, first_name AS firstName, last_name AS lastName, dni, phone, relation
       FROM guardians WHERE client_id = ? ORDER BY id`,
    )
    .all(clientId);
}

export function replaceGuardians(db: Db, clientId: number, guardians: readonly GuardianInput[]): void {
  db.prepare('DELETE FROM guardians WHERE client_id = ?').run(clientId);
  const insert = db.prepare(
    `INSERT INTO guardians (client_id, first_name, last_name, dni, phone, relation)
     VALUES (@clientId, @firstName, @lastName, @dni, @phone, @relation)`,
  );
  for (const guardian of guardians) {
    insert.run({
      clientId,
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      dni: guardian.dni,
      phone: guardian.phone,
      relation: guardian.relation,
    });
  }
}

export function setArchivedAt(db: Db, id: number, archivedAt: string | null, now: string): void {
  db.prepare('UPDATE clients SET archived_at = @archivedAt, updated_at = @now WHERE id = @id').run({ id, archivedAt, now });
}

export function anonymizeClient(db: Db, id: number, now: string): void {
  db.prepare(
    `UPDATE clients SET first_name = 'Cliente', last_name = 'anonimizado #' || id, birth_date = NULL, address = NULL,
       phone = NULL, emergency_name = NULL, emergency_phone = NULL, emergency_relation = NULL,
       anonymized_at = @now, updated_at = @now
     WHERE id = @id`,
  ).run({ id, now });
  db.prepare('DELETE FROM guardians WHERE client_id = ?').run(id);
}

export function listClientSummaries(db: Db, search: string, includeArchived: boolean): ClientSummary[] {
  return db
    .prepare<[{ search: string; includeArchived: number }], ClientSummary>(
      `WITH ${SALE_STATS_CTE}
       SELECT c.id, c.first_name AS firstName, c.last_name AS lastName, c.birth_date AS birthDate,
         c.archived_at AS archivedAt,
         COUNT(ss.id) AS activeSales,
         COALESCE(SUM(ss.free_passes - ss.used_free), 0) AS remainingFree,
         COALESCE(SUM(ss.teacher_passes - ss.used_teacher), 0) AS remainingTeacher,
         COALESCE(SUM(ss.total_cents - ss.paid_cents), 0) AS debtCents
       FROM clients c
       LEFT JOIN sale_stats ss ON ss.client_id = c.id
       WHERE (@includeArchived = 1 OR c.archived_at IS NULL)
         AND (@search = ''
           OR (c.first_name || ' ' || c.last_name) LIKE '%' || @search || '%' ESCAPE '\\'
           OR (c.last_name || ' ' || c.first_name) LIKE '%' || @search || '%' ESCAPE '\\')
       GROUP BY c.id
       ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE
       LIMIT 200`,
    )
    .all({ search: escapeLike(search), includeArchived: includeArchived ? 1 : 0 });
}
```

- [ ] **Step 4: Implementar el service**

`src/main/services/clients.ts`:

```ts
import { assertGuardianRule } from '../../domain/client';
import { DomainError } from '../../domain/errors';
import type { ClientInput, ClientListInput, ClientUpdate } from '../../shared/schemas';
import type { Client, ClientSummary } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as repo from '../repos/clients';

export function getClient(ctx: Context, id: number): Client {
  const row = repo.findClientRow(ctx.db, id);
  if (!row) throw new DomainError('NOT_FOUND');
  return { ...row, guardians: repo.listGuardians(ctx.db, id) };
}

export function requireActiveClient(ctx: Context, id: number): Client {
  const client = getClient(ctx, id);
  if (client.archivedAt) throw new DomainError('CLIENT_ARCHIVED');
  return client;
}

export function listClients(ctx: Context, input: ClientListInput): ClientSummary[] {
  return repo.listClientSummaries(ctx.db, input.search, input.includeArchived);
}

export function createClient(ctx: Context, input: ClientInput): Client {
  assertGuardianRule(input.birthDate, input.guardians.length, today(ctx));
  return ctx.db.transaction(() => {
    const id = repo.insertClient(ctx.db, input, nowIso(ctx));
    repo.replaceGuardians(ctx.db, id, input.guardians);
    return getClient(ctx, id);
  })();
}

export function updateClient(ctx: Context, input: ClientUpdate): Client {
  requireActiveClient(ctx, input.id);
  assertGuardianRule(input.birthDate, input.guardians.length, today(ctx));
  return ctx.db.transaction(() => {
    repo.updateClient(ctx.db, input.id, input, nowIso(ctx));
    repo.replaceGuardians(ctx.db, input.id, input.guardians);
    return getClient(ctx, input.id);
  })();
}

export function archiveClient(ctx: Context, id: number): Client {
  requireActiveClient(ctx, id);
  const now = nowIso(ctx);
  repo.setArchivedAt(ctx.db, id, now, now);
  return getClient(ctx, id);
}

export function unarchiveClient(ctx: Context, id: number): Client {
  const client = getClient(ctx, id);
  if (client.anonymizedAt) throw new DomainError('CLIENT_ANONYMIZED');
  repo.setArchivedAt(ctx.db, id, null, nowIso(ctx));
  return getClient(ctx, id);
}

export function anonymizeClient(ctx: Context, id: number): Client {
  const client = getClient(ctx, id);
  if (!client.archivedAt) throw new DomainError('CLIENT_NOT_ARCHIVED');
  if (client.anonymizedAt) throw new DomainError('CLIENT_ANONYMIZED');
  ctx.db.transaction(() => repo.anonymizeClient(ctx.db, id, nowIso(ctx)))();
  return getClient(ctx, id);
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- src/main/services/clients.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/repos src/main/services
git commit -m "feat: add clients repository and service with guardian rule and anonymization

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Profesores y planes — repos y services

**Files:**
- Create: `src/main/repos/teachers.ts`, `src/main/repos/plans.ts`, `src/main/services/teachers.ts`, `src/main/services/plans.ts`
- Test: `src/main/services/teachers.test.ts`, `src/main/services/plans.test.ts`

**Interfaces:**
- Consumes: `Context` (Task 6), esquemas y DTOs (Task 5), `DomainError` (Task 2)
- Produces:
  - `getTeacher(ctx: Context, id: number): Teacher`, `listTeachers(ctx: Context, includeInactive: boolean): Teacher[]`, `createTeacher(ctx: Context, input: TeacherInput): Teacher`, `updateTeacher(ctx: Context, input: TeacherUpdate): Teacher`
  - `getPlan(ctx: Context, id: number): Plan`, `listPlans(ctx: Context, includeInactive: boolean): Plan[]`, `createPlan(ctx: Context, input: PlanInput): Plan`, `updatePlan(ctx: Context, input: PlanUpdate): Plan`

- [ ] **Step 1: Escribir los tests que fallan**

`src/main/services/teachers.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { basicTeacher, createTestContext, type TestContext } from '../test-context';
import { createTeacher, getTeacher, listTeachers, updateTeacher } from './teachers';

describe('teachers service', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it('creates a teacher with socials and schedules', () => {
    const teacher = createTeacher(ctx, {
      ...basicTeacher,
      socials: [{ network: 'Instagram', handle: '@juanpared' }],
      schedules: [
        { weekday: 3, startTime: '18:00', endTime: '20:00' },
        { weekday: 1, startTime: '19:00', endTime: '21:00' },
      ],
    });
    expect(teacher.active).toBe(true);
    expect(teacher.socials).toEqual([{ network: 'Instagram', handle: '@juanpared' }]);
    expect(teacher.schedules.map((s) => s.weekday)).toEqual([1, 3]);
    expect(getTeacher(ctx, teacher.id)).toEqual(teacher);
  });

  it('updates fields and replaces schedules', () => {
    const teacher = createTeacher(ctx, { ...basicTeacher, schedules: [{ weekday: 1, startTime: '19:00', endTime: '21:00' }] });
    const updated = updateTeacher(ctx, {
      ...basicTeacher,
      id: teacher.id,
      classRateCents: 300_000,
      schedules: [{ weekday: 5, startTime: '10:00', endTime: '12:00' }],
    });
    expect(updated.classRateCents).toBe(300_000);
    expect(updated.schedules).toEqual([{ weekday: 5, startTime: '10:00', endTime: '12:00' }]);
  });

  it('lists only active teachers unless asked otherwise', () => {
    createTeacher(ctx, basicTeacher);
    createTeacher(ctx, { ...basicTeacher, firstName: 'Eva', lastName: 'Bloque', active: false });
    expect(listTeachers(ctx, false).map((t) => t.firstName)).toEqual(['Juan']);
    expect(listTeachers(ctx, true)).toHaveLength(2);
  });

  it('fails with NOT_FOUND for unknown teachers', () => {
    expectDomainError(() => getTeacher(ctx, 999), 'NOT_FOUND');
    expectDomainError(() => updateTeacher(ctx, { ...basicTeacher, id: 999 }), 'NOT_FOUND');
  });
});
```

`src/main/services/plans.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, freePlan, mixedPlan, type TestContext } from '../test-context';
import { createPlan, getPlan, listPlans, updatePlan } from './plans';

describe('plans service', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it('creates and reads a plan', () => {
    const plan = createPlan(ctx, mixedPlan);
    expect(plan).toEqual({ id: plan.id, ...mixedPlan });
    expect(getPlan(ctx, plan.id)).toEqual(plan);
  });

  it('updates a plan', () => {
    const plan = createPlan(ctx, freePlan);
    expect(updatePlan(ctx, { ...freePlan, id: plan.id, priceCents: 2_500_000, active: false })).toMatchObject({
      priceCents: 2_500_000,
      active: false,
    });
  });

  it('lists only active plans unless asked otherwise', () => {
    createPlan(ctx, freePlan);
    createPlan(ctx, { ...mixedPlan, active: false });
    expect(listPlans(ctx, false).map((p) => p.name)).toEqual(['Pack 8 libres']);
    expect(listPlans(ctx, true)).toHaveLength(2);
  });

  it('fails with NOT_FOUND for unknown plans', () => {
    expectDomainError(() => getPlan(ctx, 999), 'NOT_FOUND');
    expectDomainError(() => updatePlan(ctx, { ...freePlan, id: 999 }), 'NOT_FOUND');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/main/services/teachers.test.ts src/main/services/plans.test.ts`
Expected: FAIL; no se pueden resolver `./teachers` ni `./plans`.

- [ ] **Step 3: Implementar los repos**

`src/main/repos/teachers.ts`:

```ts
import { z } from 'zod';
import type { ScheduleInput, TeacherInput } from '../../shared/schemas';
import type { Teacher, TeacherSchedule } from '../../shared/types';
import type { Db } from '../db/connection';

export type TeacherFields = Omit<TeacherInput, 'schedules'>;

interface TeacherRow {
  id: number;
  firstName: string;
  lastName: string;
  address: string | null;
  phone: string | null;
  socials: string;
  classRateCents: number;
  active: number;
}

interface ScheduleRow extends TeacherSchedule {
  teacherId: number;
}

const storedSocials = z.array(z.object({ network: z.string(), handle: z.string() }));

const TEACHER_COLUMNS = `id, first_name AS firstName, last_name AS lastName, address, phone, socials,
  class_rate_cents AS classRateCents, active`;
const SCHEDULE_COLUMNS = 'teacher_id AS teacherId, weekday, start_time AS startTime, end_time AS endTime';

function teacherParams(fields: TeacherFields) {
  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    address: fields.address,
    phone: fields.phone,
    socials: JSON.stringify(fields.socials),
    classRateCents: fields.classRateCents,
    active: fields.active ? 1 : 0,
  };
}

function toTeacher(row: TeacherRow, schedules: readonly ScheduleRow[]): Teacher {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    address: row.address,
    phone: row.phone,
    socials: storedSocials.parse(JSON.parse(row.socials)),
    classRateCents: row.classRateCents,
    active: row.active === 1,
    schedules: schedules
      .filter((schedule) => schedule.teacherId === row.id)
      .map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
  };
}

export function insertTeacher(db: Db, fields: TeacherFields): number {
  const result = db
    .prepare(
      `INSERT INTO teachers (first_name, last_name, address, phone, socials, class_rate_cents, active)
       VALUES (@firstName, @lastName, @address, @phone, @socials, @classRateCents, @active)`,
    )
    .run(teacherParams(fields));
  return Number(result.lastInsertRowid);
}

export function updateTeacher(db: Db, id: number, fields: TeacherFields): void {
  db.prepare(
    `UPDATE teachers SET first_name = @firstName, last_name = @lastName, address = @address, phone = @phone,
       socials = @socials, class_rate_cents = @classRateCents, active = @active
     WHERE id = @id`,
  ).run({ ...teacherParams(fields), id });
}

export function replaceSchedules(db: Db, teacherId: number, schedules: readonly ScheduleInput[]): void {
  db.prepare('DELETE FROM teacher_schedules WHERE teacher_id = ?').run(teacherId);
  const insert = db.prepare(
    `INSERT INTO teacher_schedules (teacher_id, weekday, start_time, end_time)
     VALUES (@teacherId, @weekday, @startTime, @endTime)`,
  );
  for (const schedule of schedules) {
    insert.run({ teacherId, weekday: schedule.weekday, startTime: schedule.startTime, endTime: schedule.endTime });
  }
}

export function findTeacher(db: Db, id: number): Teacher | undefined {
  const row = db.prepare<[number], TeacherRow>(`SELECT ${TEACHER_COLUMNS} FROM teachers WHERE id = ?`).get(id);
  if (!row) return undefined;
  const schedules = db
    .prepare<[number], ScheduleRow>(
      `SELECT ${SCHEDULE_COLUMNS} FROM teacher_schedules WHERE teacher_id = ? ORDER BY weekday, start_time`,
    )
    .all(id);
  return toTeacher(row, schedules);
}

export function listTeachers(db: Db, includeInactive: boolean): Teacher[] {
  const rows = db
    .prepare<[number], TeacherRow>(
      `SELECT ${TEACHER_COLUMNS} FROM teachers WHERE (? = 1 OR active = 1)
       ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`,
    )
    .all(includeInactive ? 1 : 0);
  const schedules = db
    .prepare<[], ScheduleRow>(`SELECT ${SCHEDULE_COLUMNS} FROM teacher_schedules ORDER BY weekday, start_time`)
    .all();
  return rows.map((row) => toTeacher(row, schedules));
}
```

`src/main/repos/plans.ts`:

```ts
import type { PlanInput } from '../../shared/schemas';
import type { Plan } from '../../shared/types';
import type { Db } from '../db/connection';

interface PlanRow extends Omit<Plan, 'active'> {
  active: number;
}

const PLAN_COLUMNS = `id, name, free_passes AS freePasses, teacher_passes AS teacherPasses, price_cents AS priceCents, active`;

function toPlan(row: PlanRow): Plan {
  return { ...row, active: row.active === 1 };
}

function planParams(fields: PlanInput) {
  return {
    name: fields.name,
    freePasses: fields.freePasses,
    teacherPasses: fields.teacherPasses,
    priceCents: fields.priceCents,
    active: fields.active ? 1 : 0,
  };
}

export function insertPlan(db: Db, fields: PlanInput): number {
  const result = db
    .prepare(
      `INSERT INTO plans (name, free_passes, teacher_passes, price_cents, active)
       VALUES (@name, @freePasses, @teacherPasses, @priceCents, @active)`,
    )
    .run(planParams(fields));
  return Number(result.lastInsertRowid);
}

export function updatePlan(db: Db, id: number, fields: PlanInput): void {
  db.prepare(
    `UPDATE plans SET name = @name, free_passes = @freePasses, teacher_passes = @teacherPasses,
       price_cents = @priceCents, active = @active
     WHERE id = @id`,
  ).run({ ...planParams(fields), id });
}

export function findPlan(db: Db, id: number): Plan | undefined {
  const row = db.prepare<[number], PlanRow>(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ?`).get(id);
  return row ? toPlan(row) : undefined;
}

export function listPlans(db: Db, includeInactive: boolean): Plan[] {
  return db
    .prepare<[number], PlanRow>(
      `SELECT ${PLAN_COLUMNS} FROM plans WHERE (? = 1 OR active = 1) ORDER BY active DESC, name COLLATE NOCASE`,
    )
    .all(includeInactive ? 1 : 0)
    .map(toPlan);
}
```

- [ ] **Step 4: Implementar los services**

`src/main/services/teachers.ts`:

```ts
import { DomainError } from '../../domain/errors';
import type { TeacherInput, TeacherUpdate } from '../../shared/schemas';
import type { Teacher } from '../../shared/types';
import type { Context } from '../context';
import * as repo from '../repos/teachers';

export function getTeacher(ctx: Context, id: number): Teacher {
  const teacher = repo.findTeacher(ctx.db, id);
  if (!teacher) throw new DomainError('NOT_FOUND');
  return teacher;
}

export function listTeachers(ctx: Context, includeInactive: boolean): Teacher[] {
  return repo.listTeachers(ctx.db, includeInactive);
}

export function createTeacher(ctx: Context, input: TeacherInput): Teacher {
  return ctx.db.transaction(() => {
    const id = repo.insertTeacher(ctx.db, input);
    repo.replaceSchedules(ctx.db, id, input.schedules);
    return getTeacher(ctx, id);
  })();
}

export function updateTeacher(ctx: Context, input: TeacherUpdate): Teacher {
  getTeacher(ctx, input.id);
  return ctx.db.transaction(() => {
    repo.updateTeacher(ctx.db, input.id, input);
    repo.replaceSchedules(ctx.db, input.id, input.schedules);
    return getTeacher(ctx, input.id);
  })();
}
```

`src/main/services/plans.ts`:

```ts
import { DomainError } from '../../domain/errors';
import type { PlanInput, PlanUpdate } from '../../shared/schemas';
import type { Plan } from '../../shared/types';
import type { Context } from '../context';
import * as repo from '../repos/plans';

export function getPlan(ctx: Context, id: number): Plan {
  const plan = repo.findPlan(ctx.db, id);
  if (!plan) throw new DomainError('NOT_FOUND');
  return plan;
}

export function listPlans(ctx: Context, includeInactive: boolean): Plan[] {
  return repo.listPlans(ctx.db, includeInactive);
}

export function createPlan(ctx: Context, input: PlanInput): Plan {
  return getPlan(ctx, repo.insertPlan(ctx.db, input));
}

export function updatePlan(ctx: Context, input: PlanUpdate): Plan {
  getPlan(ctx, input.id);
  repo.updatePlan(ctx.db, input.id, input);
  return getPlan(ctx, input.id);
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- src/main/services`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/repos src/main/services
git commit -m "feat: add teachers and plans repositories and services

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ventas y pagos — repos y services

**Files:**
- Create: `src/main/repos/sales.ts`, `src/main/repos/payments.ts`, `src/main/services/sales.ts`, `src/main/services/payments.ts`
- Test: `src/main/services/sales.test.ts`

**Interfaces:**
- Consumes: `buildSaleSnapshot`, `SaleSnapshot` (Task 3); `allocatePayment` (Task 3); `saleDebt`, `assertPaymentVoidable`, `assertSaleVoidable` (Task 4); `remainingPasses` (Task 4); `requireActiveClient` (Task 7); `getPlan` (Task 8); `getTeacher` (Task 8)
- Produces:
  - Repo de ventas: `insertSale(db, clientId: number, soldAt: string, snapshot: SaleSnapshot): number`, `findSale(db, id): Sale | undefined`, `listSalesForClient(db, clientId): Sale[]` (más nuevas primero), `countActiveMovements(db, saleId): { payments: number; consumptions: number }`, `voidSale(db, id, now): void`
  - Repo de pagos: `insertPayment(db, payment: NewPayment): number`, `findPayment(db, id): Payment | undefined`, `listPaymentsForSale(db, saleId): Payment[]`, `listPaymentsForClient(db, clientId): Payment[]`, `activeAllocationTotals(db, saleId): { localCents: number; teacherCents: number }`, `voidPayment(db, id, now): void`
  - `getSale(ctx: Context, id: number): Sale`, `sellPlan(ctx: Context, input: SaleInput): Sale`, `voidSale(ctx: Context, id: number): Sale`
  - `getPayment(ctx: Context, id: number): Payment`, `registerPayment(ctx: Context, input: PaymentInput): Payment`, `voidPayment(ctx: Context, id: number): Payment`

- [ ] **Step 1: Escribir el test que falla**

`src/main/services/sales.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, freePlan, mixedPlan, type TestContext } from '../test-context';
import { archiveClient, createClient } from './clients';
import { registerPayment, voidPayment } from './payments';
import { createPlan, updatePlan } from './plans';
import { getSale, sellPlan, voidSale } from './sales';
import { createTeacher, updateTeacher } from './teachers';

describe('sales and payments', () => {
  let ctx: TestContext;
  let clientId: number;
  let teacherId: number;
  let freePlanId: number;
  let mixedPlanId: number;

  beforeEach(() => {
    ctx = createTestContext();
    clientId = createClient(ctx, adultClient).id;
    teacherId = createTeacher(ctx, basicTeacher).id;
    freePlanId = createPlan(ctx, freePlan).id;
    mixedPlanId = createPlan(ctx, mixedPlan).id;
  });

  function saleOf(overrides: Partial<SaleInput>): SaleInput {
    return {
      clientId,
      planId: freePlanId,
      teacherId: null,
      splitRule: 'proportional',
      soldAt: '2026-10-05',
      initialPayment: null,
      ...overrides,
    };
  }

  function pay(saleId: number, amountCents: number) {
    return registerPayment(ctx, { saleId, amountCents, method: 'cash', paidAt: '2026-10-05' });
  }

  it('sells a free plan: the total is the plan price and all of it is owed', () => {
    expect(sellPlan(ctx, saleOf({}))).toMatchObject({
      planName: 'Pack 8 libres',
      totalCents: 2_000_000,
      teacherSurchargeCents: 0,
      teacherId: null,
      teacherName: null,
      paidCents: 0,
      debtCents: 2_000_000,
      remainingFree: 8,
      remainingTeacher: 0,
      voidedAt: null,
    });
  });

  it('sells a mixed plan adding the teacher surcharge', () => {
    expect(sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId }))).toMatchObject({
      teacherName: 'Juan Pared',
      teacherRateCents: 250_000,
      teacherSurchargeCents: 1_000_000,
      totalCents: 3_000_000,
      remainingFree: 4,
      remainingTeacher: 4,
    });
  });

  it('registers the initial payment with the split rule chosen at sale time', () => {
    const sale = sellPlan(
      ctx,
      saleOf({
        planId: mixedPlanId,
        teacherId,
        splitRule: 'teacher_first',
        initialPayment: { amountCents: 1_500_000, method: 'transfer', paidAt: '2026-10-05' },
      }),
    );
    expect(sale).toMatchObject({ paidCents: 1_500_000, debtCents: 1_500_000 });
    // The first payment already covered the whole surcharge, so the second one is all local.
    expect(pay(sale.id, 1_500_000)).toMatchObject({ localCents: 1_500_000, teacherCents: 0 });
  });

  it('splits proportionally by default', () => {
    const sale = sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId }));
    expect(pay(sale.id, 1_500_000)).toMatchObject({ amountCents: 1_500_000, localCents: 1_000_000, teacherCents: 500_000, voidedAt: null });
  });

  it('rejects invalid sales', () => {
    expectDomainError(() => sellPlan(ctx, saleOf({ planId: mixedPlanId })), 'TEACHER_REQUIRED');
    expectDomainError(() => sellPlan(ctx, saleOf({ teacherId })), 'TEACHER_NOT_ALLOWED');
    expectDomainError(() => sellPlan(ctx, saleOf({ planId: 999 })), 'NOT_FOUND');
    updateTeacher(ctx, { ...basicTeacher, id: teacherId, active: false });
    expectDomainError(() => sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId })), 'INACTIVE_TEACHER');
    updatePlan(ctx, { ...freePlan, id: freePlanId, active: false });
    expectDomainError(() => sellPlan(ctx, saleOf({})), 'INACTIVE_PLAN');
    archiveClient(ctx, clientId);
    expectDomainError(() => sellPlan(ctx, saleOf({ planId: mixedPlanId })), 'CLIENT_ARCHIVED');
  });

  it('rolls the sale back when the initial payment is invalid', () => {
    expectDomainError(
      () => sellPlan(ctx, saleOf({ initialPayment: { amountCents: 2_000_001, method: 'cash', paidAt: '2026-10-05' } })),
      'PAYMENT_EXCEEDS_DEBT',
    );
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM sales').get()).toEqual({ n: 0 });
  });

  it('keeps the sale snapshot when the plan or the teacher change later', () => {
    const sale = sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId }));
    updatePlan(ctx, { ...mixedPlan, id: mixedPlanId, priceCents: 9_000_000 });
    updateTeacher(ctx, { ...basicTeacher, id: teacherId, classRateCents: 900_000 });
    expect(getSale(ctx, sale.id)).toMatchObject({ localPriceCents: 2_000_000, teacherRateCents: 250_000, totalCents: 3_000_000 });
  });

  it('rejects payments above the debt and payments on voided sales', () => {
    const sale = sellPlan(ctx, saleOf({}));
    pay(sale.id, 1_500_000);
    expectDomainError(() => pay(sale.id, 500_001), 'PAYMENT_EXCEEDS_DEBT');
    const other = sellPlan(ctx, saleOf({}));
    voidSale(ctx, other.id);
    expectDomainError(() => pay(other.id, 100), 'SALE_VOIDED');
    expectDomainError(() => pay(999, 100), 'NOT_FOUND');
  });

  it('voids only the last active payment and restores the debt', () => {
    const sale = sellPlan(ctx, saleOf({}));
    const first = pay(sale.id, 500_000);
    const second = pay(sale.id, 500_000);

    expectDomainError(() => voidPayment(ctx, first.id), 'ONLY_LAST_PAYMENT_VOIDABLE');
    expect(getSale(ctx, sale.id).paidCents).toBe(1_000_000);

    expect(voidPayment(ctx, second.id).voidedAt).not.toBeNull();
    expect(getSale(ctx, sale.id).debtCents).toBe(1_500_000);
    expectDomainError(() => voidPayment(ctx, second.id), 'ALREADY_VOIDED');

    voidPayment(ctx, first.id);
    expect(getSale(ctx, sale.id).debtCents).toBe(2_000_000);
  });

  it('voids a sale only when it has no active payments', () => {
    const sale = sellPlan(ctx, saleOf({}));
    const payment = pay(sale.id, 100_000);
    expectDomainError(() => voidSale(ctx, sale.id), 'SALE_HAS_ACTIVE_PAYMENTS');
    voidPayment(ctx, payment.id);
    const voided = voidSale(ctx, sale.id);
    expect(voided.voidedAt).not.toBeNull();
    expect(voided.debtCents).toBe(0);
    expectDomainError(() => voidSale(ctx, sale.id), 'ALREADY_VOIDED');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- src/main/services/sales.test.ts`
Expected: FAIL; no se pueden resolver `./payments` ni `./sales`.

- [ ] **Step 3: Implementar los repos**

`src/main/repos/sales.ts`:

```ts
import { saleDebt } from '../../domain/ledger';
import { remainingPasses } from '../../domain/passes';
import type { SaleSnapshot } from '../../domain/sale';
import type { Sale } from '../../shared/types';
import type { Db } from '../db/connection';

type SaleRow = Omit<Sale, 'debtCents' | 'remainingFree' | 'remainingTeacher'> & { usedFree: number; usedTeacher: number };

const SALE_SELECT = `SELECT s.id, s.client_id AS clientId, s.sold_at AS soldAt, s.plan_id AS planId, s.plan_name AS planName,
    s.free_passes AS freePasses, s.teacher_passes AS teacherPasses, s.local_price_cents AS localPriceCents,
    s.teacher_id AS teacherId,
    CASE WHEN t.id IS NULL THEN NULL ELSE t.first_name || ' ' || t.last_name END AS teacherName,
    s.teacher_rate_cents AS teacherRateCents, s.teacher_surcharge_cents AS teacherSurchargeCents,
    s.total_cents AS totalCents, s.split_rule AS splitRule, s.voided_at AS voidedAt,
    COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id = s.id AND p.voided_at IS NULL), 0) AS paidCents,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'free') AS usedFree,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'teacher') AS usedTeacher
  FROM sales s
  LEFT JOIN teachers t ON t.id = s.teacher_id`;

function toSale({ usedFree, usedTeacher, ...row }: SaleRow): Sale {
  const remaining = remainingPasses(
    { free: row.freePasses, teacher: row.teacherPasses },
    { free: usedFree, teacher: usedTeacher },
  );
  return {
    ...row,
    debtCents: row.voidedAt ? 0 : saleDebt(row.totalCents, row.paidCents),
    remainingFree: remaining.free,
    remainingTeacher: remaining.teacher,
  };
}

export function insertSale(db: Db, clientId: number, soldAt: string, snapshot: SaleSnapshot): number {
  const result = db
    .prepare(
      `INSERT INTO sales (client_id, plan_id, sold_at, plan_name, free_passes, teacher_passes, local_price_cents,
         teacher_id, teacher_rate_cents, teacher_surcharge_cents, total_cents, split_rule)
       VALUES (@clientId, @planId, @soldAt, @planName, @freePasses, @teacherPasses, @localPriceCents,
         @teacherId, @teacherRateCents, @teacherSurchargeCents, @totalCents, @splitRule)`,
    )
    .run({
      clientId,
      soldAt,
      planId: snapshot.planId,
      planName: snapshot.planName,
      freePasses: snapshot.freePasses,
      teacherPasses: snapshot.teacherPasses,
      localPriceCents: snapshot.localPriceCents,
      teacherId: snapshot.teacherId,
      teacherRateCents: snapshot.teacherRateCents,
      teacherSurchargeCents: snapshot.teacherSurchargeCents,
      totalCents: snapshot.totalCents,
      splitRule: snapshot.splitRule,
    });
  return Number(result.lastInsertRowid);
}

export function findSale(db: Db, id: number): Sale | undefined {
  const row = db.prepare<[number], SaleRow>(`${SALE_SELECT} WHERE s.id = ?`).get(id);
  return row ? toSale(row) : undefined;
}

export function listSalesForClient(db: Db, clientId: number): Sale[] {
  return db
    .prepare<[number], SaleRow>(`${SALE_SELECT} WHERE s.client_id = ? ORDER BY s.sold_at DESC, s.id DESC`)
    .all(clientId)
    .map(toSale);
}

export function countActiveMovements(db: Db, saleId: number): { payments: number; consumptions: number } {
  const counts = db
    .prepare<[number, number], { payments: number; consumptions: number }>(
      `SELECT
         (SELECT COUNT(*) FROM payments WHERE sale_id = ? AND voided_at IS NULL) AS payments,
         (SELECT COUNT(*) FROM consumptions WHERE sale_id = ? AND voided_at IS NULL) AS consumptions`,
    )
    .get(saleId, saleId);
  return counts ?? { payments: 0, consumptions: 0 };
}

export function voidSale(db: Db, id: number, now: string): void {
  db.prepare('UPDATE sales SET voided_at = ? WHERE id = ?').run(now, id);
}
```

`src/main/repos/payments.ts`:

```ts
import type { Payment, PaymentMethod } from '../../shared/types';
import type { Db } from '../db/connection';

export interface NewPayment {
  saleId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  localCents: number;
  teacherCents: number;
}

const PAYMENT_COLUMNS = `p.id, p.sale_id AS saleId, p.paid_at AS paidAt, p.amount_cents AS amountCents, p.method,
  p.local_cents AS localCents, p.teacher_cents AS teacherCents, p.voided_at AS voidedAt`;

export function insertPayment(db: Db, payment: NewPayment): number {
  const result = db
    .prepare(
      `INSERT INTO payments (sale_id, paid_at, amount_cents, method, local_cents, teacher_cents)
       VALUES (@saleId, @paidAt, @amountCents, @method, @localCents, @teacherCents)`,
    )
    .run({
      saleId: payment.saleId,
      paidAt: payment.paidAt,
      amountCents: payment.amountCents,
      method: payment.method,
      localCents: payment.localCents,
      teacherCents: payment.teacherCents,
    });
  return Number(result.lastInsertRowid);
}

export function findPayment(db: Db, id: number): Payment | undefined {
  return db.prepare<[number], Payment>(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.id = ?`).get(id);
}

export function listPaymentsForSale(db: Db, saleId: number): Payment[] {
  return db.prepare<[number], Payment>(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.sale_id = ? ORDER BY p.id`).all(saleId);
}

export function listPaymentsForClient(db: Db, clientId: number): Payment[] {
  return db
    .prepare<[number], Payment>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN sales s ON s.id = p.sale_id
       WHERE s.client_id = ? ORDER BY p.paid_at DESC, p.id DESC`,
    )
    .all(clientId);
}

export function activeAllocationTotals(db: Db, saleId: number): { localCents: number; teacherCents: number } {
  const totals = db
    .prepare<[number], { localCents: number; teacherCents: number }>(
      `SELECT COALESCE(SUM(local_cents), 0) AS localCents, COALESCE(SUM(teacher_cents), 0) AS teacherCents
       FROM payments WHERE sale_id = ? AND voided_at IS NULL`,
    )
    .get(saleId);
  return totals ?? { localCents: 0, teacherCents: 0 };
}

export function voidPayment(db: Db, id: number, now: string): void {
  db.prepare('UPDATE payments SET voided_at = ? WHERE id = ?').run(now, id);
}
```

- [ ] **Step 4: Implementar los services**

`src/main/services/payments.ts`:

```ts
import { allocatePayment } from '../../domain/allocation';
import { DomainError } from '../../domain/errors';
import { assertPaymentVoidable } from '../../domain/ledger';
import type { PaymentInput } from '../../shared/schemas';
import type { Payment } from '../../shared/types';
import { type Context, nowIso } from '../context';
import * as paymentsRepo from '../repos/payments';
import * as salesRepo from '../repos/sales';

export function getPayment(ctx: Context, id: number): Payment {
  const payment = paymentsRepo.findPayment(ctx.db, id);
  if (!payment) throw new DomainError('NOT_FOUND');
  return payment;
}

export function registerPayment(ctx: Context, input: PaymentInput): Payment {
  return ctx.db.transaction(() => {
    const sale = salesRepo.findSale(ctx.db, input.saleId);
    if (!sale) throw new DomainError('NOT_FOUND');
    if (sale.voidedAt) throw new DomainError('SALE_VOIDED');
    const allocated = paymentsRepo.activeAllocationTotals(ctx.db, sale.id);
    const allocation = allocatePayment({
      totalCents: sale.totalCents,
      surchargeCents: sale.teacherSurchargeCents,
      splitRule: sale.splitRule,
      allocatedLocalCents: allocated.localCents,
      allocatedTeacherCents: allocated.teacherCents,
      amountCents: input.amountCents,
    });
    const id = paymentsRepo.insertPayment(ctx.db, {
      saleId: sale.id,
      paidAt: input.paidAt,
      amountCents: input.amountCents,
      method: input.method,
      ...allocation,
    });
    return getPayment(ctx, id);
  })();
}

export function voidPayment(ctx: Context, id: number): Payment {
  return ctx.db.transaction(() => {
    const payment = getPayment(ctx, id);
    assertPaymentVoidable(id, paymentsRepo.listPaymentsForSale(ctx.db, payment.saleId));
    paymentsRepo.voidPayment(ctx.db, id, nowIso(ctx));
    return getPayment(ctx, id);
  })();
}
```

`src/main/services/sales.ts`:

```ts
import { DomainError } from '../../domain/errors';
import { assertSaleVoidable } from '../../domain/ledger';
import { buildSaleSnapshot } from '../../domain/sale';
import type { SaleInput } from '../../shared/schemas';
import type { Sale } from '../../shared/types';
import { type Context, nowIso } from '../context';
import * as salesRepo from '../repos/sales';
import { requireActiveClient } from './clients';
import { registerPayment } from './payments';
import { getPlan } from './plans';
import { getTeacher } from './teachers';

export function getSale(ctx: Context, id: number): Sale {
  const sale = salesRepo.findSale(ctx.db, id);
  if (!sale) throw new DomainError('NOT_FOUND');
  return sale;
}

export function sellPlan(ctx: Context, input: SaleInput): Sale {
  return ctx.db.transaction(() => {
    requireActiveClient(ctx, input.clientId);
    const plan = getPlan(ctx, input.planId);
    const teacher = input.teacherId === null ? null : getTeacher(ctx, input.teacherId);
    const snapshot = buildSaleSnapshot(plan, teacher, input.splitRule);
    const saleId = salesRepo.insertSale(ctx.db, input.clientId, input.soldAt, snapshot);
    if (input.initialPayment) registerPayment(ctx, { saleId, ...input.initialPayment });
    return getSale(ctx, saleId);
  })();
}

export function voidSale(ctx: Context, id: number): Sale {
  return ctx.db.transaction(() => {
    const sale = getSale(ctx, id);
    assertSaleVoidable(sale, salesRepo.countActiveMovements(ctx.db, id));
    salesRepo.voidSale(ctx.db, id, nowIso(ctx));
    return getSale(ctx, id);
  })();
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- src/main/services`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/repos src/main/services
git commit -m "feat: add plan sales with frozen snapshot and split payments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Consumo de pases, cuenta del cliente y ajustes

**Files:**
- Create: `src/main/repos/consumptions.ts`, `src/main/repos/settings.ts`, `src/main/services/consumptions.ts`, `src/main/services/account.ts`, `src/main/services/settings.ts`
- Test: `src/main/services/consumptions.test.ts`

**Interfaces:**
- Consumes: `pickSaleForConsumption`, `isLowOnPasses` (Task 4); `requireActiveClient`, `getClient` (Task 7); `listSalesForClient` (Task 9); `listPaymentsForClient` (Task 9); `sellPlan`, `getSale`, `voidSale` (Task 9)
- Produces:
  - Repo: `insertConsumption(db, c: NewConsumption): number`, `findConsumption(db, id): Consumption | undefined`, `listConsumptionsForClient(db, clientId): Consumption[]`, `voidConsumption(db, id, now): void`
  - Repo: `getSetting(db, key: string): string | undefined`, `setSetting(db, key: string, value: string): void`
  - `getConsumption(ctx: Context, id: number): Consumption`, `consume(ctx: Context, input: ConsumptionInput): Consumption`, `voidConsumption(ctx: Context, id: number): Consumption`
  - `getClientAccount(ctx: Context, clientId: number): ClientAccount`
  - `DEFAULT_LOW_PASSES_THRESHOLD = 2`, `getSettings(ctx: Context): Settings`, `updateSettings(ctx: Context, input: SettingsInput): Settings`

- [ ] **Step 1: Escribir el test que falla**

`src/main/services/consumptions.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, freePlan, mixedPlan, TEST_NOW, type TestContext } from '../test-context';
import { getClientAccount } from './account';
import { archiveClient, createClient } from './clients';
import { consume, voidConsumption } from './consumptions';
import { createPlan } from './plans';
import { getSale, sellPlan, voidSale } from './sales';
import { getSettings, updateSettings } from './settings';
import { createTeacher } from './teachers';

describe('consumptions and client account', () => {
  let ctx: TestContext;
  let clientId: number;
  let teacherId: number;
  let freePlanId: number;
  let mixedPlanId: number;

  beforeEach(() => {
    ctx = createTestContext();
    clientId = createClient(ctx, adultClient).id;
    teacherId = createTeacher(ctx, basicTeacher).id;
    freePlanId = createPlan(ctx, freePlan).id;
    mixedPlanId = createPlan(ctx, mixedPlan).id;
  });

  function saleOf(overrides: Partial<SaleInput>): SaleInput {
    return {
      clientId,
      planId: freePlanId,
      teacherId: null,
      splitRule: 'proportional',
      soldAt: '2026-10-05',
      initialPayment: null,
      ...overrides,
    };
  }

  const useFree = () => consume(ctx, { clientId, kind: 'free', note: null });

  it('consumes from the oldest sale with passes of that kind (FIFO)', () => {
    const newer = sellPlan(ctx, saleOf({ soldAt: '2026-10-01' }));
    const older = sellPlan(ctx, saleOf({ soldAt: '2026-09-01' }));
    const consumption = useFree();
    expect(consumption).toMatchObject({ saleId: older.id, kind: 'free', consumedAt: TEST_NOW.toISOString(), voidedAt: null });
    expect(getSale(ctx, older.id).remainingFree).toBe(7);
    expect(getSale(ctx, newer.id).remainingFree).toBe(8);
  });

  it('skips voided sales even when they are the oldest', () => {
    const voided = sellPlan(ctx, saleOf({ soldAt: '2026-08-01' }));
    voidSale(ctx, voided.id);
    const active = sellPlan(ctx, saleOf({ soldAt: '2026-09-01' }));
    expect(useFree().saleId).toBe(active.id);
  });

  it('fails when no passes of the requested kind remain', () => {
    expectDomainError(useFree, 'NO_PASSES_AVAILABLE');
    sellPlan(ctx, saleOf({}));
    expectDomainError(() => consume(ctx, { clientId, kind: 'teacher', note: null }), 'NO_PASSES_AVAILABLE');
    const single = createPlan(ctx, { ...freePlan, name: 'Pase suelto', freePasses: 1 });
    const otherClient = createClient(ctx, { ...adultClient, firstName: 'Bruno' }).id;
    sellPlan(ctx, saleOf({ clientId: otherClient, planId: single.id }));
    consume(ctx, { clientId: otherClient, kind: 'free', note: null });
    expectDomainError(() => consume(ctx, { clientId: otherClient, kind: 'free', note: null }), 'NO_PASSES_AVAILABLE');
  });

  it('rejects consumptions for archived clients', () => {
    sellPlan(ctx, saleOf({}));
    archiveClient(ctx, clientId);
    expectDomainError(useFree, 'CLIENT_ARCHIVED');
  });

  it('voids a consumption once, giving the pass back', () => {
    const sale = sellPlan(ctx, saleOf({}));
    const consumption = useFree();
    expect(voidConsumption(ctx, consumption.id).voidedAt).not.toBeNull();
    expect(getSale(ctx, sale.id).remainingFree).toBe(8);
    expectDomainError(() => voidConsumption(ctx, consumption.id), 'ALREADY_VOIDED');
    expectDomainError(() => voidConsumption(ctx, 999), 'NOT_FOUND');
  });

  it('blocks voiding a sale that has active consumptions', () => {
    const sale = sellPlan(ctx, saleOf({}));
    useFree();
    expectDomainError(() => voidSale(ctx, sale.id), 'SALE_HAS_ACTIVE_CONSUMPTIONS');
  });

  it('builds the client account with totals and the low-passes flag', () => {
    expect(getClientAccount(ctx, clientId)).toMatchObject({ sales: [], remainingFree: 0, debtCents: 0, lowOnPasses: false });

    sellPlan(
      ctx,
      saleOf({ planId: mixedPlanId, teacherId, initialPayment: { amountCents: 1_000_000, method: 'cash', paidAt: '2026-10-05' } }),
    );
    for (let i = 0; i < 4; i += 1) useFree();
    consume(ctx, { clientId, kind: 'teacher', note: 'Clase de técnica' });

    const account = getClientAccount(ctx, clientId);
    expect(account).toMatchObject({ remainingFree: 0, remainingTeacher: 3, debtCents: 2_000_000, lowOnPasses: false });
    expect(account.payments).toHaveLength(1);
    expect(account.consumptions).toHaveLength(5);

    consume(ctx, { clientId, kind: 'teacher', note: null });
    expect(getClientAccount(ctx, clientId)).toMatchObject({ remainingTeacher: 2, lowOnPasses: true });
  });

  it('reads and updates the low-passes threshold', () => {
    expect(getSettings(ctx)).toEqual({ lowPassesThreshold: 2 });
    sellPlan(ctx, saleOf({}));
    expect(getClientAccount(ctx, clientId).lowOnPasses).toBe(false);
    expect(updateSettings(ctx, { lowPassesThreshold: 8 })).toEqual({ lowPassesThreshold: 8 });
    expect(getClientAccount(ctx, clientId).lowOnPasses).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- src/main/services/consumptions.test.ts`
Expected: FAIL; no se pueden resolver `./account`, `./consumptions` ni `./settings`.

- [ ] **Step 3: Implementar los repos**

`src/main/repos/consumptions.ts`:

```ts
import type { PassKind } from '../../domain/passes';
import type { Consumption } from '../../shared/types';
import type { Db } from '../db/connection';

export interface NewConsumption {
  saleId: number;
  kind: PassKind;
  consumedAt: string;
  note: string | null;
}

const CONSUMPTION_COLUMNS = 'c.id, c.sale_id AS saleId, c.kind, c.consumed_at AS consumedAt, c.note, c.voided_at AS voidedAt';

export function insertConsumption(db: Db, consumption: NewConsumption): number {
  const result = db
    .prepare('INSERT INTO consumptions (sale_id, kind, consumed_at, note) VALUES (@saleId, @kind, @consumedAt, @note)')
    .run({ saleId: consumption.saleId, kind: consumption.kind, consumedAt: consumption.consumedAt, note: consumption.note });
  return Number(result.lastInsertRowid);
}

export function findConsumption(db: Db, id: number): Consumption | undefined {
  return db.prepare<[number], Consumption>(`SELECT ${CONSUMPTION_COLUMNS} FROM consumptions c WHERE c.id = ?`).get(id);
}

export function listConsumptionsForClient(db: Db, clientId: number): Consumption[] {
  return db
    .prepare<[number], Consumption>(
      `SELECT ${CONSUMPTION_COLUMNS} FROM consumptions c JOIN sales s ON s.id = c.sale_id
       WHERE s.client_id = ? ORDER BY c.consumed_at DESC, c.id DESC`,
    )
    .all(clientId);
}

export function voidConsumption(db: Db, id: number, now: string): void {
  db.prepare('UPDATE consumptions SET voided_at = ? WHERE id = ?').run(now, id);
}
```

`src/main/repos/settings.ts`:

```ts
import type { Db } from '../db/connection';

export function getSetting(db: Db, key: string): string | undefined {
  return db.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run({ key, value });
}
```

- [ ] **Step 4: Implementar los services**

`src/main/services/settings.ts`:

```ts
import type { SettingsInput } from '../../shared/schemas';
import type { Settings } from '../../shared/types';
import type { Context } from '../context';
import { getSetting, setSetting } from '../repos/settings';

const LOW_PASSES_KEY = 'low_passes_threshold';
export const DEFAULT_LOW_PASSES_THRESHOLD = 2;

export function getSettings(ctx: Context): Settings {
  const stored = Number(getSetting(ctx.db, LOW_PASSES_KEY));
  return { lowPassesThreshold: Number.isInteger(stored) ? stored : DEFAULT_LOW_PASSES_THRESHOLD };
}

export function updateSettings(ctx: Context, input: SettingsInput): Settings {
  setSetting(ctx.db, LOW_PASSES_KEY, String(input.lowPassesThreshold));
  return getSettings(ctx);
}
```

Nota: `Number(undefined)` es `NaN`, y `Number.isInteger(NaN)` es `false`; por eso, si falta la clave, se usa el valor por defecto.

`src/main/services/consumptions.ts`:

```ts
import { DomainError } from '../../domain/errors';
import { pickSaleForConsumption } from '../../domain/passes';
import type { ConsumptionInput } from '../../shared/schemas';
import type { Consumption } from '../../shared/types';
import { type Context, nowIso } from '../context';
import * as consumptionsRepo from '../repos/consumptions';
import { listSalesForClient } from '../repos/sales';
import { requireActiveClient } from './clients';

export function getConsumption(ctx: Context, id: number): Consumption {
  const consumption = consumptionsRepo.findConsumption(ctx.db, id);
  if (!consumption) throw new DomainError('NOT_FOUND');
  return consumption;
}

export function consume(ctx: Context, input: ConsumptionInput): Consumption {
  return ctx.db.transaction(() => {
    requireActiveClient(ctx, input.clientId);
    const availability = listSalesForClient(ctx.db, input.clientId)
      .filter((sale) => !sale.voidedAt)
      .map((sale) => ({
        saleId: sale.id,
        soldAt: sale.soldAt,
        remaining: { free: sale.remainingFree, teacher: sale.remainingTeacher },
      }));
    const saleId = pickSaleForConsumption(availability, input.kind);
    const id = consumptionsRepo.insertConsumption(ctx.db, {
      saleId,
      kind: input.kind,
      consumedAt: nowIso(ctx),
      note: input.note,
    });
    return getConsumption(ctx, id);
  })();
}

export function voidConsumption(ctx: Context, id: number): Consumption {
  const consumption = getConsumption(ctx, id);
  if (consumption.voidedAt) throw new DomainError('ALREADY_VOIDED');
  consumptionsRepo.voidConsumption(ctx.db, id, nowIso(ctx));
  return getConsumption(ctx, id);
}
```

`src/main/services/account.ts`:

```ts
import { isLowOnPasses } from '../../domain/passes';
import type { ClientAccount } from '../../shared/types';
import type { Context } from '../context';
import { listConsumptionsForClient } from '../repos/consumptions';
import { listPaymentsForClient } from '../repos/payments';
import { listSalesForClient } from '../repos/sales';
import { getClient } from './clients';
import { getSettings } from './settings';

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function getClientAccount(ctx: Context, clientId: number): ClientAccount {
  const client = getClient(ctx, clientId);
  const sales = listSalesForClient(ctx.db, clientId);
  const active = sales.filter((sale) => !sale.voidedAt);
  const remainingFree = sum(active.map((sale) => sale.remainingFree));
  const remainingTeacher = sum(active.map((sale) => sale.remainingTeacher));
  const { lowPassesThreshold } = getSettings(ctx);
  return {
    client,
    sales,
    payments: listPaymentsForClient(ctx.db, clientId),
    consumptions: listConsumptionsForClient(ctx.db, clientId),
    remainingFree,
    remainingTeacher,
    debtCents: sum(active.map((sale) => sale.debtCents)),
    lowOnPasses: active.length > 0 && isLowOnPasses(remainingFree + remainingTeacher, lowPassesThreshold),
  };
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- src/main/services`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/repos src/main/services
git commit -m "feat: add FIFO pass consumption, client account and settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Cuenta corriente de profesores, deudores y dashboard

**Files:**
- Create: `src/main/repos/payouts.ts`, `src/main/services/payouts.ts`, `src/main/services/dashboard.ts`
- Modify: `src/main/repos/saleStats.ts` (agregar `listDebtorRows` y `listClientPassTotals`)
- Test: `src/main/services/payouts.test.ts`, `src/main/services/dashboard.test.ts`

**Interfaces:**
- Consumes: `teacherBalance`, `assertPayoutFits` (Task 4); `daysBetween` (Task 2); `isLowOnPasses` (Task 4); `getTeacher` (Task 8); `getSettings` (Task 10); `voidPayment` (Task 9)
- Produces:
  - Repo: `insertPayout(db, p: NewPayout): number`, `findPayout(db, id): TeacherPayout | undefined`, `listPayoutsForTeacher(db, teacherId): TeacherPayout[]`, `voidPayout(db, id, now): void`, `listBalanceRows(db): BalanceRow[]`, `findBalanceRow(db, teacherId): BalanceRow | undefined`, `listTeacherShares(db, teacherId): TeacherShare[]`
  - `listDebtorRows(db): Omit<Debtor, 'daysSinceSale'>[]`, `listClientPassTotals(db): LowPassesAlert[]`
  - `listTeacherBalances(ctx: Context): TeacherBalance[]`, `getTeacherAccount(ctx: Context, teacherId: number): TeacherAccount`, `getPayout(ctx: Context, id: number): TeacherPayout`, `registerPayout(ctx: Context, input: PayoutInput): TeacherPayout`, `voidPayout(ctx: Context, id: number): TeacherPayout`
  - `listDebtors(ctx: Context): Debtor[]`, `getDashboard(ctx: Context): Dashboard`

- [ ] **Step 1: Escribir los tests que fallan**

`src/main/services/payouts.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError, must } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, mixedPlan, type TestContext } from '../test-context';
import { createClient } from './clients';
import { voidPayment } from './payments';
import { getTeacherAccount, registerPayout, voidPayout } from './payouts';
import { createPlan } from './plans';
import { sellPlan } from './sales';
import { createTeacher } from './teachers';

describe('teacher ledger', () => {
  let ctx: TestContext;
  let teacherId: number;
  let saleId: number;

  beforeEach(() => {
    ctx = createTestContext();
    const clientId = createClient(ctx, adultClient).id;
    teacherId = createTeacher(ctx, basicTeacher).id;
    const planId = createPlan(ctx, mixedPlan).id;
    saleId = sellPlan(ctx, {
      clientId,
      planId,
      teacherId,
      splitRule: 'proportional',
      soldAt: '2026-10-05',
      initialPayment: { amountCents: 1_500_000, method: 'cash', paidAt: '2026-10-05' },
    }).id;
  });

  const payout = (amountCents: number) =>
    registerPayout(ctx, { teacherId, amountCents, method: 'transfer', paidAt: '2026-10-05', note: null });

  it('earns the teacher share of each collected payment', () => {
    const account = getTeacherAccount(ctx, teacherId);
    expect(account).toMatchObject({ teacherName: 'Juan Pared', earnedCents: 500_000, paidOutCents: 0, balanceCents: 500_000 });
    expect(account.shares).toEqual([
      {
        paymentId: expect.any(Number),
        saleId,
        paidAt: '2026-10-05',
        clientName: 'Ana Roca',
        planName: 'Pack 4+4',
        teacherCents: 500_000,
      },
    ]);
  });

  it('registers payouts up to the balance and voids them once', () => {
    const first = payout(300_000);
    expect(getTeacherAccount(ctx, teacherId).balanceCents).toBe(200_000);
    expectDomainError(() => payout(200_001), 'PAYOUT_EXCEEDS_BALANCE');
    expect(voidPayout(ctx, first.id).voidedAt).not.toBeNull();
    expect(getTeacherAccount(ctx, teacherId).balanceCents).toBe(500_000);
    expectDomainError(() => voidPayout(ctx, first.id), 'ALREADY_VOIDED');
  });

  it('goes negative when a paid-out payment is voided and then blocks new payouts', () => {
    payout(500_000);
    const paymentId = must(getTeacherAccount(ctx, teacherId).shares[0]).paymentId;
    voidPayment(ctx, paymentId);
    expect(getTeacherAccount(ctx, teacherId)).toMatchObject({ earnedCents: 0, paidOutCents: 500_000, balanceCents: -500_000 });
    expectDomainError(() => payout(1), 'PAYOUT_EXCEEDS_BALANCE');
  });

  it('fails with NOT_FOUND for unknown teachers', () => {
    expectDomainError(() => getTeacherAccount(ctx, 999), 'NOT_FOUND');
    expectDomainError(
      () => registerPayout(ctx, { teacherId: 999, amountCents: 1, method: 'cash', paidAt: '2026-10-05', note: null }),
      'NOT_FOUND',
    );
  });
});
```

`src/main/services/dashboard.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleInput } from '../../shared/schemas';
import { adultClient, basicTeacher, createTestContext, freePlan, mixedPlan, type TestContext } from '../test-context';
import { archiveClient, createClient } from './clients';
import { getDashboard, listDebtors } from './dashboard';
import { createPlan } from './plans';
import { sellPlan, voidSale } from './sales';
import { createTeacher } from './teachers';

describe('debtors and dashboard', () => {
  let ctx: TestContext;
  let anaId: number;
  let freePlanId: number;

  beforeEach(() => {
    ctx = createTestContext();
    anaId = createClient(ctx, adultClient).id;
    freePlanId = createPlan(ctx, freePlan).id;
  });

  function saleOf(overrides: Partial<SaleInput>): SaleInput {
    return {
      clientId: anaId,
      planId: freePlanId,
      teacherId: null,
      splitRule: 'proportional',
      soldAt: '2026-10-05',
      initialPayment: null,
      ...overrides,
    };
  }

  it('lists debtors oldest first with days since sale, excluding settled and voided sales', () => {
    const unpaid = sellPlan(ctx, saleOf({ soldAt: '2026-09-05' }));
    sellPlan(ctx, saleOf({ soldAt: '2026-10-01', initialPayment: { amountCents: 2_000_000, method: 'cash', paidAt: '2026-10-01' } }));
    voidSale(ctx, sellPlan(ctx, saleOf({ soldAt: '2026-09-20' })).id);
    const partial = sellPlan(ctx, saleOf({ soldAt: '2026-10-03', initialPayment: { amountCents: 500_000, method: 'cash', paidAt: '2026-10-03' } }));

    expect(listDebtors(ctx)).toEqual([
      { saleId: unpaid.id, clientId: anaId, clientName: 'Ana Roca', planName: 'Pack 8 libres', soldAt: '2026-09-05', totalCents: 2_000_000, debtCents: 2_000_000, daysSinceSale: 30 },
      { saleId: partial.id, clientId: anaId, clientName: 'Ana Roca', planName: 'Pack 8 libres', soldAt: '2026-10-03', totalCents: 2_000_000, debtCents: 1_500_000, daysSinceSale: 2 },
    ]);
  });

  it('shows low-pass alerts for active clients and only non-zero teacher balances', () => {
    const single = createPlan(ctx, { ...freePlan, name: 'Pase suelto', freePasses: 1, priceCents: 500_000 });
    sellPlan(ctx, saleOf({ planId: single.id }));

    const brunoId = createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' }).id;
    const juanId = createTeacher(ctx, basicTeacher).id;
    createTeacher(ctx, { ...basicTeacher, firstName: 'Eva', lastName: 'Bloque' });
    const mixedId = createPlan(ctx, mixedPlan).id;
    sellPlan(ctx, saleOf({ clientId: brunoId, planId: mixedId, teacherId: juanId, initialPayment: { amountCents: 1_500_000, method: 'cash', paidAt: '2026-10-05' } }));

    const carlaId = createClient(ctx, { ...adultClient, firstName: 'Carla', lastName: 'Vía' }).id;
    sellPlan(ctx, saleOf({ clientId: carlaId, planId: single.id }));
    archiveClient(ctx, carlaId);

    const dashboard = getDashboard(ctx);
    expect(dashboard.lowPasses).toEqual([{ clientId: anaId, clientName: 'Ana Roca', remainingFree: 1, remainingTeacher: 0 }]);
    expect(dashboard.teacherBalances.map((balance) => balance.teacherName)).toEqual(['Juan Pared']);
    expect(dashboard.debtors.map((debtor) => debtor.clientName)).toEqual(['Ana Roca', 'Bruno Sierra', 'Carla Vía']);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/main/services/payouts.test.ts src/main/services/dashboard.test.ts`
Expected: FAIL; no se pueden resolver `./payouts` ni `./dashboard`.

- [ ] **Step 3: Implementar las consultas y el repo**

Agregar al final de `src/main/repos/saleStats.ts`:

```ts
import type { Debtor, LowPassesAlert } from '../../shared/types';
import type { Db } from '../db/connection';

export function listDebtorRows(db: Db): Omit<Debtor, 'daysSinceSale'>[] {
  return db
    .prepare<[], Omit<Debtor, 'daysSinceSale'>>(
      `WITH ${SALE_STATS_CTE}
       SELECT ss.id AS saleId, c.id AS clientId, c.first_name || ' ' || c.last_name AS clientName,
         ss.plan_name AS planName, ss.sold_at AS soldAt, ss.total_cents AS totalCents,
         ss.total_cents - ss.paid_cents AS debtCents
       FROM sale_stats ss
       JOIN clients c ON c.id = ss.client_id
       WHERE ss.total_cents - ss.paid_cents > 0
       ORDER BY ss.sold_at, ss.id`,
    )
    .all();
}

export function listClientPassTotals(db: Db): LowPassesAlert[] {
  return db
    .prepare<[], LowPassesAlert>(
      `WITH ${SALE_STATS_CTE}
       SELECT c.id AS clientId, c.first_name || ' ' || c.last_name AS clientName,
         SUM(ss.free_passes - ss.used_free) AS remainingFree,
         SUM(ss.teacher_passes - ss.used_teacher) AS remainingTeacher
       FROM clients c
       JOIN sale_stats ss ON ss.client_id = c.id
       WHERE c.archived_at IS NULL
       GROUP BY c.id
       ORDER BY remainingFree + remainingTeacher, c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
    )
    .all();
}
```

Mover los dos `import` nuevos al principio del archivo, junto a los existentes.

`src/main/repos/payouts.ts`:

```ts
import type { PaymentMethod, TeacherPayout, TeacherShare } from '../../shared/types';
import type { Db } from '../db/connection';

export interface NewPayout {
  teacherId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  note: string | null;
}

export interface BalanceRow {
  teacherId: number;
  teacherName: string;
  earnedCents: number;
  paidOutCents: number;
}

const PAYOUT_COLUMNS = `id, teacher_id AS teacherId, paid_at AS paidAt, amount_cents AS amountCents, method, note,
  voided_at AS voidedAt`;

const BALANCE_SELECT = `SELECT t.id AS teacherId, t.first_name || ' ' || t.last_name AS teacherName,
    COALESCE((SELECT SUM(p.teacher_cents) FROM payments p JOIN sales s ON s.id = p.sale_id
              WHERE s.teacher_id = t.id AND p.voided_at IS NULL), 0) AS earnedCents,
    COALESCE((SELECT SUM(tp.amount_cents) FROM teacher_payouts tp
              WHERE tp.teacher_id = t.id AND tp.voided_at IS NULL), 0) AS paidOutCents
  FROM teachers t`;

export function insertPayout(db: Db, payout: NewPayout): number {
  const result = db
    .prepare(
      `INSERT INTO teacher_payouts (teacher_id, paid_at, amount_cents, method, note)
       VALUES (@teacherId, @paidAt, @amountCents, @method, @note)`,
    )
    .run({
      teacherId: payout.teacherId,
      paidAt: payout.paidAt,
      amountCents: payout.amountCents,
      method: payout.method,
      note: payout.note,
    });
  return Number(result.lastInsertRowid);
}

export function findPayout(db: Db, id: number): TeacherPayout | undefined {
  return db.prepare<[number], TeacherPayout>(`SELECT ${PAYOUT_COLUMNS} FROM teacher_payouts WHERE id = ?`).get(id);
}

export function listPayoutsForTeacher(db: Db, teacherId: number): TeacherPayout[] {
  return db
    .prepare<[number], TeacherPayout>(
      `SELECT ${PAYOUT_COLUMNS} FROM teacher_payouts WHERE teacher_id = ? ORDER BY paid_at DESC, id DESC`,
    )
    .all(teacherId);
}

export function voidPayout(db: Db, id: number, now: string): void {
  db.prepare('UPDATE teacher_payouts SET voided_at = ? WHERE id = ?').run(now, id);
}

export function listBalanceRows(db: Db): BalanceRow[] {
  return db
    .prepare<[], BalanceRow>(`${BALANCE_SELECT} ORDER BY t.last_name COLLATE NOCASE, t.first_name COLLATE NOCASE`)
    .all();
}

export function findBalanceRow(db: Db, teacherId: number): BalanceRow | undefined {
  return db.prepare<[number], BalanceRow>(`${BALANCE_SELECT} WHERE t.id = ?`).get(teacherId);
}

export function listTeacherShares(db: Db, teacherId: number): TeacherShare[] {
  return db
    .prepare<[number], TeacherShare>(
      `SELECT p.id AS paymentId, s.id AS saleId, p.paid_at AS paidAt,
         c.first_name || ' ' || c.last_name AS clientName, s.plan_name AS planName, p.teacher_cents AS teacherCents
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
       JOIN clients c ON c.id = s.client_id
       WHERE s.teacher_id = ? AND p.voided_at IS NULL AND p.teacher_cents > 0
       ORDER BY p.paid_at DESC, p.id DESC`,
    )
    .all(teacherId);
}
```

- [ ] **Step 4: Implementar los services**

`src/main/services/payouts.ts`:

```ts
import { DomainError } from '../../domain/errors';
import { assertPayoutFits, teacherBalance } from '../../domain/ledger';
import type { PayoutInput } from '../../shared/schemas';
import type { TeacherAccount, TeacherBalance, TeacherPayout } from '../../shared/types';
import { type Context, nowIso } from '../context';
import * as repo from '../repos/payouts';
import { getTeacher } from './teachers';

function toBalance(row: repo.BalanceRow): TeacherBalance {
  return { ...row, balanceCents: teacherBalance(row.earnedCents, row.paidOutCents) };
}

function getBalance(ctx: Context, teacherId: number): TeacherBalance {
  const row = repo.findBalanceRow(ctx.db, teacherId);
  if (!row) throw new DomainError('NOT_FOUND');
  return toBalance(row);
}

export function listTeacherBalances(ctx: Context): TeacherBalance[] {
  return repo.listBalanceRows(ctx.db).map(toBalance);
}

export function getTeacherAccount(ctx: Context, teacherId: number): TeacherAccount {
  const teacher = getTeacher(ctx, teacherId);
  return {
    ...getBalance(ctx, teacherId),
    teacher,
    payouts: repo.listPayoutsForTeacher(ctx.db, teacherId),
    shares: repo.listTeacherShares(ctx.db, teacherId),
  };
}

export function getPayout(ctx: Context, id: number): TeacherPayout {
  const payout = repo.findPayout(ctx.db, id);
  if (!payout) throw new DomainError('NOT_FOUND');
  return payout;
}

export function registerPayout(ctx: Context, input: PayoutInput): TeacherPayout {
  return ctx.db.transaction(() => {
    assertPayoutFits(getBalance(ctx, input.teacherId).balanceCents, input.amountCents);
    const id = repo.insertPayout(ctx.db, {
      teacherId: input.teacherId,
      paidAt: input.paidAt,
      amountCents: input.amountCents,
      method: input.method,
      note: input.note,
    });
    return getPayout(ctx, id);
  })();
}

export function voidPayout(ctx: Context, id: number): TeacherPayout {
  const payout = getPayout(ctx, id);
  if (payout.voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.voidPayout(ctx.db, id, nowIso(ctx));
  return getPayout(ctx, id);
}
```

`src/main/services/dashboard.ts`:

```ts
import { daysBetween } from '../../domain/dates';
import { isLowOnPasses } from '../../domain/passes';
import type { Dashboard, Debtor } from '../../shared/types';
import { type Context, today } from '../context';
import { listClientPassTotals, listDebtorRows } from '../repos/saleStats';
import { listTeacherBalances } from './payouts';
import { getSettings } from './settings';

const DASHBOARD_DEBTORS = 10;

export function listDebtors(ctx: Context): Debtor[] {
  const now = today(ctx);
  return listDebtorRows(ctx.db).map((row) => ({ ...row, daysSinceSale: daysBetween(row.soldAt, now) }));
}

export function getDashboard(ctx: Context): Dashboard {
  const { lowPassesThreshold } = getSettings(ctx);
  return {
    lowPasses: listClientPassTotals(ctx.db).filter((client) =>
      isLowOnPasses(client.remainingFree + client.remainingTeacher, lowPassesThreshold),
    ),
    debtors: listDebtors(ctx).slice(0, DASHBOARD_DEBTORS),
    teacherBalances: listTeacherBalances(ctx).filter((balance) => balance.balanceCents !== 0),
  };
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- src/main/services`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/repos src/main/services
git commit -m "feat: add teacher ledger, debtors list and counter dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Backup automático, exportación y restauración

**Files:**
- Create: `src/main/backup.ts`, `src/main/db/holder.ts`
- Test: `src/main/backup.test.ts`

**Interfaces:**
- Consumes: `openDatabase`, `Db`, `MIGRATIONS` (Task 6); `DomainError` (Task 2); `createPlan`, `listPlans` (Task 8)
- Produces:
  - `BACKUPS_TO_KEEP = 10`, `writeBackupFile(db: Db, file: string): Promise<void>`, `createBackup(db: Db, dir: string, now: Date, keep?: number): Promise<string>`, `pruneBackups(dir: string, keep: number): Promise<void>`, `validateBackupFile(path: string): void`
  - `class DatabaseHolder { constructor(path: string); get db(): Db; close(): void; restoreFrom(source: string, backupDir: string, now: Date): Promise<void> }`

- [ ] **Step 1: Escribir el test que falla**

`src/main/backup.test.ts`:

```ts
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError, expectDomainErrorAsync } from '../test/helpers';
import { createBackup, validateBackupFile } from './backup';
import type { Context } from './context';
import { openDatabase } from './db/connection';
import { DatabaseHolder } from './db/holder';
import { createPlan, listPlans } from './services/plans';
import { freePlan, TEST_NOW } from './test-context';

describe('backups', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lebloc-backup-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function holderContext(holder: DatabaseHolder): Context {
    return {
      get db() {
        return holder.db;
      },
      clock: { now: () => TEST_NOW },
    };
  }

  it('writes timestamped backups and keeps only the newest ones', async () => {
    const db = openDatabase(':memory:');
    const backups = join(dir, 'backups');
    for (let minute = 0; minute < 4; minute += 1) {
      await createBackup(db, backups, new Date(Date.UTC(2026, 9, 5, 12, minute)), 3);
    }
    const files = (await readdir(backups)).sort();
    expect(files).toHaveLength(3);
    expect(files[0]).toContain('T12-01');
  });

  it('accepts real backups and rejects anything else', async () => {
    const file = await createBackup(openDatabase(':memory:'), dir, TEST_NOW);
    expect(() => validateBackupFile(file)).not.toThrow();

    const bogus = join(dir, 'notas.db');
    await writeFile(bogus, 'esto no es una base de datos');
    expectDomainError(() => validateBackupFile(bogus), 'INVALID_BACKUP');
    expectDomainError(() => validateBackupFile(join(dir, 'no-existe.db')), 'INVALID_BACKUP');
  });

  it('restores a backup after saving a safety copy of the current data', async () => {
    const holder = new DatabaseHolder(join(dir, 'lebloc.db'));
    const ctx = holderContext(holder);
    createPlan(ctx, freePlan);
    const saved = await createBackup(holder.db, join(dir, 'saved'), new Date(Date.UTC(2026, 9, 5, 12)));
    createPlan(ctx, { ...freePlan, name: 'Otro plan' });

    await holder.restoreFrom(saved, join(dir, 'backups'), new Date(Date.UTC(2026, 9, 5, 13)));

    expect(listPlans(ctx, true).map((plan) => plan.name)).toEqual(['Pack 8 libres']);
    expect(await readdir(join(dir, 'backups'))).toHaveLength(1);
    holder.close();
  });

  it('rejects an invalid file and leaves the current database open and intact', async () => {
    const holder = new DatabaseHolder(join(dir, 'lebloc.db'));
    const ctx = holderContext(holder);
    createPlan(ctx, freePlan);
    const bogus = join(dir, 'notas.db');
    await writeFile(bogus, 'esto no es una base de datos');

    await expectDomainErrorAsync(() => holder.restoreFrom(bogus, join(dir, 'backups'), TEST_NOW), 'INVALID_BACKUP');

    expect(listPlans(ctx, true)).toHaveLength(1);
    holder.close();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- src/main/backup.test.ts`
Expected: FAIL; no se pueden resolver `./backup` ni `./db/holder`.

- [ ] **Step 3: Implementar**

`src/main/backup.ts`:

```ts
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { DomainError } from '../domain/errors';
import type { Db } from './db/connection';
import { MIGRATIONS } from './db/migrations';

export const BACKUPS_TO_KEEP = 10;
const BACKUP_FILE = /^lebloc-.+\.db$/;

// The live database runs in WAL mode and the backup copies that flag. Switching the
// copy to rollback journaling makes it a single self-contained file that can be
// opened read-only (validation) or carried on a USB stick.
export async function writeBackupFile(db: Db, file: string): Promise<void> {
  await db.backup(file);
  const copy = new Database(file);
  try {
    copy.pragma('journal_mode = DELETE');
  } finally {
    copy.close();
  }
}

export async function createBackup(db: Db, dir: string, now: Date, keep = BACKUPS_TO_KEEP): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, `lebloc-${now.toISOString().replace(/[:.]/g, '-')}.db`);
  await writeBackupFile(db, file);
  await pruneBackups(dir, keep);
  return file;
}

export async function pruneBackups(dir: string, keep: number): Promise<void> {
  const files = (await readdir(dir)).filter((name) => BACKUP_FILE.test(name)).sort();
  const stale = files.slice(0, Math.max(0, files.length - keep));
  await Promise.all(stale.map((name) => rm(join(dir, name))));
}

export function validateBackupFile(path: string): void {
  let db: Db | undefined;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('integrity_check', { simple: true });
    const version = Number(db.pragma('user_version', { simple: true }));
    const hasSales = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sales'").get();
    if (integrity !== 'ok' || version < 1 || version > MIGRATIONS.length || !hasSales) {
      throw new DomainError('INVALID_BACKUP');
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('INVALID_BACKUP');
  } finally {
    db?.close();
  }
}
```

`src/main/db/holder.ts`:

```ts
import { copyFile, rm } from 'node:fs/promises';
import { createBackup, validateBackupFile } from '../backup';
import { type Db, openDatabase } from './connection';

// Owns the open database so a restore can swap the underlying file.
// Services must read `ctx.db` on every call instead of caching it.
export class DatabaseHolder {
  private readonly path: string;
  private current: Db;

  constructor(path: string) {
    this.path = path;
    this.current = openDatabase(path);
  }

  get db(): Db {
    return this.current;
  }

  close(): void {
    if (this.current.open) this.current.close();
  }

  async restoreFrom(source: string, backupDir: string, now: Date): Promise<void> {
    validateBackupFile(source);
    await createBackup(this.current, backupDir, now);
    this.current.close();
    try {
      await rm(`${this.path}-wal`, { force: true });
      await rm(`${this.path}-shm`, { force: true });
      await copyFile(source, this.path);
    } finally {
      this.current = openDatabase(this.path);
    }
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/main`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/backup.ts src/main/backup.test.ts src/main/db/holder.ts
git commit -m "feat: add rotating backups and validated restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: IPC, preload y proceso principal

**Files:**
- Create: `src/main/ipc/execute.ts`, `src/main/ipc/register.ts`, `src/main/ipc/handlers.ts`
- Modify: `src/main/index.ts` (reemplazo completo), `src/preload/index.ts` (reemplazo completo)
- Test: `src/main/ipc/execute.test.ts`

**Interfaces:**
- Consumes: todos los services (Tasks 7–11), `DatabaseHolder`, `createBackup` (Task 12), `apiSchemas`, `ApiOutputs`, `ApiParsedInput`, `ApiResult`, `ApiError`, `CHANNELS`, `LeblocBridge` (Task 5)
- Produces:
  - `type Handlers = { [C in Channel]: (input: ApiParsedInput<C>) => ApiOutputs[C] | Promise<ApiOutputs[C]> }`
  - `type ErrorLogger = (error: unknown) => void`
  - `toApiError(error: unknown, logError: ErrorLogger): ApiError`
  - `execute<C extends Channel>(channel: C, rawInput: unknown, handlers: Handlers, logError: ErrorLogger): Promise<ApiResult<ApiOutputs[C]>>`
  - `isTrustedSender(frameUrl: string | undefined, devServerUrl: string | undefined): boolean`, `registerIpc(ipcMain: IpcMain, handlers: Handlers, logError: ErrorLogger): void`
  - `interface BackupOps { exportBackup(): Promise<BackupOutcome>; restoreBackup(): Promise<BackupOutcome> }`, `createHandlers(ctx: Context, backup: BackupOps): Handlers`
  - `window.lebloc: LeblocBridge` en el renderer

- [ ] **Step 1: Escribir el test que falla**

`src/main/ipc/execute.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ERROR_MESSAGES } from '../../domain/errors';
import { createTestContext, freePlan } from '../test-context';
import { execute, type Handlers } from './execute';
import { createHandlers, type BackupOps } from './handlers';
import { isTrustedSender } from './register';

const backup: BackupOps = {
  exportBackup: async () => ({ status: 'cancelled' }),
  restoreBackup: async () => ({ status: 'cancelled' }),
};

describe('execute', () => {
  const handlers = createHandlers(createTestContext(), backup);

  it('wraps successful results', async () => {
    const result = await execute('plans:create', freePlan, handlers, vi.fn());
    expect(result).toMatchObject({ success: true, data: { name: 'Pack 8 libres', freePasses: 8 } });
  });

  it('applies schema defaults before calling the handler', async () => {
    const result = await execute('clients:list', {}, handlers, vi.fn());
    expect(result).toEqual({ success: true, data: [] });
  });

  it('returns VALIDATION_ERROR with field details for invalid input', async () => {
    const result = await execute('plans:create', { ...freePlan, name: '' }, handlers, vi.fn());
    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    if (!result.success) {
      expect(result.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'name' })]));
    }
  });

  it('maps domain errors to their code and Spanish message', async () => {
    const result = await execute('payments:void', { id: 999 }, handlers, vi.fn());
    expect(result).toEqual({ success: false, error: { code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND } });
  });

  it('hides unexpected errors from the renderer and logs them', async () => {
    const logError = vi.fn();
    const failing: Handlers = {
      ...handlers,
      'plans:list': () => {
        throw new Error('SQLITE_CORRUPT: secret internal detail');
      },
    };
    const result = await execute('plans:list', {}, failing, logError);
    expect(result).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe('isTrustedSender', () => {
  it('trusts only the bundled renderer or the dev server', () => {
    expect(isTrustedSender('file:///opt/lebloc/out/renderer/index.html', undefined)).toBe(true);
    expect(isTrustedSender('https://evil.example', undefined)).toBe(false);
    expect(isTrustedSender('http://localhost:5173/#/clientes', 'http://localhost:5173')).toBe(true);
    expect(isTrustedSender('file:///tmp/x.html', 'http://localhost:5173')).toBe(false);
    expect(isTrustedSender(undefined, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- src/main/ipc`
Expected: FAIL; no se pueden resolver `./execute`, `./handlers` ni `./register`.

- [ ] **Step 3: Implementar `execute.ts` y `register.ts`**

`src/main/ipc/execute.ts`:

```ts
import { ZodError } from 'zod';
import { DomainError } from '../../domain/errors';
import { apiSchemas, type ApiError, type ApiOutputs, type ApiParsedInput, type ApiResult } from '../../shared/api';
import type { Channel } from '../../shared/channels';

export type Handlers = {
  [C in Channel]: (input: ApiParsedInput<C>) => ApiOutputs[C] | Promise<ApiOutputs[C]>;
};

export type ErrorLogger = (error: unknown) => void;

const INTERNAL_ERROR: ApiError = {
  code: 'INTERNAL_ERROR',
  message: 'Ocurrió un error inesperado. Si se repite, revisá el log de la aplicación.',
};

export function toApiError(error: unknown, logError: ErrorLogger): ApiError {
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Hay datos inválidos en el formulario.',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  logError(error);
  return INTERNAL_ERROR;
}

export async function execute<C extends Channel>(
  channel: C,
  rawInput: unknown,
  handlers: Handlers,
  logError: ErrorLogger,
): Promise<ApiResult<ApiOutputs[C]>> {
  try {
    const input = apiSchemas[channel].parse(rawInput);
    // The mapped Handlers type ties each channel to its handler; TypeScript cannot
    // correlate the generic channel with the union of handlers, hence the cast.
    const handler = handlers[channel] as (input: unknown) => ApiOutputs[C] | Promise<ApiOutputs[C]>;
    return { success: true, data: await handler(input) };
  } catch (error) {
    return { success: false, error: toApiError(error, logError) };
  }
}
```

`src/main/ipc/register.ts`:

```ts
import type { IpcMain } from 'electron';
import type { ApiResult } from '../../shared/api';
import { CHANNELS } from '../../shared/channels';
import { type ErrorLogger, execute, type Handlers } from './execute';

const FORBIDDEN: ApiResult<never> = {
  success: false,
  error: { code: 'FORBIDDEN', message: 'Origen no permitido.' },
};

export function isTrustedSender(frameUrl: string | undefined, devServerUrl: string | undefined): boolean {
  if (!frameUrl) return false;
  return devServerUrl ? frameUrl.startsWith(devServerUrl) : frameUrl.startsWith('file://');
}

export function registerIpc(ipcMain: IpcMain, handlers: Handlers, logError: ErrorLogger): void {
  for (const channel of CHANNELS) {
    ipcMain.handle(channel, (event, rawInput: unknown) =>
      isTrustedSender(event.senderFrame?.url, process.env.ELECTRON_RENDERER_URL)
        ? execute(channel, rawInput, handlers, logError)
        : FORBIDDEN,
    );
  }
}
```

- [ ] **Step 4: Implementar `handlers.ts`**

`src/main/ipc/handlers.ts`:

```ts
import type { BackupOutcome } from '../../shared/types';
import type { Context } from '../context';
import { getClientAccount } from '../services/account';
import {
  anonymizeClient,
  archiveClient,
  createClient,
  getClient,
  listClients,
  unarchiveClient,
  updateClient,
} from '../services/clients';
import { consume, voidConsumption } from '../services/consumptions';
import { getDashboard, listDebtors } from '../services/dashboard';
import { registerPayment, voidPayment } from '../services/payments';
import { getTeacherAccount, registerPayout, voidPayout } from '../services/payouts';
import { createPlan, listPlans, updatePlan } from '../services/plans';
import { sellPlan, voidSale } from '../services/sales';
import { getSettings, updateSettings } from '../services/settings';
import { createTeacher, getTeacher, listTeachers, updateTeacher } from '../services/teachers';
import type { Handlers } from './execute';

export interface BackupOps {
  exportBackup(): Promise<BackupOutcome>;
  restoreBackup(): Promise<BackupOutcome>;
}

export function createHandlers(ctx: Context, backup: BackupOps): Handlers {
  return {
    'clients:list': (input) => listClients(ctx, input),
    'clients:get': ({ id }) => getClient(ctx, id),
    'clients:create': (input) => createClient(ctx, input),
    'clients:update': (input) => updateClient(ctx, input),
    'clients:archive': ({ id }) => archiveClient(ctx, id),
    'clients:unarchive': ({ id }) => unarchiveClient(ctx, id),
    'clients:anonymize': ({ id }) => anonymizeClient(ctx, id),
    'clients:account': ({ id }) => getClientAccount(ctx, id),
    'teachers:list': ({ includeInactive }) => listTeachers(ctx, includeInactive),
    'teachers:get': ({ id }) => getTeacher(ctx, id),
    'teachers:create': (input) => createTeacher(ctx, input),
    'teachers:update': (input) => updateTeacher(ctx, input),
    'teachers:account': ({ id }) => getTeacherAccount(ctx, id),
    'plans:list': ({ includeInactive }) => listPlans(ctx, includeInactive),
    'plans:create': (input) => createPlan(ctx, input),
    'plans:update': (input) => updatePlan(ctx, input),
    'sales:create': (input) => sellPlan(ctx, input),
    'sales:void': ({ id }) => voidSale(ctx, id),
    'payments:create': (input) => registerPayment(ctx, input),
    'payments:void': ({ id }) => voidPayment(ctx, id),
    'consumptions:create': (input) => consume(ctx, input),
    'consumptions:void': ({ id }) => voidConsumption(ctx, id),
    'payouts:create': (input) => registerPayout(ctx, input),
    'payouts:void': ({ id }) => voidPayout(ctx, id),
    'debtors:list': () => listDebtors(ctx),
    'dashboard:get': () => getDashboard(ctx),
    'settings:get': () => getSettings(ctx),
    'settings:update': (input) => updateSettings(ctx, input),
    'backup:export': () => backup.exportBackup(),
    'backup:restore': () => backup.restoreBackup(),
  };
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- src/main/ipc`
Expected: PASS.

- [ ] **Step 6: Reemplazar el preload y el proceso principal**

`src/preload/index.ts` (solo importa tipos de `shared/api`, así el preload sandboxed no incluye Zod):

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { LeblocBridge } from '../shared/api';
import { CHANNELS } from '../shared/channels';

const allowed = new Set<string>(CHANNELS);

const bridge: LeblocBridge = {
  invoke: (channel, input) => {
    if (!allowed.has(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`));
    return ipcRenderer.invoke(channel, input);
  },
};

contextBridge.exposeInMainWorld('lebloc', bridge);
```

`src/main/index.ts`:

```ts
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import log from 'electron-log/main';
import { toIsoDate } from '../domain/dates';
import { createBackup, writeBackupFile } from './backup';
import { type Context, systemClock } from './context';
import { DatabaseHolder } from './db/holder';
import { type BackupOps, createHandlers } from './ipc/handlers';
import { registerIpc } from './ipc/register';

// E2E tests point userData at a temp dir so they never touch real data.
if (process.env.LEBLOC_USER_DATA) app.setPath('userData', process.env.LEBLOC_USER_DATA);

const BACKUP_FILTERS = [{ name: 'Base de datos de Lebloc', extensions: ['db'] }];

function isAppUrl(url: string): boolean {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  return devUrl ? url.startsWith(devUrl) : url.startsWith('file://');
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Lebloc',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  return win;
}

function createBackupOps(holder: DatabaseHolder, backupDir: string): BackupOps {
  return {
    async exportBackup() {
      const result = await dialog.showSaveDialog({
        title: 'Exportar backup',
        defaultPath: `lebloc-${toIsoDate(new Date())}.db`,
        filters: BACKUP_FILTERS,
      });
      if (result.canceled || !result.filePath) return { status: 'cancelled' };
      await writeBackupFile(holder.db, result.filePath);
      return { status: 'done', path: result.filePath };
    },
    async restoreBackup() {
      const result = await dialog.showOpenDialog({
        title: 'Restaurar backup',
        properties: ['openFile'],
        filters: BACKUP_FILTERS,
      });
      const [source] = result.filePaths;
      if (result.canceled || !source) return { status: 'cancelled' };
      await holder.restoreFrom(source, backupDir, new Date());
      return { status: 'done', path: source };
    },
  };
}

async function start(): Promise<void> {
  const userData = app.getPath('userData');
  const backupDir = join(userData, 'backups');
  const holder = new DatabaseHolder(join(userData, 'lebloc.db'));
  await createBackup(holder.db, backupDir, new Date());

  const ctx: Context = {
    get db() {
      return holder.db;
    },
    clock: systemClock,
  };
  registerIpc(ipcMain, createHandlers(ctx, createBackupOps(holder, backupDir)), (error) => log.error(error));
  app.on('before-quit', () => holder.close());
  createWindow();
}

app
  .whenReady()
  .then(start)
  .catch((error: unknown) => {
    log.error(error);
    dialog.showErrorBox('Lebloc no pudo iniciar', 'Revisá el archivo de log de la aplicación.');
    app.quit();
  });

app.on('window-all-closed', () => app.quit());
```

- [ ] **Step 7: Verificar todo y probar la app**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: sin errores; todos los tests pasan.
Run: `npm run dev`, abrir DevTools (Ctrl+Shift+I) y en la consola ejecutar `await window.lebloc.invoke('plans:list', {})`.
Expected: `{ success: true, data: [] }`. En la carpeta `userData` (`~/.config/lebloc/` en Linux) existen `lebloc.db` y `backups/`.

- [ ] **Step 8: Commit**

```bash
git add src/main src/preload
git commit -m "feat: wire validated ipc, sandboxed preload and main process

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

> **Tareas de UI (14–18):** la dirección visual ya está fijada en `src/renderer/styles.css` (tiza, granito y naranja "volt" de las presas; títulos condensados en mayúsculas). No hay que regenerar paleta ni tipografía. Para pulir cada pantalla usar la skill `impeccable`, respetando el código de este plan. Toda pantalla contempla los 4 estados (ideal, carga, error, vacío) mediante `AsyncView`. Lo puramente visual no lleva unit tests: se verifica con `npm run dev` y con el E2E de la Task 19.

### Task 14: Base del renderer — cliente IPC, estados, componentes, layout y ajustes

**Files:**
- Create: `src/renderer/global.d.ts`, `src/renderer/lib/api.ts`, `src/renderer/lib/useAsync.ts`, `src/renderer/lib/format.ts`, `src/renderer/lib/formErrors.ts`, `src/renderer/lib/arrays.ts`
- Create: `src/renderer/components/ui/Button.tsx`, `Field.tsx`, `Dialog.tsx`, `ConfirmDialog.tsx`, `States.tsx`, `Notice.tsx`, `PageHeader.tsx`, `table.ts`
- Create: `src/renderer/components/Layout.tsx`, `src/renderer/routes.tsx`, `src/renderer/pages/SettingsPage.tsx`
- Modify: `src/renderer/main.tsx` (reemplazo completo)
- Test: `src/renderer/lib/lib.test.ts`

**Interfaces:**
- Consumes: `LeblocBridge`, `ApiInput`, `ApiOutputs`, `ApiError` (Task 5); `settingsInput` (Task 5); `formatMoney`, `formatMoneyInput` (Task 5); `ageFrom` (Task 2); `toIsoDate` (Task 2)
- Produces:
  - `call<C extends Channel>(channel: C, input: ApiInput<C>): Promise<ApiOutputs[C]>`, `class ApiCallError extends Error { code: string; details: unknown }`
  - `type AsyncState<T>`, `type AsyncResult<T> = AsyncState<T> & { reload(): void }`, `useAsync<T>(load: () => Promise<T>, deps: DependencyList, options?: { keepPreviousData?: boolean }): AsyncResult<T>`
  - `formatMoney`, `formatMoneyInput`, `formatDate(iso)`, `formatDateTime(iso)`, `todayIso()`, `fullName(person)`, `ageLabel(birthDate | null)`, `PAYMENT_METHOD_LABELS`, `SPLIT_RULE_LABELS`, `PASS_KIND_LABELS`, `WEEKDAY_LABELS`
  - `type FieldErrors`, `MONEY_ERROR`, `toFieldErrors(error: ZodError): FieldErrors`, `errorMessage(error: unknown): string`
  - `replaceAt<T>(items, index, item): T[]`, `removeAt<T>(items, index): T[]`, `sum(values): number`
  - Componentes: `Button`, `ButtonLink`, `TextField`, `MoneyField`, `SelectField`, `CheckboxField`, `Dialog`, `ConfirmDialog` + `ConfirmRequest`, `AsyncView`, `SkeletonRows`, `ErrorState`, `EmptyState`, `Notice` + `NoticeState`, `PageHeader`, `tableClass`
  - `AppRoutes` en `routes.tsx` (las tareas siguientes lo reemplazan completo)

- [ ] **Step 1: Escribir el test que falla**

`src/renderer/lib/lib.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { removeAt, replaceAt, sum } from './arrays';
import { formatDate } from './format';
import { toFieldErrors } from './formErrors';

describe('renderer helpers', () => {
  it('maps zod issues to dotted field paths, keeping the first message per field', () => {
    const schema = z.object({
      name: z.string().min(1, 'Obligatorio'),
      items: z.array(z.object({ end: z.string().min(2, 'Corto') })),
    });
    const result = schema.safeParse({ name: '', items: [{ end: 'a' }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFieldErrors(result.error)).toEqual({ name: 'Obligatorio', 'items.0.end': 'Corto' });
  });

  it('replaces, removes and sums immutably', () => {
    const items = ['a', 'b', 'c'];
    expect(replaceAt(items, 1, 'x')).toEqual(['a', 'x', 'c']);
    expect(removeAt(items, 0)).toEqual(['b', 'c']);
    expect(items).toEqual(['a', 'b', 'c']);
    expect(sum([100, 250, 50])).toBe(400);
  });

  it('formats ISO dates as dd/mm/yyyy', () => {
    expect(formatDate('2026-10-05')).toBe('05/10/2026');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- src/renderer`
Expected: FAIL; no se pueden resolver `./arrays`, `./format` ni `./formErrors`.

- [ ] **Step 3: Implementar las librerías del renderer**

`src/renderer/global.d.ts`:

```ts
import type { LeblocBridge } from '../shared/api';

declare global {
  interface Window {
    lebloc: LeblocBridge;
  }
}

export {};
```

`src/renderer/lib/api.ts`:

```ts
import type { ApiError, ApiInput, ApiOutputs } from '../../shared/api';
import type { Channel } from '../../shared/channels';

export class ApiCallError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiCallError';
    this.code = error.code;
    this.details = error.details;
  }
}

export async function call<C extends Channel>(channel: C, input: ApiInput<C>): Promise<ApiOutputs[C]> {
  const result = await window.lebloc.invoke(channel, input);
  if (!result.success) throw new ApiCallError(result.error);
  return result.data;
}
```

`src/renderer/lib/useAsync.ts`:

```ts
import { type DependencyList, useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'success'; data: T };
export type AsyncResult<T> = AsyncState<T> & { reload: () => void };

export function useAsync<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  options: { keepPreviousData?: boolean } = {},
): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const isReload = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // A reload after an action (or a search keystroke) keeps the current data on
    // screen instead of flashing the skeleton.
    if (!isReload.current && !options.keepPreviousData) setState({ status: 'loading' });
    isReload.current = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ status: 'success', data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is a new closure on every render; callers pass its real inputs in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => {
    isReload.current = true;
    setVersion((current) => current + 1);
  }, []);

  return { ...state, reload };
}
```

`src/renderer/lib/format.ts`:

```ts
import { ageFrom } from '../../domain/client';
import { toIsoDate } from '../../domain/dates';
import type { PassKind } from '../../domain/passes';
import type { SplitRule } from '../../domain/sale';
import type { PaymentMethod } from '../../shared/types';

export { formatMoney, formatMoneyInput } from '../../shared/money';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia' };
export const SPLIT_RULE_LABELS: Record<SplitRule, string> = {
  proportional: 'Proporcional',
  teacher_first: 'Primero el profesor',
  local_first: 'Primero el local',
};
export const PASS_KIND_LABELS: Record<PassKind, string> = { free: 'Libre', teacher: 'Con profesor' };
export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

export function ageLabel(birthDate: string | null): string {
  return birthDate ? `${ageFrom(birthDate, todayIso())} años` : 'Edad sin datos';
}
```

`src/renderer/lib/formErrors.ts`:

```ts
import type { z } from 'zod';

export type FieldErrors = Partial<Record<string, string>>;

export const MONEY_ERROR = 'Ingresá un monto válido, por ejemplo 15.000,50.';

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    errors[key] ??= issue.message;
  }
  return errors;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}
```

`src/renderer/lib/arrays.ts`:

```ts
export function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((current, i) => (i === index ? item : current));
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- src/renderer`
Expected: PASS.

- [ ] **Step 5: Crear los componentes de UI**

`src/renderer/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-volt text-granite hover:brightness-95',
  secondary: 'bg-granite text-chalk hover:bg-granite-soft',
  danger: 'bg-danger text-white hover:brightness-110',
  ghost: 'bg-transparent text-granite underline-offset-4 hover:underline',
};

export function buttonClass(variant: Variant = 'primary'): string {
  return `${BASE} ${VARIANTS[variant]}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...props} />;
}

export function ButtonLink({ variant = 'primary', className = '', ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={`${buttonClass(variant)} ${className}`} {...props} />;
}
```

`src/renderer/components/ui/Field.tsx`:

```tsx
import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from 'react';

const CONTROL =
  'w-full rounded-sm border border-granite/30 bg-white px-3 py-2 text-sm text-granite aria-[invalid=true]:border-danger';

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

function FieldShell({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-granite-soft">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-granite-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, className = '', ...props }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function MoneyField(props: TextFieldProps) {
  return <TextField inputMode="decimal" autoComplete="off" placeholder="0,00" {...props} />;
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & { label: string; error?: string; children: ReactNode };

export function SelectField({ label, error, children, ...props }: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error}>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error)} className={CONTROL} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & { label: string }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" className="h-4 w-4 accent-volt" {...props} />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}
```

`src/renderer/components/ui/Dialog.tsx` (el `<dialog>` nativo da foco atrapado y Escape gratis):

```tsx
import { type ReactNode, useEffect, useId, useRef } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-xl rounded-sm border-t-4 border-volt bg-chalk p-0 text-granite shadow-2xl backdrop:bg-granite/60"
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 id={titleId} className="font-display text-2xl font-bold uppercase">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
```

`src/renderer/components/ui/Notice.tsx`:

```tsx
import type { ReactNode } from 'react';

const TONES = {
  error: 'border-danger',
  success: 'border-moss',
  warning: 'border-ochre',
  info: 'border-granite',
} as const;

export type NoticeTone = keyof typeof TONES;
export interface NoticeState {
  tone: NoticeTone;
  text: string;
}

export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`border-l-4 bg-white px-4 py-3 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  );
}
```

`src/renderer/components/ui/ConfirmDialog.tsx`:

```tsx
import { useState } from 'react';
import { errorMessage } from '../../lib/formErrors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Notice } from './Notice';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  action: () => Promise<unknown>;
}

interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  onDone: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ request, onDone, onClose }: ConfirmDialogProps) {
  return (
    <Dialog open={request !== null} title={request?.title ?? ''} onClose={onClose}>
      {request && <ConfirmBody request={request} onDone={onDone} onClose={onClose} />}
    </Dialog>
  );
}

function ConfirmBody({ request, onDone, onClose }: { request: ConfirmRequest; onDone: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await request.action();
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <>
      <p className="text-sm">{request.message}</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
          {request.confirmLabel}
        </Button>
      </div>
    </>
  );
}
```

`src/renderer/components/ui/States.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { AsyncResult } from '../../lib/useAsync';
import { Button } from './Button';

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-sm bg-chalk-deep" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 border-l-4 border-danger bg-white p-5">
      <p className="font-semibold">No pudimos cargar esta sección.</p>
      <p className="text-sm text-granite-soft">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 border-2 border-dashed border-granite/25 p-6">
      <p className="font-display text-xl font-bold uppercase">{title}</p>
      {children}
    </div>
  );
}

interface AsyncViewProps<T> {
  state: AsyncResult<T>;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
}

export function AsyncView<T>({ state, children, isEmpty, empty, skeleton }: AsyncViewProps<T>) {
  if (state.status === 'loading') return <>{skeleton ?? <SkeletonRows />}</>;
  if (state.status === 'error') return <ErrorState message={state.error.message} onRetry={state.reload} />;
  if (empty && isEmpty?.(state.data)) return <>{empty}</>;
  return <>{children(state.data)}</>;
}
```

`src/renderer/components/ui/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-granite pb-4">
      <div>
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-granite-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
```

`src/renderer/components/ui/table.ts`:

```ts
export const tableClass =
  'w-full border-collapse bg-white text-sm [&_td]:border-b [&_td]:border-granite/10 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b-2 [&_th]:border-granite [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide';
```

- [ ] **Step 6: Crear el layout, las rutas, la página de ajustes y el entry point**

`src/renderer/components/Layout.tsx`:

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { buttonClass } from './ui/Button';

const NAV_ITEMS = [
  { to: '/', label: 'Mostrador', end: true },
  { to: '/clientes', label: 'Clientes', end: false },
  { to: '/deudores', label: 'Deudores', end: false },
  { to: '/planes', label: 'Planes', end: false },
  { to: '/profesores', label: 'Profesores', end: false },
  { to: '/ajustes', label: 'Ajustes', end: false },
];

export function Layout() {
  return (
    <div className="flex h-screen">
      <button
        type="button"
        onClick={() => document.getElementById('contenido')?.focus()}
        className={`${buttonClass('primary')} sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50`}
      >
        Saltar al contenido
      </button>
      <nav aria-label="Principal" className="flex w-56 shrink-0 flex-col bg-granite text-chalk">
        <p className="px-6 pb-8 pt-7 font-display text-3xl font-bold uppercase tracking-tight">
          Le<span className="text-volt">bloc</span>
        </p>
        <ul className="flex flex-col">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block border-l-4 px-5 py-3 font-display text-lg uppercase tracking-wide transition ${
                    isActive ? 'border-volt bg-granite-soft text-chalk' : 'border-transparent text-chalk/75 hover:bg-granite-soft hover:text-chalk'
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="contenido" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
```

`src/renderer/routes.tsx` (versión de esta tarea; se reemplaza en las Tasks 15–18):

```tsx
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui/States';
import { SettingsPage } from './pages/SettingsPage';

function NotFoundPage() {
  return (
    <section className="p-8">
      <EmptyState title="Página no encontrada">
        <Link className="underline" to="/">
          Volver al mostrador
        </Link>
      </EmptyState>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/ajustes" replace />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

`src/renderer/pages/SettingsPage.tsx`:

```tsx
import { type FormEvent, useState } from 'react';
import { settingsInput } from '../../shared/schemas';
import { Button } from '../components/ui/Button';
import { type ConfirmRequest, ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
import { call } from '../lib/api';
import { errorMessage, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

export function SettingsPage() {
  const settings = useAsync(() => call('settings:get', {}), []);
  return (
    <section className="max-w-3xl p-8">
      <PageHeader title="Ajustes" />
      <div className="flex flex-col gap-8">
        <AsyncView state={settings}>{(data) => <ThresholdForm initial={data.lowPassesThreshold} />}</AsyncView>
        <BackupPanel />
      </div>
    </section>
  );
}

function ThresholdForm({ initial }: { initial: number }) {
  const [value, setValue] = useState(String(initial));
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = settingsInput.safeParse({ lowPassesThreshold: Number(value) });
    if (!parsed.success) {
      setError(toFieldErrors(parsed.error).lowPassesThreshold);
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await call('settings:update', parsed.data);
      setNotice({ tone: 'success', text: 'Ajuste guardado.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 bg-white p-6">
      <h2 className="font-display text-2xl font-bold uppercase">Aviso de pocos pases</h2>
      <TextField
        label="Avisar cuando queden pases"
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error}
        hint="Se avisa cuando a un cliente le quedan esta cantidad de pases o menos."
      />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div>
        <Button type="submit" disabled={busy}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

function BackupPanel() {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreRequest, setRestoreRequest] = useState<ConfirmRequest | null>(null);

  async function exportBackup() {
    setBusy(true);
    try {
      const outcome = await call('backup:export', {});
      if (outcome.status === 'done') setNotice({ tone: 'success', text: `Backup guardado en ${outcome.path}` });
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    const outcome = await call('backup:restore', {});
    if (outcome.status === 'done') window.location.reload();
  }

  return (
    <div className="flex flex-col gap-4 bg-white p-6">
      <h2 className="font-display text-2xl font-bold uppercase">Backup</h2>
      <p className="text-sm text-granite-soft">
        Cada vez que se abre la app se guarda un backup automático (se conservan los últimos 10). Exportá una copia a un
        pendrive con regularidad: si la PC se rompe, es la única forma de recuperar los datos.
      </p>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void exportBackup()}>
          Exportar backup
        </Button>
        <Button
          variant="danger"
          onClick={() =>
            setRestoreRequest({
              title: 'Restaurar backup',
              message:
                'Se reemplazan todos los datos actuales por los del archivo que elijas. Antes se guarda automáticamente una copia de los datos actuales.',
              confirmLabel: 'Elegir archivo y restaurar',
              action: restore,
            })
          }
        >
          Restaurar backup
        </Button>
      </div>
      <ConfirmDialog request={restoreRequest} onDone={() => setRestoreRequest(null)} onClose={() => setRestoreRequest(null)} />
    </div>
  );
}
```

`src/renderer/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AppRoutes } from './routes';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  </StrictMode>,
);
```

- [ ] **Step 7: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sin errores.
Run: `npm run dev`
Expected:
- se abre la página "Ajustes";
- guardar `3` muestra "Ajuste guardado." y el valor se mantiene al recargar con Ctrl+R;
- "Exportar backup" abre el diálogo de guardado del sistema;
- Tab recorre el menú y los campos con el foco visible en naranja.

- [ ] **Step 8: Commit**

```bash
git add src/renderer
git commit -m "feat: add renderer foundation, ui kit with async states and settings page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Pantallas de planes y profesores

**Files:**
- Create: `src/renderer/pages/PlansPage.tsx`, `src/renderer/pages/TeachersPage.tsx`, `src/renderer/pages/TeacherFormPage.tsx`
- Modify: `src/renderer/routes.tsx` (reemplazo completo)

**Interfaces:**
- Consumes: componentes y librerías de la Task 14; `planInput`, `teacherInput` (Task 5); canales `plans:*`, `teachers:list|get|create|update`
- Produces: rutas `/planes`, `/profesores`, `/profesores/nuevo`, `/profesores/:id/editar`. Etiquetas que usa el E2E:
  - plan: "Nuevo plan", "Nombre", "Pases libres", "Pases con profesor", "Precio del local", "Guardar plan";
  - profesor: "Nuevo profesor", "Nombre", "Apellido", "Importe por clase", "Guardar profesor".

- [ ] **Step 1: Crear `PlansPage.tsx`**

```tsx
import { type FormEvent, useState } from 'react';
import { parseMoneyInput } from '../../shared/money';
import { planInput } from '../../shared/schemas';
import type { Plan } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { CheckboxField, MoneyField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { formatMoney, formatMoneyInput } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

export function PlansPage() {
  const plans = useAsync(() => call('plans:list', { includeInactive: true }), []);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  function saved() {
    setEditing(null);
    plans.reload();
  }

  return (
    <section className="p-8">
      <PageHeader
        title="Planes"
        subtitle="Packs de pases sin vencimiento. El recargo del profesor se suma al vender, según el profesor elegido."
        actions={<Button onClick={() => setEditing('new')}>Nuevo plan</Button>}
      />
      <AsyncView
        state={plans}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title="Todavía no hay planes">
            <p className="text-sm">Creá el primero con “Nuevo plan”.</p>
          </EmptyState>
        }
      >
        {(data) => (
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Libres</th>
                <th scope="col">Con profesor</th>
                <th scope="col">Precio del local</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((plan) => (
                <tr key={plan.id} className={plan.active ? '' : 'text-granite-soft'}>
                  <td className="font-semibold">{plan.name}</td>
                  <td>{plan.freePasses}</td>
                  <td>{plan.teacherPasses}</td>
                  <td>{formatMoney(plan.priceCents)}</td>
                  <td>{plan.active ? 'Activo' : 'Inactivo'}</td>
                  <td className="text-right">
                    <Button variant="ghost" aria-label={`Editar ${plan.name}`} onClick={() => setEditing(plan)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncView>
      <Dialog open={editing !== null} title={editing === 'new' ? 'Nuevo plan' : 'Editar plan'} onClose={() => setEditing(null)}>
        {editing !== null && <PlanForm plan={editing === 'new' ? null : editing} onSaved={saved} onCancel={() => setEditing(null)} />}
      </Dialog>
    </section>
  );
}

function PlanForm({ plan, onSaved, onCancel }: { plan: Plan | null; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(plan?.name ?? '');
  const [freePasses, setFreePasses] = useState(String(plan?.freePasses ?? 0));
  const [teacherPasses, setTeacherPasses] = useState(String(plan?.teacherPasses ?? 0));
  const [price, setPrice] = useState(plan ? formatMoneyInput(plan.priceCents) : '');
  const [active, setActive] = useState(plan?.active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const priceCents = parseMoneyInput(price);
    const parsed = planInput.safeParse({
      name,
      freePasses: Number(freePasses),
      teacherPasses: Number(teacherPasses),
      priceCents: priceCents ?? -1,
      active,
    });
    if (!parsed.success || priceCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(priceCents === null ? { priceCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      if (plan) await call('plans:update', { ...parsed.data, id: plan.id });
      else await call('plans:create', parsed.data);
      onSaved();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <TextField label="Nombre" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Pases libres"
          type="number"
          min={0}
          value={freePasses}
          onChange={(event) => setFreePasses(event.target.value)}
          error={errors.freePasses}
        />
        <TextField
          label="Pases con profesor"
          type="number"
          min={0}
          value={teacherPasses}
          onChange={(event) => setTeacherPasses(event.target.value)}
          error={errors.teacherPasses}
        />
      </div>
      <MoneyField
        label="Precio del local"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        error={errors.priceCents}
        hint="Lo que cobra el local. El recargo del profesor se suma al vender."
      />
      <CheckboxField label="Activo" checked={active} onChange={(event) => setActive(event.target.checked)} />
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Guardar plan
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Crear `TeachersPage.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Teacher } from '../../shared/types';
import { ButtonLink } from '../components/ui/Button';
import { CheckboxField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { formatMoney, fullName, WEEKDAY_LABELS } from '../lib/format';
import { useAsync } from '../lib/useAsync';

function scheduleSummary(teacher: Teacher): string {
  if (teacher.schedules.length === 0) return 'Sin horarios';
  return teacher.schedules
    .map((schedule) => `${WEEKDAY_LABELS[schedule.weekday] ?? '?'} ${schedule.startTime}–${schedule.endTime}`)
    .join(' · ');
}

export function TeachersPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const teachers = useAsync(() => call('teachers:list', { includeInactive }), [includeInactive], { keepPreviousData: true });

  return (
    <section className="p-8">
      <PageHeader
        title="Profesores"
        subtitle="Las clases con profesor están tercerizadas: el recargo le corresponde al profesor, no al local."
        actions={<ButtonLink to="/profesores/nuevo">Nuevo profesor</ButtonLink>}
      />
      <div className="mb-4">
        <CheckboxField label="Mostrar inactivos" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
      </div>
      <AsyncView
        state={teachers}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title="Todavía no hay profesores">
            <p className="text-sm">Cargá uno con “Nuevo profesor”.</p>
          </EmptyState>
        }
      >
        {(data) => (
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col">Profesor</th>
                <th scope="col">Importe por clase</th>
                <th scope="col">Horarios</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((teacher) => (
                <tr key={teacher.id}>
                  <td>
                    <Link className="font-semibold underline-offset-4 hover:underline" to={`/profesores/${teacher.id}`}>
                      {fullName(teacher)}
                    </Link>
                  </td>
                  <td>{formatMoney(teacher.classRateCents)}</td>
                  <td className="text-granite-soft">{scheduleSummary(teacher)}</td>
                  <td>{teacher.active ? 'Activo' : 'Inactivo'}</td>
                  <td className="text-right">
                    <ButtonLink variant="ghost" to={`/profesores/${teacher.id}/editar`} aria-label={`Editar ${fullName(teacher)}`}>
                      Editar
                    </ButtonLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncView>
    </section>
  );
}
```

- [ ] **Step 3: Crear `TeacherFormPage.tsx`**

```tsx
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { parseMoneyInput } from '../../shared/money';
import { teacherInput } from '../../shared/schemas';
import type { Social, Teacher } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { CheckboxField, MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
import { call } from '../lib/api';
import { removeAt, replaceAt } from '../lib/arrays';
import { formatMoneyInput, WEEKDAY_LABELS } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

interface ScheduleDraft {
  weekday: string;
  startTime: string;
  endTime: string;
}

export function TeacherFormPage() {
  const { id } = useParams();
  const teacherId = id ? Number(id) : null;
  const teacher = useAsync(() => (teacherId ? call('teachers:get', { id: teacherId }) : Promise.resolve(null)), [teacherId]);
  return (
    <section className="max-w-4xl p-8">
      <PageHeader title={teacherId ? 'Editar profesor' : 'Nuevo profesor'} />
      <AsyncView state={teacher}>{(data) => <TeacherForm teacher={data} />}</AsyncView>
    </section>
  );
}

function TeacherForm({ teacher }: { teacher: Teacher | null }) {
  const navigate = useNavigate();
  const [fields, setFields] = useState({
    firstName: teacher?.firstName ?? '',
    lastName: teacher?.lastName ?? '',
    address: teacher?.address ?? '',
    phone: teacher?.phone ?? '',
    rate: teacher ? formatMoneyInput(teacher.classRateCents) : '',
  });
  const [active, setActive] = useState(teacher?.active ?? true);
  const [socials, setSocials] = useState<Social[]>(teacher?.socials ?? []);
  const [schedules, setSchedules] = useState<ScheduleDraft[]>(
    teacher?.schedules.map((s) => ({ weekday: String(s.weekday), startTime: s.startTime, endTime: s.endTime })) ?? [],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function bind(name: keyof typeof fields) {
    return {
      value: fields[name],
      onChange: (event: ChangeEvent<HTMLInputElement>) => setFields((previous) => ({ ...previous, [name]: event.target.value })),
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const classRateCents = parseMoneyInput(fields.rate);
    const parsed = teacherInput.safeParse({
      firstName: fields.firstName,
      lastName: fields.lastName,
      address: fields.address,
      phone: fields.phone,
      socials,
      classRateCents: classRateCents ?? -1,
      active,
      schedules: schedules.map((s) => ({ weekday: Number(s.weekday), startTime: s.startTime, endTime: s.endTime })),
    });
    if (!parsed.success || classRateCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(classRateCents === null ? { classRateCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      const saved = teacher
        ? await call('teachers:update', { ...parsed.data, id: teacher.id })
        : await call('teachers:create', parsed.data);
      navigate(`/profesores/${saved.id}`);
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
      <fieldset className="bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Datos</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nombre" {...bind('firstName')} error={errors.firstName} />
          <TextField label="Apellido" {...bind('lastName')} error={errors.lastName} />
          <TextField label="Dirección" {...bind('address')} error={errors.address} />
          <TextField label="Teléfono" type="tel" {...bind('phone')} error={errors.phone} />
          <MoneyField label="Importe por clase" {...bind('rate')} error={errors.classRateCents} hint="Se usa para calcular el recargo al vender." />
          <div className="flex items-end">
            <CheckboxField label="Activo" checked={active} onChange={(event) => setActive(event.target.checked)} />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Días y horarios</legend>
        {schedules.map((schedule, index) => {
          const n = index + 1;
          return (
            <div key={index} className="grid items-end gap-3 md:grid-cols-4">
              <SelectField
                label={`Día ${n}`}
                value={schedule.weekday}
                onChange={(event) => setSchedules((prev) => replaceAt(prev, index, { ...schedule, weekday: event.target.value }))}
              >
                {WEEKDAY_LABELS.map((label, weekday) => (
                  <option key={label} value={weekday}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={`Desde ${n}`}
                type="time"
                value={schedule.startTime}
                onChange={(event) => setSchedules((prev) => replaceAt(prev, index, { ...schedule, startTime: event.target.value }))}
                error={errors[`schedules.${index}.startTime`]}
              />
              <TextField
                label={`Hasta ${n}`}
                type="time"
                value={schedule.endTime}
                onChange={(event) => setSchedules((prev) => replaceAt(prev, index, { ...schedule, endTime: event.target.value }))}
                error={errors[`schedules.${index}.endTime`]}
              />
              <Button variant="ghost" onClick={() => setSchedules((prev) => removeAt(prev, index))}>
                Quitar horario {n}
              </Button>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" onClick={() => setSchedules((prev) => [...prev, { weekday: '1', startTime: '18:00', endTime: '20:00' }])}>
            Agregar horario
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Redes sociales</legend>
        {socials.map((social, index) => {
          const n = index + 1;
          return (
            <div key={index} className="grid items-end gap-3 md:grid-cols-3">
              <TextField
                label={`Red ${n}`}
                placeholder="Instagram"
                value={social.network}
                onChange={(event) => setSocials((prev) => replaceAt(prev, index, { ...social, network: event.target.value }))}
                error={errors[`socials.${index}.network`]}
              />
              <TextField
                label={`Usuario ${n}`}
                placeholder="@usuario"
                value={social.handle}
                onChange={(event) => setSocials((prev) => replaceAt(prev, index, { ...social, handle: event.target.value }))}
                error={errors[`socials.${index}.handle`]}
              />
              <Button variant="ghost" onClick={() => setSocials((prev) => removeAt(prev, index))}>
                Quitar red {n}
              </Button>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" onClick={() => setSocials((prev) => [...prev, { network: '', handle: '' }])}>
            Agregar red
          </Button>
        </div>
      </fieldset>

      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Guardar profesor
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Reemplazar `src/renderer/routes.tsx`**

```tsx
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui/States';
import { PlansPage } from './pages/PlansPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeacherFormPage } from './pages/TeacherFormPage';
import { TeachersPage } from './pages/TeachersPage';

function NotFoundPage() {
  return (
    <section className="p-8">
      <EmptyState title="Página no encontrada">
        <Link className="underline" to="/">
          Volver al mostrador
        </Link>
      </EmptyState>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/planes" replace />} />
        <Route path="planes" element={<PlansPage />} />
        <Route path="profesores" element={<TeachersPage />} />
        <Route path="profesores/nuevo" element={<TeacherFormPage />} />
        <Route path="profesores/:id/editar" element={<TeacherFormPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sin errores.
Run: `npm run dev`
Expected:
- crear el plan "Pack 4+4" con 4 libres, 4 con profesor y precio `20.000` lo muestra en la tabla como "$ 20.000,00";
- un plan con 0 y 0 pases muestra "El plan tiene que tener al menos un pase";
- un precio `abc` muestra el error de monto;
- crear un profesor con un horario de 19:00 a 18:00 marca el error en "Hasta 1";
- con datos válidos, guarda y navega a `/profesores/:id`, que todavía muestra "Página no encontrada" porque la ruta llega en la Task 18.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git commit -m "feat: add plans and teachers screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Pantallas de clientes — lista y formulario

**Files:**
- Create: `src/renderer/pages/ClientsPage.tsx`, `src/renderer/pages/ClientFormPage.tsx`
- Modify: `src/renderer/routes.tsx` (reemplazo completo)

**Interfaces:**
- Consumes: Task 14; `clientInput` (Task 5); `isMinor` (Task 2); canales `clients:list|get|create|update`
- Produces: rutas `/clientes`, `/clientes/nuevo`, `/clientes/:id/editar`. Etiquetas que usa el E2E: "Nuevo cliente", "Nombre", "Apellido", "Fecha de nacimiento", "Guardar cliente".

- [ ] **Step 1: Crear `ClientsPage.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/ui/Button';
import { CheckboxField, TextField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { ageLabel, formatMoney, fullName } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const clients = useAsync(() => call('clients:list', { search, includeArchived }), [search, includeArchived], {
    keepPreviousData: true,
  });

  return (
    <section className="p-8">
      <PageHeader title="Clientes" actions={<ButtonLink to="/clientes/nuevo">Nuevo cliente</ButtonLink>} />
      <div className="mb-6 flex flex-wrap items-end gap-6">
        <div className="w-full max-w-md">
          <TextField label="Buscar" type="search" placeholder="Nombre o apellido" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <CheckboxField label="Incluir archivados" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
      </div>
      <AsyncView
        state={clients}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title={search ? 'Sin resultados' : 'Todavía no hay clientes'}>
            <p className="text-sm">{search ? 'Probá con otro nombre o apellido.' : 'Cargá el primero con “Nuevo cliente”.'}</p>
          </EmptyState>
        }
      >
        {(data) => (
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Edad</th>
                <th scope="col">Pases libres</th>
                <th scope="col">Pases con profesor</th>
                <th scope="col">Deuda</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((client) => (
                <tr key={client.id} className={client.archivedAt ? 'text-granite-soft' : ''}>
                  <td>
                    <Link className="font-semibold underline-offset-4 hover:underline" to={`/clientes/${client.id}`}>
                      {fullName(client)}
                    </Link>
                  </td>
                  <td>{ageLabel(client.birthDate)}</td>
                  <td>{client.remainingFree}</td>
                  <td>{client.remainingTeacher}</td>
                  <td className={client.debtCents > 0 ? 'font-semibold text-volt-ink' : ''}>
                    {client.debtCents > 0 ? formatMoney(client.debtCents) : '—'}
                  </td>
                  <td>{client.archivedAt ? 'Archivado' : 'Activo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncView>
    </section>
  );
}
```

- [ ] **Step 2: Crear `ClientFormPage.tsx`**

```tsx
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isMinor } from '../../domain/client';
import { clientInput } from '../../shared/schemas';
import type { Client } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
import { call } from '../lib/api';
import { removeAt, replaceAt } from '../lib/arrays';
import { ageLabel, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_GUARDIAN = { firstName: '', lastName: '', dni: '', phone: '', relation: '' };
type GuardianDraft = typeof EMPTY_GUARDIAN;

const GUARDIAN_FIELDS: { key: keyof GuardianDraft; label: string }[] = [
  { key: 'firstName', label: 'Nombre del tutor' },
  { key: 'lastName', label: 'Apellido del tutor' },
  { key: 'dni', label: 'DNI del tutor' },
  { key: 'phone', label: 'Teléfono del tutor' },
  { key: 'relation', label: 'Vínculo del tutor' },
];

export function ClientFormPage() {
  const { id } = useParams();
  const clientId = id ? Number(id) : null;
  const client = useAsync(() => (clientId ? call('clients:get', { id: clientId }) : Promise.resolve(null)), [clientId]);
  return (
    <section className="max-w-4xl p-8">
      <PageHeader title={clientId ? 'Editar cliente' : 'Nuevo cliente'} />
      <AsyncView state={client}>{(data) => <ClientForm client={data} />}</AsyncView>
    </section>
  );
}

function ClientForm({ client }: { client: Client | null }) {
  const navigate = useNavigate();
  const [fields, setFields] = useState({
    firstName: client?.firstName ?? '',
    lastName: client?.lastName ?? '',
    birthDate: client?.birthDate ?? '',
    enrolledAt: client?.enrolledAt ?? todayIso(),
    address: client?.address ?? '',
    phone: client?.phone ?? '',
    emergencyName: client?.emergencyName ?? '',
    emergencyPhone: client?.emergencyPhone ?? '',
    emergencyRelation: client?.emergencyRelation ?? '',
  });
  const [guardians, setGuardians] = useState<GuardianDraft[]>(
    client?.guardians.map((g) => ({
      firstName: g.firstName,
      lastName: g.lastName,
      dni: g.dni ?? '',
      phone: g.phone ?? '',
      relation: g.relation ?? '',
    })) ?? [],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validBirthDate = ISO_DATE.test(fields.birthDate);
  const minor = validBirthDate && isMinor(fields.birthDate, todayIso());

  function bind(name: keyof typeof fields) {
    return {
      value: fields[name],
      error: errors[name],
      onChange: (event: ChangeEvent<HTMLInputElement>) => setFields((previous) => ({ ...previous, [name]: event.target.value })),
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = clientInput.safeParse({ ...fields, guardians });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      const saved = client
        ? await call('clients:update', { ...parsed.data, id: client.id })
        : await call('clients:create', parsed.data);
      navigate(`/clientes/${saved.id}`);
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
      <fieldset className="bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Datos personales</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nombre" required {...bind('firstName')} />
          <TextField label="Apellido" required {...bind('lastName')} />
          <TextField
            label="Fecha de nacimiento"
            type="date"
            required
            {...bind('birthDate')}
            hint={validBirthDate ? ageLabel(fields.birthDate) : undefined}
          />
          <TextField label="Fecha de inscripción" type="date" required {...bind('enrolledAt')} />
          <TextField label="Dirección" {...bind('address')} />
          <TextField label="Teléfono" type="tel" {...bind('phone')} />
        </div>
      </fieldset>

      <fieldset className="bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Contacto de emergencia</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="Nombre del contacto" {...bind('emergencyName')} />
          <TextField label="Teléfono del contacto" type="tel" {...bind('emergencyPhone')} />
          <TextField label="Vínculo del contacto" {...bind('emergencyRelation')} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Tutores</legend>
        <p className="text-sm text-granite-soft">Obligatorio para menores de 18 años.</p>
        {minor && guardians.length === 0 && <Notice tone="warning">Es menor de edad: cargá al menos un tutor.</Notice>}
        {guardians.map((guardian, index) => {
          const n = index + 1;
          return (
            <div key={index} className="grid items-end gap-3 border-t border-granite/15 pt-4 md:grid-cols-3">
              {GUARDIAN_FIELDS.map(({ key, label }) => (
                <TextField
                  key={key}
                  label={`${label} ${n}`}
                  value={guardian[key]}
                  error={errors[`guardians.${index}.${key}`]}
                  onChange={(event) => setGuardians((prev) => replaceAt(prev, index, { ...guardian, [key]: event.target.value }))}
                />
              ))}
              <Button variant="ghost" onClick={() => setGuardians((prev) => removeAt(prev, index))}>
                Quitar tutor {n}
              </Button>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" onClick={() => setGuardians((prev) => [...prev, { ...EMPTY_GUARDIAN }])}>
            Agregar tutor
          </Button>
        </div>
      </fieldset>

      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Guardar cliente
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Reemplazar `src/renderer/routes.tsx`**

Es igual a la versión de la Task 15, con estos cambios:
- se agregan los imports `ClientsPage` y `ClientFormPage`;
- la ruta índice redirige a `/clientes`;
- se agregan las rutas `clientes`, `clientes/nuevo` y `clientes/:id/editar`.

```tsx
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui/States';
import { ClientFormPage } from './pages/ClientFormPage';
import { ClientsPage } from './pages/ClientsPage';
import { PlansPage } from './pages/PlansPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeacherFormPage } from './pages/TeacherFormPage';
import { TeachersPage } from './pages/TeachersPage';

function NotFoundPage() {
  return (
    <section className="p-8">
      <EmptyState title="Página no encontrada">
        <Link className="underline" to="/">
          Volver al mostrador
        </Link>
      </EmptyState>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/clientes" replace />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/nuevo" element={<ClientFormPage />} />
        <Route path="clientes/:id/editar" element={<ClientFormPage />} />
        <Route path="planes" element={<PlansPage />} />
        <Route path="profesores" element={<TeachersPage />} />
        <Route path="profesores/nuevo" element={<TeacherFormPage />} />
        <Route path="profesores/:id/editar" element={<TeacherFormPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sin errores.
Run: `npm run dev`
Expected:
- con fecha de nacimiento 2015-01-01 y sin tutores aparece el aviso; al guardar, el servidor responde "Un cliente menor de edad necesita al menos un tutor.";
- con un tutor cargado, guarda;
- la lista busca mientras se escribe, sin parpadear el skeleton;
- "Incluir archivados" funciona.

- [ ] **Step 5: Commit**

```bash
git add src/renderer
git commit -m "feat: add clients list and form with guardian requirement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Ficha del cliente — venta, pagos, consumos y anulaciones

**Files:**
- Create: `src/renderer/pages/ClientDetailPage.tsx`, `src/renderer/pages/SellPlanForm.tsx`, `src/renderer/pages/PaymentForm.tsx`
- Modify: `src/renderer/routes.tsx` (reemplazo completo)

**Interfaces:**
- Consumes: Task 14; `buildSaleSnapshot`, `SPLIT_RULES`, `SaleSnapshot`, `SplitRule` (Task 3); `allocatePayment` (Task 3); `saleInput`, `paymentInput` (Task 5); canales `clients:account|archive|unarchive|anonymize`, `sales:create|void`, `payments:create|void`, `consumptions:create|void`, `plans:list`, `teachers:list`
- Produces: ruta `/clientes/:id`. Textos que usa el E2E:
  - acciones: "Vender plan", "Plan", "Profesor", "Registrar pago inicial", "Monto del pago", "Confirmar venta", "Consumir con profesor";
  - estado: "Con profesor restantes: N", "Deuda: $ …", "Saldada";
  - pagos: "Registrar pago", "Monto", "Confirmar pago", "Anular último pago", "Anular pago".

- [ ] **Step 1: Crear `SellPlanForm.tsx`**

```tsx
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildSaleSnapshot, SPLIT_RULES, type SaleSnapshot, type SplitRule } from '../../domain/sale';
import { parseMoneyInput } from '../../shared/money';
import { saleInput } from '../../shared/schemas';
import type { PaymentMethod, Plan, Teacher } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { CheckboxField, MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { AsyncView, EmptyState } from '../components/ui/States';
import { call } from '../lib/api';
import { formatMoney, fullName, SPLIT_RULE_LABELS, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

interface SellPlanFormProps {
  clientId: number;
  onDone: () => void;
  onCancel: () => void;
}

export function SellPlanForm({ clientId, onDone, onCancel }: SellPlanFormProps) {
  const options = useAsync(async () => {
    const [plans, teachers] = await Promise.all([call('plans:list', {}), call('teachers:list', {})]);
    return { plans, teachers };
  }, []);
  return (
    <AsyncView
      state={options}
      isEmpty={(data) => data.plans.length === 0}
      empty={
        <EmptyState title="No hay planes activos">
          <Link className="underline" to="/planes">
            Crear un plan
          </Link>
        </EmptyState>
      }
    >
      {(data) => <SellPlanFields plans={data.plans} teachers={data.teachers} clientId={clientId} onDone={onDone} onCancel={onCancel} />}
    </AsyncView>
  );
}

type Preview = { snapshot: SaleSnapshot } | { error: string } | null;

function previewSale(plan: Plan | undefined, teacher: Teacher | null, splitRule: SplitRule): Preview {
  if (!plan) return null;
  try {
    return { snapshot: buildSaleSnapshot(plan, teacher, splitRule) };
  } catch (caught) {
    return { error: errorMessage(caught) };
  }
}

function SaleBreakdown({ snapshot }: { snapshot: SaleSnapshot }) {
  return (
    <dl className="grid grid-cols-3 gap-3 border-y border-granite/15 py-3 text-sm">
      <div>
        <dt className="text-granite-soft">Parte del local</dt>
        <dd>{formatMoney(snapshot.localPriceCents)}</dd>
      </div>
      <div>
        <dt className="text-granite-soft">Recargo del profesor</dt>
        <dd>
          {snapshot.teacherPasses} × {formatMoney(snapshot.teacherRateCents)} = {formatMoney(snapshot.teacherSurchargeCents)}
        </dd>
      </div>
      <div>
        <dt className="text-granite-soft">Total</dt>
        <dd className="font-display text-2xl">{formatMoney(snapshot.totalCents)}</dd>
      </div>
    </dl>
  );
}

function SellPlanFields({ plans, teachers, clientId, onDone, onCancel }: SellPlanFormProps & { plans: Plan[]; teachers: Teacher[] }) {
  const [planId, setPlanId] = useState(String(plans[0]?.id ?? ''));
  const [teacherId, setTeacherId] = useState('');
  const [splitRule, setSplitRule] = useState<SplitRule>('proportional');
  const [soldAt, setSoldAt] = useState(todayIso());
  const [withPayment, setWithPayment] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plan = plans.find((candidate) => candidate.id === Number(planId));
  const needsTeacher = (plan?.teacherPasses ?? 0) > 0;
  const teacher = needsTeacher ? (teachers.find((candidate) => candidate.id === Number(teacherId)) ?? null) : null;
  const preview = previewSale(plan, teacher, splitRule);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = withPayment ? parseMoneyInput(amount) : null;
    const invalidAmount = withPayment && amountCents === null;
    const parsed = saleInput.safeParse({
      clientId,
      planId: Number(planId),
      teacherId: teacher?.id ?? null,
      splitRule: needsTeacher ? splitRule : 'proportional',
      soldAt,
      initialPayment: withPayment ? { amountCents: amountCents ?? -1, method, paidAt } : null,
    });
    if (!parsed.success || invalidAmount) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(invalidAmount ? { 'initialPayment.amountCents': MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      await call('sales:create', parsed.data);
      onDone();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <SelectField label="Plan" value={planId} onChange={(event) => setPlanId(event.target.value)} error={errors.planId}>
        {plans.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </SelectField>

      {needsTeacher && (
        <>
          <SelectField label="Profesor" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
            <option value="">Elegí un profesor</option>
            {teachers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {fullName(candidate)}
              </option>
            ))}
          </SelectField>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-granite-soft">Reparto de pagos</legend>
            {SPLIT_RULES.map((rule) => (
              <label key={rule} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="splitRule"
                  value={rule}
                  checked={splitRule === rule}
                  onChange={() => setSplitRule(rule)}
                  className="accent-volt"
                />
                {SPLIT_RULE_LABELS[rule]}
              </label>
            ))}
          </fieldset>
        </>
      )}

      <TextField label="Fecha de venta" type="date" value={soldAt} onChange={(event) => setSoldAt(event.target.value)} error={errors.soldAt} />

      {preview && ('error' in preview ? <Notice tone="warning">{preview.error}</Notice> : <SaleBreakdown snapshot={preview.snapshot} />)}

      <CheckboxField label="Registrar pago inicial" checked={withPayment} onChange={(event) => setWithPayment(event.target.checked)} />
      {withPayment && (
        <div className="grid gap-3 md:grid-cols-3">
          <MoneyField
            label="Monto del pago"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={errors['initialPayment.amountCents']}
          />
          <SelectField
            label="Medio de pago"
            value={method}
            onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}
          >
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </SelectField>
          <TextField
            label="Fecha del pago"
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            error={errors['initialPayment.paidAt']}
          />
        </div>
      )}

      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy || preview === null || 'error' in preview}>
          Confirmar venta
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Crear `PaymentForm.tsx`**

```tsx
import { type FormEvent, useState } from 'react';
import { allocatePayment } from '../../domain/allocation';
import { parseMoneyInput } from '../../shared/money';
import { paymentInput } from '../../shared/schemas';
import type { Payment, PaymentMethod, Sale } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { call } from '../lib/api';
import { sum } from '../lib/arrays';
import { formatMoney, formatMoneyInput, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';

interface PaymentFormProps {
  sale: Sale;
  payments: Payment[];
  onDone: () => void;
  onCancel: () => void;
}

export function PaymentForm({ sale, payments, onDone, onCancel }: PaymentFormProps) {
  const [amount, setAmount] = useState(formatMoneyInput(sale.debtCents));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountCents = parseMoneyInput(amount);
  const split = splitPreview();

  function splitPreview(): string | null {
    if (amountCents === null || sale.teacherSurchargeCents === 0) return null;
    const active = payments.filter((payment) => !payment.voidedAt);
    try {
      const allocation = allocatePayment({
        totalCents: sale.totalCents,
        surchargeCents: sale.teacherSurchargeCents,
        splitRule: sale.splitRule,
        allocatedLocalCents: sum(active.map((payment) => payment.localCents)),
        allocatedTeacherCents: sum(active.map((payment) => payment.teacherCents)),
        amountCents,
      });
      return `Para el local ${formatMoney(allocation.localCents)} · para ${sale.teacherName ?? 'el profesor'} ${formatMoney(allocation.teacherCents)}`;
    } catch (caught) {
      return errorMessage(caught);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = paymentInput.safeParse({ saleId: sale.id, amountCents: amountCents ?? -1, method, paidAt });
    if (!parsed.success || amountCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(amountCents === null ? { amountCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      await call('payments:create', parsed.data);
      onDone();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <p className="text-sm">
        {sale.planName} · Deuda actual: <strong>{formatMoney(sale.debtCents)}</strong>
      </p>
      <MoneyField label="Monto" value={amount} onChange={(event) => setAmount(event.target.value)} error={errors.amountCents} />
      <SelectField label="Medio de pago" value={method} onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}>
        <option value="cash">Efectivo</option>
        <option value="transfer">Transferencia</option>
      </SelectField>
      <TextField label="Fecha" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} error={errors.paidAt} />
      {split && <p className="text-sm text-granite-soft">{split}</p>}
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Confirmar pago
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Crear `ClientDetailPage.tsx`**

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PassKind } from '../../domain/passes';
import type { Client, ClientAccount, Consumption, Payment, Sale } from '../../shared/types';
import { Button, ButtonLink } from '../components/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState, SkeletonRows } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import {
  ageLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  fullName,
  PASS_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  SPLIT_RULE_LABELS,
} from '../lib/format';
import { errorMessage } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';
import { PaymentForm } from './PaymentForm';
import { SellPlanForm } from './SellPlanForm';

export function ClientDetailPage() {
  const clientId = Number(useParams().id);
  const account = useAsync(() => call('clients:account', { id: clientId }), [clientId]);
  return (
    <section className="p-8">
      <AsyncView state={account} skeleton={<SkeletonRows rows={8} />}>
        {(data) => <ClientAccountView account={data} reload={account.reload} />}
      </AsyncView>
    </section>
  );
}

function ClientAccountView({ account, reload }: { account: ClientAccount; reload: () => void }) {
  const { client } = account;
  const archived = client.archivedAt !== null;
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [selling, setSelling] = useState(false);
  const [payingSale, setPayingSale] = useState<Sale | null>(null);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setNotice({ tone: 'success', text: success });
      reload();
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    }
  }

  function consume(kind: PassKind) {
    void run(
      () => call('consumptions:create', { clientId: client.id, kind, note: null }),
      `Pase ${PASS_KIND_LABELS[kind].toLowerCase()} registrado.`,
    );
  }

  const headerActions = archived ? (
    !client.anonymizedAt && (
      <>
        <Button variant="secondary" onClick={() => void run(() => call('clients:unarchive', { id: client.id }), 'Cliente desarchivado.')}>
          Desarchivar
        </Button>
        <Button
          variant="danger"
          onClick={() =>
            setPending({
              title: 'Anonimizar cliente',
              message:
                'Se borran para siempre los datos personales y los tutores. Las ventas y los pagos se conservan para no alterar deudas ni saldos de profesores. No se puede deshacer.',
              confirmLabel: 'Anonimizar',
              action: () => call('clients:anonymize', { id: client.id }),
            })
          }
        >
          Anonimizar
        </Button>
      </>
    )
  ) : (
    <>
      <ButtonLink variant="secondary" to={`/clientes/${client.id}/editar`}>
        Editar
      </ButtonLink>
      <Button
        variant="ghost"
        onClick={() =>
          setPending({
            title: 'Archivar cliente',
            message:
              'El cliente deja de aparecer en las listas y no se le pueden vender planes ni marcar pases. Su historial se conserva y se puede desarchivar.',
            confirmLabel: 'Archivar',
            action: () => call('clients:archive', { id: client.id }),
          })
        }
      >
        Archivar
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title={fullName(client)}
        subtitle={`${ageLabel(client.birthDate)}${archived ? ' · Archivado' : ''}`}
        actions={headerActions}
      />
      {notice && (
        <div className="mb-6">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_2fr]">
        <PassesPanel account={account} disabled={archived} onConsume={consume} onSell={() => setSelling(true)} />
        <div className="flex flex-col gap-8">
          <SalesPanel
            sales={account.sales}
            payments={account.payments}
            disabled={archived}
            onPay={setPayingSale}
            onVoidPayment={(payment) =>
              setPending({
                title: 'Anular pago',
                message: `Se anula el pago de ${formatMoney(payment.amountCents)} del ${formatDate(payment.paidAt)} y la deuda vuelve a subir.`,
                confirmLabel: 'Anular pago',
                action: () => call('payments:void', { id: payment.id }),
              })
            }
            onVoidSale={(sale) =>
              setPending({
                title: 'Anular venta',
                message: `Se anula la venta de “${sale.planName}”. Solo es posible si no tiene pagos ni consumos activos.`,
                confirmLabel: 'Anular venta',
                action: () => call('sales:void', { id: sale.id }),
              })
            }
          />
          <ConsumptionsPanel
            consumptions={account.consumptions}
            disabled={archived}
            onVoid={(consumption) =>
              setPending({
                title: 'Anular consumo',
                message: `Se devuelve el pase ${PASS_KIND_LABELS[consumption.kind].toLowerCase()} usado el ${formatDateTime(consumption.consumedAt)}.`,
                confirmLabel: 'Anular consumo',
                action: () => call('consumptions:void', { id: consumption.id }),
              })
            }
          />
          <ClientInfoPanel client={client} />
        </div>
      </div>

      <Dialog open={selling} title="Vender plan" onClose={() => setSelling(false)}>
        <SellPlanForm
          clientId={client.id}
          onDone={() => {
            setSelling(false);
            setNotice({ tone: 'success', text: 'Venta registrada.' });
            reload();
          }}
          onCancel={() => setSelling(false)}
        />
      </Dialog>
      <Dialog open={payingSale !== null} title="Registrar pago" onClose={() => setPayingSale(null)}>
        {payingSale && (
          <PaymentForm
            sale={payingSale}
            payments={account.payments.filter((payment) => payment.saleId === payingSale.id)}
            onDone={() => {
              setPayingSale(null);
              setNotice({ tone: 'success', text: 'Pago registrado.' });
              reload();
            }}
            onCancel={() => setPayingSale(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        request={pending}
        onDone={() => {
          setPending(null);
          reload();
        }}
        onClose={() => setPending(null)}
      />
    </>
  );
}

interface PassesPanelProps {
  account: ClientAccount;
  disabled: boolean;
  onConsume: (kind: PassKind) => void;
  onSell: () => void;
}

function PassesPanel({ account, disabled, onConsume, onSell }: PassesPanelProps) {
  return (
    <section aria-labelledby="pases-title" className="flex flex-col gap-4 self-start bg-granite p-6 text-chalk">
      <h2 id="pases-title" className="font-display text-2xl font-bold uppercase">
        Pases
      </h2>
      <p className="font-display text-6xl leading-none">
        {account.remainingFree + account.remainingTeacher}
        <span className="ml-2 font-sans text-sm uppercase tracking-wide text-chalk/70">disponibles</span>
      </p>
      <div className="flex flex-col gap-1 text-sm">
        <p>Libres restantes: {account.remainingFree}</p>
        <p>Con profesor restantes: {account.remainingTeacher}</p>
      </div>
      {account.lowOnPasses && (
        <p role="status" className="bg-volt px-3 py-2 text-sm font-semibold text-granite">
          Quedan pocos pases: ofrecé renovar el plan.
        </p>
      )}
      {account.debtCents > 0 && <p className="font-semibold text-volt">Deuda total {formatMoney(account.debtCents)}</p>}
      <div className="flex flex-col gap-2">
        <Button disabled={disabled || account.remainingFree <= 0} onClick={() => onConsume('free')}>
          Consumir libre
        </Button>
        <Button disabled={disabled || account.remainingTeacher <= 0} onClick={() => onConsume('teacher')}>
          Consumir con profesor
        </Button>
        <Button variant="secondary" className="border border-chalk/40" disabled={disabled} onClick={onSell}>
          Vender plan
        </Button>
      </div>
    </section>
  );
}

interface SalesPanelProps {
  sales: Sale[];
  payments: Payment[];
  disabled: boolean;
  onPay: (sale: Sale) => void;
  onVoidPayment: (payment: Payment) => void;
  onVoidSale: (sale: Sale) => void;
}

function SalesPanel({ sales, payments, ...actions }: SalesPanelProps) {
  return (
    <section aria-labelledby="ventas-title" className="flex flex-col gap-4">
      <h2 id="ventas-title" className="font-display text-2xl font-bold uppercase">
        Ventas
      </h2>
      {sales.length === 0 ? (
        <EmptyState title="Sin ventas todavía">
          <p className="text-sm">Usá “Vender plan” para cargar el primer pack.</p>
        </EmptyState>
      ) : (
        sales.map((sale) => (
          <SaleCard key={sale.id} sale={sale} payments={payments.filter((payment) => payment.saleId === sale.id)} {...actions} />
        ))
      )}
    </section>
  );
}

function SaleCard({ sale, payments, disabled, onPay, onVoidPayment, onVoidSale }: Omit<SalesPanelProps, 'sales'> & { sale: Sale }) {
  const voided = sale.voidedAt !== null;
  const lastActive = payments
    .filter((payment) => !payment.voidedAt)
    .reduce<Payment | null>((last, payment) => (!last || payment.id > last.id ? payment : last), null);
  const border = voided ? 'border-granite/30 opacity-70' : sale.debtCents > 0 ? 'border-volt' : 'border-moss';

  return (
    <article aria-label={`Venta ${sale.planName} del ${formatDate(sale.soldAt)}`} className={`flex flex-col gap-3 border-l-4 bg-white p-5 ${border}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-bold uppercase">{sale.planName}</h3>
        <p className="text-sm text-granite-soft">
          {formatDate(sale.soldAt)}
          {sale.teacherName && ` · con ${sale.teacherName}`}
          {voided && ' · Anulada'}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
        <div>
          <dt className="text-granite-soft">Local</dt>
          <dd>{formatMoney(sale.localPriceCents)}</dd>
        </div>
        <div>
          <dt className="text-granite-soft">Recargo profesor</dt>
          <dd>{formatMoney(sale.teacherSurchargeCents)}</dd>
        </div>
        <div>
          <dt className="text-granite-soft">Total</dt>
          <dd className="font-semibold">{formatMoney(sale.totalCents)}</dd>
        </div>
        <div>
          <dt className="text-granite-soft">Reparto</dt>
          <dd>{sale.teacherSurchargeCents > 0 ? SPLIT_RULE_LABELS[sale.splitRule] : '—'}</dd>
        </div>
      </dl>
      <p className="text-sm">
        Pases: {sale.remainingFree} libres · {sale.remainingTeacher} con profesor
      </p>
      {!voided &&
        (sale.debtCents > 0 ? (
          <p className="font-semibold text-volt-ink">Deuda: {formatMoney(sale.debtCents)}</p>
        ) : (
          <p className="font-semibold text-moss">Saldada</p>
        ))}
      {payments.length > 0 && (
        <table className={tableClass}>
          <caption className="sr-only">Pagos de la venta</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Medio</th>
              <th scope="col">Monto</th>
              <th scope="col">Local / Profesor</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className={payment.voidedAt ? 'text-granite-soft' : ''}>
                <td>{formatDate(payment.paidAt)}</td>
                <td>{PAYMENT_METHOD_LABELS[payment.method]}</td>
                <td>{formatMoney(payment.amountCents)}</td>
                <td>
                  {formatMoney(payment.localCents)} / {formatMoney(payment.teacherCents)}
                </td>
                <td>{payment.voidedAt ? 'Anulado' : 'Activo'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!voided && !disabled && (
        <div className="flex flex-wrap gap-2">
          {sale.debtCents > 0 && <Button onClick={() => onPay(sale)}>Registrar pago</Button>}
          {lastActive && (
            <Button variant="ghost" onClick={() => onVoidPayment(lastActive)}>
              Anular último pago
            </Button>
          )}
          <Button variant="ghost" onClick={() => onVoidSale(sale)}>
            Anular venta
          </Button>
        </div>
      )}
    </article>
  );
}

function ConsumptionsPanel({ consumptions, disabled, onVoid }: { consumptions: Consumption[]; disabled: boolean; onVoid: (consumption: Consumption) => void }) {
  return (
    <section aria-labelledby="consumos-title" className="flex flex-col gap-4">
      <h2 id="consumos-title" className="font-display text-2xl font-bold uppercase">
        Consumos
      </h2>
      {consumptions.length === 0 ? (
        <EmptyState title="Sin consumos todavía" />
      ) : (
        <table className={tableClass}>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Tipo</th>
              <th scope="col">Nota</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {consumptions.map((consumption) => (
              <tr key={consumption.id} className={consumption.voidedAt ? 'text-granite-soft' : ''}>
                <td>{formatDateTime(consumption.consumedAt)}</td>
                <td>{PASS_KIND_LABELS[consumption.kind]}</td>
                <td>{consumption.note ?? '—'}</td>
                <td>{consumption.voidedAt ? 'Anulado' : 'Activo'}</td>
                <td className="text-right">
                  {!consumption.voidedAt && !disabled && (
                    <Button
                      variant="ghost"
                      aria-label={`Anular consumo del ${formatDateTime(consumption.consumedAt)}`}
                      onClick={() => onVoid(consumption)}
                    >
                      Anular
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ClientInfoPanel({ client }: { client: Client }) {
  const rows: [string, string][] = [
    ['Fecha de nacimiento', client.birthDate ? formatDate(client.birthDate) : '—'],
    ['Inscripción', formatDate(client.enrolledAt)],
    ['Teléfono', client.phone ?? '—'],
    ['Dirección', client.address ?? '—'],
    [
      'Emergencia',
      client.emergencyName
        ? `${client.emergencyName}${client.emergencyRelation ? ` (${client.emergencyRelation})` : ''} ${client.emergencyPhone ?? ''}`
        : '—',
    ],
    ['Última actualización', formatDateTime(client.updatedAt)],
  ];
  return (
    <section aria-labelledby="ficha-title" className="flex flex-col gap-3 bg-white p-5">
      <h2 id="ficha-title" className="font-display text-2xl font-bold uppercase">
        Ficha
      </h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-granite-soft">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {client.guardians.length > 0 && (
        <div className="text-sm">
          <h3 className="font-semibold">Tutores</h3>
          <ul>
            {client.guardians.map((guardian) => (
              <li key={guardian.id}>
                {fullName(guardian)}
                {guardian.relation && ` (${guardian.relation})`}
                {guardian.phone && ` · ${guardian.phone}`}
                {guardian.dni && ` · DNI ${guardian.dni}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Reemplazar `src/renderer/routes.tsx`**

Es igual a la versión de la Task 16, con estos dos agregados:
- el import `ClientDetailPage` (`import { ClientDetailPage } from './pages/ClientDetailPage';`, en orden alfabético con los demás imports de `./pages`);
- la ruta `<Route path="clientes/:id" element={<ClientDetailPage />} />`, ubicada entre `clientes/nuevo` y `clientes/:id/editar`.

El bloque de rutas queda así:

```tsx
        <Route index element={<Navigate to="/clientes" replace />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/nuevo" element={<ClientFormPage />} />
        <Route path="clientes/:id" element={<ClientDetailPage />} />
        <Route path="clientes/:id/editar" element={<ClientFormPage />} />
        <Route path="planes" element={<PlansPage />} />
        <Route path="profesores" element={<TeachersPage />} />
        <Route path="profesores/nuevo" element={<TeacherFormPage />} />
        <Route path="profesores/:id/editar" element={<TeacherFormPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sin errores.
Run: `npm run dev`. Con un plan 2+2 a `20.000`, un profesor a `5.000` por clase y un cliente:
- vender con el profesor y un pago inicial de `15.000` muestra un desglose total de $ 30.000,00 y "Deuda: $ 15.000,00";
- la tabla de pagos muestra $ 10.000,00 / $ 5.000,00;
- "Consumir con profesor" deja "Con profesor restantes: 1";
- "Anular último pago" pide confirmación y la deuda vuelve a $ 30.000,00;
- intentar "Anular venta" con consumos activos muestra el error en el diálogo;
- archivar oculta las acciones.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git commit -m "feat: add client account with sales, payments, consumptions and voiding

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Mostrador, deudores y cuenta corriente del profesor

**Files:**
- Create: `src/renderer/pages/HomePage.tsx`, `src/renderer/pages/DebtorsPage.tsx`, `src/renderer/pages/TeacherAccountPage.tsx`
- Modify: `src/renderer/routes.tsx` (reemplazo completo, versión final)

**Interfaces:**
- Consumes: Task 14; `payoutInput` (Task 5); canales `dashboard:get`, `clients:list`, `consumptions:create`, `debtors:list`, `teachers:account`, `payouts:create|void`
- Produces: rutas `/` (mostrador), `/deudores`, `/profesores/:id`. Textos que usa el E2E: "Registrar liquidación", "Monto", "Confirmar liquidación", `data-testid="teacher-balance"`.

- [ ] **Step 1: Crear `HomePage.tsx`**

```tsx
import { type ReactNode, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PassKind } from '../../domain/passes';
import type { ClientSummary, Dashboard } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState, SkeletonRows } from '../components/ui/States';
import { call } from '../lib/api';
import { formatMoney, fullName, PASS_KIND_LABELS } from '../lib/format';
import { errorMessage } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

export function HomePage() {
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const query = search.trim();
  const dashboard = useAsync(() => call('dashboard:get', {}), []);
  const results = useAsync(
    () => (query ? call('clients:list', { search: query, includeArchived: false }) : Promise.resolve([])),
    [query],
    { keepPreviousData: true },
  );

  async function consume(client: ClientSummary, kind: PassKind) {
    try {
      await call('consumptions:create', { clientId: client.id, kind, note: null });
      setNotice({ tone: 'success', text: `${fullName(client)}: pase ${PASS_KIND_LABELS[kind].toLowerCase()} registrado.` });
      results.reload();
      dashboard.reload();
    } catch (caught) {
      setNotice({ tone: 'error', text: `${fullName(client)}: ${errorMessage(caught)}` });
    }
  }

  return (
    <section className="grid gap-8 p-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <PageHeader title="Mostrador" subtitle="Buscá al cliente y marcá el pase que usa." />
        <TextField
          label="Buscar cliente"
          type="search"
          autoFocus
          placeholder="Nombre o apellido"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {query === '' ? (
          <p className="text-sm text-granite-soft">Escribí un nombre para empezar.</p>
        ) : (
          <AsyncView
            state={results}
            isEmpty={(data) => data.length === 0}
            empty={
              <EmptyState title="Sin resultados">
                <Link className="underline" to="/clientes/nuevo">
                  Crear cliente
                </Link>
              </EmptyState>
            }
          >
            {(clients) => (
              <ul className="flex flex-col gap-2">
                {clients.map((client) => (
                  <li key={client.id} className="flex flex-wrap items-center justify-between gap-3 bg-white p-4">
                    <div>
                      <Link className="font-display text-xl font-bold uppercase hover:underline" to={`/clientes/${client.id}`}>
                        {fullName(client)}
                      </Link>
                      <p className="text-sm text-granite-soft">
                        Libres: {client.remainingFree} · Con profesor: {client.remainingTeacher}
                        {client.debtCents > 0 && <span className="font-semibold text-volt-ink"> · Debe {formatMoney(client.debtCents)}</span>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        disabled={client.remainingFree <= 0}
                        aria-label={`Pase libre para ${fullName(client)}`}
                        onClick={() => void consume(client, 'free')}
                      >
                        Libre
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={client.remainingTeacher <= 0}
                        aria-label={`Pase con profesor para ${fullName(client)}`}
                        onClick={() => void consume(client, 'teacher')}
                      >
                        Con profesor
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AsyncView>
        )}
      </div>
      <aside aria-label="Alertas" className="flex flex-col gap-6">
        <AsyncView state={dashboard} skeleton={<SkeletonRows rows={6} />}>
          {(data) => <DashboardPanels dashboard={data} />}
        </AsyncView>
      </aside>
    </section>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id={id} className="font-display text-xl font-bold uppercase">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function DashboardPanels({ dashboard }: { dashboard: Dashboard }) {
  return (
    <>
      <Panel title="Pocos pases">
        {dashboard.lowPasses.length === 0 ? (
          <p className="text-sm text-granite-soft">Nadie está por quedarse sin pases.</p>
        ) : (
          <ul className="divide-y divide-granite/10 text-sm">
            {dashboard.lowPasses.map((alert) => (
              <li key={alert.clientId} className="flex justify-between py-2">
                <Link className="font-semibold hover:underline" to={`/clientes/${alert.clientId}`}>
                  {alert.clientName}
                </Link>
                <span>{alert.remainingFree + alert.remainingTeacher} restantes</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        title="Deudores"
        action={
          <Link className="text-sm underline" to="/deudores">
            Ver todos
          </Link>
        }
      >
        {dashboard.debtors.length === 0 ? (
          <p className="text-sm text-granite-soft">No hay deudas pendientes.</p>
        ) : (
          <ul className="divide-y divide-granite/10 text-sm">
            {dashboard.debtors.map((debtor) => (
              <li key={debtor.saleId} className="flex justify-between gap-2 py-2">
                <Link className="font-semibold hover:underline" to={`/clientes/${debtor.clientId}`}>
                  {debtor.clientName}
                </Link>
                <span>
                  {formatMoney(debtor.debtCents)} · {debtor.daysSinceSale} días
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Saldos con profesores">
        {dashboard.teacherBalances.length === 0 ? (
          <p className="text-sm text-granite-soft">No hay saldos pendientes con profesores.</p>
        ) : (
          <ul className="divide-y divide-granite/10 text-sm">
            {dashboard.teacherBalances.map((balance) => (
              <li key={balance.teacherId} className="flex justify-between py-2">
                <Link className="font-semibold hover:underline" to={`/profesores/${balance.teacherId}`}>
                  {balance.teacherName}
                </Link>
                <span className={balance.balanceCents < 0 ? 'text-danger' : ''}>{formatMoney(balance.balanceCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
```

- [ ] **Step 2: Crear `DebtorsPage.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { sum } from '../lib/arrays';
import { formatDate, formatMoney } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export function DebtorsPage() {
  const debtors = useAsync(() => call('debtors:list', {}), []);
  return (
    <section className="p-8">
      <PageHeader title="Deudores" subtitle="Ventas con saldo pendiente, de la más antigua a la más reciente." />
      <AsyncView
        state={debtors}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title="Nadie debe nada">
            <p className="text-sm">Todas las ventas están saldadas.</p>
          </EmptyState>
        }
      >
        {(data) => (
          <>
            <p className="mb-4 font-display text-3xl font-bold uppercase">
              Total adeudado <span className="text-volt-ink">{formatMoney(sum(data.map((debtor) => debtor.debtCents)))}</span>
            </p>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Fecha de venta</th>
                  <th scope="col">Antigüedad</th>
                  <th scope="col">Total</th>
                  <th scope="col">Deuda</th>
                </tr>
              </thead>
              <tbody>
                {data.map((debtor) => (
                  <tr key={debtor.saleId}>
                    <td>
                      <Link className="font-semibold underline-offset-4 hover:underline" to={`/clientes/${debtor.clientId}`}>
                        {debtor.clientName}
                      </Link>
                    </td>
                    <td>{debtor.planName}</td>
                    <td>{formatDate(debtor.soldAt)}</td>
                    <td>{debtor.daysSinceSale} días</td>
                    <td>{formatMoney(debtor.totalCents)}</td>
                    <td className="font-semibold text-volt-ink">{formatMoney(debtor.debtCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </AsyncView>
    </section>
  );
}
```

- [ ] **Step 3: Crear `TeacherAccountPage.tsx`**

```tsx
import { type FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { parseMoneyInput } from '../../shared/money';
import { payoutInput } from '../../shared/schemas';
import type { PaymentMethod, TeacherAccount } from '../../shared/types';
import { Button, ButtonLink } from '../components/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState, SkeletonRows } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { formatDate, formatMoney, formatMoneyInput, fullName, PAYMENT_METHOD_LABELS, todayIso, WEEKDAY_LABELS } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

export function TeacherAccountPage() {
  const teacherId = Number(useParams().id);
  const account = useAsync(() => call('teachers:account', { id: teacherId }), [teacherId]);
  return (
    <section className="p-8">
      <AsyncView state={account} skeleton={<SkeletonRows rows={8} />}>
        {(data) => <TeacherAccountView account={data} reload={account.reload} />}
      </AsyncView>
    </section>
  );
}

function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="bg-white p-5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-granite-soft">{label}</dt>
      <dd data-testid={testId} className="font-display text-4xl font-bold">
        {value}
      </dd>
      {hint && <dd className="text-xs text-granite-soft">{hint}</dd>}
    </div>
  );
}

function TeacherAccountView({ account, reload }: { account: TeacherAccount; reload: () => void }) {
  const { teacher } = account;
  const [paying, setPaying] = useState(false);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  return (
    <>
      <PageHeader
        title={fullName(teacher)}
        subtitle={`${formatMoney(teacher.classRateCents)} por clase${teacher.active ? '' : ' · Inactivo'}`}
        actions={
          <>
            <ButtonLink variant="secondary" to={`/profesores/${teacher.id}/editar`}>
              Editar
            </ButtonLink>
            <Button disabled={account.balanceCents <= 0} onClick={() => setPaying(true)}>
              Registrar liquidación
            </Button>
          </>
        }
      />
      {notice && (
        <div className="mb-6">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      <dl className="mb-8 grid gap-4 md:grid-cols-3">
        <Stat label="Generado" value={formatMoney(account.earnedCents)} hint="Su parte de los pagos ya cobrados" />
        <Stat label="Liquidado" value={formatMoney(account.paidOutCents)} />
        <Stat
          label="Saldo"
          value={formatMoney(account.balanceCents)}
          testId="teacher-balance"
          hint={account.balanceCents < 0 ? 'A favor del local' : 'Pendiente de pagar al profesor'}
        />
      </dl>

      <div className="grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="liquidaciones-title" className="flex flex-col gap-3">
          <h2 id="liquidaciones-title" className="font-display text-2xl font-bold uppercase">
            Liquidaciones
          </h2>
          {account.payouts.length === 0 ? (
            <EmptyState title="Todavía no hay liquidaciones" />
          ) : (
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Medio</th>
                  <th scope="col">Monto</th>
                  <th scope="col">Nota</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {account.payouts.map((payout) => (
                  <tr key={payout.id} className={payout.voidedAt ? 'text-granite-soft' : ''}>
                    <td>{formatDate(payout.paidAt)}</td>
                    <td>{PAYMENT_METHOD_LABELS[payout.method]}</td>
                    <td>{formatMoney(payout.amountCents)}</td>
                    <td>{payout.note ?? '—'}</td>
                    <td className="text-right">
                      {payout.voidedAt ? (
                        'Anulada'
                      ) : (
                        <Button
                          variant="ghost"
                          aria-label={`Anular liquidación del ${formatDate(payout.paidAt)}`}
                          onClick={() =>
                            setPending({
                              title: 'Anular liquidación',
                              message: `Se anula la liquidación de ${formatMoney(payout.amountCents)} y el saldo del profesor vuelve a subir.`,
                              confirmLabel: 'Anular liquidación',
                              action: () => call('payouts:void', { id: payout.id }),
                            })
                          }
                        >
                          Anular
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="cobros-title" className="flex flex-col gap-3">
          <h2 id="cobros-title" className="font-display text-2xl font-bold uppercase">
            Cobros generados
          </h2>
          {account.shares.length === 0 ? (
            <EmptyState title="Todavía no hay cobros con este profesor" />
          ) : (
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Le corresponde</th>
                </tr>
              </thead>
              <tbody>
                {account.shares.map((share) => (
                  <tr key={share.paymentId}>
                    <td>{formatDate(share.paidAt)}</td>
                    <td>{share.clientName}</td>
                    <td>{share.planName}</td>
                    <td>{formatMoney(share.teacherCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section aria-labelledby="agenda-title" className="mt-8 grid gap-4 bg-white p-5 md:grid-cols-2">
        <h2 id="agenda-title" className="sr-only">
          Agenda y contacto
        </h2>
        <div className="text-sm">
          <h3 className="font-semibold">Horarios</h3>
          {teacher.schedules.length === 0 ? (
            <p className="text-granite-soft">Sin horarios cargados.</p>
          ) : (
            <ul>
              {teacher.schedules.map((schedule, index) => (
                <li key={index}>
                  {WEEKDAY_LABELS[schedule.weekday] ?? '?'} {schedule.startTime}–{schedule.endTime}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-sm">
          <h3 className="font-semibold">Contacto</h3>
          <p>{teacher.phone ?? 'Sin teléfono'}</p>
          <p>{teacher.address ?? 'Sin dirección'}</p>
          {teacher.socials.map((social) => (
            <p key={`${social.network}-${social.handle}`}>
              {social.network}: {social.handle}
            </p>
          ))}
        </div>
      </section>

      <Dialog open={paying} title="Registrar liquidación" onClose={() => setPaying(false)}>
        <PayoutForm
          account={account}
          onDone={() => {
            setPaying(false);
            setNotice({ tone: 'success', text: 'Liquidación registrada.' });
            reload();
          }}
          onCancel={() => setPaying(false)}
        />
      </Dialog>
      <ConfirmDialog
        request={pending}
        onDone={() => {
          setPending(null);
          reload();
        }}
        onClose={() => setPending(null)}
      />
    </>
  );
}

function PayoutForm({ account, onDone, onCancel }: { account: TeacherAccount; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(formatMoneyInput(Math.max(account.balanceCents, 0)));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    const parsed = payoutInput.safeParse({ teacherId: account.teacherId, amountCents: amountCents ?? -1, method, paidAt, note });
    if (!parsed.success || amountCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(amountCents === null ? { amountCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      await call('payouts:create', parsed.data);
      onDone();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <p className="text-sm">
        Saldo pendiente: <strong>{formatMoney(account.balanceCents)}</strong>
      </p>
      <MoneyField label="Monto" value={amount} onChange={(event) => setAmount(event.target.value)} error={errors.amountCents} />
      <SelectField label="Medio de pago" value={method} onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}>
        <option value="cash">Efectivo</option>
        <option value="transfer">Transferencia</option>
      </SelectField>
      <TextField label="Fecha" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} error={errors.paidAt} />
      <TextField label="Nota" value={note} onChange={(event) => setNote(event.target.value)} error={errors.note} />
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Confirmar liquidación
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Reemplazar `src/renderer/routes.tsx` (versión final)**

```tsx
import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui/States';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { ClientFormPage } from './pages/ClientFormPage';
import { ClientsPage } from './pages/ClientsPage';
import { DebtorsPage } from './pages/DebtorsPage';
import { HomePage } from './pages/HomePage';
import { PlansPage } from './pages/PlansPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeacherAccountPage } from './pages/TeacherAccountPage';
import { TeacherFormPage } from './pages/TeacherFormPage';
import { TeachersPage } from './pages/TeachersPage';

function NotFoundPage() {
  return (
    <section className="p-8">
      <EmptyState title="Página no encontrada">
        <Link className="underline" to="/">
          Volver al mostrador
        </Link>
      </EmptyState>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/nuevo" element={<ClientFormPage />} />
        <Route path="clientes/:id" element={<ClientDetailPage />} />
        <Route path="clientes/:id/editar" element={<ClientFormPage />} />
        <Route path="deudores" element={<DebtorsPage />} />
        <Route path="planes" element={<PlansPage />} />
        <Route path="profesores" element={<TeachersPage />} />
        <Route path="profesores/nuevo" element={<TeacherFormPage />} />
        <Route path="profesores/:id" element={<TeacherAccountPage />} />
        <Route path="profesores/:id/editar" element={<TeacherFormPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sin errores.
Run: `npm run dev`
Expected:
- el mostrador abre con el foco en "Buscar cliente"; al escribir aparecen resultados con los botones "Libre" y "Con profesor"; marcar un pase muestra el aviso y actualiza los números;
- el panel de alertas muestra pocos pases, deudores y saldos de profesores;
- "Deudores" muestra el total y la antigüedad;
- la cuenta del profesor muestra generado, liquidado y saldo; liquidar baja el saldo y anular la liquidación lo restaura.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git commit -m "feat: add counter dashboard, debtors and teacher account screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: E2E del flujo principal y cierre de la iteración

**Files:**
- Create: `playwright.config.ts`, `e2e/core-flow.spec.ts`

**Interfaces:**
- Consumes: la app construida (`out/main/index.js`), la variable `LEBLOC_USER_DATA` (Task 13) y los textos de UI de las Tasks 15–18.

- [ ] **Step 1: Crear la configuración de Playwright**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
```

- [ ] **Step 2: Escribir el E2E**

`e2e/core-flow.spec.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let userData: string;

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'lebloc-e2e-'));
  app = await electron.launch({ args: ['.'], env: { ...process.env, LEBLOC_USER_DATA: userData } });
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
  await expect(page.getByRole('cell', { name: 'Pack 2+2' })).toBeVisible();

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
  await page.getByLabel('Registrar pago inicial').check();
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
```

- [ ] **Step 3: Correr el E2E**

Run: `npm run test:e2e`
Expected: 1 passed.
- Si Electron no arranca en Linux por el sandbox de Chromium (error `chrome-sandbox`), agregar `'--no-sandbox'` a `args` **solo en el test**, nunca en la app.
- Si un selector no encuentra un texto, corregir el texto en la pantalla para que coincida con la etiqueta documentada en la Task correspondiente. No hay que debilitar el test.

- [ ] **Step 4: Commit del E2E**

```bash
git add playwright.config.ts e2e
git commit -m "test: add end-to-end flow for sale, payments, consumption and teacher payout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Definición de terminado**

Usar la skill `superpowers:verification-before-completion` y correr:

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run audit
gitleaks git --no-banner -v
```

Expected:
- todo verde;
- `npm audit` sin vulnerabilidades `high` ni `critical`;
- gitleaks sin hallazgos.

Si `gitleaks` no está instalado, pedirle al usuario que lo instale (por ejemplo `! sudo apt install gitleaks` o desde la release oficial). Mientras tanto no hay que dar la iteración por cerrada.

Si `npm audit` reporta vulnerabilidades altas en dependencias de desarrollo sin fix disponible, informarlas al usuario con el detalle. No forzar `npm audit fix --force`.

- [ ] **Step 6: Revisión manual final**

Correr `npm run dev` y recorrer las 4 condiciones de cada pantalla:
- **Vacío:** con la base nueva, cada lista muestra su `EmptyState`.
- **Carga:** se ve el skeleton al entrar a la ficha de un cliente.
- **Error:** desde DevTools, `await window.lebloc.invoke('clients:account', { id: 999 })` devuelve `NOT_FOUND`; navegar a `#/clientes/999` muestra `ErrorState` con "Reintentar".
- **Ideal:** el flujo completo.

Navegar solo con el teclado: menú, formularios y diálogos (Escape cierra).

Después de la revisión, el trabajo queda listo para `superpowers:finishing-a-development-branch`.
