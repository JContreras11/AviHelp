-- LANE CAL — Calendario general de ASIGNACIONES de voluntarios.
-- Tablero tipo Google Calendar: cada día muestra los voluntarios asignados.
--   estado 'disponible'/'tentativo' → AMARILLO   estado 'asignado' → VERDE
-- Aditiva e idempotente (IF NOT EXISTS). NO se aplica automáticamente.
create table if not exists asignaciones (
  id uuid primary key default uuid_generate_v4(),
  voluntario_id uuid references voluntarios(id) on delete cascade,
  fecha date not null,
  estado text not null default 'tentativo'
    check (estado in ('disponible', 'tentativo', 'asignado', 'cancelado')),
  org_id uuid,                 -- centro/organización dueña de la asignación (multi-tenant a futuro)
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_asignaciones_fecha on asignaciones (fecha);
create index if not exists idx_asignaciones_voluntario on asignaciones (voluntario_id, fecha);
create index if not exists idx_asignaciones_org on asignaciones (org_id, fecha);
drop trigger if exists trg_asignaciones_updated on asignaciones;
create trigger trg_asignaciones_updated before update on asignaciones
  for each row execute function set_updated_at();
