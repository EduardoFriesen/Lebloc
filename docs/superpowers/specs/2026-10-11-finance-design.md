# Lebloc — Subproyecto 4: finanzas (diseño)

Fecha: 2026-10-11
Fuente de requisitos: `lebloc.md` y el pedido del usuario: "una parte de finanzas donde se pueda estudiar las ventas: productos más vendidos, pases más vendidos, todo lo que le permita al administrador tomar decisiones del negocio, con gráficos y filtros para evaluar diferentes épocas".

## Contexto

Depende del subproyecto 3 (`2026-10-11-expenses-staff-design.md`), que aporta los gastos y el costo de los empleados.

Decisiones tomadas con el usuario:
- **Ingresos = lo cobrado** en el período:
  - la parte del local de cada pago de plan;
  - los tickets de kiosco;
  - las ventas del mostrador: pase del día y pédulas.
- El recargo del profesor **no es ingreso**: se muestra aparte.
- Los rankings de planes usan la fecha de venta.
- Pestañas de análisis: resumen, ventas, afluencia, profesores y clientes. Medios de pago queda afuera.
- **Gráficos con Recharts.**

Rama: `feat/finance`, desde `feat/expenses-staff`.

## Diseño

### Dependencia
- `recharts@^3`, y después `npm run audit`.
- Paleta categórica con los tokens del tema (`accent`, `ochre`, `dusk`, `moss`, `peach`), que ya tienen modo oscuro. Recharts acepta `fill="var(--color-…)"`.
- La CSP actual (`style-src 'unsafe-inline'`, sin `eval`) ya es compatible.

### Dominio: `src/domain/periods.ts` (puro, con test; lo usan main y renderer)
- `presetRange(preset, today)` para los atajos: `this_month`, `last_month`, `last_3_months`, `last_12_months` y `this_year`.
- `previousRange({ from, to })`: el período anterior con la misma cantidad de días.
- `granularityFor(range)`:
  - por día, hasta 31 días;
  - por semana (de lunes a domingo), hasta 186 días;
  - por mes, después.
- `bucketKey(date, granularity)` y `fillBuckets(range, granularity, rows)`: agrupan sumas diarias y completan con ceros los períodos sin datos.
- `percentChange(current, previous)`: devuelve `null` si el anterior es 0.

### Reglas de cálculo
| Concepto | Origen |
|---|---|
| Ingreso por planes | `payments.local_cents` por `paid_at` |
| Ingreso del kiosco | `quantity × unit_price_cents` por `kiosk_sales.sold_at` |
| Pases del día y pédulas | `counter_sales.price_cents` por `sold_at` |
| Cobrado para profesores (aparte) | `payments.teacher_cents` por `paid_at` |
| Gastos | `expenses.amount_cents` por `paid_at` |
| Sueldos | `work_shifts.cost_cents` por `worked_on` |
| Costo de la mercadería vendida | `quantity × unit_cost_cents` por `kiosk_sales.sold_at` |

- Todo excluye lo anulado.
- El rango es inclusivo en las dos puntas.
- Los timestamps (`consumed_at`, `recorded_at`) se pasan a hora local con `'localtime'`.

### Contrato IPC: un canal por pestaña
Todos los canales reciben `financeRangeInput = { from, to }`, que valida `from ≤ to` y un máximo de 3 años.

| Canal | Contenido |
|---|---|
| `finance:summary` | KPIs del período y del anterior: ingresos del local, egresos, resultado y margen. Serie por bucket con ingresos por fuente y egresos. Estado de resultados con ingresos por fuente, egresos por categoría, sueldos, costo de la mercadería y resultado. Cobrado para profesores. |
| `finance:sales` | Por plan: cantidad vendida, importe del local y si tiene profesor. Pases del día y pédulas: cantidad e importe. Por producto: unidades, facturación, costo, ganancia y margen. Productos activos sin ventas. Ticket promedio del kiosco. |
| `finance:traffic` | Visitas (consumos no anulados y pases del día): matriz día de la semana × hora, total por día de la semana, serie por bucket y reparto entre libre, con profesor y pase del día. |
| `finance:teachers` | Por profesor: clases dadas, alumnos distintos, cobrado para el profesor, liquidado en el período y saldo actual. |
| `finance:clients` | Clientes nuevos, clientes que vinieron, compras separadas en primera compra y renovación, y su serie por bucket. Los que dejaron de venir (vinieron en el período anterior y no en este) con su última visita. Deudores actuales. |

- El SQL va en `main/repos/finance.ts` y devuelve sumas por día. El agrupado en semanas o meses se hace en TS con `domain/periods.ts`.
- La composición va en `main/services/finance.ts`. Si pasa las ~300 líneas, se parte por pestaña.

### UI: `/finanzas`
- "Finanzas" va en el menú, antes de Ajustes.
- Hay una sub-ruta por pestaña: `/finanzas`, `/finanzas/ventas`, `/finanzas/afluencia`, `/finanzas/profesores` y `/finanzas/clientes`. Se navegan con `NavLink`.
- **Filtro de período**, fijo arriba:
  - botones de atajo;
  - "Personalizado", con dos `<input type="date">`;
  - el texto "Comparado con: dd/mm – dd/mm".
  - El rango vive en los search params (`?desde=&hasta=`), así se mantiene entre pestañas y al volver atrás.
- **Resumen:**
  - KPIs con la variación contra el período anterior;
  - barras apiladas de ingresos por fuente con una línea de egresos;
  - estado de resultados;
  - la nota "Cobrado para profesores (no es ingreso del local)".
- **Ventas:**
  - barras de los planes más vendidos;
  - pases del día y pédulas;
  - top 10 de productos y una tabla ordenable por unidades, facturación o ganancia;
  - "Sin ventas en el período".
- **Afluencia:**
  - mapa de calor día × hora, hecho como `<table>` con celdas teñidas (Recharts no tiene heatmap y la tabla es accesible);
  - barras por día de la semana;
  - línea de visitas.
- **Profesores:** barras de clases por profesor y una tabla.
- **Clientes:**
  - KPIs;
  - barras apiladas de primera compra contra renovación;
  - tabla "Dejaron de venir", con link a la ficha del cliente.
- `components/charts.tsx`: estilo común de Recharts (ejes, tooltip con `formatMoney`, `ResponsiveContainer`) y los colores por serie. Cada gráfico tiene su tabla con los mismos datos, visible o `sr-only`.
- Cada pestaña usa `useAsync` + `AsyncView`, con skeleton, error con reintento y el vacío "No hay movimientos en este período".

### Tests
- `domain/periods.test.ts`.
- `services/finance.test.ts`, que cubre:
  - el recargo fuera del ingreso;
  - que lo anulado no cuenta;
  - los bordes del rango;
  - el costo de la mercadería;
  - los gastos y sueldos;
  - la afluencia en hora local;
  - las clases por profesor;
  - nuevos contra renovación;
  - los que dejaron de venir.
- `shared/schemas.test.ts`.
- E2E `e2e/finance.spec.ts`.

### Fuera de alcance
- Medios de pago.
- Exportar a CSV o PDF.
- Presupuestos u objetivos.
- Índices nuevos en `sales.sold_at`, `payments.paid_at` y `consumptions.consumed_at`. Con el volumen de un local alcanza el scan completo; se agregan si alguna consulta tarda.
