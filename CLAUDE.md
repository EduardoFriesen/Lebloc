# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del proyecto

Lebloc es un sistema de gestión para un local de escalada. Es una app de escritorio offline para una sola PC de mostrador. Requisitos en `lebloc.md`; diseño en `docs/superpowers/specs/`; planes en `docs/superpowers/plans/`. Hay 4 subproyectos: 1) núcleo (clientes, profesores, planes, ventas, pagos y pases), 2) kiosco, 3) gastos y empleados, 4) balance y análisis. Cada uno tiene su propia spec.

## Comandos

```bash
npm run dev          # app en modo desarrollo (electron-vite)
npm run seed         # como dev, pero antes reemplaza la base por datos de prueba (la anterior queda en backups/before-seed-*.db)
npm test             # Vitest con el runtime de Electron (better-sqlite3 está compilado para Electron)
npm test -- src/domain/allocation.test.ts -t "proportional"   # un archivo / un test
npm run typecheck    # tsc sobre tsconfig.node.json y tsconfig.web.json
npm run lint
npm run test:e2e     # build + Playwright sobre Electron
npm run audit        # npm audit --audit-level=high
npm run dist:win     # instalador de Windows en dist/, generado desde Linux con Wine (ver docs/instalacion.md)
```

No correr Vitest con el `node` del sistema: falla con `NODE_MODULE_VERSION`. Si se reinstaló algo, `npx electron-rebuild -f -w better-sqlite3`.

## Arquitectura

- `src/domain/`: reglas de negocio puras, sin I/O. Toda regla nueva va acá, con su test.
- `src/main/`: `db/` (conexión y migraciones numeradas, versión en `PRAGMA user_version`), `repos/` (solo SQL), `services/` (casos de uso, transacciones, invocan reglas de `domain`), `ipc/` (validación Zod → service → `{ success, data | error }`).
- `src/preload/`: expone `window.lebloc.invoke(channel, input)` con lista blanca de `src/shared/channels.ts`.
- `src/shared/`: esquemas Zod, DTOs y helpers de dinero, compartidos por main y renderer.
- `src/renderer/`: React + Tailwind, solo vista. Llama a main con `call()` (`lib/api.ts`) y maneja los 4 estados con `useAsync` + `AsyncView`.
- Botones (`components/ui/Button.tsx`): siempre con relleno o marco, nunca texto suelto (lo controla `e2e/layout.spec.ts`). Anular, quitar o archivar van en `danger-outline` (marco ladrillo; el relleno rojo es para confirmarlo); cancelar, cerrar o volver, en `outline`.
- Para agregar un canal: nombre en `shared/channels.ts`, esquema en `shared/api.ts` (`apiSchemas` y `ApiOutputs`), handler en `main/ipc/handlers.ts`.
- El dinero va en centavos enteros. Los derivados (deuda, pases restantes, saldo de profesor) no se guardan: se calculan desde los movimientos. Las ventas guardan un snapshot del plan y del profesor. Los movimientos se anulan (`voided_at`), nunca se borran.

## Reglas de dominio no obvias (de `lebloc.md`)

- **El recargo por profesor no es ingreso del local.** Las clases con profesor están tercerizadas: cada plan con clases con profesor tiene un monto para el profesor (total por esas clases, cargado en Planes) que se suma al precio del local al vender y se le debe al profesor elegido. Tiene que quedar fuera de los ingresos del local en el balance, y del profesor se muestra solo lo que se le debe (lo cobrado para él menos lo ya pagado), no el valor de las clases por dar.
- **Un plan puede ser mixto:** N clases semanales con profesor más M clases libres, cada una con su precio, configurado por el administrador.
- **Pagos parciales:** un plan se puede pagar en el momento o después, completo o en cuotas. Cada pago guarda su fecha, importe y medio (efectivo o transferencia). La deuda es el total del plan menos la suma de los pagos y de lo cancelado. Hace falta una vista de deudores.
- **Cancelar deuda:** perdona todo lo que falta pagar de una venta (`debt_cancellations`). No es pago ni ingreso: Finanzas no cambia y el profesor pierde su parte pendiente (solo se le debe lo cobrado). Se puede anular; mientras esté activa, la venta no se anula ni se extiende.
- **El consumo de pases se registra a mano:** lo marca el administrador, nunca se descuenta solo. Hay que avisar cuando a un cliente le quedan pocos pases.
- **Los pases vencen:** cada venta guarda `expires_at` (por defecto un mes después de la venta, inclusive; se elige al vender y se puede cambiar después desde la ficha, por paros o feriados, aun si ya venció). Vencida, los pases que quedan se pierden (cuentan 0 en todo el sistema), pero la deuda y lo del profesor siguen. Se avisa cuando los pases que le quedan a un cliente vencen dentro de los días configurados en Ajustes (estado `expiring`).
- **Extender una venta:** misma fila, snapshot anterior en `sale_extensions`; el profe no cambia y lo pagado y las clases usadas tienen que entrar en el plan nuevo.
- **Clientes:** se guarda la fecha de nacimiento y la edad se calcula a partir de ella. Si el cliente es menor, los datos del tutor son obligatorios. También se guardan un contacto de emergencia y la fecha de inscripción (no la de la última actualización: se sacó a pedido del usuario).
- **Ficha (deslinde):** no vence. Solo se guarda el día en que la entregó; sin entrega figura "Sin ficha".
- **Planes y Empleados con pestañas:** Planes tiene Planes (las tarjetas) y Ventas; los precios sueltos (pase del día y pédulas) van en la columna lateral, debajo del resumen. Empleados tiene Equipo (las tarjetas) y Turnos; tocar la tarjeta de un empleado abre sus turnos.
- **Pases (antes Mostrador):** pestañas Pases (buscador, pases sueltos e ingresos de hoy) y Movimientos (movimientos de hoy). La barra lateral muestra los deudores que vinieron hoy (con un pase marcado hoy), no los que tienen pocos pases.
- **Marcas a mano en listas:** en Planes → Ventas, una venta pagada por completo (sin deuda ni deuda cancelada) y con algún pago por transferencia se marca como facturada (`sales.invoiced_at`; el efectivo no se factura). Facturada, no se extiende ni se le anulan pagos hasta desmarcarla. En Gastos, cada gasto se marca como pagado (`expenses.marked_paid_at`), solo como aviso: Finanzas lo cuenta igual. Tocar la fila marca; desmarcar pide confirmación. El Resumen de Finanzas muestra el total facturado: los pagos por transferencia del rango (por fecha de pago, completos, con la parte del profe) de las ventas facturadas, sobre el total cobrado por transferencia en planes.
- **Kiosco:** el producto guarda su costo unitario, que pone la última entrega del proveedor (costo ÷ cantidad) o se escribe a mano. Con el % de ganancia, el sistema calcula el precio sugerido; el precio de venta lo decide el administrador. Una entrega (`kiosk_purchases`) es lo que llegó; al proveedor se le paga aparte, en uno o más pagos (`kiosk_purchase_payments`), y la deuda con él es el total de la entrega menos los pagos activos. La mercadería cuenta en el balance a medida que se paga cada pago (las ventas anteriores a `kiosk_purchases_from` siguen restando su costo), y cada pago aparece en Gastos como "Mercadería del kiosco". Las entregas se pueden modificar (el total no puede quedar debajo de lo pagado; el costo unitario solo cambia si es la última entrega del producto). La venta del kiosco se hace en la pantalla Kiosco (pestañas Ventas, Productos y Entregas); la pantalla Pases (antes Mostrador) es solo para pases.
- **El balance mensual** incluye las ventas del kiosco, las entregas del proveedor, los gastos fijos (luz, gas, alquiler, etc.) y el costo de los empleados (estables u ocasionales, según las horas trabajadas).
- **Hay datos personales de menores:** aplica la sección de Ley 25.326 del CLAUDE.md global.
