-- Instituciones = hospitales (con tipo: hospital/clínica) + centros de acopio.
-- Membresías M:M: un usuario puede gestionar varios hospitales/centros, y un
-- hospital/centro puede tener varios usuarios. admin sigue siendo global.

alter table hospitales add column if not exists tipo text not null default 'hospital'
  check (tipo in ('hospital', 'clinica'));

create table if not exists membresias (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  hospital_id uuid references hospitales(id) on delete cascade,
  centro_id   uuid references centros_acopio(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Cada membresía apunta a exactamente una institución (hospital XOR centro).
  constraint membresia_una_inst check (num_nonnulls(hospital_id, centro_id) = 1)
);

create unique index if not exists uq_membresia_hospital on membresias (user_id, hospital_id) where hospital_id is not null;
create unique index if not exists uq_membresia_centro   on membresias (user_id, centro_id)   where centro_id is not null;
create index if not exists idx_membresias_user on membresias (user_id);
