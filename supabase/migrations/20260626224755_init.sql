-- AviDesastres — Esquema completo Supabase (Fase 1)
-- Ejecutar en Supabase SQL Editor (o `supabase db push`).
-- Idempotente: usa IF NOT EXISTS / CREATE OR REPLACE donde aplica.

-- ─────────────────────────────────────────────────────────────
-- Extensiones
-- ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists vector;      -- pgvector: búsqueda semántica / RAG

-- ─────────────────────────────────────────────────────────────
-- Trigger genérico updated_at
-- ─────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ─────────────────────────────────────────────────────────────
-- 1) PERSONAS (damnificados / desaparecidos / heridos)
-- ─────────────────────────────────────────────────────────────
create table if not exists personas (
  id              uuid primary key default uuid_generate_v4(),
  -- cedula es UNIQUE pero nullable: no todos tienen ID legible.
  cedula          text unique,
  nombre          text not null,
  edad            int  check (edad is null or edad between 0 and 130),
  sexo            text check (sexo in ('M','F','O','desconocido')),
  ubicacion       text,                       -- texto libre (barrio, zona, hospital)
  hospital_id     uuid references hospitales(id) on delete set null,
  origen          text check (origen in ('local','visitante','desconocido')) default 'desconocido',
  estado_salud    text not null default 'desconocido'
                  check (estado_salud in ('vivo','herido','desaparecido','detenido','fallecido','desconocido')),
  nivel_memoria   text check (nivel_memoria in ('normal','parcial','amnesia','desconocido')) default 'desconocido',
  descripcion_fisica text,
  fotos           text[] default '{}'         -- máx 3, paths en Supabase Storage
                  check (array_length(fotos,1) is null or array_length(fotos,1) <= 3),
  -- Metadatos EXIF de la foto fuente
  gps_lat         double precision,
  gps_lng         double precision,
  foto_fecha      timestamptz,
  -- Procedencia del dato y confianza de la IA (0..1)
  fuente          text not null default 'manual'
                  check (fuente in ('manual','ia_vision','scraper','import')),
  confianza       real check (confianza is null or confianza between 0 and 1),
  raw_extraccion  jsonb,                       -- payload crudo del LLM para auditoría
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- hospitales se crea después; referencia adelantada resuelta abajo.

create table if not exists hospitales (
  id              uuid primary key default uuid_generate_v4(),
  nombre          text not null,
  ubicacion       text,
  gps_lat         double precision,
  gps_lng         double precision,
  contacto        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Resolver FK adelantada de personas -> hospitales (por si personas se creó primero)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'personas_hospital_id_fkey') then
    alter table personas
      add constraint personas_hospital_id_fkey
      foreign key (hospital_id) references hospitales(id) on delete set null;
  end if;
end $$;

drop trigger if exists trg_personas_updated on personas;
create trigger trg_personas_updated before update on personas
  for each row execute function set_updated_at();
drop trigger if exists trg_hospitales_updated on hospitales;
create trigger trg_hospitales_updated before update on hospitales
  for each row execute function set_updated_at();

create index if not exists idx_personas_nombre on personas using gin (to_tsvector('spanish', nombre));
create index if not exists idx_personas_estado on personas (estado_salud);

-- Historial de cambios de estado (mantener trazabilidad: desaparecido -> hospital X)
create table if not exists persona_historial (
  id          uuid primary key default uuid_generate_v4(),
  persona_id  uuid not null references personas(id) on delete cascade,
  estado_salud text,
  ubicacion   text,
  hospital_id uuid references hospitales(id) on delete set null,
  nota        text,
  fuente      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_persona_historial_persona on persona_historial (persona_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- 2) INSUMOS y DONACIONES
-- ─────────────────────────────────────────────────────────────
create table if not exists insumos (
  id           uuid primary key default uuid_generate_v4(),
  hospital_id  uuid not null references hospitales(id) on delete cascade,
  nombre       text not null,                 -- "Guantes estériles", "Yelco pediátrico"
  cantidad     numeric,
  unidad       text,                          -- "cajas", "ml", "unidades"
  prioridad    text check (prioridad in ('baja','media','alta','critica')) default 'media',
  estado       text not null default 'solicitado'
               check (estado in ('solicitado','en_transito','entregado','cancelado')),
  donante      text,                          -- ONG / persona que cubre el insumo
  fuente       text not null default 'manual'
               check (fuente in ('manual','ia_vision','import')),
  confianza    real check (confianza is null or confianza between 0 and 1),
  raw_extraccion jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_insumos_updated on insumos;
create trigger trg_insumos_updated before update on insumos
  for each row execute function set_updated_at();
create index if not exists idx_insumos_hospital on insumos (hospital_id, estado);

-- Eventos de tracking del insumo (solicitado -> tránsito -> entregado)
create table if not exists insumo_eventos (
  id         uuid primary key default uuid_generate_v4(),
  insumo_id  uuid not null references insumos(id) on delete cascade,
  estado     text not null,
  actor      text,                            -- quién hizo el cambio
  nota       text,
  created_at timestamptz not null default now()
);

-- Donaciones monetarias (pasarela de pago futura: solo registro por ahora)
create table if not exists donaciones_monetarias (
  id          uuid primary key default uuid_generate_v4(),
  hospital_id uuid references hospitales(id) on delete set null,
  monto       numeric not null check (monto > 0),
  moneda      text not null default 'USD',
  donante     text,
  estado      text not null default 'registrada'
              check (estado in ('registrada','confirmada','fallida')),
  referencia  text,                           -- id de transacción externo (futuro)
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 3) RAG / Búsqueda semántica (pgvector)
-- Una sola tabla de documentos para todo lo vectorizable.
-- dim = 1536 (OpenAI text-embedding-3-small). Cambiar si usas otro modelo.
-- ─────────────────────────────────────────────────────────────
create table if not exists documentos (
  id           uuid primary key default uuid_generate_v4(),
  source_table text not null,                 -- 'personas' | 'insumos' | 'hospitales'
  source_id    uuid not null,
  contenido    text not null,                 -- texto que se embebió
  metadata     jsonb default '{}',
  embedding    vector(1536),
  created_at   timestamptz not null default now(),
  unique (source_table, source_id)
);
-- IVFFlat para similitud coseno. Crear DESPUÉS de tener datos para mejor recall;
-- con pocos registros un seq scan basta. lists=100 razonable para ~10k-100k filas.
create index if not exists idx_documentos_embedding
  on documentos using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Función de match para el chatbot RAG
create or replace function match_documentos(
  query_embedding vector(1536),
  match_count int default 5,
  filter_source text default null,
  similarity_threshold real default 0.0
)
returns table (
  id uuid, source_table text, source_id uuid,
  contenido text, metadata jsonb, similarity real
)
language sql stable as $$
  select d.id, d.source_table, d.source_id, d.contenido, d.metadata,
         1 - (d.embedding <=> query_embedding) as similarity
  from documentos d
  where d.embedding is not null
    and (filter_source is null or d.source_table = filter_source)
    and 1 - (d.embedding <=> query_embedding) >= similarity_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS: deshabilitado para MVP (acceso vía service_role en server actions).
-- TODO Fase 5+: habilitar RLS y políticas por rol (voluntario / ONG / admin).
-- ─────────────────────────────────────────────────────────────
