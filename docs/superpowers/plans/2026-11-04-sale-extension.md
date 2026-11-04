# Extender un plan vendido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender una venta no vencida a otro plan desde la ficha del cliente. Lo pagado y las clases usadas cuentan en el plan nuevo.

**Architecture:** La misma fila de `sales` toma el snapshot del plan nuevo. Los pagos y los consumos no se mueven. El snapshot anterior queda en `sale_extensions`. Las reglas son puras, en `domain/sale.ts`. `allocatePayment` se acota para que las partes ya asignadas nunca den una parte negativa.

**Tech Stack:** Electron + better-sqlite3, React + Tailwind, Zod, Vitest (runtime de Electron), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-sale-extension-design.md`

## Global Constraints

- Dinero en centavos enteros.
- Los movimientos no se borran. `sold_at` de la venta no cambia.
- Errores de negocio: `throw new DomainError(code)`, con el mensaje en español en `ERROR_MESSAGES` (`src/domain/errors.ts`).
- Textos de UI en español rioplatense. Código, nombres y commits en inglés (Conventional Commits).
- TypeScript estricto, sin `any`.
- Vitest solo con `npm test` (nunca con el `node` del sistema).
- Commits `test:` en RED están permitidos en la rama; se hace squash antes de `main`.
- Cada componente nuevo cubre los 4 estados: carga, error, vacío e ideal.

## Review Focus

1. **Profe inactivo.** Una venta cuyo profesor quedó inactivo no se extiende (`INACTIVE_TEACHER`). El diálogo lo avisa antes de confirmar. → test en Task 1.
2. **Pagos anulados.** No cuentan como asignados al decidir `PAID_EXCEEDS_PLAN`. → test de `extensionStateOf` en Task 1.
3. **Vencimiento hoy.** Una venta que vence hoy todavía se puede extender, porque el vencimiento es inclusivo. → test en Task 3.
4. **Extender dos veces.** La segunda extensión guarda como "anterior" al plan de la primera, y `extendedFrom` muestra la última. → test en Task 3.
5. **"Pago completo" sin deuda.** Si el plan nuevo queda saldado con lo pagado (deuda 0), no se envía ningún pago, igual que hoy `SellPlanForm` con total 0. → Task 4, paso del formulario.

---

### Task 1: Reglas de la extensión

**Files:**
- Modify: `src/domain/sale.ts`, `src/domain/errors.ts`
- Test: `src/domain/sale.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SaleForExtension {
    planId: number;
    teacherId: number | null;
    voided: boolean;
    expired: boolean;
    used: PassCounts;              // from './passes'
    allocatedLocalCents: number;
    allocatedTeacherCents: number;
  }
  export function extensionStateOf(
    sale: { planId: number; teacherId: number | null; voidedAt: string | null; expired: boolean;
            freePasses: number; teacherPasses: number; remainingFree: number; remainingTeacher: number },
    payments: readonly { localCents: number; teacherCents: number; voidedAt: string | null }[],
  ): SaleForExtension;
  /** Same plan or wrong kind: the plans the dialog must not offer. */
  export function extensionKindError(
    sale: Pick<SaleForExtension, 'planId' | 'teacherId'>,
    plan: Pick<PlanForSale, 'id' | 'freePasses' | 'teacherPasses'>,
  ): 'SAME_PLAN' | 'EXTENSION_NEEDS_TEACHER_PLAN' | 'EXTENSION_NEEDS_FREE_PASSES' | null;
  export function buildExtension(sale: SaleForExtension, plan: PlanForSale, teacher: TeacherForSale | null, splitRule: SplitRule): SaleSnapshot;
  ```
- New codes in `ERROR_MESSAGES`, with these exact texts:

  | Código | Mensaje |
  |---|---|
  | `SALE_EXPIRED` | La venta está vencida: no se puede extender. |
  | `SAME_PLAN` | La venta ya es de ese plan. |
  | `TEACHER_CHANGE_NOT_ALLOWED` | El profesor de la venta no se puede cambiar. |
  | `EXTENSION_NEEDS_TEACHER_PLAN` | Una venta con profesor solo se extiende a un plan con clases con profesor. |
  | `EXTENSION_NEEDS_FREE_PASSES` | Una venta libre solo se extiende a un plan con clases libres. |
  | `USED_PASSES_DONT_FIT` | Las clases que ya usó no entran en el plan nuevo. |
  | `PAID_EXCEEDS_PLAN` | Lo que ya pagó supera el precio del plan nuevo. |

- [ ] **Step 1: Write the failing tests** in a new `describe('buildExtension')` in `sale.test.ts`.

  Fixtures, reusing the file's `freePlan` (id 1, 8 libres, local 2_000_000), `mixedPlan` (id 2, 4+4, local 2_000_000 + profe 1_000_000) and `teacher` (id 7):
  ```ts
  const teacherOnlyPlan: PlanForSale = { id: 3, name: 'Escuelita', freePasses: 0, teacherPasses: 4, priceCents: 2_000_000, teacherAmountCents: 1_200_000, active: true };
  const trial: SaleForExtension = { planId: 9, teacherId: null, voided: false, expired: false, used: { free: 1, teacher: 0 }, allocatedLocalCents: 700_000, allocatedTeacherCents: 0 };
  const withTeacher: SaleForExtension = { planId: 9, teacherId: 7, voided: false, expired: false, used: { free: 0, teacher: 1 }, allocatedLocalCents: 300_000, allocatedTeacherCents: 200_000 };
  ```
  Tests (`it` names in English):
  - free trial → `freePlan`: equals `buildSaleSnapshot(freePlan, null, 'proportional')`.
  - free trial → `mixedPlan` with `teacher`: `teacherId` 7, `totalCents` 3_000_000.
  - `withTeacher` → `mixedPlan` with `teacher`: `teacherSurchargeCents` 1_000_000.
  - Each of these throws the given code (use `expectDomainError`):
    - `{ ...trial, voided: true }` → `SALE_VOIDED`
    - `{ ...trial, expired: true }` → `SALE_EXPIRED`
    - `{ ...trial, planId: 1 }` → `freePlan` → `SAME_PLAN`
    - `withTeacher` → `mixedPlan` with `{ id: 8, active: true }` → `TEACHER_CHANGE_NOT_ALLOWED`
    - `withTeacher` → `mixedPlan` with `null` → `TEACHER_CHANGE_NOT_ALLOWED`
    - `withTeacher` → `freePlan` → `EXTENSION_NEEDS_TEACHER_PLAN`
    - `trial` → `teacherOnlyPlan` with `teacher` → `EXTENSION_NEEDS_FREE_PASSES`
    - `{ ...withTeacher, used: { free: 1, teacher: 1 } }` → `teacherOnlyPlan` with `teacher` → `USED_PASSES_DONT_FIT`
    - `{ ...trial, allocatedLocalCents: 2_000_001 }` → `freePlan` → `PAID_EXCEEDS_PLAN`
    - `{ ...withTeacher, allocatedTeacherCents: 1_000_001 }` → `mixedPlan` with `teacher` → `PAID_EXCEEDS_PLAN`
    - `withTeacher` → `mixedPlan` with `{ id: 7, active: false }` → `INACTIVE_TEACHER`
  - `extensionStateOf` with payments `[{ localCents: 700_000, teacherCents: 0, voidedAt: null }, { localCents: 500_000, teacherCents: 0, voidedAt: '2026-10-06T10:00:00.000Z' }]` and a sale of 8 free with 6 remaining → `used` `{ free: 2, teacher: 0 }`, `allocatedLocalCents` 700_000.
  - `extensionKindError({ planId: 9, teacherId: null }, teacherOnlyPlan)` → `'EXTENSION_NEEDS_FREE_PASSES'`; with `freePlan` → `null`.

- [ ] **Step 2: Run** `npm test -- src/domain/sale.test.ts`. Expected: FAIL (`buildExtension` is not exported).

- [ ] **Step 3: Implement** the types and the three functions in `sale.ts`, and the codes in `errors.ts`.

  `buildExtension` validates in this order:
  1. voided → `SALE_VOIDED`; expired → `SALE_EXPIRED`.
  2. `extensionKindError` → throw it if it isn't null.
  3. Sale with a teacher and `teacher?.id !== sale.teacherId` → `TEACHER_CHANGE_NOT_ALLOWED`.
  4. `buildSaleSnapshot(plan, teacher, splitRule)`.
  5. Used passes > the snapshot's passes, for either kind → `USED_PASSES_DONT_FIT`.
  6. Allocated local > `localPriceCents`, or allocated teacher > `teacherSurchargeCents` → `PAID_EXCEEDS_PLAN`.

  `extensionStateOf`:
  - `used = passes − remaining`, for each kind;
  - allocated = sum over the payments with `voidedAt === null`.

- [ ] **Step 4: Run** `npm test -- src/domain/sale.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `feat: rules for extending a sold plan`.

### Task 2: Reparto acotado después de una extensión

**Files:**
- Modify: `src/domain/allocation.ts`
- Test: `src/domain/allocation.test.ts`

**Interfaces:** `allocatePayment` keeps its signature.

- [ ] **Step 1: Write the failing tests.**

  Give `payInSequence` an optional 5th parameter `start = { localCents: 0, teacherCents: 0 }` for the starting allocations.

  The scenario: a trial of 700_000, all of it to the local, extended to total 4_200_000 with surcharge 1_400_000.
  - `it('proportional: right after an extension the teacher catch-up never exceeds the payment')`: `payInSequence('proportional', 4_200_000, 1_400_000, [200_000], { localCents: 700_000, teacherCents: 0 })` → `[{ localCents: 0, teacherCents: 200_000 }]`.
  - `it.each(SPLIT_RULES)('%s: an extended sale settles with the teacher getting exactly the surcharge')`:
    - payments `[200_000, 1_000_000, 2_300_000]`, same start;
    - teacher sum = 1_400_000;
    - local sum = 2_100_000;
    - every part ≥ 0.

- [ ] **Step 2: Run** `npm test -- src/domain/allocation.test.ts`. Expected: the new tests FAIL (local part negative).

- [ ] **Step 3: Implement** in `allocatePayment`. Clamp the result of `teacherShare` like this:
  ```ts
  const localPending = input.totalCents - input.surchargeCents - input.allocatedLocalCents;
  const teacherPending = input.surchargeCents - input.allocatedTeacherCents;
  const teacherCents = Math.min(Math.max(teacherShare(input, paidBefore), input.amountCents - localPending, 0), input.amountCents, teacherPending);
  ```

- [ ] **Step 4: Run** `npm test -- src/domain/allocation.test.ts`. Expected: all PASS, including the ones that already existed.

- [ ] **Step 5: Commit** `fix: keep payment splits within each part after a sale changes`.

### Task 3: Guardar la extensión y el canal `sales:extend`

**Files:**
- Create: `src/main/db/migrations/014_sale_extensions.ts`
- Modify:
  - `src/main/db/migrations.ts`
  - `src/main/repos/sales.ts`
  - `src/main/services/sales.ts`
  - `src/shared/types.ts`, `src/shared/schemas.ts`, `src/shared/channels.ts`, `src/shared/api.ts`
  - `src/main/ipc/handlers.ts`
- Test: `src/main/services/sales.test.ts`

**Interfaces:**
- Consumes (Task 1): `extensionStateOf`, `buildExtension`.
- Produces:
  - **Migration:** `migration014`, with the table and index exactly as in the spec ("Datos").
  - **Type:** `Sale.extendedFrom: { planName: string; extendedAt: string } | null`, the latest extension.
    - `extendedAt` is `nowIso`.
    - It is read in `SALE_SELECT` with two subqueries ordered by `id DESC LIMIT 1`, and grouped into the object in `toSale`.
  - **Schema:**
    - `saleExtensionInput = z.object({ saleId: id, planId: id, teacherId: id.nullable(), splitRule: splitRuleSchema, expiresAt: isoDate, payment: z.object(newPaymentFields).nullable() })`
    - `export type SaleExtensionInput`.
  - **Channel:** `'sales:extend'`, with `apiSchemas['sales:extend'] = schemas.saleExtensionInput` and `ApiOutputs['sales:extend'] = T.Sale`.
  - **Repo** (`repos/sales.ts`):
    - `insertExtension(db: Db, from: Sale, extendedAt: string): void` copies the `from_*` columns out of `from`.
    - `applySnapshot(db: Db, saleId: number, snapshot: SaleSnapshot, expiresAt: string): void` does a single `UPDATE` of the columns the spec lists.
  - **Service:** `extendSale(ctx: Context, input: SaleExtensionInput): Sale`.

- [ ] **Step 1: Write the failing tests** in `describe('extendSale')` in `sales.test.ts`.

  Extra plans in `beforeEach`:
  - `trialPlanId = createPlan(ctx, { name: 'Pase libre suelto', freePasses: 1, teacherPasses: 0, priceCents: 700_000, teacherAmountCents: 0, active: true }).id`
  - `teacherOnlyPlanId` for "Escuelita" (0 + 4, 2_000_000 + 1_200_000).

  `trial()` sells `saleOf({ planId: trialPlanId, initialPayment: { amountCents: 700_000, method: 'cash', paidAt: '2026-10-05' } })` and calls `consume(ctx, { clientId, kind: 'free', note: null })`.

  `extension(saleId, overrides)` builds `{ saleId, planId: freePlanId, teacherId: null, splitRule: 'proportional', expiresAt: FAR_EXPIRY, payment: null, ...overrides }`.

  The tests:
  - `'a used trial extended to Pack 8 keeps its payment and its pass: 7 left, the debt drops by what was paid'` → `toMatchObject`:
    - `{ planName: 'Pack 8 libres', soldAt: '2026-10-05', totalCents: 2_000_000, paidCents: 700_000, debtCents: 1_300_000, remainingFree: 7 }`
    - `extendedFrom: { planName: 'Pase libre suelto', extendedAt: TEST_NOW.toISOString() }`
  - `'a free trial extended to a mixed plan takes the chosen teacher and its amount'` → `{ teacherId, teacherSurchargeCents: 1_000_000, totalCents: 3_000_000 }`.
  - `'keeps the previous plan and prices'`: `SELECT * FROM sale_extensions` has a row with `from_plan_name: 'Pase libre suelto', from_free_passes: 1, from_local_price_cents: 700_000, from_teacher_surcharge_cents: 0`.
  - `'charges a payment in the same step'`: payment of 1_300_000 → `debtCents` 0.
  - `'a payment that fails leaves the sale as it was'`: payment of 1_300_001 → `PAYMENT_EXCEEDS_DEBT`. Afterwards `getSale` still has `planName` 'Pase libre suelto' and `sale_extensions` is empty.
  - `'extending twice records the plan it came from each time'`: trial → Pack 8 → Pack 4+4 with `teacherId`. `extendedFrom.planName` = 'Pack 8 libres' and there are 2 rows.
  - `'a sale that expires today can still be extended'`: sell with `expiresAt: '2026-10-05'` → OK.
  - `'an archived client cannot extend'` → `CLIENT_ARCHIVED`.
  - `'the expiry may not be before the sale'`: `expiresAt: '2026-10-04'` → `EXPIRY_BEFORE_SALE`.

- [ ] **Step 2: Run** `npm test -- src/main/services/sales.test.ts`. Expected: FAIL (`extendSale` does not exist).

- [ ] **Step 3: Implement** the migration and register it after `migration013`. Then `Sale.extendedFrom`, the repo functions, the schema, the channel and `extendSale`.

  `extendSale` works in a single `ctx.db.transaction`:
  1. `getSale`, then `requireActiveClient`, then `getPlan`. The teacher is `null` when `input.teacherId === null`, otherwise `getTeacher`.
  2. `buildExtension(extensionStateOf(sale, paymentsRepo.listPaymentsForSale(ctx.db, sale.id)), plan, teacher, input.splitRule)`.
  3. `input.expiresAt < sale.soldAt` → `EXPIRY_BEFORE_SALE`.
  4. `insertExtension(ctx.db, sale, nowIso(ctx))`, then `applySnapshot`.
  5. If there is a payment, `registerPayment(ctx, { saleId: sale.id, ...input.payment })`.
  6. Return `getSale`.

  Then the handler `'sales:extend': (input) => extendSale(ctx, input)`.

- [ ] **Step 4: Run** `npm test` (the whole suite: migrations and the services that build a `Sale`) and `npm run typecheck`. Expected: PASS with no errors.

- [ ] **Step 5: Commit** `feat: extend a sold plan keeping its payments and used passes`.

### Task 4: Diálogo "Extender plan" en la ficha

**Files:**
- Create:
  - `src/renderer/pages/PaymentModeFields.tsx`: the payment block taken out of `SellPlanForm`.
  - `src/renderer/pages/ExtendSaleForm.tsx`.
- Modify: `src/renderer/pages/SellPlanForm.tsx`, `src/renderer/pages/ClientDetailPage.tsx`
- Test: `e2e/core-flow.spec.ts`

**Interfaces:**
- Consumes:
  - `extensionStateOf`, `extensionKindError`, `buildExtension` (Task 1);
  - `call('sales:extend', SaleExtensionInput)` and `Sale.extendedFrom` (Task 3).
- Produces:
  - **`PaymentModeFields`:**
    - props `{ mode, onModeChange, amount, onAmountChange, method, onMethodChange, paidAt, onPaidAtChange, amountError?: string, paidAtError?: string }`;
    - exports `type PaymentMode` and `PAYMENT_MODE_LABELS` (moved from `SellPlanForm`).
  - **`ExtendSaleForm`:** props `{ sale: Sale; payments: Payment[]; onDone: () => void; onCancel: () => void }`.

- [ ] **Step 1: Write the failing E2E** `test('extend a used trial into a pack, paying part now')` in `core-flow.spec.ts`. It follows the style of the renew test:
  1. Create the plans "Prueba libre" (1 free, local `1.000`) and "Pack 4 libres" (4 free, local `8.000`).
  2. Create the client "Carla Méndez" (born 1995-02-14).
  3. Sell "Prueba libre" (full payment by default) and click "Consumir libre".
  4. Click "Extender". The dialog shows the heading "Extender plan". Select "Pack 4 libres", pick "Pago parcial", fill "Monto del pago" with `3.000` and click "Confirmar extensión".
  5. Expect:
     - "Plan extendido.";
     - "Pases: 3 libres · 0 con profesor";
     - text `/Extendida el .* · antes: Prueba libre/`;
     - "Deuda:" containing `4.000`.

- [ ] **Step 2: Run** `npm run test:e2e -- -g "extend a used trial"`. Expected: FAIL (there is no "Extender" button).

- [ ] **Step 3: Extract `PaymentModeFields`** from `SellPlanForm`, with no change in behavior.

- [ ] **Step 4: Implement `ExtendSaleForm`.**

  **Data and states:**
  - It loads `plans:list` and `teachers:list` with `useAsync` + `AsyncView`, as `SellPlanForm` does.
  - The offered plans are those where `extensionKindError(state, plan) === null`.
  - If there are none, `EmptyState` "No hay planes a los que extender esta venta" with a link to `/planes`.
  - The preview uses `buildExtension` inside a try/catch, as `previewSale` does. Its error goes into a `Notice tone="warning"` and disables the confirm button. This covers the inactive teacher.

  **Copy:**
  - Top line: `{planName} del {dd/mm/aaaa} · pagó {money} · usó {n} libres · {m} con profesor`.
  - Teacher fixed, when the sale has one: `Profesor: {teacherName}`. Otherwise a "Profesor" select, only if the plan has teacher passes.
  - "Reparto de pagos" when the plan has teacher passes. It defaults to `sale.splitRule`.
  - "Vence el" defaults to `sale.expiresAt`, with `min={sale.soldAt}`.
  - Summary: "Total nuevo", "Ya pagado", "Queda debiendo" and `Le quedan: {x} libres · {y} con profesor`.
  - Submit button "Confirmar extensión".

  **What it sends:**
  - `teacherId` is `sale.teacherId` when the sale already has one.
  - `splitRule` is `sale.splitRule` when the plan has no teacher passes.

  **Payment:**
  - "Pago completo" sends `debt = total − paidCents`, and sends `payment: null` if the debt is 0.
  - "Pago parcial" sends the typed amount.
  - Validate with `saleExtensionInput.safeParse`.

- [ ] **Step 5: Wire it in `ClientDetailPage`.**
  - In `SaleCard`, a secondary "Extender" button when `!voided && !sale.expired && !disabled`, through `onExtend(sale)`.
  - The state `extendingSale` and a `Dialog` titled "Extender plan". It passes `payments` filtered by `saleId`. `onDone` shows the notice "Plan extendido." and calls `reload()`.
  - Under the card's header, when there is `sale.extendedFrom`: `Extendida el {formatDateTime(extendedAt)} · antes: {planName}`.

- [ ] **Step 6: Run** `npm run test:e2e`. Expected: all PASS, including the existing sell and renew tests that use the extracted block.

- [ ] **Step 7: Commit** `feat: extend a sold plan from the client's file`.

### Task 5: Cierre (Definición de terminado)

- [ ] **Step 1:** `npm test && npm run typecheck && npm run lint`. Expected: everything green, no errors.
- [ ] **Step 2:** `npm run audit` and `gitleaks detect`. Expected: no high or critical vulnerabilities, no leaks.
- [ ] **Step 3:** Manual review with `npm run seed`: extend a seed client's sale and check the card, Deudores and Profesores.
- [ ] **Step 4:** Update the "Reglas de dominio no obvias" section of `CLAUDE.md` with one line: "Extender una venta: misma fila, snapshot anterior en `sale_extensions`; el profe no cambia y lo pagado y las clases usadas tienen que entrar en el plan nuevo." Commit `docs: note how sale extensions work`.
