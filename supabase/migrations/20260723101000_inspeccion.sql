-- LANE E — Inspección / control de calidad del inventario recibido.
-- Tras el check-in un item queda en estatus 'por_revisar'; un inspector corrige cantidades
-- y presentaciones, deja su firma (quién inspeccionó) y fija el estatus final
-- (disponible / rechazado / danado). Aditivo e idempotente: solo agrega la firma de inspección.
alter table inventario
  add column if not exists inspeccionado_por_nombre text,
  add column if not exists inspeccionado_por_rol text,
  add column if not exists inspeccionado_at timestamptz;
