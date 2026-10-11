# Lebloc — Subproyecto 2: kiosco (diseño)

Fecha: 2026-10-11
Fuente de requisitos: `lebloc.md`

## Contexto

`lebloc.md` pide un kiosco donde cada producto se carga con la cantidad del paquete y el costo del paquete, y el sistema calcula el costo unitario y, con el % de ganancia, el precio sugerido. La spec del núcleo fija una regla de integración: todo módulo que mueva dinero lo registra como movimientos con fecha, importe y medio de pago, para que el balance (subproyecto 4) los sume.

Decisiones tomadas con el usuario:
- **Sin stock.** Solo catálogo y ventas. No se registran compras.
- **Ticket con varios ítems** (producto × cantidad), en efectivo o por transferencia, sin cliente asociado. Se anula el ticket entero.
- **Precio de venta fijado por producto.** El sistema muestra el sugerido y un botón "Usar sugerido", pero el administrador puede redondearlo.
- **% de ganancia = recargo sobre el costo:** sugerido = costo unitario × (1 + %).
- **El cobro se hace en el Mostrador.** `/kiosco` queda para la ABM de productos y el historial de ventas.

Estado de git: el árbol está limpio y pusheado en `feat/client-consumptions-filter` (`44ffd16`). `main` está muy atrás (`e3e01dc`), así que el kiosco sale de la rama actual.

## Diseño

### Dominio: `src/domain/kiosk.ts` (puro, con test)
- `unitCostCents(packCostCents, packSize)` = `Math.round(packCost / packSize)`.
- `suggestedPriceCents(packCostCents, packSize, markupPercent)` = `Math.round(packCost × (100 + markup) / (packSize × 100))`. Se calcula desde los valores del paquete para no redondear dos veces.
- `ticketTotalCents(items: { quantity, unitPriceCents }[])`.
- El `markupPercent` es un entero de 0 a 1000.

### Migración `003_kiosk.ts`
```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  pack_size INTEGER NOT NULL CHECK (pack_size > 0),
  pack_cost_cents INTEGER NOT NULL CHECK (pack_cost_cents >= 0),
  markup_percent INTEGER NOT NULL CHECK (markup_percent BETWEEN 0 AND 1000),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE UNIQUE INDEX idx_products_name ON products(name COLLATE NOCASE);
CREATE TABLE kiosk_sales (
  id INTEGER PRIMARY KEY,
  sold_at TEXT NOT NULL,          -- YYYY-MM-DD
  recorded_at TEXT NOT NULL,      -- ISO
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  voided_at TEXT
);
CREATE INDEX idx_kiosk_sales_sold_at ON kiosk_sales(sold_at);
CREATE TABLE kiosk_sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES kiosk_sales(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,                                     -- snapshot
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0), -- snapshot
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0)    -- snapshot, para la ganancia en el balance
);
CREATE INDEX idx_kiosk_sale_items_sale ON kiosk_sale_items(sale_id);
CREATE INDEX idx_kiosk_sale_items_product ON kiosk_sale_items(product_id);
```
- El total del ticket no se guarda: se calcula con `SUM(quantity × unit_price_cents)`, siguiendo la regla de no guardar derivados.
- La fila de `kiosk_sales` es el movimiento: tiene fecha, medio, importe derivado y `voided_at`.

### Contrato IPC (`shared/`)
| Canal | Entrada | Salida |
|---|---|---|
| `products:list` | `activeListInput` | `Product[]` (incluye `unitCostCents` y `suggestedPriceCents` derivados) |
| `products:create` / `products:update` | `productInput` (+ `id` y `active` en update) | `Product` |
| `kiosk:sell` | `{ items: { productId, quantity }[] (1..50), method }` | `KioskSale` |
| `kiosk:void` | `idInput` | `KioskSale` |
| `kiosk:sales` | `{ date: isoDate }` | `KioskSale[]` del día, con ítems y total |

- `DashboardSummary` suma `kioskTodayCount` y `kioskTodayCents`.
- **Seguridad:** el cliente manda solo `productId` y `quantity`. El precio y el costo los lee el servicio de la base y los copia como snapshot. `sold_at` es la fecha de hoy según `ctx.clock`.
- Errores nuevos en `domain/errors.ts`:
  - `PRODUCT_INACTIVE`: se intentó vender un producto inactivo.
  - `PRODUCT_NAME_TAKEN`: nombre repetido, para que la UNIQUE no termine en `INTERNAL_ERROR`.
  - `KIOSK_SALE_VOIDED`: el ticket ya estaba anulado.
- `NOT_FOUND` ya existe y se reusa.

### Backend
- `main/repos/products.ts` y `main/repos/kioskSales.ts`: solo SQL, con el patrón de `repos/payouts.ts`.
- `main/services/products.ts` y `main/services/kiosk.ts`: transacciones con el patrón de `services/payments.ts`.
  - `sellKiosk` valida que todos los productos existan y estén activos, inserta la venta y los ítems en una transacción y devuelve el ticket releído.
- `services/dashboard.ts`: agrega los dos campos del día.
- `ipc/handlers.ts`: los 6 handlers nuevos.

### UI
- **Mostrador (`HomePage.tsx`):** una sección "Kiosco" en la columna izquierda, debajo de la búsqueda de clientes.
  - Botones con los productos activos. Cada clic suma 1 al carrito.
  - El carrito tiene −/+ por línea, el total, el medio de pago (efectivo por defecto) y el botón Cobrar.
  - Al cobrar muestra un aviso de éxito y recarga el dashboard.
  - Vacío: "Todavía no hay productos" con link a `/kiosco`.
  - Componente nuevo: `components/KioskSalePanel.tsx`, para no inflar `HomePage`.
- **Resumen:** una fila `AlertRow` "Kiosco hoy" con la cantidad de tickets y el monto, que lleva a `/kiosco`.
- **`/kiosco` (`KioskPage.tsx`):** dos bloques.
  - **Productos:** tabla con `tableClass` y las columnas nombre, paquete, costo unitario, % ganancia, sugerido, precio e inactivo. Crear y editar en un `Dialog` con `ProductForm.tsx`, que muestra en vivo el costo unitario y el sugerido y tiene el botón "Usar sugerido".
  - **Ventas:** fecha (hoy por defecto) y lista de tickets del día con ítems, medio, total y "Anular" (`ConfirmDialog`). Los anulados se ven tachados.
- **Navegación:** una línea "Kiosco" en `NAV_ITEMS` de `Layout.tsx` y la ruta en `routes.tsx`.
- **Reutilización:** `useAsync`, `AsyncView`, `Dialog`, `ConfirmDialog`, `MoneyField`, `SelectField`, `TextField`, `Notice`, `PageHeader`, `parseMoneyInput`, `formatMoney`, `toFieldErrors`, `PAYMENT_METHOD_LABELS` y `tableClass`.
- Los 4 estados vienen de `AsyncView`.

### Mostrador como caja (agregado el 2026-10-11)
- **Movimientos de hoy** (`counter:today`): tabla de consulta en el Mostrador que junta los tickets de kiosco no anulados y los pagos de planes cobrados hoy, incluidas las cuotas de planes anteriores. Arriba muestra los totales de Kiosco, Planes y Total.
  - Los planes van primero y los tickets después, porque los pagos no guardan hora.
  - El monto de un plan es lo cobrado, incluida la parte del profesor: es una vista de caja.
  - No se anula desde acá.
- **Más vendidos** (`kiosk:top`): los 5 productos activos con más unidades vendidas en tickets no anulados desde hace un mes; si faltan, se completa por nombre.
- **Buscador de productos** en el panel de kiosco: filtra en memoria los productos activos, sin distinguir mayúsculas ni acentos. Sin texto, muestra los más vendidos.
- **Separador:** la franja de tres líneas del encabezado (`ui/Stripe.tsx`) separa los pases del kiosco.

### Fuera de alcance
- Stock y compras.
- Fiado a clientes.
- Ventas con fecha pasada.
- Gráficos, que son del subproyecto 4.

