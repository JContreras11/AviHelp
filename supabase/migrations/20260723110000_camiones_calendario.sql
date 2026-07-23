create table if not exists camiones (
  id uuid primary key default uuid_generate_v4(),
  placa text, modelo text,
  capacidad numeric,                    -- capacidad total
  capacidad_unidad text default 'kg',   -- kg, m3, unidades...
  centro_id uuid references centros_acopio(id) on delete set null,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists camioneros (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,  -- opcional: si es usuario
  nombre text not null, telefono text, licencia text,
  centro_id uuid references centros_acopio(id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Agenda REUSABLE: disponibilidad de camioneros + turnos de voluntarios
create table if not exists agenda (
  id uuid primary key default uuid_generate_v4(),
  tipo text not null check (tipo in ('camionero','voluntario')),
  camionero_id uuid references camioneros(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,   -- voluntario con cuenta
  persona_nombre text,                                         -- voluntario sin cuenta
  centro_id uuid references centros_acopio(id) on delete set null,
  hospital_id uuid references hospitales(id) on delete set null,
  inicio timestamptz not null,
  fin timestamptz,
  estado text not null default 'disponible' check (estado in ('disponible','ocupado','confirmado','cancelado')),
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists idx_agenda_rango on agenda (inicio, fin);
create index if not exists idx_agenda_centro on agenda (centro_id, inicio);
create index if not exists idx_agenda_camionero on agenda (camionero_id, inicio);
alter table entregas add column if not exists camion_id uuid references camiones(id) on delete set null;
alter table entregas add column if not exists camionero_id uuid references camioneros(id) on delete set null;
drop trigger if exists trg_camiones_updated on camiones;
create trigger trg_camiones_updated before update on camiones for each row execute function set_updated_at();
drop trigger if exists trg_camioneros_updated on camioneros;
create trigger trg_camioneros_updated before update on camioneros for each row execute function set_updated_at();
