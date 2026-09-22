# Mi Ruta

PWA de transporte público para Managua. Los usuarios reportan si están "en el bus" o "esperando"
una ruta, y ven en un mapa en tiempo real dónde está la actividad reciente de cada ruta.

## Stack

- **Next.js 16** (App Router) + **React 19**, TypeScript
- **Supabase** (Postgres + Realtime) como backend — tabla `reportes`, sin autenticación de usuarios
- **Leaflet / react-leaflet** para el mapa
- **Serwist** para el service worker (PWA instalable, `app/sw.ts` → `public/sw.js`)
- **Tailwind CSS v4** (tokens de diseño en `app/globals.css`, ver `@theme`)

## Desarrollo

```bash
npm install
npm run dev      # Turbopack, service worker deshabilitado en dev
npm run build    # Webpack — Serwist genera el service worker en el build de producción
npm run start
```

`dev` usa `--turbopack` y `build` usa `--webpack` a propósito: Serwist necesita el pipeline de
Webpack para generar `public/sw.js`, y el service worker está deshabilitado en desarrollo de
todas formas (ver `next.config.ts`).

## Variables de entorno

Requeridas en `.env.local` (el cliente de Supabase falla rápido si faltan, ver `lib/supabase.ts`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

La anon key es pública por diseño (Supabase); la seguridad de escritura en la tabla `reportes`
depende de las políticas de Row Level Security configuradas en el proyecto de Supabase, no en
el cliente.

## Estructura

- `app/page.tsx` — pantalla única de la app (onboarding, permisos de GPS, mapa, picker de rutas)
- `components/` — `Boton`, `BannerFlotante`, `PantallaFrame` (marco responsive), `MapaLeaflet`,
  `Iconos` (set de iconos SVG propios)
- `lib/rutas.ts` — catálogo de rutas de bus; `lib/supabase.ts` — cliente de Supabase

## Despliegue

Desplegado en Vercel vía integración con GitHub (push a `master` dispara un deploy). Dominio de
producción: `mi-ruta-sable.vercel.app`.
