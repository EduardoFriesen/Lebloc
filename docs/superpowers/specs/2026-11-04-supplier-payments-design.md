# Lebloc — Pagos al proveedor en partes, detalle de la entrega y entregas en Gastos (diseño)

Fecha: 2026-11-04

## Contexto y por qué

Hoy una entrega del proveedor se carga ya pagada: tiene una fecha de pago y un medio, y su costo entra en el balance ese día. En la práctica al proveedor se le paga a veces en partes, y el usuario quiere:

1. Pagar una entrega completa, en partes o más adelante, **sin perder la deuda** con el proveedor.
2. Tocar una entrega y ver su **detalle** (qué llegó, a qué costo, cómo se pagó).
3. Ver en **Gastos** la plata que se fue en mercadería, junto con el resto de los gastos.

## Decisiones del usuario

- Los pagos al proveedor pueden ser parciales, y la deuda no se puede perder ("buscá la mejor forma").
- Aprobó la propuesta: la entrega es lo que llegó y los pagos van aparte, como las ventas de planes; Gastos muestra cada pago como "Mercadería del kiosco" y **suma al total del mes**.
- Al tocar una fila de las entregas se ve el detalle del ingreso.
- Al aprobar el diseño pidió que **las entregas se puedan modificar**.

## Decisiones mías (el usuario no las contestó)

- **Un solo proveedor**, como hoy: no se guarda de quién es la entrega. Si más adelante hay varios, se agrega una columna sin perder datos.
- Se puede anular **cualquier** pago activo de una entrega (no solo el último): los pagos al proveedor no se reparten entre partes, así que no dependen unos de otros.

## Objetivos

1. Cargar una entrega con pago completo, parcial o sin pago, y registrar más pagos después.
2. Ver cuánto se le debe al proveedor (en total, de cualquier mes) y qué entregas tienen deuda.
3. Detalle de la entrega desde Kiosco y desde Gastos.
4. En Gastos, cada pago al proveedor del mes como fila "Mercadería del kiosco", sumando al total del mes.
5. Finanzas cuenta la mercadería cuando se paga cada pago, en su fecha y con su medio.
6. Modificar una entrega: fecha de entrega y productos (cantidades y costos).

## No objetivos

- Varios proveedores.
- Editar los pagos: se anulan y se cargan de nuevo.
- Guardar el historial de cambios de una entrega: se guarda cómo quedó.
- Saldo a favor o pagos adelantados sin entrega.
- Avisos de vencimiento de la deuda con el proveedor.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que cambie algún número de meses pasados al instalar la versión (Finanzas, Gastos, Kiosco).
- Que una deuda con el proveedor quede escondida porque la entrega es de otro mes.
- Que la mercadería se cuente dos veces en Finanzas (como gasto y como mercadería).

## Diseño

Mismo esquema que las ventas de planes: la entrega es el "qué llegó" y los pagos son movimientos aparte. La deuda nunca se guarda: es el total de la entrega menos los pagos activos.

### Datos — migración `018_supplier_payments`

- `kiosk_purchases`: `paid_at` pasa a llamarse `received_at` (el día que llegó la mercadería) y se borra `method` (el medio pasa a cada pago).
- Tabla nueva `kiosk_purchase_payments`: `id`, `purchase_id` → `kiosk_purchases`, `paid_at` (fecha ISO), `amount_cents` (> 0), `method` (`cash` | `transfer`), `recorded_at`, `voided_at`. Índices por `purchase_id` y por `paid_at`.
- Datos existentes: cada entrega con total > 0 recibe **un pago por su total**, con su misma fecha, medio y `recorded_at`; si la entrega estaba anulada, el pago queda anulado con la misma fecha. Así ningún número cambia. Las entregas de total 0 no reciben pago (no deben nada).
- La migración copia los datos antes de borrar `method`. Test de migración: una base en versión 17 con una entrega activa, una anulada y una de total 0 queda con los pagos esperados y el mismo `kiosk_cost` en Finanzas.

### Reglas — `src/domain/kiosk.ts`, con sus tests

- `purchaseDebtCents(totalCents, activePaidCents)` = total − pagado.
- Pago: monto entero > 0 (`INVALID_AMOUNT`) y que no supere la deuda (`PAYMENT_EXCEEDS_DEBT`); entrega anulada → `PURCHASE_VOIDED` (código nuevo); fecha no futura (`DATE_IN_FUTURE`, como hoy). La fecha del pago puede ser anterior a la de la entrega (se cargó tarde).
- Anular una entrega: solo sin pagos activos → `PURCHASE_HAS_ACTIVE_PAYMENTS` (nuevo, "La entrega tiene pagos activos. Anulalos primero."). Ya anulada → `ALREADY_VOIDED`.
- Anular un pago: cualquiera activo; ya anulado → `ALREADY_VOIDED`.
- El costo unitario del producto sigue saliendo de la entrega (costo ÷ cantidad) al cargarla, no de los pagos.
- Modificar una entrega: no anulada (`PURCHASE_VOIDED`); fecha no futura; mismas validaciones de ítems que al cargarla; el total nuevo no puede quedar por debajo de lo pagado (`PAID_EXCEEDS_PURCHASE`, nuevo: "Lo pagado supera el total de la entrega."). Los ítems se reemplazan (no son movimientos de plata). El costo unitario de cada producto de la entrega se actualiza solo si esta es su entrega activa más reciente (por `received_at` y después `id`); los productos que se sacan de la entrega conservan su costo.

### Servidor

- `purchases:create`: entrada `{ receivedAt, items, initialPayment: { amountCents, method, paidAt } | null }` (mismos campos que el pago inicial de una venta). Todo en una transacción: si el pago es inválido no queda la entrega.
- `purchases:update` `{ id, receivedAt, items }`: modifica la entrega (reglas de arriba), en una transacción.
- `purchases:pay` `{ purchaseId, amountCents, method, paidAt }` y `purchases:voidPayment` `{ id }`.
- `purchases:get` `{ id }`: la entrega con ítems, pagos (activos y anulados), total, pagado y deuda. Lo usan los dos detalles.
- `purchases:list` `{ month, onlyOwed? }`: entregas por mes de `received_at`, cada una con `paidCents` y `debtCents`; con `onlyOwed` trae **todas las entregas con deuda de cualquier mes** y no mira el mes. Siempre devuelve también `owedCents`: lo que se le debe al proveedor en total (entregas activas de cualquier mes).
- `expenses:month`: además de los gastos, `supplierPayments` (los pagos activos al proveedor con `paid_at` en el mes: fecha, medio, monto, id y fecha de la entrega, resumen de productos) y `supplierCents` (su suma). `totalCents` pasa a ser gastos + `supplierCents`. `byCategory` sigue siendo solo de los gastos (sus categorías son las de la tabla `expenses`); la fila "Mercadería del kiosco" del resumen sale de `supplierCents`.
- Finanzas (`moneyByDay`): `kiosk_cost` sale de los pagos al proveedor (`paid_at`, filtrando por su `method`) en lugar de las entregas. Las ventas del kiosco anteriores a `kiosk_purchases_from` siguen restando su costo como hoy. No se cuenta en ningún otro lado (anti-objetivo de contar dos veces).

### Pantallas

**Kiosco → Entregas del proveedor**
- Arriba del bloque: "Se le debe al proveedor: $X" (de cualquier mes) y una casilla "Solo con deuda" que muestra todas las entregas con deuda, sin importar el mes.
- Tabla: Llegó (dd/mm), Productos, Total, Debe ($X en rojo, o "Pagada").
- Tocar una fila (o su botón "Ver", para el teclado) abre el **detalle**.
- "Cargar entrega del proveedor": la fecha pasa a llamarse "Fecha de entrega" y el pago usa `PaymentModeFields` (completo, parcial o sin pago, con medio y fecha), igual que al vender un plan.

**Detalle de la entrega** (diálogo, componente compartido)
- Fecha de entrega y cuándo se cargó.
- Tabla de productos: Producto, Cantidad, Costo, Costo unitario; y el total.
- Pagos: fecha, medio, monto, estado, con "Anular" en cada activo.
- Deuda ("Debe $X" o "Pagada"), "Registrar pago" si debe (monto sugerido: la deuda), "Modificar" si no está anulada (abre el formulario de la entrega con sus datos, sin la parte de pago) y "Anular entrega" si no tiene pagos activos.
- Al cambiar algo, se actualizan la tabla de entregas y la deuda total.

**Gastos**
- Los pagos al proveedor del mes se mezclan con los gastos en la tabla, por fecha (más nuevo primero): Fecha, "Mercadería del kiosco", Detalle ("Entrega del dd/mm: 3 × Agua, 2 × Barrita"), Medio, Importe.
- Sin casilla "Pagado" (ya es un pago) y sin Repetir ni Anular: se manejan desde Kiosco. Tocar la fila abre el detalle de la entrega.
- Resumen: "Total del mes" incluye estos pagos; "Mercadería del kiosco" filtra la tabla como las demás categorías (ya no lleva a Kiosco).

- Datos de prueba (`seed.ts`, `seedVolume.ts`) y tests que cargan entregas pasan a la entrada nueva; conviene que el seed deje alguna entrega con deuda.

## Lo que queda al constructor

- Nombres de componentes y cómo se reparte el código entre `KioskPage` y un componente nuevo del detalle.
- Paginado y tamaños, mientras pase el test de layout en las tres ventanas.
- Texto exacto de los mensajes de confirmación.

## Verificación

- Tests de dominio (deuda, pagos, anulaciones) y de servicio (crear con pago completo / parcial / sin pago, pagar, anular, `owedCents`, `onlyOwed`, Gastos y Finanzas con el mismo total que antes para entregas pagadas de una vez).
- Test de migración (ver arriba).
- E2E: cargar una entrega con pago parcial, ver la deuda, modificarla, pagar el resto desde el detalle, verla en Gastos y abrir su detalle desde ahí.
- Typecheck, lint, audit y gitleaks.
