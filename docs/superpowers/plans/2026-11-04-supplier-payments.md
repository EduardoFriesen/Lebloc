# Pagos al proveedor en partes — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una entrega del proveedor se pueda pagar en partes y modificar, que su detalle se vea al tocarla (en Kiosco y en Gastos) y que cada pago al proveedor aparezca en Gastos.

**Architecture:** La entrega (`kiosk_purchases`) pasa a ser solo lo que llegó (`received_at`, ítems); los pagos van en `kiosk_purchase_payments`, como los pagos de las ventas de planes. La deuda es total − pagos activos y no se guarda. Finanzas cuenta la mercadería por pago.

**Tech Stack:** Electron, better-sqlite3, Zod, React + Tailwind, Vitest (runtime de Electron), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-supplier-payments-design.md`

## Global Constraints

- Dinero en centavos enteros. La deuda no se guarda: total − pagos activos.
- Los pagos se anulan (`voided_at`), nunca se borran. Una entrega con pagos activos no se anula.
- Un solo proveedor: no hay columna de proveedor.
- Al instalar, ningún número de meses pasados cambia (Finanzas, Gastos, Kiosco).
- La mercadería se cuenta una sola vez en Finanzas: por los pagos al proveedor.
- Reglas nuevas en `src/domain/` con su test; canales: nombre en `shared/channels.ts`, esquema en `shared/api.ts` (`apiSchemas` y `ApiOutputs`), handler en `main/ipc/handlers.ts`.
- Textos de error nuevos: `PURCHASE_VOIDED` "La entrega está anulada.", `PURCHASE_HAS_ACTIVE_PAYMENTS` "La entrega tiene pagos activos. Anulalos primero.", `PAID_EXCEEDS_PURCHASE` "Lo pagado supera el total de la entrega.".
- Comandos: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:e2e` (compila antes), `npm run audit`, `gitleaks protect --staged`.

## Review Focus

1. Corregir una entrega vieja cuando ya hay una más nueva del mismo producto: el costo unitario no se pisa (test en Task 3).
2. Una deuda de un mes anterior se ve con "Solo con deuda" y en "Se le debe al proveedor" (test en Task 2).
3. Una entrega anulada antes de la versión: su pago migrado queda anulado y Finanzas da lo mismo (test en Task 1).
4. Entrega de total 0: no se le crea pago, figura "Pagada" y no acepta pagos (test en Task 2).
5. Un pago inicial mayor que el total no deja la entrega a medio guardar (test en Task 2).

---

### Task 1: Migración 018 y Finanzas por pago

**Files:**
- Create: `src/main/db/migrations/018_supplier_payments.ts`
- Modify: `src/main/db/migrations.ts`, `src/main/repos/finance.ts` (bloque `kiosk_cost` de `kiosk_purchases`, línea ~50)
- Test: `src/main/db/migrations.test.ts`, `src/main/services/finance.test.ts`

**Interfaces:**
- Produces: tabla `kiosk_purchase_payments (id, purchase_id, paid_at, amount_cents > 0, method in ('cash','transfer'), recorded_at, voided_at)` con índices por `purchase_id` y `paid_at`; `kiosk_purchases (id, received_at, recorded_at, voided_at)`.

- [ ] **Step 1: Test de migración** `it('moves each delivery payment to its own row and keeps the totals')`: base con `MIGRATIONS.slice(0, 17)` y `user_version = 17`, un producto, tres entregas: activa de $1.000 (efectivo, 2026-10-01), anulada de $500 (transferencia, 2026-10-02, `voided_at` 'x'), y una de costo 0. Después de `migrate`: `PRAGMA table_info(kiosk_purchases)` tiene `received_at` y no tiene `paid_at` ni `method`; `kiosk_purchase_payments` tiene exactamente `[{ purchase_id: activa, amount_cents: 100000, method: 'cash', paid_at: '2026-10-01', voided_at: null }, { purchase_id: anulada, amount_cents: 50000, method: 'transfer', paid_at: '2026-10-02', voided_at: 'x' }]`.
- [ ] **Step 2:** `npm test -- src/main/db/migrations.test.ts` → FAIL.
- [ ] **Step 3:** Migración: crear tabla e índices; `INSERT ... SELECT` un pago por entrega con `SUM(cost_cents) > 0` copiando `paid_at`, `method`, `recorded_at`, `voided_at`; `ALTER TABLE kiosk_purchases RENAME COLUMN paid_at TO received_at`; `DROP COLUMN method`. Registrar `migration018`.
- [ ] **Step 4:** En `moneyByDay`, `kiosk_cost` sale de `kiosk_purchase_payments` (`voided_at IS NULL`, `paid_at` en rango, `${OF_METHOD}`), sumando `amount_cents`. Ajustar comentario.
- [ ] **Step 5:** La migración rompe `repos/purchases.ts`: queda en rojo hasta Task 2. Correr solo `npm test -- src/main/db/migrations.test.ts` → PASS. No commitear todavía: Task 1 y Task 2 van en un mismo commit.

### Task 2: Entregas con pagos (servidor)

**Files:**
- Modify: `src/domain/kiosk.ts`, `src/domain/errors.ts`, `src/main/repos/purchases.ts`, `src/main/services/purchases.ts`, `src/shared/schemas.ts`, `src/shared/types.ts`, `src/shared/channels.ts`, `src/shared/api.ts`, `src/main/ipc/handlers.ts`, `src/main/seed.ts`, `src/renderer/pages/PurchaseForm.tsx` (solo adaptar a la entrada nueva), `src/renderer/pages/KioskPage.tsx` (`paidAt` → `receivedAt`)
- Test: `src/domain/kiosk.test.ts`, `src/main/services/purchases.test.ts`, `src/main/services/finance.test.ts`

**Interfaces:**
- Produces (dominio): `purchaseDebtCents(totalCents: number, paidCents: number): number`; `assertPurchasePayable(purchase: { voidedAt: string | null; debtCents: number }, amountCents: number): void` (PURCHASE_VOIDED, INVALID_AMOUNT, PAYMENT_EXCEEDS_DEBT, en ese orden); `assertPurchaseVoidable(purchase: { voidedAt: string | null }, activePayments: number): void` (ALREADY_VOIDED, PURCHASE_HAS_ACTIVE_PAYMENTS); `assertPurchaseEditable(purchase: { voidedAt: string | null; paidCents: number }, newTotalCents: number): void` (PURCHASE_VOIDED, PAID_EXCEEDS_PURCHASE).
- Produces (tipos): `KioskPurchasePayment { id; purchaseId; paidAt; amountCents; method; voidedAt }`; `KioskPurchase { id; receivedAt; recordedAt; voidedAt; items; totalCents; payments: KioskPurchasePayment[]; paidCents; debtCents }`; `KioskPurchaseMonth { purchases; totalCents; owedCents }`.
- Produces (esquemas): `purchaseItems` (el array actual con su `superRefine`); `purchaseInput = { receivedAt, items: purchaseItems, initialPayment: z.object(newPaymentFields).nullable() }`; `purchaseUpdate = { id, receivedAt, items: purchaseItems }`; `purchasePaymentInput = { purchaseId: id, ...newPaymentFields }`; `purchaseListInput = { month, onlyOwed: z.boolean().default(false) }`; tipos `PurchaseInput`, `PurchaseUpdate`, `PurchasePaymentInput`, `PurchaseListInput`.
- Produces (servicio): `createPurchase(ctx, PurchaseInput)`, `getPurchase(ctx, id)`, `voidPurchase(ctx, id)`, `payPurchase(ctx, PurchasePaymentInput)`, `voidPurchasePayment(ctx, paymentId)` (todos devuelven `KioskPurchase`); `getPurchaseMonth(ctx, PurchaseListInput): KioskPurchaseMonth`.
- Produces (canales): `purchases:create`, `purchases:list` (`purchaseListInput`), `purchases:get` (`idInput`), `purchases:void`, `purchases:pay`, `purchases:voidPayment` (`idInput`).

- [ ] **Step 1: Tests de dominio** en `kiosk.test.ts`: deuda = total − pagado; pagar 0 → INVALID_AMOUNT, más que la deuda → PAYMENT_EXCEEDS_DEBT, anulada → PURCHASE_VOIDED; anular con 1 pago activo → PURCHASE_HAS_ACTIVE_PAYMENTS, ya anulada → ALREADY_VOIDED; editar con total nuevo < pagado → PAID_EXCEEDS_PURCHASE, igual al pagado → ok, anulada → PURCHASE_VOIDED.
- [ ] **Step 2:** Correr → FAIL. Implementar las cuatro funciones y los tres códigos. Correr → PASS.
- [ ] **Step 3: Tests de servicio** en `purchases.test.ts`, con el helper `delivery(receivedAt, items?, initialPayment?)`:
  - `creates a delivery paid in full, in part or not at all`: con pago de $12.000 → `paidCents 1_200_000, debtCents 0, payments.length 1`; con $5.000 → `debtCents 700_000`; sin pago → `debtCents 1_200_000, payments []`; el costo unitario se fija igual que hoy.
  - `rolls back a delivery whose first payment is too big`: pago de $12.000,01 → PAYMENT_EXCEEDS_DEBT y `getPurchaseMonth(...).purchases` vacío, costo del producto sin cambiar.
  - `pays the rest later and voids any payment`: pagar $7.000 → `debtCents 0`; `voidPurchasePayment` del primero → `debtCents 500_000`; anular dos veces → ALREADY_VOIDED.
  - `voids a delivery only without active payments`.
  - `a delivery that cost nothing owes nothing`: ítems de costo 0 sin pago → `debtCents 0`; pagar 1 → PAYMENT_EXCEEDS_DEBT.
  - `shows what is owed from any month`: entrega de septiembre sin pagar y de octubre con pago parcial → `getPurchaseMonth(ctx, { month: '2026-10', onlyOwed: false })` trae solo la de octubre y `owedCents` = deuda de las dos; con `onlyOwed: true` trae las dos (más nueva primero); una anulada no suma.
  - Los tests actuales pasan a `receivedAt` y `initialPayment` (los que eran "pagada" llevan pago completo).
- [ ] **Step 4:** Correr → FAIL. Implementar repo (`insertPurchase({ receivedAt, recordedAt })`, `listPurchasesInMonth` por `received_at`, `listActivePurchases`, `insertPurchasePayment`, `findPurchasePayment`, `listPurchasePayments(purchaseId)` por `paid_at, id`, `voidPurchasePaymentRow`) y servicio. `owedCents`/`onlyOwed` en el servicio sobre `listActivePurchases` con el comentario `// ponytail: lee todas las entregas activas; pasar a SQL si llegan a miles`.
- [ ] **Step 5:** Adaptar `seed.ts` (la entrega de hoy, con pago completo; sumar una de hace 10 días con pago parcial para que haya deuda), `finance.test.ts` (entrada nueva; agregar `counts the kiosk stock by supplier payment, on its date and method`: entrega del 2026-10-02 sin pago y un pago de transferencia el 2026-10-04 → `kiosk_cost` en `{2026-10-01..05}` igual al pago, y 0 con `method: 'cash'`), `PurchaseForm` (manda `receivedAt` y `initialPayment` completo con el medio elegido, como hoy) y `KioskPage` (`receivedAt`). Canales y handlers.
- [ ] **Step 6:** `npm test && npm run typecheck && npm run lint` → todo en verde.
- [ ] **Step 7:** Commit (Task 1 + 2): `feat: pay supplier deliveries in parts, keeping what is owed`.

### Task 3: Modificar una entrega (servidor)

**Files:**
- Modify: `src/main/repos/purchases.ts`, `src/main/services/purchases.ts`, `src/shared/channels.ts`, `src/shared/api.ts`, `src/main/ipc/handlers.ts`
- Test: `src/main/services/purchases.test.ts`

**Interfaces:**
- Consumes: `assertPurchaseEditable`, `purchaseUpdate` (Task 2).
- Produces: `updatePurchase(ctx, PurchaseUpdate): KioskPurchase`; canal `purchases:update`; repo `updatePurchaseRow(db, id, receivedAt)`, `deletePurchaseItems(db, purchaseId)`, `latestActivePurchaseWith(db, productId): number | undefined` (por `received_at DESC, id DESC`, solo no anuladas).

- [ ] **Step 1: Tests:**
  - `edits the date and the lines, and the debt follows`: entrega con pago de $5.000, modificar a Agua 10 × $8.000 y fecha 2026-10-03 → `receivedAt '2026-10-03', totalCents 800_000, debtCents 300_000`, costo unitario de Agua 80_000.
  - `does not overwrite a newer cost when fixing an old delivery`: entrega del 2026-10-01 y otra del 2026-10-04 de Agua; modificar la del 01 → el costo de Agua sigue siendo el de la del 04. Un producto que se saca de la entrega conserva su costo.
  - `rejects a total below what was paid, a voided delivery, future dates and inactive products, changing nothing`.
- [ ] **Step 2:** Correr → FAIL. Implementar en una transacción: validar (fecha, productos activos, `assertPurchaseEditable`), actualizar fecha, reemplazar ítems y fijar el costo unitario solo donde `latestActivePurchaseWith(productId) === id`. Correr → PASS.
- [ ] **Step 3:** `npm test && npm run typecheck` → verde. Commit: `feat: edit a supplier delivery`.

### Task 4: Pagos al proveedor en Gastos (servidor)

**Files:**
- Modify: `src/main/repos/expenses.ts`, `src/main/services/expenses.ts`, `src/shared/types.ts`
- Test: `src/main/services/expenses.test.ts`

**Interfaces:**
- Produces: `SupplierPaymentRow { id; purchaseId; paidAt; method; amountCents; receivedAt; productsLabel }` (`productsLabel` = "24 × Agua, 12 × Barrita", armado con `group_concat` en SQL); `ExpenseMonth` suma `supplierPayments: SupplierPaymentRow[]` (más nuevo primero) y `supplierCents`; `totalCents` = gastos + `supplierCents`; `byCategory` sigue solo con gastos.

- [ ] **Step 1: Test** `lists the supplier payments of the month and adds them to the total`: un gasto de $500.000 y una entrega con un pago de $12.000 en octubre y otro anulado → `supplierPayments` con un elemento (`amountCents 1_200_000`, `productsLabel '24 × Agua'`), `supplierCents 1_200_000`, `totalCents 51_200_000`, `byCategory` solo con `rent`. Un pago de septiembre no aparece.
- [ ] **Step 2:** Correr → FAIL. Implementar `listSupplierPaymentsInMonth(db, month)`. Correr → PASS.
- [ ] **Step 3:** Commit: `feat: supplier payments count in the month's expenses`.

### Task 5: Kiosco — formulario, tabla y detalle

**Files:**
- Create: `src/renderer/pages/PurchaseDetail.tsx`
- Modify: `src/renderer/pages/PurchaseForm.tsx`, `src/renderer/pages/KioskPage.tsx`

**Interfaces:**
- Consumes: canales de Tasks 2 y 3; `PaymentModeFields` (`PaymentModeFields.tsx`).
- Produces: `PurchaseDetail({ purchaseId: number; onChanged: () => void; onClose: () => void })`, un `Dialog` con título "Entrega del dd/mm/aaaa" que usa `purchases:get`; `PurchaseForm` acepta `purchase?: KioskPurchase` (modo modificar).

- [ ] **Step 1:** `PurchaseForm`: "Fecha de entrega"; en alta, `PaymentModeFields` (completo / parcial / sin pago) armando `initialPayment` como `SellPlanForm` (sin pago si el total es 0); "Total: $X". Con `purchase`: precarga fecha y líneas, sin la parte de pago, guarda con `purchases:update`, título "Modificar entrega".
- [ ] **Step 2:** `PurchaseDetail`: fecha de entrega y "Cargada el …"; tabla Producto / Cantidad / Costo / Costo unitario y total; tabla de pagos (Fecha, Medio, Monto, Estado, "Anular" en los activos con confirmación); "Debe $X" o "Pagada"; "Registrar pago" (monto sugerido: la deuda; medio; fecha hoy) si debe; "Modificar" si no está anulada; "Anular entrega" si no hay pagos activos. Los cuatro estados (cargando, error, vacío no aplica, ideal). Cada cambio llama a `onChanged`.
- [ ] **Step 3:** `KioskPage` → bloque de entregas: "Se le debe al proveedor: $X" (`owedCents`) y `CheckboxField` "Solo con deuda" (deshabilita el mes); tabla Llegó (dd/mm) / Productos / Total / Debe ("Pagada" o el monto en rojo) / botón "Ver"; tocar la fila abre el detalle (ignorando clicks en botones y links); se saca "Anular" de la fila.
- [ ] **Step 4:** `npm run typecheck && npm run lint` → verde. Commit: `feat: see, pay and edit a delivery from the kiosk`.

### Task 6: Gastos — filas de mercadería

**Files:**
- Modify: `src/renderer/pages/ExpensesPage.tsx`

**Interfaces:**
- Consumes: `ExpenseMonth.supplierPayments`, `supplierCents` (Task 4); `PurchaseDetail` (Task 5).

- [ ] **Step 1:** La tabla mezcla gastos y pagos al proveedor por fecha (más nuevo primero). Fila de pago: Fecha (dd/mm), "Mercadería del kiosco", "Entrega del dd/mm: {productsLabel}", Medio (sin casilla), Importe, sin Repetir ni Anular; tocarla abre `PurchaseDetail`, y al cambiar algo se recarga el mes.
- [ ] **Step 2:** Resumen: "Total del mes" = `totalCents`; "Mercadería del kiosco" = `supplierCents` y filtra la tabla (seleccionada como las categorías); deja de usar `purchases:list`.
- [ ] **Step 3:** `npm run typecheck && npm run lint` → verde. Commit: `feat: show supplier payments among the expenses`.

### Task 7: E2E, layout y documentación

**Files:**
- Modify: `e2e/kiosk.spec.ts`, `CLAUDE.md`

- [ ] **Step 1:** Reescribir `a supplier delivery sets the unit cost and shows in Gastos`: cargar con "Pago parcial" de $10.000 → la fila dice "Debe" $20.400 y "Se le debe al proveedor" lo muestra; abrir el detalle tocando la fila; "Modificar" cambia la cantidad de Chicle y el total; "Registrar pago" por el resto → "Pagada"; en Gastos aparecen dos filas "Mercadería del kiosco" y el resumen suma los dos pagos; tocar una abre el detalle. Para anular: anular los dos pagos desde el detalle y después "Anular entrega" → Gastos en $0.
- [ ] **Step 2:** `npm run test:e2e` → todo en verde, incluido `layout.spec.ts` en las tres ventanas.
- [ ] **Step 3:** `CLAUDE.md`, regla del kiosco: "La mercadería cuenta en el balance a medida que se paga cada pago al proveedor; la deuda con el proveedor es total de la entrega − pagos; las entregas se pueden modificar."
- [ ] **Step 4:** `npm run audit` (sin altos nuevos), `gitleaks protect --staged`. Commit: `test: supplier payments end to end` y `docs: supplier payments`.
