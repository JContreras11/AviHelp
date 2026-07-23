-- LANE V — Registro de VOLUNTARIOS (personal de salud) + enganche con el CRONOGRAMA.
-- Replica el Google Form "PERSONAL DE SALUD VOLUNTARIO" (Fundación Agua Verde) y
-- engancha la tabla `agenda` (LANE T) al perfil del voluntario + especialidad + turno.
-- Aditiva e idempotente. NO aplicada automáticamente.
create table if not exists voluntarios (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  cedula text,
  edad int,
  telefono text,
  estado_residencia text,
  contacto_emergencia text,
  area_conocimiento text,
  especialidad text,
  mpps text,
  constancia_path text,
  disponibilidad text,
  frecuencia text,
  duracion_turno text,
  transporte_propio boolean,
  postulacion text,
  grupo_sanguineo text,
  alergias text,
  user_id uuid references auth.users(id) on delete set null,
  centro_id uuid references centros_acopio(id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('pendiente','activo','inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_voluntarios_estado on voluntarios (estado, created_at desc);
drop trigger if exists trg_voluntarios_updated on voluntarios;
create trigger trg_voluntarios_updated before update on voluntarios for each row execute function set_updated_at();
-- Engancha la agenda (cronograma) al perfil + especialidad + turno.
alter table agenda add column if not exists voluntario_id uuid references voluntarios(id) on delete set null;
alter table agenda add column if not exists especialidad text;
alter table agenda add column if not exists turno text;   -- AM, PM, 12, 24, 48
