-- FASE 5: Ofertas (supply) + cola de emparejamiento sugerido por IA (human-in-the-loop).
-- "Necesidad" = insumos (ya existe). "Oferta" = lo que alguien tiene para dar.

create table if not exists ofertas (
  id                  uuid primary key default uuid_generate_v4(),
  usuario_oferente_id uuid references auth.users(id) on delete set null, -- null si oferta pública anónima
  tipo                text not null check (tipo in ('insumo_fisico', 'personal_humano')),
  descripcion         text not null,
  cantidad            integer,                                  -- ej. 50 férulas; null para personal
  ubicacion_actual    text,
  contacto_nombre     text,
  contacto_telefono   text,
  estatus             text not null default 'disponible'
                      check (estatus in ('disponible', 'reservado', 'entregado', 'cancelado')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_ofertas_estatus on ofertas (estatus, created_at desc);

drop trigger if exists trg_ofertas_updated on ofertas;
create trigger trg_ofertas_updated before update on ofertas
  for each row execute function set_updated_at();

-- Sugerencias de la IA: borradores que un admin aprueba/rechaza (no se asignan solas).
create table if not exists match_sugerencias (
  id               uuid primary key default uuid_generate_v4(),
  oferta_id        uuid not null references ofertas(id) on delete cascade,
  hospital_id      uuid references hospitales(id) on delete cascade,
  insumo_id        uuid references insumos(id) on delete set null,  -- necesidad concreta; null si es personal
  cantidad_sugerida integer,
  razon            text,                                            -- explicación de la IA
  estatus          text not null default 'sugerido'
                   check (estatus in ('sugerido', 'aprobado', 'rechazado')),
  aprobado_por     uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_match_estatus on match_sugerencias (estatus, created_at desc);
create index if not exists idx_match_hospital on match_sugerencias (hospital_id);

drop trigger if exists trg_match_updated on match_sugerencias;
create trigger trg_match_updated before update on match_sugerencias
  for each row execute function set_updated_at();
