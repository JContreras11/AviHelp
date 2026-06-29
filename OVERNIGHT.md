# Overnight — orquestación de mejoras (rama `auto/overnight`)

Claude orquesta mejoras + pruebas mientras Jesús duerme. Cada cambio = 1 commit
(checkpoint reversible). **No toca `main` ni prod.** Jesús revisa y mergea en la mañana.

## Reglas duras (no romper)
- Trabajar SOLO en `auto/overnight`. Nunca push a `main`/prod, nunca deploy prod, nunca migración en Supabase PROD.
- Gate antes de cada commit: `pnpm build` OK + (si toca UI/runtime) smoke local OK. Si falla → `git checkout -- <archivos>` y registrar el intento fallido aquí.
- 1 commit por mejora atómica. Mensaje claro + Co-Authored-By. Tag `ckpt-N` cada 5 commits.
- **Prohibido** (trampas de freeze ya pagadas, ver memoria estado-mvp): reintroducir `@base-ui/react`, `@tanstack/react-table`, o service worker. No `router.refresh()` para datos (usar invalidateQueries).
- Mobile-first siempre. No añadir dependencias por algo que resuelven pocas líneas.
- Si un cambio es dudoso/grande → NO hacerlo autónomo; anotarlo en "Para revisar con Jesús".

## Gate
```
pnpm build && pnpm lint    # types/imports/lint — atrapa lo que rompe la app
```
Smoke de runtime: corre contra deploys reales (watcher prod). La rama no se
despliega, así que el gate local es build+lint + las reglas duras (que evitan
los freezes ya conocidos). Cambio dudoso de runtime → "Para revisar con Jesús".

## Procedimiento por ciclo
1. `git fetch origin main` — ver qué pushearon los otros 3 agentes (no mergear; solo contexto). Si hubo deploy prod nuevo, correr smoke prod (watcher).
2. Tomar la siguiente tarea del Backlog (orden de prioridad).
3. Implementar (subagente si es grande). Respetar reglas duras.
4. Gate. Pasa → commit (checkpoint) + log abajo. Falla → revertir + log.
5. Repetir hasta agotar tokens. Al reset de Claude, retomar desde el Backlog.

## Backlog (prioridad ↓)
Seguro/alto valor primero; lo invasivo al final y solo si el gate lo cubre.

- [ ] **Tests CRUD×rol** (instrumento en `e2e/`, no app): cubrir cada módulo (personas, insumos, hospitales, refugios/centros, ofertas, donaciones, notificaciones, usuarios) × CRUD × rol (admin/medico/voluntario/ong/publico) contra DEV, con fixtures que auto-siembran y limpian. Cada bug que cacen → fix gated.
- [ ] **Bugs/hardening**: errores de consola en todas las páginas, validaciones de formularios, estados de error que no pierdan datos.
- [ ] **UX/polish mobile-first**: empty states, loading states, a11y (aria-label en botones de icono, foco en diálogos), copy claro orientado a la emergencia.
- [ ] **Gaps MVP/spec**: completar ofertas→match→notificación; donaciones e2e; RLS en DB (SOLO dev, nunca prod auto).
- [ ] **Microtareas curiosas**: detalles que sumen al propósito (hospitales/refugios gestionan donaciones tras catástrofe).

## Bitácora de checkpoints
| commit | qué | gate |
|--------|-----|------|
| ee85247 | fix React #418 (saludo Avi determinista en SSR) | build ✅ |

## Para revisar con Jesús (no autónomo)
- **Política /dashboard**: el Panel (KPIs + drill-down con edición de estado) renderiza para TODOS los roles (medico/voluntario/ong), no solo admin. Auditoría claude-4: el gate de /admin/* SÍ funciona (no-admin redirige a /), pero /dashboard no está restringido. Decide si voluntario/ong deben verlo; si no, añadir gate de rol.

## Hallazgos de pruebas
- #418 hydration en chat-home (entrada pública) — ARREGLADO (ee85247). Causa: `Math.random` en render (`chat-store.tsx`).
- Entorno worktree: `node_modules` venía symlinkeado a /Users/jesusc/Code/AviHelp -> Turbopack falla ("Symlink invalid, points out of fs root"). Se materializó con `pnpm install --offline --frozen-lockfile`. Faltaba `.env.local` (copiado del repo principal, gitignored). Tras eso `pnpm build` queda VERDE.

## F2 progreso — Donación inteligente con Avi (COMPLETA, 5 slices)
Commits: 9f3bea3 (s1), faa8ab9 (s2), 9b7883d (s3), 2a04ff0 (s4), 43f3bd7 (s5). Build verde en cada uno.
- s1: /ofrecer logueado no pide nombre/teléfono; `crearOferta` autocompleta del perfil. (page.tsx ahora server wrapper + OfrecerForm.tsx client.)
- s2: toda oferta ligada a centro/refugio (`ofertas.refugio_id` -> hospitales tipo refugio). Selector obligatorio + geolocalización ordena/preselecciona el más cercano. Notificación encolada al centro vía helper reutilizable `notificarInstitucion` (fallback a admins).
- s3: `/mis-donaciones` (login) lista ofertas propias + cancelar (estado local, sin router.refresh). Link en navbar.
- s4: `extraerDonacion(FormData)` reusa vision.ts (foto/audio/texto) -> productos+cantidades; `crearOfertasMixtas` crea una oferta por producto (donación MIXTA) con 1 notificación-resumen.
- s5: tras crear, `sugerenciasDeOfertas` lee el match enriquecido (hospital + ÁREA del insumo) y Avi lo muestra en la confirmación.

DECISIONES / PENDIENTES:
- Modelo: se reusó `ofertas` (no `donaciones`). `donaciones` queda atado a una necesidad puntual (insumo_id NOT NULL); las ofertas son supply general con match human-in-the-loop. "Mis donaciones" muestra ofertas; las donaciones de `donarNecesidad` NO se listan ahí aún (a futuro unificar la vista).
- Migración `20260629120000_oferta_centro_entrega.sql`: SOLO additiva (columna nullable). Aplicada a DEV vía psql directo (idempotente, sin tocar historial por concurrencia de agentes). NO aplicada a prod.
- Audio: input file `accept="audio/*" capture` (no MediaRecorder en página) para mantenerlo liviano.

## FEATURES MUST-HAVE (Jesús, prioridad máxima — implementar en este worktree)
Orden: F2 (core) → F3 → F1. Cada una: rama propia o commits chicos en auto/overnight, gate `pnpm build`, checkpoint, sin romper smoke.

### F2 — Donación inteligente con Avi (CORE, lo más importante)
- Crear donación por **audio / foto / texto** reusando IA existente (`src/lib/ai/vision.ts`: analizarDocumento/analizarTexto/transcribirAudio) para extraer **productos + cantidades**.
- Soporta donación **MIXTA**: varios productos de distinta índole (comida vs insumos médicos), cantidad separada por producto.
- Avi **chatea mientras se crea**: recomienda dónde llevar, cómo organizar, y **MATCH** (lo más importante): si un producto coincide con una solicitud, recomienda el **centro/hospital** que lo necesita + el **ÁREA** (pediatría/traumatología/…) derivada de las solicitudes existentes. Ver `src/lib/ai/match.ts`, `actions/ofertas.ts`, `actions/donaciones.ts`.
- **Zona** desde geolocalización del navegador (ya se pide para Avi). Mostrar refugios/centros de acopio cercanos + necesidades de hospitales.
- **Usuario logueado: NO pedir nombre/teléfono** (ya se sabe quién es) → crear y relacionar directo. Fix `/ofrecer` (`src/app/ofrecer/page.tsx`): ocultar identidad si autenticado.
- **CRUD "mis donaciones"** del usuario.
- Cada donación **SIEMPRE ligada a centro de acopio o refugio** → genera **notificación encolada** a usuarios autorizados/admin (`actions/notificaciones`).

### F3 — Dashboard drill-down a personas del hospital
- En tabla "Hospitales — prioridad de atención" (`src/components/dashboard/Charts.tsx`), click en fila/críticos → ver **las personas de ese hospital**, con búsqueda y **edición de estado** (alta/fallecido/etc.) para administrar pacientes rápido.
- Reusar `listarPersonas` filtrado por hospital_id + `PersonaDialog`. Modal o lista filtrada. (Coordinar: claude-6 hace dashboard hardening EXCEPTO esta tabla.)

### F1 — "Mis Cargas" (galería de lo que subí)
- Ruta `/mis-cargas` (login). **Grid** de imágenes subidas por el usuario, **zoom al tocar** (`Img` + react-medium-image-zoom ya instalado).
- Al lado: info extraída de esa carga (insumos → insumos+hospital+info; lista personas → personas **editables**, poder añadir).
- Data: ligar cada carga (storage `fotos`) con el usuario + entidades extraídas. Revisar `documentos`/`raw_extraccion`; quizá columna `user_id`/tabla `cargas`. Migración SOLO dev.
- ✅ HECHO (commits 6902c2a + 1a72b6e). Modelo: tabla `cargas(user_id, foto, tipo, raw, resumen, hospital_id, …)` + columna nullable `carga_id` en `personas` e `insumos`. `guardar()` (procesar.ts) crea la carga del uploader y liga insumos/personas creados; a personas existentes huérfanas (carga_id null) las reclama vía camposFaltantes. Migración `20260629140000_cargas.sql` aplicada a DEV vía psql (aditiva e idempotente), NO a prod. UI `/mis-cargas` (login, ya cubierto por middleware): grid mobile-first + zoom (Img) + PersonaDialog/InsumoDialog editables + añadir persona (`crearPersona`). Link en Nav.
  - Limitación: el histórico previo a la migración NO tiene `carga_id`, así que la galería solo muestra cargas nuevas. Si una persona ya pertenecía a otra carga no se re-asigna (se conserva la primera). Hoy `limit(100)` cargas (sin paginación).

## Ramas de agentes en origin (para review/merge de Jesús AM)
- `origin/claude-4/refugios` (16ff2d2) — refugios hardening (try-finally, validación, a11y, mapa robusto data vacía). Build verde self-gated. → next: desaparecidos.
- `origin/claude-2/personas-hardening` (f99f801..6edb596, 8 commits) — personas + InsumoDialog + ui/dialog a11y. Build verde cada commit. → next: Hospital/CentroDialog.
- `claude-jesus-6/dashboard` (ba1cb3f) — dashboard empty-states + a11y + loading skeleton. Pedido push a origin. → next: admin panels.
- Integración: cada rama separada; Jesús mergea AM (no merges cruzados nocturnos). Verificar build+smoke por rama antes de mergear.

## RESUMEN AM (hitos)
- **F2/F3/F1 implementadas** en auto/overnight (gated, build verde): F2 donación inteligente, F3 dashboard drill-down, F1 /mis-cargas.
- **F2/F3 VERIFICADAS en navegador** (claude-4, login real): PASS, 0 bugs. /ofrecer logueado sin identidad + exige centro + notifica + /mis-donaciones + IA extrae productos; drill-down edita estado y persiste en DB.
- **base-ui ELIMINADO por completo** (rama claude-2/personas-hardening, 71bc7c8, -736 líneas, quitado de package.json) → riesgo de freeze fuera del todo.
- **Bug realtime** ('postgres_changes after subscribe') arreglado (31a013e) y VERIFICADO PASS (claude-6).
- Ramas de agentes en origin para merge: claude-4/refugios, claude-2/personas-hardening, claude-jesus-6/{dashboard,admin,landing}.
