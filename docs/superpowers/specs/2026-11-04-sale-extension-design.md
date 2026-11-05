# Lebloc — Extender un plan vendido (diseño)

Fecha: 2026-11-04

## Contexto y por qué

Cuando llega un cliente nuevo, se lo anota y se le vende una prueba: un pase libre suelto o una clase con profe. Si después de la clase quiere seguir, hoy hay que venderle un plan aparte, y lo que pagó por la prueba queda en otra venta.

El usuario quiere **extender** la venta de la prueba al plan que el cliente elige. Lo pagado cuenta como pago del plan nuevo y la clase que hizo cuenta como la primera. Sirve para cualquier venta que no esté vencida, no solo para pruebas.

## Decisiones del usuario

- Lo pagado cuenta como pagado del plan nuevo. La deuda pasa a ser el total nuevo menos lo pagado.
- La clase ya usada cuenta como la primera del plan nuevo: con un plan de 8, le quedan 7.
- **El profesor no se cambia.**
- Se puede extender cualquier venta **no vencida**, le queden pases o no.
- Una venta con profe solo se extiende a planes con clases con profe (incluye mixtos).
- Una venta libre se extiende a un plan libre o mixto, y en el mixto se elige el profe en ese momento. A un plan solo con profe, no.

## Objetivos

1. Desde la ficha del cliente, extender una venta no vencida a otro plan activo, con un pago opcional en el momento.
2. Los pagos y los consumos de la venta quedan como están. La deuda y los pases restantes se recalculan.
3. Cada extensión deja registro (plan y precios anteriores, y cuándo), y la ficha muestra la última.

## No objetivos

- Cambiar el profesor de una venta.
- Deshacer una extensión: se corrige extendiendo de nuevo al plan correcto.
- Saldo a favor o devoluciones.
- Extender ventas vencidas o anuladas.
- Cambiar la fecha de venta.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que cambie el balance de meses pasados: lo que ya entró al local y lo que ya se le asignó al profe por pagos hechos.
- Que, al saldarse la venta, el profe termine con más o con menos que el monto del plan nuevo.
- Perder el rastro de lo que era la venta antes.

## Diseño

Se modifica la misma venta en lugar de anular una y crear otra. Los pagos y los consumos siguen apuntando a la misma `sale_id`, así que no hay que mover nada.

### Reglas — `src/domain/sale.ts`

`buildExtension(current, plan, teacher, splitRule): SaleSnapshot` es pura. `current` trae:

- `voidedAt`, `expired`, `planId`, `teacherId`;
- `usedFree`, `usedTeacher`;
- `allocatedLocalCents`, `allocatedTeacherCents`.

Valida en este orden:

1. Anulada → `SALE_VOIDED`. Vencida → `SALE_EXPIRED`.
2. `plan.id === current.planId` → `SAME_PLAN`.
3. Profesor:
   - Si la venta tiene profe:
     - el plan no trae clases con profe → `EXTENSION_NEEDS_TEACHER_PLAN`;
     - `teacher?.id !== current.teacherId` → `TEACHER_CHANGE_NOT_ALLOWED`.
   - Si la venta no tiene profe y el plan no trae clases libres → `EXTENSION_NEEDS_FREE_PASSES`.
4. `buildSaleSnapshot(plan, teacher, splitRule)`. Así se reusan `INACTIVE_PLAN`, `TEACHER_REQUIRED`, `INACTIVE_TEACHER` y `TEACHER_AMOUNT_MISSING`.
5. `usedFree > snapshot.freePasses` o `usedTeacher > snapshot.teacherPasses` → `USED_PASSES_DONT_FIT`.
6. `allocatedLocalCents > snapshot.localPriceCents` o `allocatedTeacherCents > snapshot.teacherSurchargeCents` → `PAID_EXCEEDS_PLAN`.

La regla 6 cubre dos casos:
- el total nuevo es menor que lo pagado;
- de una venta con profe ya se le asignó al profe más que el monto del plan nuevo.

Los pagos anteriores no se reasignan, así que cada parte nueva tiene que alcanzar para lo que ya se le asignó.

### Reparto de pagos — `src/domain/allocation.ts`

Después de una extensión, la regla proporcional puede pedir para el profe más que el pago. Ejemplo:
- la prueba de $7.000 fue toda al local;
- la extensión es a un mixto de $28.000 + $14.000;
- un pago de $2.000 da un objetivo para el profe de `round(9.000 × 14.000 / 42.000) = 3.000`.

Arreglo: la parte del profe calculada por cualquier regla se acota a `[max(0, monto − pendienteLocal), min(monto, pendienteProfe)]`, donde:
- `pendienteLocal = (total − recargo) − asignadoLocal`
- `pendienteProfe = recargo − asignadoProfe`

Sin extensiones, el resultado no cambia, y los tests actuales tienen que seguir en verde. Al saldarse la venta, el profe recibe exactamente su monto.

### Datos — migración `014_sale_extensions`

```sql
CREATE TABLE sale_extensions (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  extended_at TEXT NOT NULL,              -- fecha y hora (nowIso)
  from_plan_id INTEGER NOT NULL REFERENCES plans(id),
  from_plan_name TEXT NOT NULL,
  from_free_passes INTEGER NOT NULL,
  from_teacher_passes INTEGER NOT NULL,
  from_local_price_cents INTEGER NOT NULL,
  from_teacher_surcharge_cents INTEGER NOT NULL,
  from_split_rule TEXT NOT NULL,
  from_expires_at TEXT NOT NULL
);
CREATE INDEX sale_extensions_sale ON sale_extensions (sale_id);
```

- **No se guardan:** el total anterior (es local + recargo) ni el profe anterior (es el mismo, o ninguno si `from_teacher_passes = 0`).
- **Se actualizan en `sales`:** `plan_id`, `plan_name`, `free_passes`, `teacher_passes`, `local_price_cents`, `teacher_id`, `teacher_surcharge_cents`, `total_cents`, `split_rule` y `expires_at`.
- **No cambia:** `sold_at`.

### Servicio — `extendSale(ctx, input)` en `src/main/services/sales.ts`

En una sola transacción:

1. Toma la venta con `getSale` y llama a `requireActiveClient`.
2. Busca el plan con `getPlan` y el profe con `getTeacher` si `input.teacherId` no es null.
3. Calcula `usedFree = freePasses − remainingFree` (y lo mismo para profe). Vale porque una venta vencida ya se rechaza en el paso 1 de las reglas. Lo asignado sale de `paymentsRepo.activeAllocationTotals`.
4. Llama a `buildExtension`. Si `input.expiresAt < sale.soldAt` → `EXPIRY_BEFORE_SALE`.
5. Inserta la fila en `sale_extensions` con los valores anteriores y actualiza `sales`.
6. Si viene un pago, llama a `registerPayment({ saleId, ...input.payment })`. Si el pago falla, por ejemplo porque supera la deuda, se revierte todo.
7. Devuelve `getSale`.

`Sale` suma `extendedFrom: { planName: string; extendedAt: string } | null` con la última extensión. Sale de una subconsulta en `SALE_SELECT`.

### Contrato

- `sales:extend` `{ saleId, planId, teacherId: id | null, splitRule, expiresAt, payment: newPaymentFields | null }` → `Sale`.
  - Se agrega como cualquier canal: `channels.ts`, `apiSchemas`/`ApiOutputs` y `handlers.ts`.
- Errores nuevos en `ERROR_MESSAGES`:

| Código | Mensaje |
|---|---|
| `SALE_EXPIRED` | La venta está vencida: no se puede extender. |
| `SAME_PLAN` | La venta ya es de ese plan. |
| `TEACHER_CHANGE_NOT_ALLOWED` | El profesor de la venta no se puede cambiar. |
| `EXTENSION_NEEDS_TEACHER_PLAN` | Una venta con profesor solo se extiende a un plan con clases con profesor. |
| `EXTENSION_NEEDS_FREE_PASSES` | Una venta libre solo se extiende a un plan con clases libres. |
| `USED_PASSES_DONT_FIT` | Las clases que ya usó no entran en el plan nuevo. |
| `PAID_EXCEEDS_PLAN` | Lo que ya pagó supera el precio del plan nuevo. |

### UI — ficha del cliente (`ClientDetailPage.tsx`)

**Tarjeta de la venta (`SaleCard`)**
- Botón **"Extender"** (secondary) cuando la venta no está anulada ni vencida y la ficha no está deshabilitada.
- "Renovar" sigue igual: es una venta nueva.
- Debajo del encabezado: "Extendida el 04/11 · antes: Pase libre suelto".

**Diálogo "Extender plan"**
- **Arriba:** "Pase libre suelto del 02/11 · pagó $7.000 · usó 1 libre".
- **Plan:**
  - solo los activos que respetan la regla de tipo (con profe → `teacherPasses > 0`; libre → `freePasses > 0`), sin el plan actual;
  - si no queda ninguno, estado vacío "No hay planes a los que extender esta venta", con link a Planes.
- **Profesor:**
  - si la venta tiene profe, se muestra fijo ("Profesor: Diego") y no se elige;
  - si no tiene y el plan trae clases con profe, se elige con un select.
- **Reparto de pagos:** cuando el plan trae clases con profe, con la regla actual de la venta por defecto.
- **Vence el:** con el vencimiento actual por defecto; se puede cambiar y no puede ser anterior a la venta.
- **Resumen:**
  - total nuevo, ya pagado y queda debiendo;
  - pases que le quedan (libres y con profe) después de extender;
  - los errores de `buildExtension` se muestran antes de confirmar, como hoy hace `previewSale`.
- **Pago:** los mismos modos que al vender (completo = la deuda que queda, parcial, sin pago ahora), con medio y fecha.
- Al confirmar: aviso "Plan extendido."
- Los 4 estados: carga con `AsyncView`, error, vacío (sin planes posibles) e ideal.

### Efectos en otras pantallas

- **Balance:** los pagos anteriores no se tocan. Los nuevos se reparten según la venta extendida.
- **Profesores:** lo ganado sale de `payments.teacher_cents` y no cambia hacia atrás. Las clases pendientes se recalculan solas.
- **Deudores y Mostrador:** la deuda, los pases y el estado se recalculan solos. "Inició el" sigue mostrando `sold_at`.
- **Ranking de planes:** la venta cuenta como el plan nuevo, en el mes en que se vendió.

## Pruebas (TDD)

- **`domain/sale.test.ts` (`buildExtension`):**
  - libre → libre;
  - libre → mixto con profe elegido;
  - con profe → con profe con el mismo profe;
  - cada error: anulada, vencida, mismo plan, otro profe, libre → solo con profe, con profe → libre, mixto con libres usados → solo con profe, pagado que supera.
- **`domain/allocation.test.ts`:**
  - el caso del ejemplo: $2.000 → todo al profe;
  - una venta extendida que se salda deja al profe con exactamente su monto, con las tres reglas.
- **`services/sales.test.ts`:**
  - la prueba usada + Pack 8 → le quedan 7 y la deuda baja por lo pagado;
  - pagos y consumos intactos y la fila de extensión guardada;
  - pago en el momento;
  - un pago que falla revierte la extensión;
  - cliente archivado → `CLIENT_ARCHIVED`.
- **`db/migrations.test.ts`:** la versión nueva.
- **E2E (`core-flow.spec.ts`):** extender un pase libre suelto usado a Pack 8 con pago parcial. La tarjeta muestra "Extendida…" y 7 libres.

## Decisiones del asistente (revisar)

- **Vencimiento:** queda el que tenía la venta y se puede cambiar en el diálogo. No se recalcula desde el día de la extensión.
- **Pago:** se puede cobrar en el mismo diálogo.
- **Mismo plan:** no se puede extender al mismo plan (`SAME_PLAN`).
- **Profe inactivo:** si el profe de la venta está inactivo, no se puede extender (`INACTIVE_TEACHER`).
- **Cliente archivado:** tampoco se puede extender.
- **Reparto:** se puede cambiar al extender a un plan con profe.
- **Ranking de planes:** cuenta la venta como el plan nuevo en su mes original.
- **Para quien lo construya:** si el bloque de pago se extrae de `SellPlanForm` para reusarlo, o si se agrega una venta extendida al seed.
