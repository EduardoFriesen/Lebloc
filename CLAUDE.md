# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del proyecto

Lebloc es un sistema de gestión para un local de escalada. El repo se reinició desde cero en el commit `e3e01dc` ("de cero"). La única fuente de requisitos es `lebloc.md`. Todavía no hay stack, comandos ni código.

- El stack se define en brainstorming antes de escribir código. Cuando se defina, agregá acá los comandos de build, lint, typecheck y tests (incluido cómo correr un test individual) y la arquitectura.
- La implementación anterior (Electron + SQLite + React + Zustand, hasta `67ac1a5`) sigue en el historial de git. Sirve como referencia (`git show 67ac1a5:<ruta>`), pero no es una decisión vigente.

## Reglas de dominio no obvias (de `lebloc.md`)

- **El recargo por profesor no es ingreso del local.** Las clases con profesor están tercerizadas: el recargo se calcula a partir del importe por clase de cada profesor y se le debe a ese profesor. Tiene que quedar fuera de los ingresos del local en el balance, y el dashboard muestra cuánto le corresponde a cada profesor según las clases que tiene que dar.
- **Un plan puede ser mixto:** N clases semanales con profesor más M clases libres, cada una con su precio, configurado por el administrador.
- **Pagos parciales:** un plan se puede pagar en el momento o después, completo o en cuotas. Cada pago guarda su fecha, importe y medio (efectivo o transferencia). La deuda es el total del plan menos la suma de los pagos. Hace falta una vista de deudores.
- **El consumo de pases se registra a mano:** lo marca el administrador, nunca se descuenta solo. Hay que avisar cuando a un cliente le quedan pocos pases.
- **Clientes:** se guarda la fecha de nacimiento y la edad se calcula a partir de ella. Si el cliente es menor, los datos del tutor son obligatorios. También se guardan un contacto de emergencia, la fecha de inscripción y la fecha de la última actualización de la ficha.
- **Kiosco:** el producto se carga con la cantidad por paquete y el costo del paquete. El sistema calcula el costo unitario y, con el porcentaje de ganancia, el precio sugerido.
- **El balance mensual** incluye las ventas del kiosco, los gastos fijos (luz, gas, alquiler, etc.) y el costo de los empleados (estables u ocasionales, según las horas trabajadas).
- **Hay datos personales de menores:** aplica la sección de Ley 25.326 del CLAUDE.md global.
