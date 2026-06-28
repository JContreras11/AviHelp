-- Refugios de Caracas (reusa hospitales con tipo='refugio'). Idempotente por nombre.
insert into hospitales (nombre, ubicacion, tipo)
select v.nombre, v.ubicacion, 'refugio'
from (values
  ('Parque del Este', 'Caracas · Parroquia Leoncio Martínez'),
  ('Parque del Oeste', 'Caracas · Parroquia Sucre'),
  ('IPOSTEL de San Martín', 'Av. San Martín · Caracas · Parroquia San Juan')
) as v(nombre, ubicacion)
where not exists (select 1 from hospitales h where h.nombre = v.nombre);
