-- AGENTE 3 — SOLICITUDES COMPARTIBLES
-- "Necesidad" = insumos (item + cantidad por hospital). Una SOLICITUD agrupa varias
-- necesidades en un paquete con LINK PÚBLICO para difundir (redes / chats de ONG).
-- Aditiva e idempotente. No toca entregas (Agente 1) ni cargas.categoria (Agente 2).

-- ─────────────────────────────────────────────────────────────
-- 1) SOLICITUDES: paquete compartible de necesidades.
-- ─────────────────────────────────────────────────────────────
create table if not exists solicitudes (
  id           uuid primary key default uuid_generate_v4(),
  slug         text not null unique,              -- identificador público url-safe (lo genera la app)
  titulo       text not null,
  descripcion  text,
  hospital_id  uuid references hospitales(id) on delete set null,  -- centro principal (contexto de entrega)
  estado       text not null default 'abierta'
               check (estado in ('abierta','en_progreso','cubierta','cerrada')),
  -- Procedencia: de dónde nació la solicitud.
  fuente       text not null default 'manual'
               check (fuente in ('manual','documento','texto','url','existentes')),
  origen_url   text,                              -- URL scrapeada (provenance)
  origen_hash  text,                              -- hash del contenido scrapeado (dedupe de re-scrapes)
  carga_id     uuid references cargas(id) on delete set null,      -- documento del que salió
  created_by   uuid,                              -- auth.users.id (quién la creó)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_solicitudes_hospital on solicitudes (hospital_id);
create index if not exists idx_solicitudes_creador  on solicitudes (created_by, created_at desc);
-- Dedupe de scraping: una sola solicitud por URL de origen.
create unique index if not exists uq_solicitud_origen_url on solicitudes (origen_url) where origen_url is not null;

drop trigger if exists trg_solicitudes_updated on solicitudes;
create trigger trg_solicitudes_updated before update on solicitudes
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) Cada NECESIDAD (insumo) puede pertenecer a una solicitud compartible.
-- ─────────────────────────────────────────────────────────────
alter table insumos add column if not exists solicitud_id uuid references solicitudes(id) on delete set null;
create index if not exists idx_insumos_solicitud on insumos (solicitud_id);

-- Permitir procedencia 'scraper' en insumos (scraping crea necesidades). Idempotente.
do $$ begin
  alter table insumos drop constraint if exists insumos_fuente_check;
  alter table insumos add constraint insumos_fuente_check
    check (fuente in ('manual','ia_vision','import','scraper'));
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3) Estado derivado de la SOLICITUD según el estado de sus necesidades.
--    abierta = nada en progreso · en_progreso = algo en camino/recibido ·
--    cubierta = todas las necesidades cubiertas/entregadas. 'cerrada' es manual (no se pisa).
-- ─────────────────────────────────────────────────────────────
create or replace function recomputar_solicitud(p_solicitud uuid)
returns void language plpgsql as $$
declare
  v_total    int;
  v_cubierta int;
  v_progreso int;
begin
  if p_solicitud is null then return; end if;
  select
    count(*) filter (where estado <> 'cancelado'),
    count(*) filter (where estado in ('cubierto','entregado')),
    count(*) filter (where estado in ('en_transito','cubierto','entregado'))
  into v_total, v_cubierta, v_progreso
  from insumos where solicitud_id = p_solicitud;

  update solicitudes set estado = case
      when v_total > 0 and v_cubierta >= v_total then 'cubierta'
      when v_progreso > 0                        then 'en_progreso'
      else 'abierta'
    end
  where id = p_solicitud and estado <> 'cerrada';
end; $$;

-- Cuando cambia una necesidad ligada a una solicitud, recalcula la solicitud.
-- (recomputar_necesidad ya corre por las donaciones; esto propaga al paquete.)
create or replace function trg_insumo_solicitud()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.solicitud_id is distinct from new.solicitud_id then
    perform recomputar_solicitud(old.solicitud_id);
  end if;
  perform recomputar_solicitud(coalesce(new.solicitud_id, old.solicitud_id));
  return coalesce(new, old);
end; $$;

drop trigger if exists on_insumo_solicitud on insumos;
create trigger on_insumo_solicitud after insert or update or delete on insumos
  for each row execute function trg_insumo_solicitud();
