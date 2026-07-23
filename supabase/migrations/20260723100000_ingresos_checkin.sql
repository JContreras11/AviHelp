create table if not exists ingresos (
  id uuid primary key default uuid_generate_v4(),
  donante_id uuid references donantes(id) on delete set null,
  centro_id uuid references centros_acopio(id) on delete set null,
  categorias text[] not null default '{}',
  detalle text,
  foto_path text, audio_path text, doc_path text,
  raw_extraccion jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_ingresos_creador on ingresos (created_by, created_at desc);
alter table inventario add column if not exists ingreso_id uuid references ingresos(id) on delete set null;
alter table inventario add column if not exists donante_id uuid references donantes(id) on delete set null;
create index if not exists idx_inventario_ingreso on inventario (ingreso_id);
