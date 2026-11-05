# Plan: entregas del proveedor, kiosco fuera del Mostrador y fecha de inicio del pase

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la mercadería del kiosco cuente en el balance cuando se le paga al proveedor, que el producto guarde su costo unitario, que el Mostrador quede solo para pases y que muestre cuándo inició el pase de cada cliente.

**Architecture:** migración 013 (productos con `unit_cost_cents` y `description`, tablas `kiosk_purchases` y `kiosk_purchase_items`, clave `kiosk_purchases_from` en `settings`). Un servicio nuevo `purchases` sigue el patrón de `expenses`. Finanzas suma la mercadería desde dos partes: ventas anteriores al corte y entregas. El panel de venta del kiosco se mueve sin cambios de `HomePage` a `KioskPage`.

**Tech Stack:** Electron + better-sqlite3, React + Tailwind, Zod, Vitest (con el runtime de Electron), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-kiosk-purchases-design.md`

## Global Constraints

- Dinero en centavos enteros. Los derivados (costo unitario de una línea, total de la entrega, sugerido) no se guardan, salvo `products.unit_cost_cents`.
- Los movimientos se anulan con `voided_at` y nunca se borran.
- Canales: nombre en `src/shared/channels.ts`, esquema en `src/shared/api.ts` (`apiSchemas` y `ApiOutputs`), handler en `src/main/ipc/handlers.ts`.
- El cliente no manda costos derivados ni fechas de registro: `recorded_at` lo pone `ctx.clock` y el costo unitario lo calcula el servicio.
- UI: los 4 estados con `useAsync` + `AsyncView`; textos en español rioplatense, como el resto de la app.
- TDD en dominio, servicios y repos: primero el test que falla. UI visual: se verifica con E2E.
- Comandos: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`, `npm run audit`. Nunca Vitest con el `node` del sistema.
- Commits convencionales en inglés, con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Dos líneas con el mismo producto en una entrega:** se rechaza en el esquema con "Ese producto ya está en la entrega", en la línea repetida. Test en la Tarea 2 (`schemas.test.ts`).
2. **Vender justo después de una entrega:** el ticket toma el costo nuevo como snapshot y los tickets viejos conservan el suyo. Test en la Tarea 2.
3. **Entrega anulada:** no cuenta ni en Finanzas ni en el total del mes de Gastos, y el costo del producto queda igual. Tests en las Tareas 2 y 3.
4. **Cliente cuya única venta con pases ya venció:** `startedAt` es `null` y no se muestra "Inició el". Test en la Tarea 6.
5. **Escape en la ficha de producto abierta desde la entrega:** cierra solo la ficha y la entrega queda con lo cargado. Paso E2E en la Tarea 4.

---

### Tarea 0: rama

- [ ] **Paso 1:** preguntarle al usuario si `feat/plan-teacher-amount` ya se mergeó. Crear `feat/kiosk-purchases` desde la que corresponda (por defecto, desde `feat/plan-teacher-amount`). No tocar `docs/imagenes/`, que no está trackeado.
- [ ] **Paso 2:** commitear la spec y este plan: `docs: design and plan for kiosk supplier deliveries`.

### Tarea 1: el producto guarda su costo unitario

**Files:**
- Create: `src/main/db/migrations/013_kiosk_purchases.ts`
- Modify: `src/main/db/migrations.ts`, `src/domain/kiosk.ts`, `src/shared/schemas.ts` (`productFields`), `src/shared/types.ts` (`Product`), `src/main/repos/products.ts`, `src/main/services/products.ts`, `src/main/services/kiosk.ts` (`sellKiosk`), `src/main/seed.ts`, `src/main/seedVolume.ts`, `src/renderer/pages/ProductForm.tsx`, `src/renderer/pages/KioskPage.tsx` (`ProductsTable`), `.gitignore`
- Test: `src/domain/kiosk.test.ts`, `src/main/db/migrations.test.ts`, `src/main/services/products.test.ts`, y los tests que crean productos con `packSize` (`counter.test.ts`, `finance.test.ts`, `kiosk.test.ts`), `e2e/kiosk.spec.ts` (solo el alta de productos)

**Interfaces:**
- Produces:
  - `unitCostCents(costCents: number, quantity: number): number` = `Math.round(costCents / quantity)`.
  - `suggestedPriceCents(unitCostCents: number, markupPercent: number): number` = `Math.round(unitCostCents * (100 + markupPercent) / 100)`.
  - `ProductInput = { name: string; description: string | null; unitCostCents: number; markupPercent: number; priceCents: number; active: boolean }`, con `description: optionalText(200)` y `unitCostCents: cents`.
  - `Product = { id; name; description: string | null; unitCostCents; markupPercent; priceCents; active; suggestedPriceCents }`.
  - `ProductRow` en `repos/products.ts` = `Product` sin `suggestedPriceCents`.
  - `setProductUnitCost(db: Db, id: number, unitCostCents: number): void` en `repos/products.ts` (la usa la Tarea 2).
  - `ProductForm` acepta `hideCost?: boolean`: sin el campo "Costo unitario", guarda `unitCostCents: 0` (la usa la Tarea 4).
  - Tablas `kiosk_purchases`, `kiosk_purchase_items` y la clave `kiosk_purchases_from`, con el SQL exacto de la spec.

- [ ] **Paso 1: tests de dominio que fallan.** En `kiosk.test.ts` reemplazar los de `unitCostCents`/`suggestedPriceCents`:
  ```ts
  expect(unitCostCents(1_200_000, 24)).toBe(50_000);
  expect(unitCostCents(1_000, 3)).toBe(333);
  expect(unitCostCents(2_000, 3)).toBe(667);
  expect(suggestedPriceCents(50_000, 60)).toBe(80_000);
  expect(suggestedPriceCents(333, 0)).toBe(333);
  expect(suggestedPriceCents(333, 60)).toBe(533); // 532.8
  ```
  Se borra el test "rounds once, from the pack values": ahora el sugerido parte del costo unitario ya redondeado.
- [ ] **Paso 2: test de migración que falla** en `migrations.test.ts`, con el mismo estilo que el de la 012: `MIGRATIONS.slice(0, 12)`, `user_version = 12`, productos `('Agua', pack_size 12, pack_cost_cents 1000)` y `('Barra', 3, 2000)`, `migrate(db)`. Comprobar `unit_cost_cents` 83 y 667; que `PRAGMA table_info(products)` no tenga `pack_size` ni `pack_cost_cents` y sí `description`; que existan `kiosk_purchases` y `kiosk_purchase_items`; y que `SELECT value FROM settings WHERE key = 'kiosk_purchases_from'` sea `toIsoDate(new Date())`.
- [ ] **Paso 3: correr y ver que fallan.** `npm test -- src/domain/kiosk.test.ts src/main/db/migrations.test.ts`. FAIL.
- [ ] **Paso 4: implementar** la migración 013 (el SQL de la spec, agregada al final de `MIGRATIONS`) y las dos funciones de dominio.
- [ ] **Paso 5: tests de productos que fallan.** En `products.test.ts`, `alfajor` pasa a `{ name: 'Alfajor', description: 'Triple', unitCostCents: 50_000, markupPercent: 50, priceCents: 75_000, active: true }`. "creates": `toMatchObject({ description: 'Triple', unitCostCents: 50_000, suggestedPriceCents: 75_000 })`. "updates": `updateProduct(ctx, { ...alfajor, id, unitCostCents: 100_000, markupPercent: 0 })` da `suggestedPriceCents` 100_000. Nuevo test: `setProductUnitCost(ctx.db, id, 40_000)` y después `getProduct` da `unitCostCents` 40_000 y `suggestedPriceCents` 60_000.
- [ ] **Paso 6: implementar** el esquema, el tipo, el repo (columnas `description` y `unit_cost_cents`, más `setProductUnitCost`), `toProduct` con `suggestedPriceCents(row.unitCostCents, row.markupPercent)`, y en `sellKiosk` usar `unitCostCents: product.unitCostCents`.
- [ ] **Paso 7: arreglar los otros tests y los seeds.** En cada `createProduct` de los tests, `unitCostCents` = costo del paquete ÷ unidades de antes (por ejemplo, en `finance.test.ts`, Agua 200_000 y Barrita 100_000) y `description: null`. Los seeds hacen lo mismo con `Math.round`; el `updateProduct` de Energizante en `seed.ts` también.
- [ ] **Paso 8: UI del producto.**
  - `ProductForm`: campos Nombre, Descripción (`TextField`, opcional), Costo unitario (`MoneyField`, se oculta con `hideCost`), % de ganancia, el texto en vivo `Sugerido $…` (o "Completá costo y ganancia para ver el sugerido."), Precio de venta con "Usar sugerido", Activo.
  - `ProductsTable`: columnas Producto, Descripción (`—` si es `null`), Costo unitario, Ganancia, Sugerido, Precio de venta. Sale "Paquete"; `FillerRows columns` sigue en 7.
- [ ] **Paso 9: E2E del alta.** En `e2e/kiosk.spec.ts`, el alta de Agua carga "Costo unitario" `1.000` y espera `Sugerido $ 1.400,00`. El alta de Magnesio carga "Costo unitario" `1.500`. Lo demás del archivo se toca en la Tarea 5.
- [ ] **Paso 10:** agregar `.superpowers/` a `.gitignore`.
- [ ] **Paso 11: verificar.** `npm test`, `npm run typecheck`, `npm run lint`. Todo en verde.
- [ ] **Paso 12: commit** `feat: products keep a unit cost instead of a pack`.

### Tarea 2: entregas del proveedor (backend)

**Files:**
- Create: `src/main/repos/purchases.ts`, `src/main/services/purchases.ts`, `src/main/services/purchases.test.ts`
- Modify: `src/domain/kiosk.ts`, `src/shared/schemas.ts`, `src/shared/types.ts`, `src/shared/channels.ts`, `src/shared/api.ts`, `src/main/ipc/handlers.ts`
- Test: `src/domain/kiosk.test.ts`, `src/shared/schemas.test.ts`, `src/main/services/purchases.test.ts`

**Interfaces:**
- Consumes: `unitCostCents`, `setProductUnitCost`, `findProduct` (Tarea 1); `monthBounds` de `repos/expenses.ts`; `assertNotFuture`, `nowIso` de `main/context`.
- Produces:
  - `purchaseTotalCents(items: readonly { costCents: number }[]): number` en `domain/kiosk.ts`.
  - `purchaseInput = z.object({ paidAt: isoDate, method: paymentMethodSchema, items: z.array(z.object({ productId: id, quantity: z.number().int().min(1).max(10_000), costCents: cents })).min(1, 'Agregá al menos un producto').max(50) })`, con un `superRefine` que marca cada repetido con path `['items', i, 'productId']` y mensaje `'Ese producto ya está en la entrega'`. `PurchaseInput = z.infer<typeof purchaseInput>`.
  - Tipos: `KioskPurchaseItem = { productId: number; productName: string; quantity: number; costCents: number; unitCostCents: number }`, `KioskPurchase = { id: number; paidAt: string; method: PaymentMethod; recordedAt: string; voidedAt: string | null; items: KioskPurchaseItem[]; totalCents: number }`, `KioskPurchaseMonth = { purchases: KioskPurchase[]; totalCents: number }`.
  - Servicio: `createPurchase(ctx: Context, input: PurchaseInput): KioskPurchase`, `voidPurchase(ctx: Context, id: number): KioskPurchase`, `getPurchaseMonth(ctx: Context, month: string): KioskPurchaseMonth`.
  - Canales: `'purchases:create'` (`purchaseInput` → `KioskPurchase`), `'purchases:list'` (`monthInput` → `KioskPurchaseMonth`), `'purchases:void'` (`idInput` → `KioskPurchase`).

- [ ] **Paso 1: tests que fallan.**
  - Dominio: `purchaseTotalCents([{ costCents: 1_200_000 }, { costCents: 504_000 }])` da 1_704_000 y `[]` da 0.
  - `schemas.test.ts`: dos ítems con el mismo `productId` → `safeParse` falla con un issue en `['items', 1, 'productId']` y el mensaje de arriba; `items: []` falla; `quantity: 0` falla.
  - `purchases.test.ts` (contexto de test, hoy 2026-10-05; productos `agua` con `unitCostCents: 45_000` y `barrita`):
    - `creates a delivery and sets each product's unit cost`: `createPurchase(ctx, { paidAt: '2026-10-02', method: 'cash', items: [{ productId: agua, quantity: 24, costCents: 1_200_000 }, { productId: barrita, quantity: 12, costCents: 504_000 }] })` da `totalCents` 1_704_000, ítems con `productName` y `unitCostCents` 50_000 y 42_000, `recordedAt` = `ctx.clock.now().toISOString()`, `voidedAt` null. `getProduct(agua).unitCostCents` = 50_000.
    - `rejects future dates, unknown and inactive products`: `paidAt: '2026-10-06'` → `DATE_IN_FUTURE`; `productId: 999` → `NOT_FOUND`; producto inactivo → `PRODUCT_INACTIVE`. En los tres casos no queda ninguna entrega ni cambia ningún costo (es una transacción).
    - `voids once and leaves the product cost alone`: anular → `voidedAt` seteado y `unitCostCents` sigue en 50_000; anular de nuevo → `ALREADY_VOIDED`; `999` → `NOT_FOUND`.
    - `lists a month newest first and totals without the voided`: entregas el 09-30, 10-01 y 10-03, y una anulada el 10-04; `getPurchaseMonth(ctx, '2026-10')` lista 10-04, 10-03, 10-01 y su total no suma la anulada.
    - `a ticket sold after a delivery snapshots the new cost`: un ticket antes de la entrega guarda 45_000 y uno después guarda 50_000 (`listKioskSales`).
- [ ] **Paso 2: correr y ver que fallan.** `npm test -- src/main/services/purchases.test.ts src/shared/schemas.test.ts src/domain/kiosk.test.ts`. FAIL.
- [ ] **Paso 3: implementar** el repo (solo SQL, como `repos/expenses.ts` y `repos/kioskSales.ts`), el servicio (`ctx.db.transaction`, como `sellKiosk`), los tipos, el esquema, los canales y los handlers.
- [ ] **Paso 4: correr los tests.** PASS. Después `npm run typecheck` y `npm run lint`.
- [ ] **Paso 5: commit** `feat: record supplier deliveries that set the product's unit cost`.

### Tarea 3: el balance cuenta la mercadería cuando se paga

**Files:**
- Modify: `src/main/repos/finance.ts` (`moneyByDay`), `src/domain/finance.ts` (comentario de `balanceOf`), `src/renderer/pages/finance/SummaryTab.tsx`, `src/main/test-context.ts`
- Test: `src/main/services/finance.test.ts`

**Interfaces:**
- Consumes: `createPurchase`, `voidPurchase` (Tarea 2).
- Produces: `setKioskPurchasesFrom(ctx: TestContext, date: string): void` en `test-context.ts`. `createTestContext` llama a `setKioskPurchasesFrom(ctx, '2000-01-01')`, así los tests no dependen del día real en que corre la migración.

- [ ] **Paso 1: tests que fallan** en `finance.test.ts`.
  - `scenario`: antes de vender, `createPurchase(ctx, { paidAt: '2026-10-02', method: 'cash', items: [{ productId: water, quantity: 6, costCents: 1_200_000 }] })`. El costo de Agua sigue en 200_000, así que Ventas no cambia. Actualizar el comentario del escenario.
  - "counts what was collected…": `kiosk_cost` 1_200_000; `current` = `{ incomeCents: 4_400_000, expensesCents: 7_200_000, resultCents: -2_800_000 }`.
  - "splits by payment method…" (renombrarlo a "…and the kiosk deliveries paid that way"): en efectivo `kiosk_cost` 1_200_000; en transferencia 0. El `outflow` en efectivo del 10-05 sigue en 2_000_000.
  - Nuevo `describe('kiosk merchandise')` con su propio contexto: `setKioskPurchasesFrom(ctx, '2026-10-04')`; un producto con costo 100_000; un ticket de 1 unidad el 10-03 y otro el 10-05 (mover `ctx.clock`); una entrega el 10-05 por 300_000 y otra anulada por 999_900. `getFinanceSummary(ctx, OCTOBER).totals.kiosk_cost` = 400_000: el ticket del 10-03 (antes del corte) más la entrega. El ticket del 10-05 no suma.
- [ ] **Paso 2: correr y ver que fallan.** `npm test -- src/main/services/finance.test.ts`. FAIL.
- [ ] **Paso 3: implementar** el `UNION ALL` de dos partes de la spec en `moneyByDay`, que reemplaza la parte `kiosk_cost` de hoy. Agregar `setKioskPurchasesFrom` (un `UPDATE settings`) y llamarla desde `createTestContext`.
- [ ] **Paso 4: UI.** En `SummaryTab`, el renglón pasa a `<StatementRow label="Mercadería del kiosco" cents={-totals.kiosk_cost} />`, siempre visible (se va el `!byMethod &&`). Actualizar el comentario de `balanceOf` y el de `moneyByDay` ("the kiosk stock sold is left out" ya no aplica).
- [ ] **Paso 5: verificar.** `npm test`, `npm run typecheck`, `npm run lint`. PASS.
- [ ] **Paso 6: commit** `feat: count kiosk merchandise when the supplier is paid`.

### Tarea 4: pantallas de entregas

**Files:**
- Create: `src/renderer/pages/PurchaseForm.tsx`
- Modify: `src/renderer/pages/KioskPage.tsx`, `src/renderer/pages/ExpensesPage.tsx`, `src/main/seed.ts`
- Test: `e2e/kiosk.spec.ts` (test nuevo)

**Interfaces:**
- Consumes: canales `purchases:*` (Tarea 2); `ProductForm` con `hideCost` (Tarea 1); `unitCostCents` del dominio para la vista previa.
- Produces: `PurchaseForm({ onSaved, onCancel }: { onSaved: (purchase: KioskPurchase) => void; onCancel: () => void })`.

- [ ] **Paso 1: `PurchaseForm`.**
  - Arriba: "Fecha de pago" (`type="date"`, `todayIso()`) y "Medio de pago" (`SelectField`, efectivo por defecto).
  - Líneas: producto (`SelectField` con los activos de `products:list`), "Cantidad" y "Costo total" (`MoneyField`). Al lado, el costo unitario nuevo y "antes $X" o "igual".
  - "Agregar producto" suma una línea; "Quitar" (✕ con `aria-label`) saca una, sin bajar de una línea.
  - "Nuevo producto" abre un segundo `Dialog` con `<ProductForm product={null} hideCost …>`. Al guardar, recarga `products:list` y agrega una línea con ese producto elegido; al cancelar no toca nada.
  - Abajo: "Total pagado" y Guardar/Cancelar. Valida con `purchaseInput.safeParse` y muestra los errores con `toFieldErrors` en cada campo (claves `items.N.quantity`, etc.). El error del servidor va en un `Notice`.
- [ ] **Paso 2: `KioskPage`.**
  - Botón "Cargar entrega del proveedor" en el encabezado de Productos; abre un `Dialog` (`wide`) con `PurchaseForm`.
  - Bloque nuevo "Entregas del proveedor" debajo de Productos, separado con `Stripe`: "Mes" (`type="month"`, `currentMonthIso()`) y una tabla con Fecha, Productos (`24 × Agua, 12 × Barrita`), Medio, Total y Anular (`ConfirmDialog` → `purchases:void`). Las anuladas se tachan, como los tickets. Vacío: "No hay entregas cargadas este mes."
  - Al guardar o anular se recargan los productos y las entregas.
- [ ] **Paso 3: `ExpensesPage`.** `useAsync(() => call('purchases:list', { month }), [month], { keepPreviousData: true })`. Un renglón "Mercadería del kiosco" debajo de "Sueldos del mes", con `formatMoney(totalCents)` (o `—` mientras carga) y `onSelect: () => void navigate('/kiosco')`.
- [ ] **Paso 4: seed.** En `seed.ts`, una entrega de hoy en efectivo con Agua (24 u.) y Barrita (24 u.), con los costos de su ficha, para que el bloque no aparezca vacío.
- [ ] **Paso 5: E2E** `a supplier delivery sets the unit cost and shows in Gastos`, en `e2e/kiosk.spec.ts`, después del test de alta y venta:
  - Kiosco → "Cargar entrega del proveedor" → producto Agua, cantidad 24, costo 26.400. La línea muestra `$ 1.100,00`.
  - "Nuevo producto" → Nombre "Chicle", % 100, precio 500. Primero se aprieta Escape: se cierra solo la ficha y la línea de Agua sigue. Se vuelve a abrir y se guarda. Aparece una línea con Chicle; cantidad 20, costo 4.000.
  - Guardar. La tabla de productos muestra Agua `$ 1.100,00` y Chicle `$ 200,00`; "Entregas del proveedor" muestra `24 × Agua, 20 × Chicle` y `$ 30.400,00`.
  - Gastos: "Mercadería del kiosco" muestra `$ 30.400,00`.
  - Volver a Kiosco, anular la entrega; en Gastos el renglón pasa a `$ 0,00` y el costo de Agua sigue en `$ 1.100,00`.
- [ ] **Paso 6: verificar.** `npm run typecheck`, `npm run lint`, `npm run test:e2e`. PASS. Mirar la pantalla con `npm run seed`: estados de carga, error y vacío del bloque nuevo.
- [ ] **Paso 7: commit** `feat: load supplier deliveries from the kiosk screen`.

### Tarea 5: el kiosco sale del Mostrador

**Files:**
- Modify: `src/renderer/pages/HomePage.tsx`, `src/renderer/pages/KioskPage.tsx`, `src/renderer/components/DayMovementsTable.tsx`, `src/main/services/counter.ts`, `src/main/services/dashboard.ts`, `src/main/repos/kioskSales.ts` (borrar `kioskDaySummary`), `src/shared/types.ts` (`DayMovement`, `DayMovements`, `DashboardSummary`)
- Test: `src/main/services/counter.test.ts`, `src/main/services/dashboard.test.ts`, `src/main/services/kiosk.test.ts` (línea con `kioskTodayCount`), `src/main/seed.test.ts`, `e2e/kiosk.spec.ts`

**Interfaces:**
- Produces: `DayMovement` sin la rama `kind: 'kiosk'`; `DayMovements = { rows; plansCents; counterCents; totalCents }`; `DashboardSummary` sin `kioskTodayCount`/`kioskTodayCents`.

- [ ] **Paso 1: tests que fallan.** En `counter.test.ts`, un ticket de kiosco de hoy no aparece en `getDayMovements(ctx).rows` y `totalCents` = planes + pases sueltos. El objeto esperado ya no tiene `kioskCents`. Sacar `kioskTodayCount`/`kioskTodayCents` de `dashboard.test.ts`, `kiosk.test.ts` y `seed.test.ts`. En `seed.test.ts`, para no perder el chequeo, que `getKioskStats(ctx).todayCount` sea igual a los tickets vivos de hoy.
- [ ] **Paso 2: correr y ver que fallan.** `npm test -- src/main/services/counter.test.ts`. FAIL.
- [ ] **Paso 3: implementar** el backend: `getDayMovements` sin tickets, `getDashboard` sin kiosco, borrar `kioskDaySummary` y actualizar los tipos.
- [ ] **Paso 4: UI.**
  - `HomePage`: se van la sección Kiosco, el `Stripe`, `productSearch` y `kioskPanel`. `DayMovementsTable` queda dentro de la sección Pases, debajo de "Ingresos de hoy". Sale el renglón "Kiosco hoy" de `SummaryPanel`.
  - `DayMovementsTable`: sin la rama `kiosk`. Los totales quedan `Planes … · Pases sueltos … · Total …` y el comentario se actualiza.
  - `KioskPage`: arriba de Ventas, una sección "Vender" con encabezado fijo (`STICKY_HEADING`), título, `TextField` "Buscar producto" y `KioskSalePanel`, con el mismo `scrollIntoView` de hoy. `onSold` recarga el resumen y la lista de Ventas.
- [ ] **Paso 5: E2E.** En el primer test de `e2e/kiosk.spec.ts`, la venta se hace en Kiosco. Sacar `kioskToday` y los chequeos de "Movimientos de hoy" sobre tickets. Agregar: en el Mostrador no hay `Buscar producto` y "Movimientos de hoy" no tiene filas `2 × Agua`. El test de pases sueltos queda igual.
- [ ] **Paso 6: verificar.** `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`. PASS.
- [ ] **Paso 7: commit** `feat: sell from the kiosk screen and keep the counter for passes`.

### Tarea 6: fecha de inicio del pase en el Mostrador

**Files:**
- Modify: `src/main/repos/clients.ts` (`listClientSummaries`), `src/shared/types.ts` (`ClientSummary`), `src/renderer/pages/HomePage.tsx` (`ResultRow`)
- Test: `src/main/services/clients.test.ts`, y los tests que comparan un `ClientSummary` entero con `toEqual`

**Interfaces:**
- Produces: `ClientSummary.startedAt: string | null`, con el comentario `/** Day the oldest sale with passes left was sold; null without passes left. */`.

- [ ] **Paso 1: test que falla** `startedAt is the oldest sale with usable passes`:
  - Venta A el 2026-09-01 con vencimiento 2026-09-30 (ya venció) y venta B el 2026-09-20 con `FAR_EXPIRY`: `startedAt` = `'2026-09-20'`.
  - Una venta C el 2026-10-01: sigue `'2026-09-20'`.
  - Se consumen todos los pases de B: pasa a `'2026-10-01'`.
  - Un cliente cuya única venta venció: `startedAt` = `null`.
- [ ] **Paso 2: correr y ver que falla.** `npm test -- src/main/services/clients.test.ts -t startedAt`. FAIL.
- [ ] **Paso 3: implementar** `MIN(CASE WHEN ss.left_free + ss.left_teacher > 0 THEN ss.sold_at END) AS startedAt` en el `SELECT`, y el campo en el tipo. Arreglar los `toEqual` que fallen.
- [ ] **Paso 4: UI.** En `ResultRow`, antes de `PassBadge`: `{client.startedAt && <span>Inició el {formatDate(client.startedAt).slice(0, 5)}</span>}`.
- [ ] **Paso 5: verificar.** `npm test`, `npm run typecheck`, `npm run lint`. PASS.
- [ ] **Paso 6: commit** `feat: show when the client's pass started at the counter`.

### Tarea 7: documentación y cierre

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Paso 1:** en `CLAUDE.md`, la regla del kiosco pasa a: "**Kiosco:** el producto guarda su costo unitario, que pone la última entrega del proveedor (costo ÷ cantidad) o se escribe a mano. Con el % de ganancia, el sistema calcula el precio sugerido; el precio de venta lo decide el administrador. La mercadería cuenta en el balance cuando se paga la entrega (las ventas anteriores a `kiosk_purchases_from` siguen restando su costo)."
- [ ] **Paso 2: verificación final.** `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`, `npm run audit` y `gitleaks detect`. Todo en verde, sin secretos.
- [ ] **Paso 3: commit** `docs: kiosk cost now comes from supplier deliveries`.
- [ ] **Paso 4:** recordarle al usuario el paso de instalación: el día que se instale, cargar como primera entrega la mercadería que haya en los estantes.
