# ⛁ Ledger — Control de cuentas de trading

Ledger es una aplicación web privada (PWA) para llevar el control de cuentas de trading, tanto **capital propio** como cuentas de **fondeo (prop firms)**: FTMO, Apex, Topstep, Axi Select, etc.

Modela directamente las reglas de cada tipo de programa (CFD, Futuros, Axi Select) y calcula en tiempo real si estás cerca de romper un límite, cuánto te falta para pasar de fase, y cómo va tu rentabilidad real.

## Stack

- **Frontend:** React + Vite + TypeScript, tema claro/oscuro, responsive, instalable como PWA.
- **Gráficas:** Recharts.
- **Datos / Auth / Sincronización:** [Supabase](https://supabase.com) (Postgres + Auth email/contraseña + Row Level Security + Realtime).

## Requisitos

- Node.js 18+ y npm.
- Un proyecto en [Supabase](https://supabase.com) (plan gratuito suficiente).

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear el esquema en Supabase

1. Crea un proyecto en https://supabase.com.
2. Ve al **SQL Editor** de tu proyecto.
3. Copia y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql).
   - Esto crea las tablas `profiles`, `accounts`, `trades`, `payouts` y `app_settings`.
   - Habilita **Row Level Security** (cada usuario solo ve sus datos).
   - Registra un disparador para crear el perfil al registrar un usuario.
   - Añade las tablas a **Realtime** para la sincronización entre dispositivos.

> **Si ya tenías el esquema creado** y solo quieres actualizar (sin borrar datos), ejecuta
> [`supabase/migrate_stage_start_pnl.sql`](supabase/migrate_stage_start_pnl.sql) en el SQL Editor:
> agrega la columna `stage_start_pnl` (punto de partida de cada etapa) de forma no destructiva.

### 3. Configurar credenciales

Copia `.env.example` a `.env`:

```bash
copy .env.example .env
```

Edita `.env` y pega tu **URL** y **anon key** de Supabase (Settings → API):

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

> La `anon key` NO es un secreto (se envía al navegador); la seguridad real la dan las políticas RLS que crea el `schema.sql`. Si no configuras el `.env`, la app te pedirá las credenciales en la pantalla de login («Configurar ahora»).

### 4. Ejecutar en desarrollo

```bash
npm run dev
```

Abre http://localhost:5173, registra tu cuenta (correo + contraseña) y confirma si Supabase lo requiere.

### 5. Build de producción (PWA instalable)

```bash
npm run build
npm run preview
```

En el celular abre la URL (o despliega `dist/` en cualquier hosting estático: Vercel, Netlify, Cloudflare Pages) y usa «Añadir a pantalla de inicio» para instalarla como app.

## Características

- **Acceso:** login con correo/contraseña, modo claro/oscuro recordado, diseño responsive (escritorio + celular), PWA instalable.
- **Navegación por cuenta:** la barra lateral lista tus cuentas directamente; al hacer clic en una se abre su vista completa con pestañas (Dashboard, Calendario, Operaciones, Etapas, Mensual, Payouts) que comparten siempre el contexto de esa cuenta. No hay selectores duplicados.
- **Cuentas:** múltiples, con tipo (propio / Fondeo CFD / Fondeo Futuros / Axi Select), broker o prop firm predefinido, balance inicial, riesgo %, fecha de inicio y estado. Editar/eliminar con confirmación (borrar también sus operaciones y payouts).
- **Reglas por programa:**
  - **Fondeo CFD:** 1 o 2 fases con objetivo en $, drawdown estático (límites en $ calculados sobre el balance), profit split; tras las fases pasa a «Fondeada».
  - **Fondeo Futuros:** Evaluación → Colchón → Fondeo, drawdown estático o trailing/EOD, objetivos en $, regla de consistencia y profit split.
  - **Axi Select:** ruta Seed → Incubation → Acceleration → Pro → Pro 500 → Pro M con equity mínimo, Edge Score, multiplicador, fondeo, split, profit target, duración/operaciones mínimas, apalancamiento y pérdida máx, todo editable.
- **Sistema de etapas:** cada etapa mide su progreso como la **ganancia neta desde que entraste a esa etapa** (punto de partida que se reinicia en cada cambio), contra el **objetivo en $** de esa etapa.
  - **Fondeo Futuros y Fondeo CFD:** avance **automático** — al superar el objetivo, la cuenta sube sola de etapa, se reinicia el punto de partida y aparece el modal de celebración. En CFD, tras las fases el programa pasa a una etapa terminal **«Fondeada»**.
  - **Axi Select:** avance **manual** — tú decides cuándo subir/bajar de etapa desde el detalle de la cuenta; el progreso se muestra solo como referencia informativa.
- **Operaciones:** fecha, instrumento, dirección, sesión (Londres, NY AM, NY PM, 2AM NY, Asia, Otra), R planeado/resultado, P&L $, resultado, notas. Listado completo editable/eliminable.
- **Calendario:** vista mensual tipo heatmap (verde/rojo, fin de semana rayado), P&L mensual destacado, resumen semanal (columna lateral en PC / fila compacta en móvil), clic en un día para registrar operación.
- **Dashboard:** balance, rentabilidad, P&L neto y de hoy, win rate, profit factor, racha, expectativa, curva de equity, drawdown máximo, mayor día, promedios, desgloses por sesión/instrumento/long-short/día de semana, histograma de R y resumen de payouts.
- **Vista mensual (myfxbook):** tabla mes a mes (P&L, R, operaciones, win rate, mejor/peor día) y gráfico de ganancia % por mes.
- **Payouts:** retiros con fecha, monto bruto, split, estado, cálculo automático de «tu parte» y listado editable.

## Estructura

```
src/
  lib/          tipos, motor de cálculo (engine), formato, reglas por defecto
  contexts/     Auth (Supabase), Datos (CRUD + realtime), Tema, Cuenta de ruta
  hooks/        avance automático de etapas
  components/   Layout (lista de cuentas), pestañas de cuenta, formularios, modales
  pages/        Login, Dashboard, Calendario, Operaciones, Etapas, Mensual, Payouts, Cuentas
supabase/
  schema.sql    esquema + políticas RLS + realtime
```

> **Nota:** los cálculos de drawdown, objetivos y avance de etapa se hacen en el cliente a partir de los datos crudos (operaciones + payouts). Esto mantiene la app rápida, funciona sin conexión y refleja los cambios al instante, sincronizando después con Supabase.

HOLA