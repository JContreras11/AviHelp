# Runbook de administración — AviHelp

Guía operativa para mantener AviHelp: limpiar datos, desplegar, y preparar producción.

---

## Entornos

| Entorno | Supabase ref | Uso |
|---|---|---|
| **DEV** | `vcbitzupradnikgxrqjo` | Desarrollo y pruebas. `.env.local` apunta acá. |
| **PROD** | `lowapicvmzywihkdjazd` | Producción. Solo schema; se carga data real al ir a vivo. |

Credenciales en `.env.local` (gitignored): Supabase URL + publishable + secret key,
`SUPABASE_DB_PASSWORD`, y OpenRouter (IA). **Nunca** commitear este archivo.

---

## Limpiar datos  (`scripts/clean.sh`)

Para dejar el sistema listo antes de cargar data real, o resetear pruebas.

```bash
# Borra SOLO el movimiento operativo; CONSERVA instituciones, categorías, usuarios y membresías.
./scripts/clean.sh dev transaccional

# Borra TODO (además instituciones y membresías); conserva auth.users y re-siembra categorías.
./scripts/clean.sh dev total

# En producción (pide confirmación escrita "LIMPIAR PROD"):
./scripts/clean.sh prod transaccional
```

**Qué borra `transaccional`:** personas, insumos, ofertas, donaciones, entregas, inventario, ingresos,
donantes, receptores, gastos, solicitudes, notificaciones, cargas, documentos, audit_log, camiones,
camioneros, agenda, monetarias.
**Qué conserva:** hospitales, centros_acopio, categorías, cuentas, profiles, auth.users, membresías, relaciones.

> **Preparación de producción**: la secuencia recomendada para ir a vivo es
> (1) cargar instituciones y usuarios reales, (2) `clean.sh prod transaccional` para dejar el
> movimiento en cero, (3) empezar a operar (check-in, etc.).

Los archivos SQL están en `supabase/clean_transaccional.sql` y `supabase/clean_total.sql`
(idempotentes, solo truncan tablas que existan).

---

## Migraciones y deploy  (`scripts/db.sh`)

```bash
./scripts/db.sh new <nombre>   # crea una migración vacía
./scripts/db.sh push dev       # aplica migraciones + seed a DEV  (⚠ seed trunca — ver abajo)
./scripts/db.sh push prod      # aplica migraciones a PROD (sin seed)
./scripts/db.sh psql dev|prod  # consola psql
```

⚠️ **`push dev` corre el seed** (`supabase/seed.sql`), que hace *truncate-first* y **borra los datos de
prueba**. Si solo querés aplicar una migración nueva sin perder datos, aplicala directo:

```bash
set -a; source .env.local; set +a
psql "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.vcbitzupradnikgxrqjo.supabase.co:5432/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/migrations/<archivo>.sql
```

Las migraciones son **aditivas e idempotentes** (`if not exists` / `do $$`), con timestamps únicos por autor.

### Migraciones nuevas de esta entrega (Wave 1–3)
```
20260723090000_categorias_donantes.sql   categorías + donantes
20260723091000_inventario.sql            inventario de stock
20260723092000_cuentas_gastos.sql        cuentas + gastos
20260723095000_receptores_despacho.sql   receptores + cols de entregas
20260723100000_ingresos_checkin.sql      ingresos (check-in) + cols de inventario
20260723101000_inspeccion.sql            cols de inspección en inventario
20260723110000_camiones_calendario.sql   camiones + camioneros + agenda
```
Todas aplicadas a **DEV**. **NO** aplicadas a PROD (hacerlo al ir a vivo, con `push prod` o psql directo).

---

## Usuarios de prueba

```bash
node scripts/reset-test-users.mjs      # password Avi!Test2607 para los e2e-*
psql ... -f supabase/fixtures_test.sql # centro de prueba + membresía logística del voluntario
```

---

## Pruebas automáticas con video

```bash
pnpm e2e            # corre la suite, graba video por flujo (e2e/videos/)
pnpm e2e:report     # abre el reporte HTML
```
Ver `e2e/README.md` y `docs/CHECKLIST_APROBACION.md`.

---

## ⚠️ Privacidad pendiente (decisión de Jesús)

La reunión definió que **los pedidos por hospital no deben ser públicos** (solo acopio/aliados).
La auditoría encontró 2 rutas heredadas que hoy **sí** exponen a usuarios anónimos el detalle de
necesidades por hospital + **nombre y teléfono del responsable**:

1. `/compartir/hospital/[id]` — pensada como link compartible (QR/redes). Expone necesidades + contacto.
2. `/refugios` — lista pública que incluye `responsable_recepcion_nombre` y `_contacto` + necesidades por institución.

No se modificaron (parecen intencionales). **Decidir**: (a) dejarlas como opt-in de difusión, o
(b) mover el detalle/contacto detrás de login. Si se elige (b), gatear esos campos en
`src/app/refugios/page.tsx` y `src/app/compartir/hospital/[id]/`.

## Alcance de logística vs. hospital (decisión de diseño)
Por el modelo de **fuente única**, un miembro de **hospital** obtiene alcance de centro
(`getScope().centroIds` no vacío). Consecuencia: **médico/ONG con membresía de hospital
pueden entrar a los módulos de logística** (`/checkin`, `/inventario`, etc.).
Si logística debe excluir al personal solo-hospital, endurecer el gate para exigir membresía
de un centro de acopio real (no un hospital). Hoy los tests validan el invariante limpio:
**las páginas `/admin/*` son estrictamente solo-admin**.

## Follow-ups técnicos
- **Camiones FK**: `camiones/camioneros/agenda.centro_id` referencian `centros_acopio`. Por el modelo de
  "fuente única", los centros reales son `hospitales` tipo='centro'. Evaluar re-apuntar esas FK a `hospitales`.
- Evidencia de pre-despacho: se guarda en `entregas.evidencia` (jsonb) + `entregas.imagen_predespacho`.
- Ingreso monetario ↔ gasto: hoy se vincula por el campo `referencia`; una FK dedicada es mejora futura.
- Costos de producción (hosting + instancia + IA): documento pendiente (acuerdo de la reunión).
