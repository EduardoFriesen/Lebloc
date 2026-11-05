# Lebloc: botón Volver, renovación de planes, pago completo por defecto y ficha firmada

## Contexto
Después de probar el núcleo, pediste cuatro mejoras de uso en el mostrador:
1. Un botón para volver atrás en todas las pantallas.
2. Renovar un plan agotado sin pasar por el formulario de venta completo.
3. Que una venta se registre como pagada completa por defecto y que el pago parcial sea la excepción.
4. Llevar el control de la **ficha firmada** (el documento legal, no los datos del cliente). El admin registra la fecha de firma, la ficha vence según una vigencia configurable y la app avisa a quién le falta firmar o tiene la ficha vencida.

Decisiones que tomaste:
- La renovación cobra el **precio actual** del plan.
- La vigencia de la ficha se configura **en meses**, con un solo valor global en Ajustes.
- El aviso de ficha vencida aparece en la **ficha del cliente** y en el **Mostrador**.
- "Volver" vuelve a la **pantalla anterior** del historial.

Trabajo en una rama `feat/core-followups` que sale de `feat/core`. Antes de implementar, copio este diseño a `docs/superpowers/specs/2026-10-09-core-followups-design.md`. Aplico TDD en domain y services, y hago un commit por feature.

## 1. Botón Volver (solo UI)
- Va en `src/renderer/components/Layout.tsx`, una vez sobre el `<Outlet />`. Así no hay que tocar cada página.
- Usa `useLocation()` y `useNavigate()`, y se muestra solo si `location.key !== 'default'`. React Router le pone esa key a la primera entrada, así que el botón no aparece en el Mostrador recién abierto.
- `onClick={() => navigate(-1)}`, con texto "← Volver" y `buttonClass('ghost')`. Al ser un `<button>` es accesible por teclado.

## 2. Pago completo por defecto (`SellPlanForm.tsx`)
- El checkbox "Registrar pago inicial" pasa a ser un grupo de radios "Pago": **Completo** (por defecto) / **Parcial** / **Sin pago ahora**.
- **Completo:** `amountCents = preview.snapshot.totalCents`. Se muestran solo el medio y la fecha.
- **Parcial:** se muestra el campo de monto, igual que ahora.
- **Sin pago:** `initialPayment: null`.
- Si el total es 0, no se manda pago, porque el schema exige monto > 0.
- El backend no cambia: `sellPlan` en `src/main/services/sales.ts` ya registra el pago inicial y `registerPayment` valida que no supere la deuda.

## 3. Renovar plan agotado
- Una venta está agotada si no está anulada y `remainingFree + remainingTeacher === 0`. En `SaleCard` de `ClientDetailPage.tsx`, esas ventas muestran el botón **Renovar**, salvo que el cliente esté archivado.
- Renovar abre el mismo diálogo de venta con `SellPlanForm` y un prop nuevo `renewFrom?: Sale`, que precarga `planId`, `teacherId` y `splitRule`. El título del diálogo es "Renovar plan".
- La renovación es una **venta nueva** que usa `sales:create` con el snapshot del precio vigente. No hace falta canal ni migración nueva, y el historial y la deuda se siguen calculando igual.
- Si el plan o el profesor ya no están activos, no están en las listas del form. En ese caso se muestra `Notice` "El plan original ya no está activo; elegí otro" y el form queda editable.
- El pago es completo por defecto, igual que en el punto 2.

## 4. Ficha firmada
**Dominio** (`src/domain/waiver.ts`, con su test):
- `addMonths(iso, months)` en `src/domain/dates.ts`. Si el día no existe en el mes destino, usa el último día del mes (31/01 + 1 mes = 28 o 29/02).
- `waiverStatus(lastSignedAt: string | null, validityMonths: number, today: string)` devuelve `{ state: 'missing' | 'expired' | 'valid', signedAt, expiresAt }`. Una ficha vence el mismo día de `expiresAt`.

**DB**: migración `src/main/db/migrations/002_waivers.ts`, registrada en `MIGRATIONS` (`src/main/db/migrations.ts`):
```sql
CREATE TABLE waiver_signatures (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  signed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_waiver_signatures_client ON waiver_signatures(client_id);
INSERT INTO settings (key, value) VALUES ('waiver_validity_months', '12');
```
Las firmas forman un historial y se anulan, no se borran, igual que el resto de los movimientos. La firma vigente es el `MAX(signed_at)` de las no anuladas.

**Main**:
- `src/main/repos/waivers.ts` con insert, void, list por cliente y "última firma activa por cliente".
- `src/main/services/waivers.ts`:
  - `signWaiver({ clientId, signedAt })` usa `requireActiveClient` y rechaza fechas futuras con `DomainError`.
  - `voidWaiver({ id })`.
- `settings`: se suma `waiverValidityMonths` (entero de 1 a 120) a `Settings`, `settingsInput` y `getSettings`/`updateSettings`.
- `account.ts`: `ClientAccount` suma `waivers: WaiverSignature[]` y `waiver: WaiverStatus`.
- Búsqueda del Mostrador: `ClientSummary` suma `waiverState`. Se calcula en el service con la última firma, sin meter la regla en SQL.
- `dashboard.ts`: `Dashboard` suma `waiverAlerts: { clientId, clientName, state, expiresAt }[]` con los clientes activos (no archivados) en estado `missing` o `expired`.
- Canales `waivers:sign` y `waivers:void`, siguiendo el patrón del CLAUDE.md del proyecto: `channels.ts`, `api.ts` (`apiSchemas` + `ApiOutputs`) y `handlers.ts`. Los esquemas Zod van en `schemas.ts`.

**UI**:
- `ClientDetailPage.tsx`: sección "Ficha firmada" con la etiqueta del estado (Vigente hasta X / Vencida desde X / Sin firmar) y el botón **Registrar firma**. El botón abre un `Dialog` con fecha, que por defecto es hoy y usa `type="date"`. Debajo va el historial con opción de anular, con `ConfirmDialog`. El panel actual "Ficha", que muestra los datos del cliente, pasa a llamarse "Datos" para no confundir.
- `HomePage.tsx`: en los resultados de búsqueda, una marca "Ficha vencida" o "Sin ficha" junto a los pases. En el aside, un panel "Fichas por firmar" con su `EmptyState`.
- `SettingsPage.tsx`: campo "Vigencia de la ficha (meses)" en el mismo form del umbral.

## Tests (TDD)
- `src/domain/dates.test.ts`: `addMonths`, incluido el caso de fin de mes.
- `src/domain/waiver.test.ts`: los estados missing, valid, expired y el borde del día de vencimiento.
- `src/main/services/waivers.test.ts`: firmar, rechazar fecha futura, cliente archivado, anular, y que la última firma vigente ignore las anuladas.
- `dashboard.test.ts` y `clients.test.ts`, que es donde se testea la búsqueda: `waiverAlerts` y `waiverState`.
- `migrations.test.ts`: la base llega a la versión 2.
- `schemas.test.ts`: `settingsInput` con meses fuera de rango.
- E2E `e2e/core-flow.spec.ts`: el flujo existente pasa a usar pago parcial explícito. Se suman:
  - vender con pago completo por defecto y comprobar que no queda deuda;
  - agotar los pases, Renovar y comprobar que aparece una venta nueva;
  - registrar una firma y ver que desaparece el aviso;
  - Volver desde la ficha del cliente.

## Verificación
```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run audit
```
Además, una revisión manual con `LEBLOC_USER_DATA=/tmp/lebloc-prueba npm run dev`:
- abrir la app con una base existente y que migre a la versión 2;
- configurar la vigencia en 1 mes y registrar una firma de hace 2 meses, que tiene que aparecer como vencida;
- comprobar los 4 estados del panel nuevo.

## Fuera de alcance
- Adjuntar el PDF o la imagen de la ficha firmada.
- Una vigencia distinta para cada cliente.
- Un atajo de teclado para Volver.
