# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del proyecto

Lebloc es un sistema de gestión para un local de escalada. Es una app de escritorio offline para una sola PC de mostrador. Requisitos en `lebloc.md`; diseño en `docs/superpowers/specs/`; planes en `docs/superpowers/plans/`. Hay 4 subproyectos: 1) núcleo (clientes, profesores, planes, ventas, pagos y pases), 2) kiosco, 3) gastos y empleados, 4) balance y análisis. Cada uno tiene su propia spec.

## Comandos

```bash
npm run dev          # app en modo desarrollo (electron-vite)
npm test             # Vitest con el runtime de Electron (better-sqlite3 está compilado para Electron)
npm test -- src/domain/allocation.test.ts -t "proportional"   # un archivo / un test
npm run typecheck    # tsc sobre tsconfig.node.json y tsconfig.web.json
npm run lint
npm run test:e2e     # build + Playwright sobre Electron
npm run audit        # npm audit --audit-level=high
```

No correr Vitest con el `node` del sistema: falla con `NODE_MODULE_VERSION`. Si se reinstaló algo, `npx electron-rebuild -f -w better-sqlite3`.

## Arquitectura

- `src/domain/`: reglas de negocio puras, sin I/O. Toda regla nueva va acá, con su test.
- `src/main/`: `db/` (conexión y migraciones numeradas, versión en `PRAGMA user_version`), `repos/` (solo SQL), `services/` (casos de uso, transacciones, invocan reglas de `domain`), `ipc/` (validación Zod → service → `{ success, data | error }`).
- `src/preload/`: expone `window.lebloc.invoke(channel, input)` con lista blanca de `src/shared/channels.ts`.
- `src/shared/`: esquemas Zod, DTOs y helpers de dinero, compartidos por main y renderer.
- `src/renderer/`: React + Tailwind, solo vista. Llama a main con `call()` (`lib/api.ts`) y maneja los 4 estados con `useAsync` + `AsyncView`.
- Para agregar un canal: nombre en `shared/channels.ts`, esquema en `shared/api.ts` (`apiSchemas` y `ApiOutputs`), handler en `main/ipc/handlers.ts`.
- El dinero va en centavos enteros. Los derivados (deuda, pases restantes, saldo de profesor) no se guardan: se calculan desde los movimientos. Las ventas guardan un snapshot del plan y del profesor. Los movimientos se anulan (`voided_at`), nunca se borran.

## Reglas de dominio no obvias (de `lebloc.md`)

- **El recargo por profesor no es ingreso del local.** Las clases con profesor están tercerizadas: el recargo se calcula a partir del importe por clase de cada profesor y se le debe a ese profesor. Tiene que quedar fuera de los ingresos del local en el balance, y el dashboard muestra cuánto le corresponde a cada profesor según las clases que tiene que dar.
- **Un plan puede ser mixto:** N clases semanales con profesor más M clases libres, cada una con su precio, configurado por el administrador.
- **Pagos parciales:** un plan se puede pagar en el momento o después, completo o en cuotas. Cada pago guarda su fecha, importe y medio (efectivo o transferencia). La deuda es el total del plan menos la suma de los pagos. Hace falta una vista de deudores.
- **El consumo de pases se registra a mano:** lo marca el administrador, nunca se descuenta solo. Hay que avisar cuando a un cliente le quedan pocos pases.
- **Clientes:** se guarda la fecha de nacimiento y la edad se calcula a partir de ella. Si el cliente es menor, los datos del tutor son obligatorios. También se guardan un contacto de emergencia, la fecha de inscripción y la fecha de la última actualización de la ficha.
- **Kiosco:** el producto se carga con la cantidad por paquete y el costo del paquete. El sistema calcula el costo unitario y, con el porcentaje de ganancia, el precio sugerido.
- **El balance mensual** incluye las ventas del kiosco, los gastos fijos (luz, gas, alquiler, etc.) y el costo de los empleados (estables u ocasionales, según las horas trabajadas).
- **Hay datos personales de menores:** aplica la sección de Ley 25.326 del CLAUDE.md global.
