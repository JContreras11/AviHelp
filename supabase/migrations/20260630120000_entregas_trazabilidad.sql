-- AGENTE 1 (Donaciones) — TRAZABILIDAD de la entrega. Cierra el ciclo:
--   donación (oferta) ↔ solicitud (insumo) → entrega → recepción CONFIRMADA por
--   personal del hospital habilitado, con foto, hora, lugar, quién entrega y quién recibe.
--
-- NO altera match_sugerencias ni recomputar_necesidad (los posee el Agente 3). Cuando
-- una recepción se confirma y está ligada a una necesidad concreta (insumo_id), la acción
-- `confirmarRecepcion` inserta un registro en `donaciones` (estado='recibido') reutilizando
-- el trigger existente `on_donacion_change` → recomputar_necesidad. Así el estado de la
-- necesidad se actualiza sin tocar el trigger del Agente 3.

-- Código corto + público para CADA donación (oferta): id estable y compartible
-- (/donaciones/<codigo>). Lo rellena la app al crear; este backfill cubre las previas.
alter table ofertas add column if not exists codigo text;
update ofertas set codigo = upper(substr(replace(id::text, '-', ''), 1, 6)) where codigo is null;
create unique index if not exists idx_ofertas_codigo on ofertas (codigo);

-- Modelo de datos como lo necesita el personal médico: separar presentación, unidad
-- de dosis, área del hospital y vencimiento (intake inteligente del flujo /donaciones/crear).
alter table ofertas
  add column if not exists presentacion text,   -- frasco, tableta, vial, ampolla, caja…
  add column if not exists unidad       text,   -- dosis/medida: mg, ml, L, par…
  add column if not exists area         text,   -- Trauma, Neonato, Cirugía…
  add column if not exists vencimiento  date,   -- caducidad (insumos/medicamentos perecederos)
  add column if not exists insumo_id    uuid references insumos(id) on delete set null; -- necesidad relacionada (opcional)

create table if not exists entregas (
  id              uuid primary key default uuid_generate_v4(),
  codigo          text not null unique,                               -- código corto rastreable + link público
  oferta_id       uuid references ofertas(id) on delete cascade,      -- la donación (flujo /donaciones/crear)
  insumo_id       uuid references insumos(id) on delete set null,     -- la SOLICITUD/necesidad concreta (si se relacionó)
  hospital_id     uuid references hospitales(id) on delete set null,  -- destino (centro de salud que recibe)
  refugio_id      uuid references hospitales(id) on delete set null,  -- punto de acopio/entrega elegido
  donacion_id     uuid references donaciones(id) on delete set null,  -- ledger creado al confirmar (para recomputar la necesidad)
  area            text,                                               -- área médica solicitante (Trauma, Neonato, …)
  cantidad        integer,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'en_transito', 'recibido', 'rechazado', 'cancelado')),

  -- Quién ENTREGA (donante / portador físico)
  entrega_nombre    text,
  entrega_telefono  text,
  entrega_user      uuid references auth.users(id) on delete set null,

  -- Quién RECIBE (personal del hospital habilitado que marca RECIBIDO)
  recibido_por_user   uuid references auth.users(id) on delete set null,
  recibido_por_nombre text,
  recibido_at         timestamptz,

  -- Evidencia de la recepción
  foto_path       text,                 -- foto de la entrega/recepción (bucket 'fotos')
  lugar           text,                 -- lugar de entrega (texto libre)
  gps_lat         double precision,
  gps_lng         double precision,
  nota            text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists idx_entregas_codigo on entregas (codigo);
create index if not exists idx_entregas_hospital on entregas (hospital_id, estado);
create index if not exists idx_entregas_oferta on entregas (oferta_id);
create index if not exists idx_entregas_insumo on entregas (insumo_id);

drop trigger if exists trg_entregas_updated on entregas;
create trigger trg_entregas_updated before update on entregas
  for each row execute function set_updated_at();
