# Plan: Mostrador como caja

Spec: `docs/superpowers/specs/2026-10-11-kiosk-design.md` (apartado "Mostrador como caja")

## Contexto
El kiosco ya está hecho en `feat/kiosk` (HEAD `bc15e66`, todo en verde). El usuario quiere que el Mostrador sirva también de caja del día:
1. **Tabla "Movimientos de hoy"** combinada en el Mostrador. Junta los tickets de kiosco y los **pagos de planes cobrados hoy**, sean de un plan vendido hoy o una cuota de uno anterior. Arriba muestra los totales de Kiosco, Planes y Total. Es **solo de consulta**: anular sigue en `/kiosco` y en la ficha del cliente.
2. **Buscador de productos** en el panel de kiosco. Sin texto, muestra los **5 más vendidos del último mes**. Al escribir, muestra los productos activos que coinciden. Si todavía no hay ventas, muestra los primeros 5 por nombre.
3. **Una barra** que separa la parte de pases de la de kiosco.

Se queda en la rama `feat/kiosk`; la spec del kiosco recibe un apartado "Mostrador como caja".

## Diseño

### Contrato (`src/shared/`)
- Canales nuevos:
  - `counter:today` (`emptyInput`) → `DayMovements`.
  - `kiosk:top` (`emptyInput`) → `Product[]`, hasta 5.
- Tipos en `types.ts`:
  ```ts
  export type DayMovement =
    | { kind: 'kiosk'; sale: KioskSale }
    | { kind: 'plan'; paymentId: number; clientId: number; clientName: string; planName: string;
        method: PaymentMethod; amountCents: number; saleTotalCents: number; debtCents: number };
  export interface DayMovements { rows: DayMovement[]; kioskCents: number; plansCents: number; totalCents: number }
  ```
- Los totales se calculan en el servicio, no se guardan.

### Backend
- **Repo de pagos del día** (`repos/payments.ts`): `listPaymentsOn(db, date)`.
  - Trae los pagos no anulados con `paid_at = date` y hace JOIN con `sales` (plan, total, pagado) y `clients` (nombre).
  - La deuda de la venta se calcula con `saleDebt` de `domain/ledger.ts`, igual que en `repos/sales.ts`.
- **Repo de más vendidos** (`repos/kioskSales.ts`): `topProducts(db, since, limit)`.
  - Toma los productos activos con un LEFT JOIN a las unidades vendidas en tickets no anulados con `sold_at >= since`.
  - Ordena por unidades descendente y después por nombre, con `LIMIT`.
  - Con eso, si hay menos de 5 vendidos, la lista se completa sola por orden alfabético.
- **Servicio nuevo** `services/counter.ts`:
  - `getDayMovements(ctx)`:
    - reúne los pagos de hoy y `listKioskSales(ctx, today)` sin los anulados;
    - los totales salen de los montos de cada fila.
  - Orden de las filas: primero los planes y después los tickets, cada grupo del más reciente al más viejo. Los pagos solo guardan la fecha, no la hora, así que no se pueden intercalar por hora.
  - El monto de un plan es lo cobrado, incluida la parte del profesor. Es una vista de caja: lo que entró, no el ingreso del local.
- **Más vendidos** en `services/kiosk.ts`: `listTopProducts(ctx)` usa como corte `since = addMonths(today, -1)`, con `addMonths` de `domain/dates.ts`. Devuelve `Product` con los derivados (reusa el mapeo de `services/products.ts`).
- **Handlers**: los dos nuevos en `ipc/handlers.ts`.
- **Tests de servicio**, que cubran:
  - un pago de hoy de un plan viejo entra;
  - un pago anulado, otro de ayer y un ticket anulado quedan afuera;
  - los totales;
  - el top ordena por unidades, ignora los anulados, los productos inactivos y las ventas de más de un mes;
  - el top se completa por nombre;
  - el límite de 5.

### UI
- **`ui/Stripe.tsx`**: se extraen de `PageHeader.tsx` las tres líneas decorativas (`aria-hidden`), y `PageHeader` pasa a usar el componente.
  - El separador del Mostrador es `<Stripe />` entre la sección de clientes y la de kiosco.
  - Es la misma identidad visual y no se crea un estilo nuevo.
- **`KioskSalePanel.tsx`**:
  - Agrega un `TextField` "Buscar producto" (`type="search"`).
  - Sin texto, el título "Más vendidos" muestra los botones de `kiosk:top`.
  - Con texto, filtra en memoria los productos activos de `products:list`, que ya se cargan: ignora mayúsculas y acentos con `normalize('NFD')`, sin dependencias.
  - Sin coincidencias, muestra "Ningún producto coincide".
  - El carrito sigue armándose con la lista completa, así que un producto buscado se puede cobrar.
  - Al cobrar se recargan el top y el callback `onSold`.
- **`components/DayMovementsTable.tsx`** (nuevo):
  - Un h2 "Movimientos de hoy" y la línea de totales "Kiosco $X · Planes $Y · Total $Z".
  - Tabla con `tableClass` y las columnas Tipo, Detalle, Medio y Monto.
    - Kiosco: el detalle es "2 × Agua, 1 × Barrita".
    - Plan: el detalle es "Cliente · Plan", con link a `/clientes/:id`, y debajo "total $X · debe $Y" solo si debe algo.
  - Los 4 estados con `AsyncView`; el vacío dice "Todavía no hay movimientos hoy".
- **`HomePage.tsx`**: el orden de la columna izquierda queda así:
  1. clientes;
  2. `<Stripe />`;
  3. `KioskSalePanel`;
  4. `DayMovementsTable`.

  Tiene un `useAsync` para `counter:today`, que se recarga al vender en el kiosco. `onSold` recarga el dashboard y los movimientos.
- **Reutilización**: `useAsync`, `AsyncView`, `TextField`, `Button`, `tableClass`, `formatMoney`, `PAYMENT_METHOD_LABELS`, `fullName` y `ListSection` si el título encaja.

### Fuera de alcance
- Anular desde el Mostrador.
- Agregar hora a los pagos (no hay columna para eso).
- Totales separados por medio de pago.

## Ejecución con varios agentes (mismo esquema que antes)
- **Ola 0 (yo):**
  - el contrato: canales, tipos y `apiSchemas`/`ApiOutputs`;
  - stubs en `handlers.ts`;
  - la extracción de `Stripe`;
  - el apartado nuevo en la spec.

  Verifico con typecheck y tests, y hago commit.
- **Ola 1, en paralelo, con archivos disjuntos y sin commits de los agentes:**
  - **A, backend:** `repos/payments.ts`, `repos/kioskSales.ts`, `services/counter.ts` (+test), `services/kiosk.ts` (+test) y `ipc/handlers.ts`, con TDD.
  - **B, UI:** `KioskSalePanel.tsx`, `DayMovementsTable.tsx` y `HomePage.tsx`.
  - Revisión por tarea y un commit por agente.
- **Ola 2, un agente:**
  - extender `e2e/kiosk.spec.ts`:
    - el buscador encuentra un producto que no está en el top;
    - el top muestra el más vendido;
    - "Movimientos de hoy" muestra el ticket y un pago de plan con sus totales;
    - el ticket anulado sale de la tabla;
  - revisar que los datos de `seed.ts` alcancen: hay pagos de hoy y ventas del último mes.
- **Ola 3:** revisión final de toda la rama, un solo paso de arreglos y una re-revisión.

## Verificación
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:e2e` (todo en verde) y `npm run audit`.
- `gitleaks detect` sobre los commits nuevos.
- Prueba a mano con `npm run seed` en el Mostrador:
  - ver la barra;
  - ver los 5 más vendidos;
  - buscar "magn" y encontrar el magnesio;
  - cobrar y ver la fila en "Movimientos de hoy" con el total actualizado;
  - registrar un pago de un plan viejo desde la ficha del cliente y volver: aparece como fila de plan con "debe $X".
