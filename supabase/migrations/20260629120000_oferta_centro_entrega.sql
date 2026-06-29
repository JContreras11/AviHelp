-- F2 slice 2: toda oferta/donación se entrega en un centro de acopio o refugio.
-- Los centros/refugios viven en la tabla hospitales (tipo='refugio'). Guardamos el
-- punto de entrega elegido (o inferido por cercanía) para coordinar y notificar.
alter table ofertas
  add column if not exists refugio_id uuid references hospitales(id) on delete set null;
create index if not exists idx_ofertas_refugio on ofertas (refugio_id);
