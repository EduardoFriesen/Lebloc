# Identidad visual: estética "atardecer en la montaña" para Lebloc

## Contexto
La UI actual es "industrial": títulos condensados en mayúsculas, naranja fosforescente (`volt`), bordes rectos y menú gris granito. Le Bloc es un lugar relajado, medio hippie (bio de Instagram con ✨🧗🧚🌈, yoga y escuelita), y la app tiene que parecerse al lugar. El usuario eligió: paleta **atardecer suave**, títulos en **Fraunces** (serif suave), y **con detalles decorativos**.

El logo (`docs/logo.jpg`, 150×150, fondo blanco) es un triángulo-montaña relleno con un collage pictórico más el texto "LE BLOC" en negro. Sus colores dominantes son terracota quemado `#b1642a`, ocre/mostaza `#c29044`, arena `#d8bd8c` e índigo polvoriento `#464b71`/`#646e8a`. Por eso el coral y la lavanda de la paleta elegida se ajustan a los tonos del logo: **terracota + mostaza + índigo sobre crema**, el mismo atardecer pero coherente con la marca.

Alcance: solo la capa visual del renderer. No se tocan dominio, IPC, datos ni textos/roles accesibles (los E2E buscan por rol y texto del DOM, y `uppercase` es solo CSS).

## Paleta (tokens en `src/renderer/styles.css`, `@theme`)
Se **mantienen los nombres de token** (`chalk`, `granite`, `volt`…) y cambian los valores, así se evita un sed sobre unas 100 clases. Un comentario en `@theme` aclara qué representa cada uno. Se agregan dos tokens nuevos.

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `chalk` | `#fbf4ea` | fondo crema durazno | — |
| `chalk-deep` | `#efe2cf` | arena: skeletons, hover | tinta 10.9 |
| `paper` (nuevo) | `#fffaf2` | tarjetas, tablas y avisos (reemplaza `bg-white`) | — |
| `granite` | `#2d2a3e` | tinta berenjena-índigo | 12.7 |
| `granite-soft` | `#5d5870` | texto secundario | 6.2 |
| `volt` | `#a4501f` | terracota del logo: botón primario, acentos | crema sobre terracota 5.4 |
| `volt-ink` | `#8a3f14` | texto terracota | 6.9 |
| `dusk` (nuevo) | `#363b63` | índigo del logo: fondo del menú lateral | crema sobre índigo 9.8 |
| `ochre` | `#c8923a` / texto `#7f5a12` | mostaza: avisos, sol, indicador activo | 5.7 (texto) |
| `moss` | `#56724c` | salvia: éxito | 4.9 |
| `danger` | `#a2382a` | ladrillo: error | 6.1 |

La mostaza sobre índigo (3.9) se usa solo como indicador no textual (barra o punto del ítem activo, sol), nunca para texto.

## Tipografía
- Títulos: **Fraunces Variable** con ejes `SOFT` altos (curvas suaves) y peso 600. Ya **no van en mayúsculas**.
- Texto: **Nunito Variable** (sans redondeada).
- La app es offline y la CSP solo permite `'self'`, así que las fuentes van empaquetadas. Se agrega `@fontsource-variable/fraunces` y `@fontsource-variable/nunito` (licencia OFL, Vite las incluye en el build; no hace falta tocar la CSP porque `font-src` cae en `default-src 'self'`). Esto justifica las dos dependencias nuevas; después se corre `npm run audit`.
- Hoy `Barlow Condensed` ni siquiera está empaquetada (cae en Arial Narrow), así que no se pierde nada.

## Formas
- Botones: pastilla `rounded-full`, sin mayúsculas, `font-semibold`. El primario es terracota con texto crema; el secundario, índigo `dusk`; el fantasma queda igual.
- Tarjetas, tablas, avisos y diálogos: `rounded-2xl`, fondo `paper` y una sombra cálida suave (sombra tintada con berenjena, no gris).
- Inputs (`Field.tsx`): `rounded-xl` y foco en terracota.
- El foco `:focus-visible` se mantiene en 3px, ahora en terracota.

## Detalles decorativos
1. **Menú lateral "cielo de atardecer"**: fondo índigo `dusk`. El logo va arriba, dentro de un **círculo crema (el sol)** con `mix-blend-mode: multiply`, que funde el fondo blanco del JPG con el crema. El logo es la imagen `docs/logo.jpg` copiada a `src/renderer/assets/logo.jpg` con `alt="Le Bloc"`, y reemplaza el texto "Lebloc". El ítem activo lleva una barra mostaza redondeada y los ítems pierden las mayúsculas.
2. **Silueta de montañas** en SVG inline al pie del menú (capas terracota, mostaza y arena), `aria-hidden`.
3. **Franja setentosa**: tres líneas finas terracota, mostaza e índigo, como un arcoíris recto, debajo del título de cada página. Reemplaza el `border-b-2` de `PageHeader`.
4. **Grano de papel** sutil sobre el fondo con un SVG `feTurbulence` en `data:` URI, que la CSP ya permite (`img-src data:`) y que va en `body` en CSS.
5. **Estado vacío** (`EmptyState`) con borde punteado redondeado y un pequeño sol o montaña SVG `aria-hidden`.

Todo lo decorativo es CSS o SVG inline y no agrega dependencias.

## Archivos
- `src/renderer/styles.css`: tokens, fuentes (`@import` de fontsource), sombra cálida, grano de papel, foco.
- `src/renderer/components/Layout.tsx`: menú índigo, logo en el sol, montañas, ítem activo.
- `src/renderer/components/ui/Button.tsx`: variantes en pastilla.
- `src/renderer/components/ui/PageHeader.tsx`: Fraunces y franja setentosa.
- `src/renderer/components/ui/{States,Notice,Dialog,Field,ConfirmDialog}.tsx` y `table.ts`: radios, `paper` y sombras.
- `src/renderer/assets/logo.jpg` (nuevo, copia de `docs/logo.jpg`), más `src/renderer/global.d.ts` si falta el tipo para importar `.jpg` (electron-vite suele traer `vite/client`).
- Páginas (`src/renderer/pages/*.tsx`): cambio mecánico en dos patrones:
  - `font-display … font-bold uppercase` pasa a `font-display … font-semibold`, sin mayúsculas, en h2, h3, legend y tarjetas (unas 25 apariciones).
  - `bg-white` pasa a `bg-paper` (19 apariciones), con `rounded-2xl` donde sea una tarjeta.
- `docs/superpowers/specs/2026-10-09-visual-identity-design.md`: este diseño como spec (lo pide el flujo de brainstorming).


## Verificación
- `npm run typecheck`, `npm run lint` y `npm test` en verde.
- `npm run test:e2e` en verde. Confirma que no se rompieron roles ni textos que buscan los tests.
- `npm run dev` y revisión visual, con capturas de Playwright sobre Electron (skill `run` o `playwright-skill`), de Mostrador, Clientes, Ficha de cliente, Planes, un diálogo y estados vacío y error.
- Navegación con teclado: el foco tiene que verse en el menú índigo y sobre los botones terracota.
- `grep -rn "uppercase\|bg-white" src/renderer` solo deja usos intencionales.
- `npm run audit` y `gitleaks detect` antes de cerrar.

## Nota
El logo es de 150×150 y se ve bien hasta unos 110 px. Si aparece una versión en mayor resolución o un SVG, se reemplaza el archivo y listo.

## Ajustes surgidos al implementar
- `peach` (`#f2b48c`, 5.9:1 sobre `dusk`): texto de acento dentro de paneles índigo (deuda total en el panel de pases). El terracota sobre índigo no se lee.
- Avisos con fondo de color (pocos pases, ficha sin firmar) pasan de `bg-volt text-granite` (2.4:1, no pasa AA) a `bg-ochre text-granite` (5.0:1).
- El foco dentro de `.bg-dusk` y del menú va en crema.
- `fieldset > legend` flotado (en `@layer base`) para que el título quede adentro de las tarjetas redondeadas.
- No se agregó `ochre-ink`: ningún texto mostaza lo necesitó.
