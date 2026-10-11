# Pase del día y alquiler de pédulas (Mostrador)

## Qué
- **Pase del día:** un pase libre por un día, vendido en el Mostrador a alguien sin ficha de cliente.
- **Alquiler de pédulas:** se cobra solo o junto con el pase del día.
- Los dos son ingresos del local y aparecen en "Movimientos de hoy".

## Decisiones
- **Precios:** se configuran en **Planes**, en el bloque "Precios sueltos". Se guardan en `settings` (`day_pass_price_cents` y `shoe_rental_price_cents`), en centavos y en 0 hasta que se configuren.
- **Precio en 0:**
  - el botón queda deshabilitado con el aviso "Configurá el precio en Planes";
  - el servidor rechaza la venta con `PRICE_NOT_SET`.
- **Medio de pago:** se elige, efectivo o transferencia.
- **Modal "¿Alquila pédulas?":** sale solo al vender el pase del día, no al marcar "Libre" a un cliente.
  - "Sí, con pédulas" registra el pase y el alquiler en una sola transacción.
  - "No, solo el pase" registra solo el pase.
- **Anulación:** se anulan desde "Movimientos de hoy" (`voided_at`) y no se borran. Una fila ya anulada da `ALREADY_VOIDED`.

## Datos
Migración `004_counter_sales`:
```sql
CREATE TABLE counter_sales (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('day_pass', 'shoe_rental')),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  sold_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
```
`price_cents` guarda el precio del momento de la venta. El balance (subproyecto 4) lo suma como ingreso aparte.

## Contrato
- `prices:get` → `CounterPrices { dayPassCents, shoeRentalCents }`.
- `prices:update` (`CounterPrices`, centavos ≥ 0) → `CounterPrices`.
- `counter:sell` `{ kinds: ('day_pass' | 'shoe_rental')[] (1–2, sin repetir), method }` → `CounterSale[]`. El precio lo toma el servidor.
- `counter:void` `{ id }` → `CounterSale`.
- `DayMovement` suma `{ kind: 'counter'; sale: CounterSale }`.
- `DayMovements` suma `counterCents`, que se incluye en `totalCents`.

## UI
- **Mostrador:**
  - título "Pases" arriba de "Buscar cliente", que pasa a ser más angosto;
  - al lado del buscador, los botones "Pase del día $X" y "Alquilar pédulas $Y";
  - "Recomendados" se muestra como subtítulo.
- **Movimientos de hoy:**
  - filas "Pase del día" y "Pédulas", con un botón "Anular" que pide confirmación;
  - en los totales, "Pases sueltos".
- **Planes:** formulario "Precios sueltos" arriba de la lista.
