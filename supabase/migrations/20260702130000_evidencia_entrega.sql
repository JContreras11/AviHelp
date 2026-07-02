-- Metadata de evidencia de la recepción (anti-robo / trazabilidad): lote, seriales, factura, etc.
-- Un solo jsonb flexible en vez de N columnas para campos opcionales que pueden crecer.
alter table entregas add column if not exists evidencia jsonb;
comment on column entregas.evidencia is 'Evidencia opcional de la recepción: {lote, seriales, factura_url, ...}';
