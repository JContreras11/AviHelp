-- Coordenadas aproximadas para los refugios de Caracas (los añadió otra migración sin gps).
-- Aproximadas por parque/parroquia; afinar si se consigue la ubicación exacta.
update hospitales h set gps_lat = v.lat, gps_lng = v.lng
from (values
  ('Parque del Este',       10.4965, -66.8410),  -- Pque. Gen. Francisco de Miranda, Leoncio Martínez
  ('Parque del Oeste',      10.5180, -66.9280),  -- Pque. Alí Primera (Jóvito Villalba), Sucre/Catia
  ('IPOSTEL de San Martín', 10.4920, -66.9210)   -- Av. San Martín, San Juan
) as v(nombre, lat, lng)
where h.nombre = v.nombre and h.tipo = 'refugio' and h.gps_lat is null;
