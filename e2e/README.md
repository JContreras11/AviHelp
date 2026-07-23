# Suite de pruebas e2e — AviHelp

Pruebas end-to-end con **Playwright** que **graban video** de cada flujo por rol.
Sirven de (a) verificación automática y (b) documentación viva de cómo se usa el sistema.

## Requisitos

- App corriendo local (`pnpm dev` en `http://localhost:3000`) — la suite lo levanta sola si no está.
- `.env.local` con las credenciales de DEV (Supabase + OpenRouter).
- Navegador Chromium de Playwright: `npx playwright install chromium` (una vez).
- Usuarios de prueba en DEV con password conocido (ver **Fixtures** abajo).

## Correr

```bash
pnpm e2e                 # toda la suite (headless, con video)
pnpm e2e:ui              # modo interactivo (UI de Playwright)
pnpm e2e:report          # abre el último reporte HTML
npx playwright test -c e2e/playwright.config.ts e2e/00-smoke-roles.spec.ts   # un archivo
```

Videos: `e2e/videos/<test>/video.webm` · Reporte: `e2e/report/index.html` · Trazas: `trace.zip` por test.

## Fixtures (una vez, antes de correr)

Los usuarios de prueba y el andamiaje se preparan con:

```bash
# 1) Password común para los usuarios e2e-* (usa el service_role de .env.local)
node scripts/reset-test-users.mjs        # deja todos en Avi!Test2607

# 2) Centro de acopio de prueba + membresía logística del voluntario
./scripts/db.sh psql dev < supabase/fixtures_test.sql   # o psql directo
```

Usuarios (todos password `Avi!Test2607`):

| Rol | Email | Alcance |
|---|---|---|
| admin | `e2e-admin@avihelp.test` | todo |
| voluntario (logística) | `e2e-voluntario@avihelp.test` | miembro del "Centro de Acopio Central (TEST)" |
| médico | `e2e-medico@avihelp.test` | pacientes/panel |
| ONG | `e2e-ong@avihelp.test` | solo lectura + panel |
| público | (sin login) | rutas públicas |

## Qué cubre

- `00-smoke-roles.spec.ts` — cada rol entra y recorre SUS páginas; verifica que renderizan sin error JS.
- `flujo-acopio.spec.ts` — flujo operativo completo: recepción → inspección → inventario → despacho.
- `permisos.spec.ts` — matriz de permisos (quién ve / quién es rebotado).
- `publico.spec.ts` — vista pública sin datos sensibles.

## Limpiar datos de prueba

```bash
./scripts/clean.sh dev transaccional   # borra movimiento, conserva instituciones/usuarios
```
Ver `docs/RUNBOOK_ADMIN.md`.
