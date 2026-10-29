# Lebloc — Entregas del proveedor, kiosco fuera del Mostrador y fecha de inicio del pase (diseño)

Fecha: 2026-10-29
Reemplaza en parte: `2026-10-11-kiosk-design.md` (sin compras, cobro en el Mostrador) y `2026-10-11-expenses-staff-design.md` ("la mercadería del kiosco no es un gasto").

## Contexto y por qué

Hoy el balance resta el costo de la mercadería **venta por venta**: cada ítem de ticket guarda `unit_cost_cents` y Finanzas suma `quantity × unit_cost_cents` en la fecha de la venta (fuente `kiosk_cost`). El costo del producto sale de "unidades por paquete" y "costo del paquete", que se cargan a mano en la ficha.

El usuario quiere que el costo de la mercadería cuente **cuando le paga al proveedor**: al llegar la entrega carga qué productos trajo, cuántas unidades y cuánto le costó, y el sistema calcula el costo unitario y lo deja en el producto. Es la plata que sale de la caja ese día.

En la misma conversación pidió dos cambios más, que tocan las mismas pantallas:
- Sacar la venta del kiosco del Mostrador y llevarla a la pantalla Kiosco: el Mostrador queda solo para los pases.
- En cada cliente del Mostrador, mostrar la fecha en que inició el pase.

## Decisiones del usuario

- **Entrega del proveedor:** por cada producto se carga la cantidad que pidió (en unidades) y el costo total. Costo unitario = costo ÷ cantidad. Sin elegir "paquete o sueltas": solo cantidad y costo.
- **El costo unitario del producto se actualiza** con cada entrega. El precio sugerido se recalcula solo. El precio de venta **no** cambia solo.
- **La ficha del producto muestra solo:** nombre, descripción, costo unitario, % de ganancia, precio sugerido, precio de venta (con "Usar sugerido") y activo. Se van "unidades por paquete" y "costo del paquete".
- **El costo unitario se puede escribir a mano** (opción B del boceto): sirve para un producto nuevo antes de su primera entrega o para corregir. Cada entrega lo pisa.
- **En el balance**, lo pagado al proveedor es egreso en la fecha de pago y se deja de restar el costo de cada venta.
- **Mostrador solo con pases:** la venta del kiosco (buscar producto, botones, ticket, cobrar) pasa a Kiosco. Aprobó el boceto: "Movimientos de hoy" se queda en el Mostrador sin los tickets del kiosco y se va el renglón "Kiosco hoy" del resumen.
- **Fecha de inicio del pase:** en cada cliente que aparece al buscar en el Mostrador, "Inició el dd/mm" al lado del vencimiento.
- Aprobó todo en conjunto ("perfecto") después de ver los bocetos.
- **El kiosco ya tiene ventas reales** en la PC del mostrador: hace falta el corte por fecha para que los meses pasados no cambien.

## Objetivos

1. Cargar entregas del proveedor (varios productos, fecha de pago, medio) y anularlas.
2. El costo unitario del producto queda con el de la última entrega cargada.
3. El balance cuenta la mercadería cuando se paga, también al filtrar por Efectivo o Transferencia.
4. El Mostrador queda solo con pases; el kiosco vende desde su pantalla.
5. El cliente buscado en el Mostrador muestra cuándo inició su pase.

## No objetivos

- Stock (cuántas unidades quedan). La cantidad sirve solo para el costo unitario.
- Proveedores como entidad (nombre, datos, cuenta corriente).
- Pagos parciales o deuda con el proveedor: la entrega se paga entera en una fecha.
- Cambiar el precio de venta automáticamente.
- Mostrar la fecha de inicio en otras listas (Clientes, "Tienen que renovar", "Ingresos de hoy").

## Anti-objetivos (sería un fracaso aunque funcione)

- Contar la mercadería dos veces en un mismo período (por la venta y por la entrega).
- Que cambie el balance de los meses que ya pasaron.
- Que se mueva el precio de venta en el mostrador sin que el administrador lo decida.

## Diseño

### Datos — migración `013_kiosk_purchases.ts`

```sql
ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0);
UPDATE products SET unit_cost_cents = CAST(ROUND(pack_cost_cents * 1.0 / pack_size) AS INTEGER);
ALTER TABLE products DROP COLUMN pack_size;
ALTER TABLE products DROP COLUMN pack_cost_cents;

CREATE TABLE kiosk_purchases (
  id INTEGER PRIMARY KEY,
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_kiosk_purchases_paid_at ON kiosk_purchases(paid_at);

CREATE TABLE kiosk_purchase_items (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES kiosk_purchases(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,                                   -- snapshot, como en kiosk_sale_items
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0)           -- total de la línea
);
CREATE INDEX idx_kiosk_purchase_items_purchase ON kiosk_purchase_items(purchase_id);

-- Desde este día la mercadería cuenta por entregas; antes, por venta. Así no cambian los meses pasados.
INSERT INTO settings (key, value) VALUES ('kiosk_purchases_from', date('now', 'localtime'));
```

- Los productos existentes quedan con el costo unitario que tienen hoy (`ROUND` de SQLite redondea igual que `Math.round` para positivos).
- `DROP COLUMN` funciona porque los `CHECK` de `pack_size` y `pack_cost_cents` son de la propia columna (como en la migración 011). Verificarlo en el test de migración.
- `kiosk_sale_items.unit_cost_cents` se mantiene: sigue siendo el snapshot del costo al vender.

### Dominio — `src/domain/kiosk.ts`

- `unitCostCents(costCents, quantity)` = `Math.round(costCents / quantity)`. Es la función de hoy con los parámetros renombrados; sirve para la línea de la entrega.
- `suggestedPriceCents(unitCostCents, markupPercent)` = `Math.round(unitCost × (100 + markup) / 100)`. Cambia la firma: ahora parte del costo unitario guardado.
- `ticketProfitCents` y `ticketTotalCents` no cambian.

### Productos

- `productFields` (Zod): `name`, `description` (texto opcional, máx. 200, vacío → `null`, como otros textos opcionales del proyecto), `unitCostCents` (`cents`), `markupPercent`, `priceCents`, `active`. Salen `packSize` y `packCostCents`.
- `Product` (tipo): `id, name, description, unitCostCents, markupPercent, priceCents, active` y el derivado `suggestedPriceCents`.
- `sellKiosk` copia `product.unitCostCents` como snapshot del ítem.
- Actualizar `seed.ts`, `seedVolume.ts` y los tests que arman productos con `packSize`/`packCostCents`.

### Entregas del proveedor — servicio `purchases.ts`, repo `purchases.ts`

| Canal | Entrada | Salida |
|---|---|---|
| `purchases:create` | `{ paidAt, method, items: [{ productId, quantity, costCents }] }` | `KioskPurchase` |
| `purchases:list` | `{ month }` (`YYYY-MM`) | `{ purchases: KioskPurchase[], totalCents }` (total sin anuladas) |
| `purchases:void` | `{ id }` | `KioskPurchase` |

- `KioskPurchase`: `id, paidAt, method, recordedAt, voidedAt, items: { productId, productName, quantity, costCents, unitCostCents }[], totalCents`. `unitCostCents` y `totalCents` se derivan, no se guardan.
- Validación Zod: `paidAt` ISO, `method`, `items` de 1 a 50, `quantity` entero 1–10000, `costCents` con `cents`, sin productos repetidos en la misma entrega (refine con mensaje "Ese producto ya está en la entrega").
- `createPurchase`, en una transacción: `assertNotFuture(paidAt)`; cada producto existe (`NOT_FOUND`) y está activo (`PRODUCT_INACTIVE`, como al vender); inserta la entrega y sus ítems con el nombre como snapshot; pone `products.unit_cost_cents = unitCostCents(costCents, quantity)` de cada línea. `recorded_at` lo pone `ctx.clock`.
- `voidPurchase`: `ALREADY_VOIDED` si ya estaba; marca `voided_at`. **No** toca el costo del producto.
- `listPurchases(month)`: con `monthBounds` de `repos/expenses.ts`, por `paid_at` desc, `id` desc.
- Canales: nombre en `shared/channels.ts`, esquema en `shared/api.ts`, handler en `main/ipc/handlers.ts`.

### Balance — `repos/finance.ts`, `SummaryTab.tsx`

La fuente `kiosk_cost` pasa a significar "mercadería del kiosco" y en `moneyByDay` sale de dos partes:

```sql
SELECT k.sold_at, 'kiosk_cost', SUM(i.quantity * i.unit_cost_cents) FROM kiosk_sales k JOIN kiosk_sale_items i ON i.sale_id = k.id
  WHERE @method IS NULL AND k.voided_at IS NULL AND k.sold_at BETWEEN @from AND @to
    AND k.sold_at < (SELECT value FROM settings WHERE key = 'kiosk_purchases_from')
  GROUP BY k.sold_at
UNION ALL
SELECT p.paid_at, 'kiosk_cost', SUM(i.cost_cents) FROM kiosk_purchases p JOIN kiosk_purchase_items i ON i.purchase_id = p.id
  WHERE p.voided_at IS NULL AND p.paid_at BETWEEN @from AND @to AND ${OF_METHOD}
  GROUP BY p.paid_at
```

- Puede haber dos filas con la misma fecha y fuente; quien agrupa por día o por bucket tiene que sumarlas (verificar `services/finance.ts`).
- En el estado de resultados, el renglón "Mercadería vendida del kiosco" pasa a llamarse **"Mercadería del kiosco"** y se muestra también con un medio elegido (hoy se oculta).
- Actualizar el comentario de `balanceOf` en `domain/finance.ts`.
- Finanzas → Ventas (costo y ganancia por producto) y "Ganancia de hoy" en Kiosco siguen usando el snapshot de cada venta: son referencia del margen, no el balance.

### Pantalla Kiosco — `KioskPage.tsx`

De arriba hacia abajo:
1. **Vender** (nuevo arriba): título con el buscador de productos (encabezado fijo) y `KioskSalePanel`, movidos tal cual desde `HomePage.tsx`. Al cobrar se recargan el resumen y la lista de Ventas.
2. **Ventas:** igual que hoy.
3. **Productos:** columnas Producto, Descripción, Costo unitario, % ganancia, Sugerido, Precio de venta, Editar. Sale "Paquete". Botones "Cargar entrega del proveedor" y "Nuevo producto".
4. **Entregas del proveedor** (nuevo): selector de mes (como en Gastos), tabla con fecha, productos (`2 × Alfajor triple, 12 × Agua`), medio, total y Anular (`ConfirmDialog`). Las anuladas se ven tachadas, como los tickets. Vacío: "No hay entregas cargadas este mes."

**`ProductForm.tsx`:** Nombre, Descripción, Costo unitario (`MoneyField`), % de ganancia, el texto en vivo "Sugerido $…", Precio de venta con "Usar sugerido", Activo.

**Ventana "Entrega del proveedor"** (`Dialog`, `PurchaseForm.tsx`): fecha de pago (hoy por defecto), medio (efectivo por defecto), y líneas con producto (`SelectField` de activos), cantidad y costo total. Cada línea muestra en vivo el costo unitario nuevo y el actual ("antes $450" o "igual"). "Agregar producto" suma una línea; ✕ la saca (siempre queda al menos una). Abajo, "Total pagado" y Guardar/Cancelar. Errores por campo como en los otros formularios.

**"Nuevo producto" dentro de la entrega** (pedido del usuario): un botón al lado de "Agregar producto" abre `ProductForm` en un segundo `Dialog` encima de la entrega. Al guardar, el producto queda creado (`products:create`, como siempre), se recarga la lista de productos de la entrega y se agrega una línea con ese producto elegido, lista para poner cantidad y costo. Cancelar vuelve a la entrega sin tocar nada. Lo ya cargado en la entrega no se pierde.
- *Decisión de Claude:* abierto desde la entrega, `ProductForm` no muestra el campo "Costo unitario" y lo crea en $0, porque la entrega lo pone al guardarse; así no se pide el costo dos veces. El sugerido se ve después de la primera entrega.
- Si la entrega se cancela, el producto creado queda igual (ya existe); se puede desactivar desde Productos.
- Verificar que `Dialog` soporte uno encima de otro (foco, Escape cierra solo el de arriba).

### Pantalla Gastos — `ExpensesPage.tsx`

En el resumen de la derecha, debajo de "Sueldos del mes", un renglón **"Mercadería del kiosco"** con el total de entregas del mes (`purchases:list`) que lleva a `/kiosco`. *(Decisión de Claude: el usuario piensa la entrega como "el gasto del proveedor", así que la busca en Gastos.)*

### Mostrador — `HomePage.tsx`

- Se van la sección Kiosco (buscador de productos, `KioskSalePanel`) y el `Stripe` que la separaba.
- "Movimientos de hoy" queda debajo de "Ingresos de hoy", sin los tickets del kiosco: `counter:today` deja de traer tickets y `kioskCents`; la línea de totales queda "Planes · Pases sueltos · Total". Se borra la rama `kind: 'kiosk'` de `DayMovement` y de `DayMovementsTable.tsx`.
- Del resumen de la derecha se va "Kiosco hoy": salen `kioskTodayCount` y `kioskTodayCents` de `DashboardSummary`, y `kioskDaySummary` si no queda otro uso.

### Fecha de inicio del pase

- `ClientSummary` suma `startedAt: string | null`: en `listClientSummaries`, `MIN(CASE WHEN ss.left_free + ss.left_teacher > 0 THEN ss.sold_at END)`. Es la venta más vieja con pases que se pueden usar, la misma de la que `pickSaleForConsumption` descuenta el próximo pase. Verificar que en `SALE_STATS_CTE` una venta vencida da 0 pases restantes, así no cuenta.
- En `ResultRow` del Mostrador: "Inició el dd/mm" antes del badge del pase, con el mismo formato de fecha que "Vence el dd/mm". Si es `null` (sin pases), no se muestra.

## Decisiones de Claude (para revisar)

- Las ventas anteriores al día de la instalación siguen restando su costo; desde ese día solo cuentan las entregas (clave `kiosk_purchases_from` en `settings`).
- **Mercadería en estantes al instalar:** se pagó antes del corte y no es una entrega, así que su costo no contaría nunca. Sin código: el día de la instalación el administrador carga lo que haya como una primera entrega. Se recomendó al usuario y no lo rechazó; va como paso de instalación, no como función.
- Si se carga una entrega con fecha de pago anterior a la instalación, se cuenta igual. Puede duplicar la mercadería de esos días; se acepta porque es un caso raro.
- Anular una entrega no devuelve el costo anterior del producto; se corrige a mano desde la ficha.
- Si se cargan dos entregas del mismo producto, el costo queda el de la última **cargada**, no el de la fecha de pago más reciente.
- Un mismo producto no se puede repetir en una entrega.
- Solo productos activos en la entrega, igual que al vender.
- Renglón "Mercadería del kiosco" en el resumen de Gastos.
- Las entregas se listan por mes.

## Pruebas (TDD)

- **Dominio:** `unitCostCents` y `suggestedPriceCents` con redondeo (por ejemplo 12000/24 = 500; 1000/3 = 333; 333 × 160% = 533).
- **Migración 013:** con `user_version = 12` y productos con paquete, queda `unit_cost_cents` redondeado, sin `pack_size`/`pack_cost_cents`, y con `kiosk_purchases_from` = hoy.
- **Productos:** crear y editar con costo unitario y descripción; el sugerido sale del costo guardado.
- **Entregas:** crear actualiza el costo de cada producto; rechaza fecha futura, producto inactivo o inexistente y repetidos; anular deja el costo; `listPurchases` filtra por mes y suma sin las anuladas; `sellKiosk` toma el costo nuevo.
- **Finanzas:** una entrega cuenta en su `paid_at` y con su medio; una venta anterior a `kiosk_purchases_from` resta su costo y una posterior no; las anuladas no cuentan.
- **Mostrador:** `getDayMovements` sin tickets; `startedAt` en el resumen de clientes (venta más vieja con pases, `null` sin pases, ignora vencidas).
- **E2E:** `e2e/kiosk.spec.ts` vende desde Kiosco y no desde el Mostrador; flujo de entrega: cargar → costo unitario en la tabla → "Mercadería del kiosco" en Gastos; crear un producto desde la entrega y cargarlo en la misma entrega; `layout.spec.ts` si mira el Mostrador.

## Varios

- Agregar `.superpowers/` a `.gitignore` (bocetos de esta conversación).
- Fijar `kiosk_purchases_from` en los tests de finanzas en vez de depender del día en que corre la migración.
- Actualizar el CLAUDE.md del proyecto: la regla del kiosco ("el producto se carga con la cantidad por paquete y el costo del paquete") pasa a "el costo unitario sale de la última entrega del proveedor o se escribe a mano".
