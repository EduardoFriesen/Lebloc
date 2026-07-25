# Lebloc Fase 1 — Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Electron + React + TypeScript + Tailwind project with SQLite database, design system, navigation, and the core modules: Clients, Passes, Plans, and Payments.

**Architecture:** Electron desktop app with React frontend, better-sqlite3 for synchronous database access, Zustand for state management. Sidebar navigation with one page per module.

**Tech Stack:** Electron, React 18, TypeScript, Tailwind CSS, Zustand, better-sqlite3, Framer Motion, react-hook-form, xlsx, Inter / JetBrains Mono

## Global Constraints

- Windows desktop, single user, no authentication
- SQLite database stored in Electron's userData directory
- All dates stored as ISO strings (YYYY-MM-DDTHH:mm:ss)
- IDs are auto-increment integers
- Soft deletes via `activo` field (never hard delete)
- Argentine Spanish for all UI text
- Currency: ARS (Argentine Pesos)

## Design System (Impeccable-Compliant)

### Color Strategy: Restrained
Single accent (terracota) carries ≤10% of surface. Rest is tinted neutrals.

### Palette (OKLCH-based, mapped to Tailwind)

| Token | Hex | Role |
|---|---|---|
| `--color-ink` | `#0F172A` | Primary text, headers |
| `--color-muted` | `#64748B` | Secondary text, placeholders |
| `--color-surface` | `#FFFFFF` | Cards, modals, inputs |
| `--color-bg` | `#F1F0ED` | Page background (neutral, NOT cream) |
| `--color-panel` | `#E8E6E1` | Sidebar, secondary panels |
| `--color-border` | `#D4D2CD` | Subtle borders |
| `--color-accent` | `#B8654A` | CTAs, active states, primary actions |
| `--color-accent-hover` | `#A35640` | Accent hover/active |
| `--color-success` | `#16A34A` | Active plans, confirmations |
| `--color-warning` | `#D97706` | Low passes, debt alerts |
| `--color-danger` | `#DC2626` | Errors, destructive actions |

### Typography
- **One family: Inter** — Product UI doesn't need display/body pairing. A well-tuned sans carries everything.
- **Scale:** Fixed rem, ratio 1.125–1.2 between steps
- **Mono:** JetBrains Mono for numbers, currency, data

### Motion Principles
- **150–250ms** on most transitions (product register)
- **Easing:** `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart) for smooth deceleration
- **Exit faster than enter** (~75% duration)
- **Motion conveys state**, not decoration
- **Always respect** `prefers-reduced-motion: reduce`
- **No page-load choreography** — users are in a task
- **No bounce/elastic** — feels dated

### Signature Element
Sidebar with subtle gradient from `--color-panel` to a slightly warmer tone at the bottom, evoking rock texture without being literal. No gradients on text, no glassmorphism.

---

## File Structure

```
Lebloc/
├── src/
│   ├── main/
│   │   ├── index.ts              ← Electron main process
│   │   ├── database.ts           ← SQLite connection + migrations
│   │   └── preload.ts            ← IPC bridge
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx              ← React entry
│   │   ├── App.tsx               ← Router + Layout
│   │   ├── globals.css           ← Tailwind + design tokens + animations
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── PageLayout.tsx
│   │   │   ├── ui/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   └── Alert.tsx
│   │   │   └── shared/
│   │   │       ├── SearchInput.tsx
│   │   │       └── ConfirmDialog.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── clientes/
│   │   │   │   ├── ClientesPage.tsx
│   │   │   │   ├── ClienteForm.tsx
│   │   │   │   └── ClienteDetail.tsx
│   │   │   ├── pases/
│   │   │   │   ├── PasesPage.tsx
│   │   │   │   └── PaseForm.tsx
│   │   │   ├── planes/
│   │   │   │   ├── PlanesPage.tsx
│   │   │   │   ├── PlanForm.tsx
│   │   │   │   └── AsistenciaButton.tsx
│   │   │   └── pagos/
│   │   │       ├── PagosPage.tsx
│   │   │       └── PagoForm.tsx
│   │   ├── stores/
│   │   │   ├── clienteStore.ts
│   │   │   ├── paseStore.ts
│   │   │   ├── planStore.ts
│   │   │   └── pagoStore.ts
│   │   ├── lib/
│   │   │   ├── db.ts             ← IPC wrappers for DB queries
│   │   │   └── utils.ts          ← Formatters, helpers
│   │   └── types/
│   │       ├── index.ts          ← TypeScript interfaces
│   │       └── global.d.ts       ← Window.api declaration
│   └── database/
│       └── schema.sql            ← CREATE TABLE statements
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vite.config.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`, `src/main/index.ts`, `src/main/preload.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/globals.css`

**Interfaces:**
- Consumes: none
- Produces: runnable Electron app with React + TypeScript + Tailwind + Framer Motion

- [ ] **Step 1: Initialize npm project**

```bash
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react react-dom react-router-dom zustand better-sqlite3 framer-motion react-hook-form xlsx
npm install -D electron typescript @types/react @types/react-dom @types/better-sqlite3 \
  vite @vitejs/plugin-react tailwindcss postcss autoprefixer \
  concurrently wait-on
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/renderer/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/**/*.{tsx,ts}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        muted: '#64748B',
        surface: '#FFFFFF',
        bg: '#F1F0ED',
        panel: '#E8E6E1',
        border: '#D4D2CD',
        accent: '#B8654A',
        'accent-hover': '#A35640',
        success: '#16A34A',
        warning: '#D97706',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.25, 1, 0.5, 1)',
        'slide-up': 'slide-up 250ms cubic-bezier(0.25, 1, 0.5, 1)',
        'slide-down': 'slide-down 250ms cubic-bezier(0.25, 1, 0.5, 1)',
        'scale-in': 'scale-in 200ms cubic-bezier(0.25, 1, 0.5, 1)',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 5: Create src/renderer/globals.css**

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  }

  body {
    @apply bg-bg font-sans text-ink antialiased;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }

  /* Focus ring — consistent across all interactive elements */
  *:focus-visible {
    @apply outline-none ring-2 ring-accent/50 ring-offset-2 ring-offset-surface;
  }

  /* Scrollbar styling — subtle, not decorative */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    @apply bg-transparent;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-ink/10 rounded-full;
  }
  ::-webkit-scrollbar-thumb:hover {
    @apply bg-ink/20;
  }
}

@layer components {
  /* Skeleton loading state */
  .skeleton {
    @apply bg-ink/5 rounded animate-shimmer;
    background-size: 200% 100%;
    background-image: linear-gradient(
      90deg,
      theme('colors.ink') 0% 5%,
      theme('colors.ink / 0.05') 40%,
      theme('colors.ink / 0.05') 60%,
      theme('colors.ink') 100%
    );
  }

  /* Stagger animation utility */
  .stagger-item {
    animation: slide-up 250ms var(--ease-out-quart) both;
    animation-delay: calc(var(--i, 0) * 40ms);
  }
}

/* Reduced motion — respect user preference */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 6: Create src/renderer/index.html**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lebloc</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/renderer/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 7: Create src/renderer/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 8: Create src/renderer/App.tsx (minimal)**

```tsx
export default function App() {
  return (
    <div className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold text-ink">Lebloc</h1>
    </div>
  )
}
```

- [ ] **Step 9: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist/renderer',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
})
```

- [ ] **Step 10: Create src/main/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Will be populated as we add DB queries
})
```

- [ ] **Step 11: Create src/main/index.ts (minimal)**

```typescript
import { app, BrowserWindow } from 'electron'
import path from 'path'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Lebloc',
    backgroundColor: '#F1F0ED',
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 12: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build && tsc",
    "start": "electron ."
  },
  "main": "src/main/index.ts"
}
```

- [ ] **Step 13: Run dev to verify**

```bash
npm run dev
```
Expected: Electron window opens showing "Lebloc" centered on screen with Inter font

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with Electron + React + TypeScript + Tailwind + Framer Motion"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `src/renderer/types/index.ts`, `src/renderer/types/global.d.ts`

**Interfaces:**
- Consumes: none
- Produces: all TypeScript interfaces used across the app

- [ ] **Step 1: Create src/renderer/types/index.ts**

```typescript
export interface Cliente {
  id: number
  nombre: string
  apellido: string
  dni: string | null
  telefono: string | null
  fechaNacimiento: string | null
  esMenor: number
  telefonoResponsable: string | null
  contactoEmergencia: string | null
  fechaIngreso: string
  fotoPath: string | null
  pdfPath: string | null
  fechaUltimaActualizacion: string | null
  activo: number
  createdAt: string
  updatedAt: string
}

export interface Pase {
  id: number
  nombre: string
  clasesSemanales: number
  precio: number
  recargoProfesor: number
  esDiario: number
  activo: number
  createdAt: string
  updatedAt: string
}

export interface Plan {
  id: number
  clienteId: number
  paseId: number
  clasesSemanales: number
  precio: number
  pasesRestantes: number
  profesorId: number | null
  fechaInicio: string
  activo: number
  createdAt: string
  clienteNombre?: string
  paseNombre?: string
  profesorNombre?: string
}

export interface Pago {
  id: number
  planId: number
  monto: number
  fecha: string
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta'
  observaciones: string | null
  createdAt: string
  planNombre?: string
  clienteNombre?: string
}

export interface Asistencia {
  id: number
  planId: number
  fecha: string
  createdAt: string
}

export interface Profesor {
  id: number
  nombre: string
  apellido: string
  telefono: string | null
  email: string | null
  activo: number
  createdAt: string
}

export interface Producto {
  id: number
  nombre: string
  cantidadPorPaquete: number
  costoPaquete: number
  costoUnitario: number
  precioVenta: number
  activo: number
  createdAt: string
}

export interface Venta {
  id: number
  fecha: string
  total: number
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta'
  cajaId: number
  observaciones: string | null
  createdAt: string
}

export interface VentaDetalle {
  id: number
  ventaId: number
  tipo: 'pase' | 'producto' | 'diario'
  referenciaId: number
  cantidad: number
  precioUnitario: number
  subtotal: number
  profesorId: number | null
  createdAt: string
}

export interface Empleado {
  id: number
  nombre: string
  apellido: string
  telefono: string | null
  direccion: string | null
  fechaNacimiento: string | null
  fechaContratacion: string
  valorHora: number
  activo: number
  createdAt: string
}

export interface HorasTrabajadas {
  id: number
  empleadoId: number
  fecha: string
  horas: number
  costo: number
  metodoPago: 'efectivo' | 'transferencia'
  pagado: number
  fechaPago: string | null
  observaciones: string | null
  createdAt: string
  empleadoNombre?: string
}

export interface Gasto {
  id: number
  categoria: string
  descripcion: string | null
  monto: number
  fecha: string
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta'
  ventaId: number | null
  horasTrabajadasId: number | null
  creadoPor: string | null
  createdAt: string
}

export interface Caja {
  id: number
  fechaApertura: string
  montoInicial: number
  fechaCierre: string | null
  montoFinal: number | null
  diferencia: number | null
  estado: 'abierta' | 'cerrada'
  createdAt: string
}

export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta'
```

- [ ] **Step 2: Create src/renderer/types/global.d.ts**

```typescript
interface Window {
  api: {
    query: (sql: string, params?: unknown[]) => Promise<any[]>
    run: (sql: string, params?: unknown[]) => Promise<any>
    get: (sql: string, params?: unknown[]) => Promise<any>
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/types/
git commit -m "feat: TypeScript interfaces for all entities"
```

---

### Task 3: Database Schema + Connection

**Files:**
- Create: `src/database/schema.sql`, `src/main/database.ts`
- Modify: `src/main/index.ts`, `src/main/preload.ts`

**Interfaces:**
- Consumes: TypeScript types from Task 2
- Produces: `db.query()`, `db.run()`, `db.get()` IPC methods

- [ ] **Step 1: Create src/database/schema.sql**

```sql
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT UNIQUE,
  telefono TEXT,
  fechaNacimiento TEXT,
  esMenor INTEGER DEFAULT 0,
  telefonoResponsable TEXT,
  contactoEmergencia TEXT,
  fechaIngreso TEXT NOT NULL,
  fotoPath TEXT,
  pdfPath TEXT,
  fechaUltimaActualizacion TEXT,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  clasesSemanales INTEGER NOT NULL,
  precio REAL NOT NULL,
  recargoProfesor REAL DEFAULT 0,
  esDiario INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profesores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS planes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clienteId INTEGER NOT NULL REFERENCES clientes(id),
  paseId INTEGER NOT NULL REFERENCES pases(id),
  clasesSemanales INTEGER NOT NULL,
  precio REAL NOT NULL,
  pasesRestantes INTEGER NOT NULL,
  profesorId INTEGER REFERENCES profesores(id),
  fechaInicio TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planId INTEGER NOT NULL REFERENCES planes(id),
  monto REAL NOT NULL,
  fecha TEXT NOT NULL,
  metodoPago TEXT NOT NULL,
  observaciones TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asistencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planId INTEGER NOT NULL REFERENCES planes(id),
  fecha TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cantidadPorPaquete INTEGER NOT NULL,
  costoPaquete REAL NOT NULL,
  costoUnitario REAL NOT NULL,
  precioVenta REAL NOT NULL,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  total REAL NOT NULL,
  metodoPago TEXT NOT NULL,
  cajaId INTEGER REFERENCES caja(id),
  observaciones TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ventaDetalles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ventaId INTEGER NOT NULL REFERENCES ventas(id),
  tipo TEXT NOT NULL,
  referenciaId INTEGER,
  cantidad INTEGER NOT NULL,
  precioUnitario REAL NOT NULL,
  subtotal REAL NOT NULL,
  profesorId INTEGER REFERENCES profesores(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS empleados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  telefono TEXT,
  direccion TEXT,
  fechaNacimiento TEXT,
  fechaContratacion TEXT NOT NULL,
  valorHora REAL NOT NULL,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS horasTrabajadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empleadoId INTEGER NOT NULL REFERENCES empleados(id),
  fecha TEXT NOT NULL,
  horas REAL NOT NULL,
  costo REAL NOT NULL,
  metodoPago TEXT NOT NULL,
  pagado INTEGER DEFAULT 0,
  fechaPago TEXT,
  observaciones TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  descripcion TEXT,
  monto REAL NOT NULL,
  fecha TEXT NOT NULL,
  metodoPago TEXT NOT NULL,
  ventaId INTEGER REFERENCES ventas(id),
  horasTrabajadasId INTEGER REFERENCES horasTrabajadas(id),
  creadoPor TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS caja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fechaApertura TEXT NOT NULL,
  montoInicial REAL NOT NULL,
  fechaCierre TEXT,
  montoFinal REAL,
  diferencia REAL,
  estado TEXT DEFAULT 'abierta',
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Create src/main/database.ts**

```typescript
import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

const DB_PATH = path.join(app.getPath('userData'), 'lebloc.db')
const SCHEMA_PATH = path.join(__dirname, '../database/schema.sql')

let db: Database.Database

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initializeSchema()
  }
  return db
}

function initializeSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
  db.exec(schema)
}

export function query(sql: string, params?: unknown[]) {
  return db.prepare(sql).all(params || [])
}

export function run(sql: string, params?: unknown[]) {
  return db.prepare(sql).run(params || [])
}

export function get(sql: string, params?: unknown[]) {
  return db.prepare(sql).get(params || [])
}
```

- [ ] **Step 3: Update src/main/index.ts**

```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { getDatabase, query, run, get } from './database'

function createWindow() {
  getDatabase()

  ipcMain.handle('db:query', (_, sql, params) => query(sql, params))
  ipcMain.handle('db:run', (_, sql, params) => run(sql, params))
  ipcMain.handle('db:get', (_, sql, params) => get(sql, params))

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Lebloc',
    backgroundColor: '#F1F0ED',
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 4: Update src/main/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:query', sql, params),
  run: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:run', sql, params),
  get: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:get', sql, params),
})
```

- [ ] **Step 5: Create src/renderer/lib/db.ts**

```typescript
export async function dbQuery(sql: string, params?: unknown[]) {
  return (window as any).api.query(sql, params)
}

export async function dbRun(sql: string, params?: unknown[]) {
  return (window as any).api.run(sql, params)
}

export async function dbGet(sql: string, params?: unknown[]) {
  return (window as any).api.get(sql, params)
}
```

- [ ] **Step 6: Run dev to verify DB initializes**

```bash
npm run dev
```
Expected: No errors, `lebloc.db` created in userData directory

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: SQLite database schema and IPC connection"
```

---

### Task 4: UI Components Library

**Files:**
- Create: `src/renderer/components/ui/Button.tsx`, `Input.tsx`, `Select.tsx`, `Modal.tsx`, `Table.tsx`, `Card.tsx`, `Badge.tsx`, `Alert.tsx`

**Interfaces:**
- Consumes: Design tokens from globals.css, Framer Motion
- Produces: Reusable UI components with state-rich interactions

- [ ] **Step 1: Create Button.tsx**

```tsx
import { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion } from 'framer-motion'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const variants = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-hover',
  secondary: 'bg-ink text-white hover:bg-ink/90 active:bg-ink/80',
  danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80',
  ghost: 'bg-transparent text-ink hover:bg-ink/5 active:bg-ink/10',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
}

export function Button({ variant = 'primary', size = 'md', className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-150
        focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...(props as any)}
    >
      {children}
    </motion.button>
  )
}
```

- [ ] **Step 2: Create Input.tsx**

```tsx
import { InputHTMLAttributes, forwardRef } from 'react'
import { motion } from 'framer-motion'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-ink">{label}</label>
        )}
        <motion.input
          ref={ref}
          whileFocus={{ scale: 1.01 }}
          transition={{ duration: 0.15 }}
          className={`rounded-lg border bg-surface px-3 py-2 text-sm text-ink
            placeholder:text-muted transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
            ${error ? 'border-danger ring-2 ring-danger/20' : 'border-border hover:border-ink/30'}
            ${className}`}
          {...props}
        />
        {error && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-danger"
          >
            {error}
          </motion.span>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'
```

- [ ] **Step 3: Create Select.tsx**

```tsx
import { SelectHTMLAttributes, ReactNode, forwardRef } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = '', children, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-ink">{label}</label>
        )}
        <select
          ref={ref}
          className={`rounded-lg border bg-surface px-3 py-2 text-sm text-ink
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
            ${error ? 'border-danger ring-2 ring-danger/20' : 'border-border hover:border-ink/30'}
            ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    )
  }
)
Select.displayName = 'Select'
```

- [ ] **Step 4: Create Modal.tsx**

```tsx
import { ReactNode, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
            className={`relative bg-surface rounded-xl shadow-2xl ${sizes[size]} w-full mx-4 max-h-[90vh] overflow-y-auto`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <button
                onClick={onClose}
                className="text-muted hover:text-ink transition-colors duration-150 rounded-lg p-1 hover:bg-ink/5"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 5: Create Table.tsx**

```tsx
import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface Column<T> {
  key: string
  header: string
  render?: (item: T) => ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (item: T) => void
  emptyMessage?: string
}

export function Table<T extends { id: number }>({ columns, data, onRowClick, emptyMessage = 'Sin datos' }: TableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-12 text-center">
        <p className="text-muted text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-bg">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <motion.tr
              key={item.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
              onClick={() => onRowClick?.(item)}
              className={`border-b border-border/50 last:border-0 transition-colors duration-150
                ${onRowClick ? 'cursor-pointer hover:bg-accent/5' : ''}`}
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3 text-sm text-ink ${col.className || ''}`}>
                  {col.render ? col.render(item) : (item as any)[col.key]}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 6: Create Card.tsx**

```tsx
import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
}

export function Card({ children, className = '', hover = false }: CardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -2, boxShadow: '0 8px 25px -5px rgba(0,0,0,0.1)' } : undefined}
      transition={{ duration: 0.2 }}
      className={`bg-surface rounded-xl border border-border p-6 ${className}`}
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 7: Create Badge.tsx**

```tsx
interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger'
  children: React.ReactNode
}

const variants = {
  default: 'bg-ink/5 text-ink',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  )
}
```

- [ ] **Step 8: Create Alert.tsx**

```tsx
import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface AlertProps {
  variant?: 'info' | 'warning' | 'danger' | 'success'
  children: ReactNode
}

const variants = {
  info: 'bg-ink/5 border-ink/10 text-ink',
  warning: 'bg-warning/10 border-warning/20 text-warning',
  danger: 'bg-danger/10 border-danger/20 text-danger',
  success: 'bg-success/10 border-success/20 text-success',
}

export function Alert({ variant = 'info', children }: AlertProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-lg border px-4 py-3 text-sm ${variants[variant]}`}
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/ui/
git commit -m "feat: UI component library with Framer Motion animations"
```

---

### Task 5: Layout + Navigation

**Files:**
- Create: `src/renderer/components/layout/Sidebar.tsx`, `PageLayout.tsx`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Consumes: UI components from Task 4, Framer Motion
- Produces: Layout wrapper with sidebar navigation

- [ ] **Step 1: Create Sidebar.tsx**

```tsx
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'

const navItems = [
  { to: '/', label: 'Inicio', icon: '◉' },
  { to: '/clientes', label: 'Clientes', icon: '◎' },
  { to: '/pases', label: 'Pases', icon: '◈' },
  { to: '/planes', label: 'Planes', icon: '◇' },
  { to: '/pagos', label: 'Pagos', icon: '$' },
  { to: '/profesores', label: 'Profesores', icon: '◉' },
  { to: '/ventas', label: 'Ventas', icon: '◈' },
  { to: '/kiosco', label: 'Kiosco', icon: '◎' },
  { to: '/empleados', label: 'Empleados', icon: '◉' },
  { to: '/gastos', label: 'Gastos', icon: '◇' },
  { to: '/caja', label: 'Caja', icon: '$' },
  { to: '/informes', label: 'Informes', icon: '◈' },
]

export function Sidebar() {
  return (
    <aside className="flex flex-col w-60 bg-panel h-screen fixed left-0 top-0 border-r border-border">
      <div className="px-5 py-5">
        <h1 className="text-lg font-bold text-ink tracking-tight">Lebloc</h1>
      </div>
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item, index) => (
          <motion.div
            key={item.to}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.03 }}
          >
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150
                ${isActive
                  ? 'bg-accent text-white'
                  : 'text-ink/70 hover:text-ink hover:bg-ink/5'
                }`
              }
            >
              <span className="w-5 text-center text-xs opacity-70">{item.icon}</span>
              {item.label}
            </NavLink>
          </motion.div>
        ))}
      </nav>
      <div className="px-5 py-4 text-xs text-muted border-t border-border">
        v1.0
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create PageLayout.tsx**

```tsx
import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface PageLayoutProps {
  title: string
  actions?: ReactNode
  children: ReactNode
}

export function PageLayout({ title, actions, children }: PageLayoutProps) {
  return (
    <main className="ml-60 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
        className="px-8 py-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
        {children}
      </motion.div>
    </main>
  )
}
```

- [ ] **Step 3: Update App.tsx with Router**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { PageLayout } from './components/layout/PageLayout'
import { Card } from './components/ui/Card'
import { motion } from 'framer-motion'

function Dashboard() {
  const stats = [
    { label: 'Clientes activos', value: '--' },
    { label: 'Planes activos', value: '--' },
    { label: 'Ventas del mes', value: '$--' },
    { label: 'Caja abierta', value: '--' },
  ]

  return (
    <PageLayout title="Inicio">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card>
              <p className="text-sm text-muted">{stat.label}</p>
              <p className="text-2xl font-bold text-ink mt-1 font-mono">{stat.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </PageLayout>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <PageLayout title={title}>
      <Card className="p-12 text-center">
        <p className="text-muted text-sm">Proximamente...</p>
      </Card>
    </PageLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-bg">
        <Sidebar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clientes" element={<Placeholder title="Clientes" />} />
          <Route path="/pases" element={<Placeholder title="Pases" />} />
          <Route path="/planes" element={<Placeholder title="Planes" />} />
          <Route path="/pagos" element={<Placeholder title="Pagos" />} />
          <Route path="/profesores" element={<Placeholder title="Profesores" />} />
          <Route path="/ventas" element={<Placeholder title="Ventas" />} />
          <Route path="/kiosco" element={<Placeholder title="Kiosco" />} />
          <Route path="/empleados" element={<Placeholder title="Empleados" />} />
          <Route path="/gastos" element={<Placeholder title="Gastos" />} />
          <Route path="/caja" element={<Placeholder title="Caja" />} />
          <Route path="/informes" element={<Placeholder title="Informes" />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Run dev to verify navigation**

```bash
npm run dev
```
Expected: Sidebar visible, clicking nav items changes page content with smooth transitions

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: sidebar navigation and page layout with animations"
```

---

### Task 6: Shared Components

**Files:**
- Create: `src/renderer/components/shared/SearchInput.tsx`, `ConfirmDialog.tsx`

**Interfaces:**
- Consumes: UI components from Task 4, Framer Motion
- Produces: SearchInput, ConfirmDialog

- [ ] **Step 1: Create SearchInput.tsx**

```tsx
import { InputHTMLAttributes, forwardRef } from 'react'
import { motion } from 'framer-motion'

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (props, ref) => {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">⌕</span>
        <motion.input
          ref={ref}
          whileFocus={{ scale: 1.01 }}
          transition={{ duration: 0.15 }}
          type="text"
          className="w-full rounded-lg border border-border bg-surface pl-10 pr-4 py-2 text-sm text-ink
            placeholder:text-muted transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
            hover:border-ink/30"
          placeholder="Buscar..."
          {...props}
        />
      </div>
    )
  }
)
SearchInput.displayName = 'SearchInput'
```

- [ ] **Step 2: Create ConfirmDialog.tsx**

```tsx
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  variant?: 'primary' | 'danger'
}

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', variant = 'primary' }: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-muted mb-6">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant={variant} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/shared/
git commit -m "feat: shared components (SearchInput, ConfirmDialog)"
```

---

### Task 7: Utils + Clientes Store

**Files:**
- Create: `src/renderer/lib/utils.ts`, `src/renderer/stores/clienteStore.ts`

**Interfaces:**
- Consumes: types, db
- Produces: Utility functions, cliente CRUD store

- [ ] **Step 1: Create utils.ts**

```typescript
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('es-AR')
}

export function formatDateShort(date: string): string {
  return new Date(date).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
  })
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('es-AR')
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
```

- [ ] **Step 2: Create clienteStore.ts**

```typescript
import { create } from 'zustand'
import { Cliente } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface ClienteState {
  clientes: Cliente[]
  selectedCliente: Cliente | null
  search: string
  loading: boolean
  setSearch: (search: string) => void
  fetchClientes: () => Promise<void>
  createCliente: (data: Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
  updateCliente: (id: number, data: Partial<Cliente>) => Promise<void>
  deleteCliente: (id: number) => Promise<void>
  selectCliente: (cliente: Cliente | null) => void
}

export const useClienteStore = create<ClienteState>((set, get) => ({
  clientes: [],
  selectedCliente: null,
  search: '',
  loading: false,

  setSearch: (search) => set({ search }),

  fetchClientes: async () => {
    set({ loading: true })
    const { search } = get()
    let sql = 'SELECT * FROM clientes WHERE activo = 1'
    const params: unknown[] = []

    if (search) {
      sql += ' AND (nombre LIKE ? OR apellido LIKE ? OR dni LIKE ?)'
      const term = `%${search}%`
      params.push(term, term, term)
    }

    sql += ' ORDER BY apellido, nombre'
    const clientes = await dbQuery(sql, params)
    set({ clientes, loading: false })
  },

  createCliente: async (data) => {
    const now = new Date().toISOString()
    const result = await dbRun(
      `INSERT INTO clientes (nombre, apellido, dni, telefono, fechaNacimiento, esMenor,
        telefonoResponsable, contactoEmergencia, fechaIngreso, fotoPath, pdfPath,
        fechaUltimaActualizacion, activo, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [data.nombre, data.apellido, data.dni, data.telefono, data.fechaNacimiento,
       data.esMenor, data.telefonoResponsable, data.contactoEmergencia,
       data.fechaIngreso, data.fotoPath, data.pdfPath, now, now, now]
    )
    await get().fetchClientes()
    return result.lastInsertRowid
  },

  updateCliente: async (id, data) => {
    const now = new Date().toISOString()
    const fields: string[] = []
    const values: unknown[] = []

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdAt') {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    })

    fields.push('updatedAt = ?')
    values.push(now)
    values.push(id)

    await dbRun(`UPDATE clientes SET ${fields.join(', ')} WHERE id = ?`, values)
    await get().fetchClientes()
  },

  deleteCliente: async (id) => {
    await dbRun('UPDATE clientes SET activo = 0 WHERE id = ?', [id])
    await get().fetchClientes()
  },

  selectCliente: (cliente) => set({ selectedCliente: cliente }),
}))
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/ src/renderer/stores/clienteStore.ts
git commit -m "feat: utility functions and cliente store"
```

---

### Task 8: Clientes Page + Form

**Files:**
- Create: `src/renderer/pages/clientes/ClientesPage.tsx`, `ClienteForm.tsx`, `ClienteDetail.tsx`
- Modify: `src/renderer/App.tsx` (route)

**Interfaces:**
- Consumes: types, db, UI components, layout, stores
- Produces: Full CRUD for clients with fluid interactions

- [ ] **Step 1: Create ClienteForm.tsx**

```tsx
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Cliente } from '../../types'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { motion } from 'framer-motion'

interface ClienteFormProps {
  isOpen: boolean
  onClose: () => void
  cliente?: Cliente | null
  onSubmit: (data: any) => Promise<void>
}

export function ClienteForm({ isOpen, onClose, cliente, onSubmit }: ClienteFormProps) {
  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm()
  const esMenor = watch('esMenor')

  useEffect(() => {
    if (cliente) {
      reset(cliente)
    } else {
      reset({
        nombre: '', apellido: '', dni: '', telefono: '',
        fechaNacimiento: '', esMenor: 0,
        telefonoResponsable: '', contactoEmergencia: '',
        fechaIngreso: new Date().toISOString().split('T')[0],
      })
    }
  }, [cliente, reset, isOpen])

  const handleFormSubmit = async (data: any) => {
    await onSubmit(data)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cliente ? 'Editar Cliente' : 'Nuevo Cliente'} size="lg">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 gap-4"
        >
          <Input label="Nombre" {...register('nombre', { required: 'El nombre es obligatorio' })} />
          <Input label="Apellido" {...register('apellido', { required: 'El apellido es obligatorio' })} />
        </motion.div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="DNI" {...register('dni')} />
          <Input label="Telefono" {...register('telefono')} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Fecha de Nacimiento" type="date" {...register('fechaNacimiento')} />
          <Input label="Fecha de Ingreso" type="date" {...register('fechaIngreso')} />
        </div>

        <div className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            id="esMenor"
            {...register('esMenor')}
            className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
          />
          <label htmlFor="esMenor" className="text-sm font-medium text-ink">Es menor de edad</label>
        </div>

        {esMenor ? (
          <Input label="Telefono del Adulto Responsable" {...register('telefonoResponsable')} />
        ) : (
          <Input label="Contacto de Emergencia" {...register('contactoEmergencia')} />
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : cliente ? 'Guardar Cambios' : 'Crear Cliente'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 2: Create ClientesPage.tsx**

```tsx
import { useEffect, useState } from 'react'
import { useClienteStore } from '../../stores/clienteStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { SearchInput } from '../../components/shared/SearchInput'
import { Badge } from '../../components/ui/Badge'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { ClienteForm } from './ClienteForm'
import { Cliente } from '../../types'
import { formatDate } from '../../lib/utils'

export function ClientesPage() {
  const { clientes, search, setSearch, fetchClientes, createCliente, updateCliente, deleteCliente } = useClienteStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => { fetchClientes() }, [search])

  const columns = [
    { key: 'apellido', header: 'Apellido' },
    { key: 'nombre', header: 'Nombre' },
    { key: 'dni', header: 'DNI' },
    { key: 'telefono', header: 'Telefono' },
    { key: 'fechaIngreso', header: 'Ingreso', render: (c: Cliente) => formatDate(c.fechaIngreso) },
    { key: 'actions', header: '', className: 'w-32', render: (c: Cliente) => (
      <div className="flex gap-1 justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); setEditingCliente(c); setIsFormOpen(true) }}
        >
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); setDeletingId(c.id) }}
        >
          Eliminar
        </Button>
      </div>
    )},
  ]

  return (
    <PageLayout
      title="Clientes"
      actions={
        <Button onClick={() => { setEditingCliente(null); setIsFormOpen(true) }}>
          + Nuevo Cliente
        </Button>
      }
    >
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, apellido o DNI..."
        />
      </div>

      <Table
        columns={columns}
        data={clientes}
        onRowClick={(c) => { setEditingCliente(c); setIsFormOpen(true) }}
        emptyMessage="No hay clientes registrados. Crea el primero."
      />

      <ClienteForm
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingCliente(null) }}
        cliente={editingCliente}
        onSubmit={editingCliente ? (d) => updateCliente(editingCliente.id, d) : createCliente}
      />

      <ConfirmDialog
        isOpen={deletingId !== null}
        onClose={() => setDeletingId(null)}
        onConfirm={() => { if (deletingId) deleteCliente(deletingId) }}
        title="Eliminar Cliente"
        message="Esta accion desactivara el cliente. No se eliminara permanentemente."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </PageLayout>
  )
}
```

- [ ] **Step 3: Create ClienteDetail.tsx (placeholder)**

```tsx
// Will be implemented in Phase 2 when we need detailed client view
export function ClienteDetail() {
  return null
}
```

- [ ] **Step 4: Update App.tsx route**

Replace the clientes placeholder:
```tsx
import { ClientesPage } from './pages/clientes/ClientesPage'
// ...
<Route path="/clientes" element={<ClientesPage />} />
```

- [ ] **Step 5: Install react-hook-form**

```bash
npm install react-hook-form
```

- [ ] **Step 6: Run dev to test CRUD**

```bash
npm run dev
```
Expected: Can create, list, search, edit, and soft-delete clients with smooth animations

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: clientes module with CRUD, search, and animated form"
```

---

### Task 9: Pases Store + Page

**Files:**
- Create: `src/renderer/stores/paseStore.ts`, `src/renderer/pages/pases/PasesPage.tsx`, `PaseForm.tsx`
- Modify: `src/renderer/App.tsx` (route)

**Interfaces:**
- Consumes: types, db, UI, layout
- Produces: CRUD for pass types

- [ ] **Step 1: Create paseStore.ts**

```typescript
import { create } from 'zustand'
import { Pase } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface PaseState {
  pases: Pase[]
  loading: boolean
  fetchPases: () => Promise<void>
  createPase: (data: Omit<Pase, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
  updatePase: (id: number, data: Partial<Pase>) => Promise<void>
  deletePase: (id: number) => Promise<void>
}

export const usePaseStore = create<PaseState>((set, get) => ({
  pases: [],
  loading: false,

  fetchPases: async () => {
    set({ loading: true })
    const pases = await dbQuery('SELECT * FROM pases WHERE activo = 1 ORDER BY nombre')
    set({ pases, loading: false })
  },

  createPase: async (data) => {
    const now = new Date().toISOString()
    const result = await dbRun(
      `INSERT INTO pases (nombre, clasesSemanales, precio, recargoProfesor, esDiario, activo, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [data.nombre, data.clasesSemanales, data.precio, data.recargoProfesor, data.esDiario, now, now]
    )
    await get().fetchPases()
    return result.lastInsertRowid
  },

  updatePase: async (id, data) => {
    const now = new Date().toISOString()
    const fields: string[] = []
    const values: unknown[] = []
    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdAt') {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    })
    fields.push('updatedAt = ?')
    values.push(now)
    values.push(id)
    await dbRun(`UPDATE pases SET ${fields.join(', ')} WHERE id = ?`, values)
    await get().fetchPases()
  },

  deletePase: async (id) => {
    await dbRun('UPDATE pases SET activo = 0 WHERE id = ?', [id])
    await get().fetchPases()
  },
}))
```

- [ ] **Step 2: Create PaseForm.tsx**

```tsx
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Pase } from '../../types'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

interface PaseFormProps {
  isOpen: boolean
  onClose: () => void
  pase?: Pase | null
  onSubmit: (data: any) => Promise<void>
}

export function PaseForm({ isOpen, onClose, pase, onSubmit }: PaseFormProps) {
  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm()
  const esDiario = watch('esDiario')

  useEffect(() => {
    if (pase) {
      reset(pase)
    } else {
      reset({ nombre: '', clasesSemanales: 1, precio: 0, recargoProfesor: 0, esDiario: 0 })
    }
  }, [pase, reset, isOpen])

  const handleFormSubmit = async (data: any) => {
    await onSubmit({ ...data, clasesSemanales: Number(data.clasesSemanales), precio: Number(data.precio), recargoProfesor: Number(data.recargoProfesor) })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={pase ? 'Editar Pase' : 'Nuevo Pase'} size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Input label="Nombre del Pase" {...register('nombre', { required: true })} placeholder="Ej: 2x semana, Diario" />

        {!esDiario && (
          <Input label="Clases por Semana" type="number" min="1" {...register('clasesSemanales', { required: true })} />
        )}

        <Input label="Precio" type="number" min="0" step="0.01" {...register('precio', { required: true })} />
        <Input label="Recargo Profesor" type="number" min="0" step="0.01" {...register('recargoProfesor')} />

        <div className="flex items-center gap-3 py-2">
          <input type="checkbox" id="esDiario" {...register('esDiario')} className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30" />
          <label htmlFor="esDiario" className="text-sm font-medium text-ink">Pase diario (no se asocia a cliente)</label>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>{pase ? 'Guardar' : 'Crear Pase'}</Button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 3: Create PasesPage.tsx**

```tsx
import { useEffect, useState } from 'react'
import { usePaseStore } from '../../stores/paseStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PaseForm } from './PaseForm'
import { Pase } from '../../types'
import { formatCurrency } from '../../lib/utils'

export function PasesPage() {
  const { pases, fetchPases, createPase, updatePase, deletePase } = usePaseStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPase, setEditingPase] = useState<Pase | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => { fetchPases() }, [])

  const columns = [
    { key: 'nombre', header: 'Nombre', render: (p: Pase) => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{p.nombre}</span>
        {p.esDiario ? <Badge>Diario</Badge> : null}
      </div>
    )},
    { key: 'clasesSemanales', header: 'Clases/Sem', render: (p: Pase) => p.esDiario ? '-' : `${p.clasesSemanales}x` },
    { key: 'precio', header: 'Precio', render: (p: Pase) => formatCurrency(p.precio) },
    { key: 'recargoProfesor', header: 'Recargo Prof.', render: (p: Pase) => p.recargoProfesor > 0 ? formatCurrency(p.recargoProfesor) : '-' },
    { key: 'actions', header: '', className: 'w-32', render: (p: Pase) => (
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingPase(p); setIsFormOpen(true) }}>Editar</Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingId(p.id) }}>Eliminar</Button>
      </div>
    )},
  ]

  return (
    <PageLayout title="Pases" actions={<Button onClick={() => { setEditingPase(null); setIsFormOpen(true) }}>+ Nuevo Pase</Button>}>
      <Table columns={columns} data={pases} onRowClick={(p) => { setEditingPase(p); setIsFormOpen(true) }} emptyMessage="No hay pases configurados. Crea el primero." />
      <PaseForm isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditingPase(null) }} pase={editingPase} onSubmit={editingPase ? (d) => updatePase(editingPase.id, d) : createPase} />
      <ConfirmDialog isOpen={deletingId !== null} onClose={() => setDeletingId(null)} onConfirm={() => { if (deletingId) deletePase(deletingId) }} title="Eliminar Pase" message="Esta accion desactivara el pase." confirmLabel="Eliminar" variant="danger" />
    </PageLayout>
  )
}
```

- [ ] **Step 4: Update App.tsx route**

```tsx
import { PasesPage } from './pages/pases/PasesPage'
// ...
<Route path="/pases" element={<PasesPage />} />
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pases module with CRUD"
```

---

### Task 10: Planes Store + Page

**Files:**
- Create: `src/renderer/stores/planStore.ts`, `src/renderer/pages/planes/PlanesPage.tsx`, `PlanForm.tsx`, `AsistenciaButton.tsx`
- Modify: `src/renderer/App.tsx` (route)

**Interfaces:**
- Consumes: types, db, UI, layout, stores (clienteStore, paseStore)
- Produces: Assign plans, register attendance, renew plans

- [ ] **Step 1: Create planStore.ts**

```typescript
import { create } from 'zustand'
import { Plan } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface PlanState {
  planes: Plan[]
  loading: boolean
  fetchPlanes: () => Promise<void>
  createPlan: (data: { clienteId: number; paseId: number; profesorId?: number }) => Promise<number>
  renovarPlan: (planId: number) => Promise<number>
  registrarAsistencia: (planId: number) => Promise<void>
}

export const usePlanStore = create<PlanState>((set, get) => ({
  planes: [],
  loading: false,

  fetchPlanes: async () => {
    set({ loading: true })
    const planes = await dbQuery(`
      SELECT p.*, c.nombre || ' ' || c.apellido as clienteNombre,
             pa.nombre as paseNombre,
             pr.nombre || ' ' || pr.apellido as profesorNombre
      FROM planes p
      JOIN clientes c ON p.clienteId = c.id
      JOIN pases pa ON p.paseId = pa.id
      LEFT JOIN profesores pr ON p.profesorId = pr.id
      WHERE p.activo = 1
      ORDER BY c.apellido, c.nombre
    `)
    set({ planes, loading: false })
  },

  createPlan: async (data) => {
    const pase = (await dbQuery('SELECT * FROM pases WHERE id = ?', [data.paseId]))[0]
    const now = new Date().toISOString()
    const pasesRestantes = pase.clasesSemanales * 4

    const result = await dbRun(
      `INSERT INTO planes (clienteId, paseId, clasesSemanales, precio, pasesRestantes, profesorId, fechaInicio, activo, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [data.clienteId, data.paseId, pase.clasesSemanales, pase.precio, pasesRestantes,
       data.profesorId || null, now, now]
    )
    await get().fetchPlanes()
    return result.lastInsertRowid
  },

  renovarPlan: async (planId) => {
    const plan = (await dbQuery('SELECT * FROM planes WHERE id = ?', [planId]))[0]
    const now = new Date().toISOString()
    const pasesRestantes = plan.clasesSemanales * 4

    const result = await dbRun(
      `INSERT INTO planes (clienteId, paseId, clasesSemanales, precio, pasesRestantes, profesorId, fechaInicio, activo, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [plan.clienteId, plan.paseId, plan.clasesSemanales, plan.precio, pasesRestantes,
       plan.profesorId, now, now]
    )
    await get().fetchPlanes()
    return result.lastInsertRowid
  },

  registrarAsistencia: async (planId) => {
    const now = new Date().toISOString()
    await dbRun('INSERT INTO asistencias (planId, fecha, createdAt) VALUES (?, ?, ?)', [planId, now, now])
    await dbRun('UPDATE planes SET pasesRestantes = pasesRestantes - 1 WHERE id = ?', [planId])
    await get().fetchPlanes()
  },
}))
```

- [ ] **Step 2: Create AsistenciaButton.tsx**

```tsx
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { usePlanStore } from '../../stores/planStore'
import { Plan } from '../../types'
import { motion, AnimatePresence } from 'framer-motion'

interface AsistenciaButtonProps {
  plan: Plan
}

export function AsistenciaButton({ plan }: AsistenciaButtonProps) {
  const registrarAsistencia = usePlanStore((s) => s.registrarAsistencia)
  const [animating, setAnimating] = useState(false)

  const isLow = plan.pasesRestantes <= 2
  const isEmpty = plan.pasesRestantes <= 0

  const handleClick = async () => {
    setAnimating(true)
    await registrarAsistencia(plan.id)
    setTimeout(() => setAnimating(false), 300)
  }

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence mode="wait">
        <motion.div
          key={plan.pasesRestantes}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Badge variant={isEmpty ? 'danger' : isLow ? 'warning' : 'success'}>
            {plan.pasesRestantes} restantes
          </Badge>
        </motion.div>
      </AnimatePresence>
      <Button
        size="sm"
        variant="ghost"
        disabled={isEmpty || animating}
        onClick={handleClick}
      >
        {animating ? '...' : '+ Asistencia'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Create PlanForm.tsx**

```tsx
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { useClienteStore } from '../../stores/clienteStore'
import { usePaseStore } from '../../stores/paseStore'
import { motion } from 'framer-motion'

interface PlanFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { clienteId: number; paseId: number; profesorId?: number }) => Promise<void>
}

export function PlanForm({ isOpen, onClose, onSubmit }: PlanFormProps) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm()
  const { clientes, fetchClientes } = useClienteStore()
  const { pases, fetchPases } = usePaseStore()
  const [selectedPase, setSelectedPase] = useState<any>(null)

  useEffect(() => {
    fetchClientes()
    fetchPases()
  }, [])

  const paseId = watch('paseId')

  useEffect(() => {
    if (paseId) {
      const pase = pases.find((p) => p.id === Number(paseId))
      setSelectedPase(pase)
    }
  }, [paseId, pases])

  const handleFormSubmit = async (data: any) => {
    await onSubmit({
      clienteId: Number(data.clienteId),
      paseId: Number(data.paseId),
      profesorId: data.profesorId ? Number(data.profesorId) : undefined,
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Asignar Plan" size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Select label="Cliente" {...register('clienteId', { required: true })}>
          <option value="">Seleccionar cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.apellido}, {c.nombre}</option>
          ))}
        </Select>

        <Select label="Tipo de Pase" {...register('paseId', { required: true })}>
          <option value="">Seleccionar pase...</option>
          {pases.filter((p) => !p.esDiario).map((p) => (
            <option key={p.id} value={p.id}>{p.nombre} - {p.clasesSemanales}x/sem</option>
          ))}
        </Select>

        {selectedPase && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-bg rounded-lg p-4 text-sm"
          >
            <p className="text-muted">Pases al inicio: <span className="font-mono font-bold text-ink">{selectedPase.clasesSemanales * 4}</span></p>
            <p className="text-muted">Precio: <span className="font-mono font-bold text-ink">${selectedPase.precio}</span></p>
          </motion.div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>Asignar Plan</Button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Create PlanesPage.tsx**

```tsx
import { useEffect, useState } from 'react'
import { usePlanStore } from '../../stores/planStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PlanForm } from './PlanForm'
import { AsistenciaButton } from './AsistenciaButton'
import { Plan } from '../../types'
import { formatDate, formatCurrency } from '../../lib/utils'

export function PlanesPage() {
  const { planes, fetchPlanes, createPlan, renovarPlan } = usePlanStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [renovarId, setRenovarId] = useState<number | null>(null)

  useEffect(() => { fetchPlanes() }, [])

  const columns = [
    { key: 'clienteNombre', header: 'Cliente', render: (p: Plan) => <span className="font-medium">{p.clienteNombre}</span> },
    { key: 'paseNombre', header: 'Pase' },
    { key: 'clasesSemanales', header: 'Clases/Sem', render: (p: Plan) => `${p.clasesSemanales}x` },
    { key: 'precio', header: 'Precio', render: (p: Plan) => formatCurrency(p.precio) },
    { key: 'pasesRestantes', header: 'Estado', render: (p: Plan) => <AsistenciaButton plan={p} /> },
    { key: 'fechaInicio', header: 'Inicio', render: (p: Plan) => formatDate(p.fechaInicio) },
    { key: 'actions', header: '', className: 'w-24', render: (p: Plan) => (
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setRenovarId(p.id) }}>Renovar</Button>
    )},
  ]

  return (
    <PageLayout title="Planes" actions={<Button onClick={() => setIsFormOpen(true)}>+ Nuevo Plan</Button>}>
      <Table columns={columns} data={planes} emptyMessage="No hay planes activos." />
      <PlanForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSubmit={createPlan} />
      <ConfirmDialog
        isOpen={renovarId !== null}
        onClose={() => setRenovarId(null)}
        onConfirm={() => { if (renovarId) renovarPlan(renovarId) }}
        title="Renovar Plan"
        message="Se creara un nuevo plan con los pases reiniciados."
        confirmLabel="Renovar"
      />
    </PageLayout>
  )
}
```

- [ ] **Step 5: Update App.tsx route**

```tsx
import { PlanesPage } from './pages/planes/PlanesPage'
// ...
<Route path="/planes" element={<PlanesPage />} />
```

- [ ] **Step 6: Run dev to test**

```bash
npm run dev
```
Expected: Can assign plans, register attendance with animated counter, renew plans, see low-pass alerts

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: planes module with assignment, attendance, and renewal"
```

---

### Task 11: Pagos Store + Page

**Files:**
- Create: `src/renderer/stores/pagoStore.ts`, `src/renderer/pages/pagos/PagosPage.tsx`, `PagoForm.tsx`
- Modify: `src/renderer/App.tsx` (route)

**Interfaces:**
- Consumes: types, db, UI, layout, planStore
- Produces: Register partial payments, track debt

- [ ] **Step 1: Create pagoStore.ts**

```typescript
import { create } from 'zustand'
import { Pago } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface PagoState {
  pagos: Pago[]
  loading: boolean
  fetchPagos: (planId?: number) => Promise<void>
  createPago: (data: { planId: number; monto: number; metodoPago: string; observaciones?: string }) => Promise<number>
}

export const usePagoStore = create<PagoState>((set) => ({
  pagos: [],
  loading: false,

  fetchPagos: async (planId) => {
    set({ loading: true })
    let sql = `
      SELECT pg.*, p.precio as planPrecio, c.nombre || ' ' || c.apellido as clienteNombre
      FROM pagos pg
      JOIN planes p ON pg.planId = p.id
      JOIN clientes c ON p.clienteId = c.id
    `
    const params: unknown[] = []
    if (planId) {
      sql += ' WHERE pg.planId = ?'
      params.push(planId)
    }
    sql += ' ORDER BY pg.fecha DESC'
    const pagos = await dbQuery(sql, params)
    set({ pagos, loading: false })
  },

  createPago: async (data) => {
    const now = new Date().toISOString()
    const result = await dbRun(
      `INSERT INTO pagos (planId, monto, fecha, metodoPago, observaciones, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.planId, data.monto, now, data.metodoPago, data.observaciones || null, now]
    )
    return result.lastInsertRowid
  },
}))
```

- [ ] **Step 2: Create PagoForm.tsx**

```tsx
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { usePlanStore } from '../../stores/planStore'
import { usePagoStore } from '../../stores/pagoStore'
import { motion } from 'framer-motion'

interface PagoFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => Promise<void>
}

export function PagoForm({ isOpen, onClose, onSubmit }: PagoFormProps) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm()
  const { planes, fetchPlanes } = usePlanStore()
  const { createPago } = usePagoStore()
  const [deudaInfo, setDeudaInfo] = useState<{ total: number; pagado: number; pendiente: number } | null>(null)

  useEffect(() => { fetchPlanes() }, [])

  const planId = watch('planId')

  useEffect(() => {
    if (planId) {
      const plan = planes.find((p) => p.id === Number(planId))
      if (plan) {
        setDeudaInfo({ total: plan.precio, pagado: 0, pendiente: plan.precio })
      }
    }
  }, [planId, planes])

  const handleFormSubmit = async (data: any) => {
    await onSubmit({
      planId: Number(data.planId),
      monto: Number(data.monto),
      metodoPago: data.metodoPago,
      observaciones: data.observaciones,
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registrar Pago" size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Select label="Plan" {...register('planId', { required: true })}>
          <option value="">Seleccionar plan...</option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>{p.clienteNombre} - {p.paseNombre}</option>
          ))}
        </Select>

        {deudaInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-bg rounded-lg p-4 text-sm space-y-1"
          >
            <p className="text-muted">Total: <span className="font-mono font-bold text-ink">${deudaInfo.total}</span></p>
            <p className="text-muted">Pendiente: <span className="font-mono font-bold text-warning">${deudaInfo.pendiente}</span></p>
          </motion.div>
        )}

        <Input label="Monto" type="number" min="0" step="0.01" {...register('monto', { required: true })} />

        <Select label="Metodo de Pago" {...register('metodoPago', { required: true })}>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </Select>

        <Input label="Observaciones" {...register('observaciones')} />

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>Registrar Pago</Button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 3: Create PagosPage.tsx**

```tsx
import { useEffect, useState } from 'react'
import { usePagoStore } from '../../stores/pagoStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { PagoForm } from './PagoForm'
import { Pago } from '../../types'
import { formatCurrency, formatDate, formatDateTime } from '../../lib/utils'

export function PagosPage() {
  const { pagos, fetchPagos, createPago } = usePagoStore()
  const [isFormOpen, setIsFormOpen] = useState(false)

  useEffect(() => { fetchPagos() }, [])

  const columns = [
    { key: 'fecha', header: 'Fecha', render: (p: Pago) => formatDateTime(p.fecha) },
    { key: 'clienteNombre', header: 'Cliente', render: (p: Pago) => <span className="font-medium">{p.clienteNombre}</span> },
    { key: 'monto', header: 'Monto', render: (p: Pago) => <span className="font-mono">{formatCurrency(p.monto)}</span> },
    { key: 'metodoPago', header: 'Metodo', render: (p: Pago) => <span className="capitalize">{p.metodoPago}</span> },
    { key: 'observaciones', header: 'Obs.' },
  ]

  return (
    <PageLayout title="Pagos" actions={<Button onClick={() => setIsFormOpen(true)}>+ Registrar Pago</Button>}>
      <Table columns={columns} data={pagos} emptyMessage="No hay pagos registrados." />
      <PagoForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSubmit={createPago} />
    </PageLayout>
  )
}
```

- [ ] **Step 4: Update App.tsx route**

```tsx
import { PagosPage } from './pages/pagos/PagosPage'
// ...
<Route path="/pagos" element={<PagosPage />} />
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pagos module with partial payments and debt tracking"
```

---

### Task 12: Profesores Store + Page

**Files:**
- Create: `src/renderer/stores/profesorStore.ts`, `src/renderer/pages/profesores/ProfesoresPage.tsx`, `ProfesorForm.tsx`
- Modify: `src/renderer/App.tsx` (route)

**Interfaces:**
- Consumes: types, db, UI, layout
- Produces: CRUD for external teachers

- [ ] **Step 1: Create profesorStore.ts**

```typescript
import { create } from 'zustand'
import { Profesor } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface ProfesorState {
  profesores: Profesor[]
  loading: boolean
  fetchProfesores: () => Promise<void>
  createProfesor: (data: Omit<Profesor, 'id' | 'createdAt'>) => Promise<number>
  updateProfesor: (id: number, data: Partial<Profesor>) => Promise<void>
  deleteProfesor: (id: number) => Promise<void>
}

export const useProfesorStore = create<ProfesorState>((set, get) => ({
  profesores: [],
  loading: false,

  fetchProfesores: async () => {
    set({ loading: true })
    const profesores = await dbQuery('SELECT * FROM profesores WHERE activo = 1 ORDER BY apellido, nombre')
    set({ profesores, loading: false })
  },

  createProfesor: async (data) => {
    const now = new Date().toISOString()
    const result = await dbRun(
      `INSERT INTO profesores (nombre, apellido, telefono, email, activo, createdAt)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [data.nombre, data.apellido, data.telefono, data.email, now]
    )
    await get().fetchProfesores()
    return result.lastInsertRowid
  },

  updateProfesor: async (id, data) => {
    const fields: string[] = []
    const values: unknown[] = []
    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdAt') {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    })
    values.push(id)
    await dbRun(`UPDATE profesores SET ${fields.join(', ')} WHERE id = ?`, values)
    await get().fetchProfesores()
  },

  deleteProfesor: async (id) => {
    await dbRun('UPDATE profesores SET activo = 0 WHERE id = ?', [id])
    await get().fetchProfesores()
  },
}))
```

- [ ] **Step 2: Create ProfesorForm.tsx**

```tsx
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Profesor } from '../../types'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

interface ProfesorFormProps {
  isOpen: boolean
  onClose: () => void
  profesor?: Profesor | null
  onSubmit: (data: any) => Promise<void>
}

export function ProfesorForm({ isOpen, onClose, profesor, onSubmit }: ProfesorFormProps) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm()

  useEffect(() => {
    if (profesor) reset(profesor)
    else reset({ nombre: '', apellido: '', telefono: '', email: '' })
  }, [profesor, reset, isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={profesor ? 'Editar Profesor' : 'Nuevo Profesor'} size="md">
      <form onSubmit={handleSubmit(async (data) => { await onSubmit(data); onClose() })} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Nombre" {...register('nombre', { required: true })} />
          <Input label="Apellido" {...register('apellido', { required: true })} />
        </div>
        <Input label="Telefono" {...register('telefono')} />
        <Input label="Email" type="email" {...register('email')} />
        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>{profesor ? 'Guardar' : 'Crear'}</Button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 3: Create ProfesoresPage.tsx**

```tsx
import { useEffect, useState } from 'react'
import { useProfesorStore } from '../../stores/profesorStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { ProfesorForm } from './ProfesorForm'
import { Profesor } from '../../types'

export function ProfesoresPage() {
  const { profesores, fetchProfesores, createProfesor, updateProfesor, deleteProfesor } = useProfesorStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Profesor | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => { fetchProfesores() }, [])

  const columns = [
    { key: 'apellido', header: 'Apellido', render: (p: Profesor) => <span className="font-medium">{p.apellido}</span> },
    { key: 'nombre', header: 'Nombre' },
    { key: 'telefono', header: 'Telefono' },
    { key: 'email', header: 'Email' },
    { key: 'actions', header: '', className: 'w-32', render: (p: Profesor) => (
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(p); setIsFormOpen(true) }}>Editar</Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingId(p.id) }}>Eliminar</Button>
      </div>
    )},
  ]

  return (
    <PageLayout title="Profesores" actions={<Button onClick={() => { setEditing(null); setIsFormOpen(true) }}>+ Nuevo Profesor</Button>}>
      <Table columns={columns} data={profesores} onRowClick={(p) => { setEditing(p); setIsFormOpen(true) }} emptyMessage="No hay profesores registrados." />
      <ProfesorForm isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditing(null) }} profesor={editing} onSubmit={editing ? (d) => updateProfesor(editing.id, d) : createProfesor} />
      <ConfirmDialog isOpen={deletingId !== null} onClose={() => setDeletingId(null)} onConfirm={() => { if (deletingId) deleteProfesor(deletingId) }} title="Eliminar Profesor" message="Esta accion desactivara al profesor." confirmLabel="Eliminar" variant="danger" />
    </PageLayout>
  )
}
```

- [ ] **Step 4: Update App.tsx route**

```tsx
import { ProfesoresPage } from './pages/profesores/ProfesoresPage'
// ...
<Route path="/profesores" element={<ProfesoresPage />} />
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: profesores module with CRUD"
```

---

### Task 13: Dashboard + Final Integration

**Files:**
- Modify: `src/renderer/App.tsx` (Dashboard with real data)

**Interfaces:**
- Consumes: all stores
- Produces: Dashboard with real stats

- [ ] **Step 1: Update Dashboard with real queries**

```tsx
function Dashboard() {
  const [stats, setStats] = useState({ clientes: 0, planes: 0, ventasMes: 0, cajaAbierta: false })

  useEffect(() => {
    const load = async () => {
      const clientes = await dbQuery('SELECT COUNT(*) as count FROM clientes WHERE activo = 1')
      const planes = await dbQuery('SELECT COUNT(*) as count FROM planes WHERE activo = 1')
      const caja = await dbQuery('SELECT COUNT(*) as count FROM caja WHERE estado = \'abierta\'')

      setStats({
        clientes: clientes[0]?.count || 0,
        planes: planes[0]?.count || 0,
        ventasMes: 0, // Will be implemented in Phase 2
        cajaAbierta: (caja[0]?.count || 0) > 0,
      })
    }
    load()
  }, [])

  const cards = [
    { label: 'Clientes activos', value: stats.clientes.toString(), color: 'text-ink' },
    { label: 'Planes activos', value: stats.planes.toString(), color: 'text-ink' },
    { label: 'Ventas del mes', value: '$--', color: 'text-ink' },
    { label: 'Caja', value: stats.cajaAbierta ? 'Abierta' : 'Cerrada', color: stats.cajaAbierta ? 'text-success' : 'text-muted' },
  ]

  return (
    <PageLayout title="Inicio">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card>
              <p className="text-sm text-muted">{card.label}</p>
              <p className={`text-2xl font-bold mt-1 font-mono ${card.color}`}>{card.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </PageLayout>
  )
}
```

- [ ] **Step 2: Final run dev test**

```bash
npm run dev
```
Expected: All Phase 1 modules working, dashboard showing real data, smooth animations throughout

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: dashboard with real stats and final Phase 1 integration"
```
