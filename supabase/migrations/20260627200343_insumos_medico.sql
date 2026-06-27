-- Insumos: modelo médico. Separar presentación (tipo) de cantidad, área del
-- hospital, e info clínica útil para decisiones rápidas + estado "cubierto".

alter table insumos
  add column if not exists presentacion    text,   -- frasco, tableta, vial, ampolla, polvo, otro
  add column if not exists area            text,   -- Trauma, Neonato, Cirugía, Pediatría, ...
  add column if not exists para_que_sirve  text,   -- indicación breve
  add column if not exists alternativas    text,   -- sustitutos si no se consigue
  add column if not exists cubierto_at     timestamptz,
  add column if not exists cubierto_por    text;

-- Ampliar el estado para incluir "cubierto" (recibido/verificado por el hospital).
do $$ begin
  alter table insumos drop constraint if exists insumos_estado_check;
  alter table insumos add constraint insumos_estado_check
    check (estado in ('solicitado','en_transito','entregado','cubierto','cancelado'));
end $$;

-- Filtrar rápido las listas activas por área.
create index if not exists idx_insumos_area on insumos (hospital_id, area);
