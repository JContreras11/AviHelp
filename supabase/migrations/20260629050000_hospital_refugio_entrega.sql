-- A qué refugios cercanos se entrega la donación de cada hospital.
-- Match por CIUDAD (heurística sobre ubicacion: Caracas vs La Guaira), ya que los
-- hospitales no tienen coords pero sí la ciudad en el texto. Persistido para mostrarlo
-- en todas partes (donar, refugios, chat de Avi). Re-poblable.
create table if not exists hospital_refugio (
  hospital_id uuid not null references hospitales(id) on delete cascade,
  refugio_id  uuid not null references hospitales(id) on delete cascade,
  primary key (hospital_id, refugio_id)
);
create index if not exists idx_hr_hospital on hospital_refugio (hospital_id);

-- Empareja cada hospital/clínica con los refugios de su misma ciudad.
insert into hospital_refugio (hospital_id, refugio_id)
select h.id, r.id
from hospitales h
join hospitales r on r.tipo = 'refugio' and r.id <> h.id
where h.tipo in ('hospital', 'clinica')
  and (h.ubicacion ilike '%caracas%') = (r.ubicacion ilike '%caracas%')
on conflict do nothing;
