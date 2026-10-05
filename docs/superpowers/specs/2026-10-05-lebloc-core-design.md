# Lebloc — Diseño de arquitectura y subproyecto 1 (núcleo)

Fecha: 2026-10-05
Fuente de requisitos: `lebloc.md`

## Contexto y objetivo

Lebloc es un sistema de gestión para un local de escalada. Lo usa un solo administrador en una PC del mostrador, sin internet. El proyecto se reinició desde cero porque cambiaron los requisitos. El stack anterior (Electron + React + SQLite) funcionaba y se mantiene.

Esta spec define:
- la arquitectura y el stack de todo el sistema;
- el diseño detallado del **subproyecto 1 (núcleo)**: clientes, profesores, planes, ventas, pagos, consumo de pases, deudores y cuenta corriente de profesores.

### Decisiones del usuario
- Una sola PC y un solo usuario. Sin login ni roles.
- Un plan es un **pack de N pases sin vencimiento** y combina pases libres y pases con profesor. La "cantidad por semana" de `lebloc.md` no se modela.
- **Un profesor por venta.** Recargo = pases con profesor × importe por clase del profesor.
- El recargo no es ingreso del local. Al profesor se le debe **en función de lo cobrado**, no de lo vendido ni de lo consumido.
- La regla de reparto de los pagos entre el local y el profesor **se elige al vender el plan**: `proportional`, `teacher_first` o `local_first`.
- Los profesores tienen **cuenta corriente**: lo generado, las liquidaciones y el saldo.

### Supuestos
- Moneda ARS, sin facturación electrónica.
- Sin sincronización ni nube. La protección de los datos se resuelve con backups locales.

### Fuera de alcance de esta spec
- **Subproyecto 2: kiosco.** Productos, costo unitario, precio sugerido, stock y ventas.
- **Subproyecto 3: gastos y empleados.** Servicios fijos, empleados estables u ocasionales y horas trabajadas.
- **Subproyecto 4: balance y análisis.** Balance mensual y gráficos.

Cada uno tendrá su propia spec y su propio plan. El único punto de integración que fija esta spec es este: **todo módulo que mueva dinero lo registra como movimientos con fecha, importe y medio de pago**, para que el balance pueda sumarlos.

## 1. Arquitectura

**Stack:** Electron, React, TypeScript (modo estricto), Tailwind, SQLite (`better-sqlite3`), Zod, Vitest, Playwright, ESLint y `electron-log`.

```
src/
  domain/     TypeScript puro, sin Electron ni base de datos. Reglas de negocio.
  main/
    db/       Conexión SQLite y migraciones versionadas
    repos/    Acceso a datos por agregado
    services/ Casos de uso: orquestan repos y domain dentro de transacciones
    ipc/      Handlers: validan con Zod, llaman al service y devuelven el contrato de API
  preload/    API tipada mínima expuesta con contextBridge
  shared/     Esquemas Zod y tipos compartidos entre main y renderer
  renderer/   React y Tailwind. Solo vista y estado de UI
```

**Reglas de arquitectura**
- El dinero se guarda como **enteros en centavos**. No se usan floats.
- **Los derivados no se persisten.** La deuda, los pases restantes y el saldo de cada profesor se calculan a partir de los movimientos.
- **Los precios se congelan en la venta.** La venta guarda una copia de los datos del plan y del profesor en ese momento.
- **Nada se borra.** Los movimientos se anulan con `voided_at`, y los clientes se archivan con `archived_at`.
- **Seguridad de Electron:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` y CSP estricta. El renderer no accede a la base de datos.
- **Contrato del IPC:** `{ success: true, data }` o `{ success: false, error: { code, message } }`.

## 2. Modelo de datos

Los montos están en centavos (`INTEGER`). Las fechas se guardan en ISO 8601 (`TEXT`).

### Personas
- **clients:** `id`, `first_name`, `last_name`, `birth_date`, `address`, `phone`, `emergency_name`, `emergency_phone`, `emergency_relation`, `enrolled_at`, `updated_at`, `archived_at`.
- **guardians:** `id`, `client_id`, `first_name`, `last_name`, `dni`, `phone`, `relation`. Si el cliente es menor (según `birth_date`), tiene que tener al menos uno. La edad no se guarda.
- **teachers:** `id`, `first_name`, `last_name`, `address`, `phone`, `socials` (JSON con `[{ network, handle }]`), `class_rate_cents`, `active`.
- **teacher_schedules:** `id`, `teacher_id`, `weekday` (0–6), `start_time`, `end_time` (`HH:MM`).

### Catálogo
- **plans:** `id`, `name`, `free_passes`, `teacher_passes`, `price_cents` (la parte del local), `active`. Debe cumplirse `free_passes + teacher_passes > 0`. El plan lleva profesor si `teacher_passes > 0`.

### Movimientos
- **sales:** `id`, `client_id`, `sold_at` y un snapshot con `plan_id`, `plan_name`, `free_passes`, `teacher_passes`, `local_price_cents`, `teacher_id` (que puede ser null), `teacher_rate_cents`, `teacher_surcharge_cents`, `total_cents` y `split_rule`. Además tiene `voided_at`.
  - Si `teacher_passes > 0`, `teacher_id` es obligatorio.
  - `teacher_surcharge_cents = teacher_passes × teacher_rate_cents`.
  - `total_cents = local_price_cents + teacher_surcharge_cents`.
- **payments:** `id`, `sale_id`, `paid_at`, `amount_cents`, `method` (`cash | transfer`), `local_cents`, `teacher_cents`, `voided_at`. Siempre se cumple `local_cents + teacher_cents = amount_cents`.
- **consumptions:** `id`, `sale_id`, `kind` (`free | teacher`), `consumed_at`, `note`, `voided_at`.
- **teacher_payouts:** `id`, `teacher_id`, `paid_at`, `amount_cents`, `method`, `note`, `voided_at`.
- **settings:** `key`, `value`. Incluye `low_passes_threshold`, que por defecto vale 2.

### Derivados
Se calculan solo con los movimientos no anulados.
- Deuda de una venta = `total_cents − Σ amount_cents`.
- Pases restantes de una venta = pases de cada tipo − consumos de ese tipo.
- Saldo de un profesor = `Σ teacher_cents` de los pagos de sus ventas − `Σ teacher_payouts.amount_cents`.

## 3. Lógica de dominio (`src/domain/`)

### Reparto de pagos: `allocatePayment`
Entrada: `total`, `surcharge`, `split_rule`, lo ya asignado al local y al profesor, y el monto nuevo.
Salida: `{ localCents, teacherCents }`.

- `teacher_first`: profesor = `min(monto, surcharge − ya asignado al profesor)`; el local recibe el resto.
- `local_first`: local = `min(monto, (total − surcharge) − ya asignado al local)`; el profesor recibe el resto.
- `proportional` (cálculo acumulado, para que el redondeo no se arrastre):
  `teacher = round((pagado previo + monto) × surcharge / total) − ya asignado al profesor`.
  Cuando la venta queda saldada, el profesor recibió exactamente su `surcharge`.
- Si `surcharge = 0`, todo el monto va al local.

### Otras funciones
- `computeSurcharge`, `computeSaleTotal`.
- `saleDebt`, `remainingPasses`, `isLowOnPasses(remaining, threshold)`. El aviso se activa cuando quedan pases `≤ threshold`, y también cuando no queda ninguno.
- `pickSaleForConsumption(sales, kind)`: elige la venta **FIFO**, es decir, la más vieja no anulada que tenga pases de ese tipo. Si no hay ninguna, lanza `NO_PASSES_AVAILABLE`.
- `teacherBalance`. El saldo puede quedar negativo, y en ese caso se muestra como "a favor del local".
- `ageFrom(birthDate, today)`, `isMinor`.

### Invariantes
Cada una tiene su código de `DomainError`.

| Código | Regla |
|---|---|
| `PAYMENT_EXCEEDS_DEBT` | Un pago no puede superar la deuda de la venta. |
| `PAYOUT_EXCEEDS_BALANCE` | Una liquidación no puede superar el saldo del profesor. |
| `ONLY_LAST_PAYMENT_VOIDABLE` | Solo se puede anular el último pago activo de una venta, porque el reparto depende de los pagos anteriores. |
| `SALE_HAS_ACTIVE_PAYMENTS` | Una venta con pagos activos no se puede anular. |
| `SALE_HAS_ACTIVE_CONSUMPTIONS` | Una venta con consumos activos no se puede anular. |
| `NO_PASSES_AVAILABLE` | No hay pases del tipo pedido. |
| `MINOR_REQUIRES_GUARDIAN` | Un cliente menor tiene que tener al menos un tutor. |
| `TEACHER_REQUIRED` | Una venta de un plan con pases con profesor tiene que tener profesor. |
| `INACTIVE_PLAN` / `INACTIVE_TEACHER` | No se puede vender un plan ni elegir un profesor que estén inactivos. |

Un cliente con deuda **puede** consumir pases; la UI muestra la deuda como aviso.

## 4. Flujos

1. **Vender plan:** cliente → plan activo → profesor (si el plan tiene pases con profesor) → regla de reparto. Se muestra el desglose (local, recargo y total), con un pago inicial opcional. Todo se guarda en una sola transacción.
2. **Registrar pago:** monto, medio y fecha (por defecto hoy). El reparto calculado se muestra antes de confirmar.
3. **Marcar consumo:** se busca al cliente y se elige "Libre" o "Con profesor". Se muestran los pases restantes, el aviso de pocos pases y la deuda.
4. **Anular:** pago (solo el último), consumo, liquidación o venta (sin pagos ni consumos activos). Pide confirmación.
5. **Liquidar profesor:** desde su cuenta corriente. Se cargan monto, medio y nota.
6. **Deudores:** lista de ventas con deuda mayor a 0, con la antigüedad desde `sold_at`.

## 5. Pantallas

- **Inicio (mostrador):** buscador de clientes como foco principal para consumir rápido, alertas de pocos pases, deudores recientes y saldos pendientes con profesores.
- **Clientes:** lista con búsqueda, ficha (datos, edad calculada, tutores, ventas, pagos y consumos) y formulario. El formulario exige tutor si el cliente es menor.
- **Planes:** catálogo para crear, editar y desactivar.
- **Profesores:** lista, ficha con horarios y redes, cuenta corriente y liquidaciones.
- **Deudores.**
- **Ajustes:** umbral de pocos pases, backup manual y restauración.

Cada componente contempla los 4 estados: ideal, loading (skeleton), error y vacío. La navegación funciona con teclado y la UI cumple WCAG AA.

## 6. Errores, logs y backup

- El dominio lanza `DomainError(code)`. El IPC lo traduce a `{ success: false, error: { code, message } }`, con el mensaje en español.
- El IPC valida toda entrada con Zod; si falla, devuelve `VALIDATION_ERROR` con `details`.
- Los errores inesperados se registran con `electron-log` y al renderer le llega `INTERNAL_ERROR` con un mensaje genérico.
- Las operaciones que tocan varias tablas van en una transacción de SQLite.
- **Backup:** se hace uno automático al iniciar (en `userData/backups/`, se conservan los 10 más recientes) y se puede exportar e importar manualmente desde Ajustes. Antes de restaurar se pide confirmación y se guarda una copia de la base actual.
- **Migraciones:** archivos SQL numerados, aplicados en orden. La versión aplicada se registra con `PRAGMA user_version`. `PRAGMA foreign_keys = ON`.

## 7. Testing y calidad

- **`domain`:** unit tests con Vitest y TDD.
  - Las tres reglas de reparto, el redondeo acumulado y que el saldo final sea exacto.
  - `surcharge = 0`, el consumo FIFO, los saldos de profesor (incluido el negativo), la edad y la condición de menor, y cada invariante.
- **`services` y `repos`:** tests de integración contra SQLite en memoria, con las migraciones aplicadas.
- **`ipc`:** tests de esquemas que verifican que se rechacen entradas inválidas.
- **E2E:** Playwright sobre Electron para vender, pagar, consumir, anular el último pago y liquidar un profesor.
- **Calidad:** TypeScript estricto sin `any`, ESLint, `npm audit --audit-level=high` y `gitleaks detect` antes de cerrar cada iteración.

## Datos personales

El sistema guarda datos de menores y de sus tutores, así que aplica la Ley 25.326. Para el núcleo, alcanza con:
- **rectificación y actualización:** se cubren editando la ficha, que registra `updated_at`;
- **supresión:** se ofrece la anonimización del cliente archivado (se borran sus datos personales y se conservan los movimientos).

Las demás medidas (consentimiento trazable, exportación de datos) se evalúan cuando el sistema salga de una PC con un solo operador.
