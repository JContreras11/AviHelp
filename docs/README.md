# Documentación AviHelp

Entrada a la documentación de la plataforma. Para el equipo de la fundación y para desarrollo.

## Para quienes van a USAR AviHelp
- **[Manual completo (por URL)](MANUAL.md)** — cada pantalla del sistema: qué es, quién entra, cómo se usa. El manual de referencia.
- **[Guía de usuarios](GUIA_USUARIOS.md)** — versión corta: qué hace cada rol y cada módulo.
- **[Checklist de aprobación](CHECKLIST_APROBACION.md)** — guion paso a paso para probar y aprobar cada funcionalidad, rol por rol.

## Para ADMINISTRAR el sistema
- **[Runbook de administración](RUNBOOK_ADMIN.md)** — limpiar datos (producción), migraciones, deploy dev→prod, usuarios de prueba, privacidad pendiente, follow-ups.

## Para DESARROLLO / QA
- **[Suite de pruebas e2e](../e2e/README.md)** — Playwright con video por rol y flujo. `pnpm e2e`.

## Módulos entregados (Wave 1–3 + camiones)
Recepción/Check-in · Inspección/Triage · Inventario de stock · Despacho + Receptores ·
Camiones + Camioneros · Calendario (voluntarios + camioneros) · Vencimientos ·
Gastos + Cuentas · Categorías + Donantes · Vista pública "estado por zona".
Todo **aditivo**: no se tocó lo existente (chat Avi, donaciones, solicitudes, desaparecidos, dashboard).

## Estado
- Construido, integrado, `tsc` limpio.
- Migraciones aplicadas a **DEV** (no a PROD).
- Suite e2e verde (smoke por rol + permisos + flujo acopio completo) con **video**.
- Pendientes y decisiones: ver `RUNBOOK_ADMIN.md` (privacidad de rutas heredadas, FK de camiones, costos de producción).
