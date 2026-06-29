-- "Mis Cargas": cada subida (foto / voz / texto / lista) queda registrada y ligada
-- al usuario que la subió y a las entidades extraídas (personas / insumos).
-- Aditiva e idempotente. Aplicada SOLO a DEV (el histórico previo no tiene carga).

create table if not exists cargas (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid,                                   -- quién subió (auth.users / profiles.id)
  tipo        text,                                   -- DocumentoAnalizado.tipo
  foto        text,                                   -- path en Storage 'fotos' (nullable: voz/texto)
  contexto    text,                                   -- nota/transcripción libre
  hospital_id uuid references hospitales(id) on delete set null,
  resumen     text,
  confianza   real,
  modelo      text,
  raw         jsonb,                                  -- DocumentoAnalizado completo (preview guardado)
  created_at  timestamptz not null default now()
);
create index if not exists idx_cargas_user on cargas (user_id, created_at desc);

-- Liga cada entidad a la carga de la que salió (nullable: histórico previo no la tiene).
alter table personas add column if not exists carga_id uuid references cargas(id) on delete set null;
alter table insumos  add column if not exists carga_id uuid references cargas(id) on delete set null;
create index if not exists idx_personas_carga on personas (carga_id);
create index if not exists idx_insumos_carga  on insumos  (carga_id);
