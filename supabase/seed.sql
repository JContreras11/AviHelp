-- Seed SOLO para ambiente DEV (pruebas de fidelidad). No correr en PROD.
-- Reset-first: reproducible al re-correr. cascade limpia historial/eventos.
truncate personas, hospitales, insumos, insumo_eventos,
         donaciones_monetarias, persona_historial, documentos
  restart identity cascade;

-- Hospitales
insert into hospitales (id, nombre, ubicacion, gps_lat, gps_lng, contacto) values
  ('11111111-1111-1111-1111-111111111111','Hospital Central Caracas','Av. Urdaneta, Caracas', 10.5061, -66.9146, '+58-212-5550101'),
  ('22222222-2222-2222-2222-222222222222','Hospital de Petare','Petare, Miranda', 10.4806, -66.8086, '+58-212-5550202')
on conflict (id) do nothing;

-- Personas (varios estados, fuentes, confianza)
insert into personas (id, cedula, nombre, edad, sexo, ubicacion, hospital_id, origen, estado_salud, nivel_memoria, descripcion_fisica, fuente, confianza, gps_lat, gps_lng) values
  ('aaaaaaaa-0000-0000-0000-000000000001','V-12345678','Juan Pérez',45,'M','Petare','22222222-2222-2222-2222-222222222222','local','herido','normal','1.75m, cicatriz ceja izquierda','ia_vision',0.93, 10.4806,-66.8086),
  ('aaaaaaaa-0000-0000-0000-000000000002','V-23456789','María González',32,'F','Caracas','11111111-1111-1111-1111-111111111111','local','vivo','normal','cabello negro, 1.60m','manual',null, null,null),
  ('aaaaaaaa-0000-0000-0000-000000000003',null,'Hombre NN ~60','60','M','Zona El Valle',null,'desconocido','desaparecido','amnesia','adulto mayor, camisa azul','ia_vision',0.71, null,null),
  ('aaaaaaaa-0000-0000-0000-000000000004','V-34567890','Carlos Rangel',28,'M','Caracas',null,'visitante','detenido','normal','tatuaje brazo derecho','scraper',0.60, null,null)
on conflict (id) do nothing;

-- Historial (Juan pasó de desaparecido a hospital)
insert into persona_historial (persona_id, estado_salud, ubicacion, hospital_id, nota, fuente) values
  ('aaaaaaaa-0000-0000-0000-000000000001','desaparecido','Petare',null,'Reporte inicial familia','manual'),
  ('aaaaaaaa-0000-0000-0000-000000000001','herido','Hospital de Petare','22222222-2222-2222-2222-222222222222','Ingresado a urgencias','ia_vision');

-- Insumos (tracking en distintos estados)
insert into insumos (id, hospital_id, nombre, cantidad, unidad, prioridad, estado, donante, fuente, confianza) values
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Guantes estériles',50,'cajas','alta','solicitado',null,'ia_vision',0.88),
  ('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Yelco pediátrico',200,'unidades','critica','en_transito','Cruz Roja Internacional','ia_vision',0.91),
  ('bbbbbbbb-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Solución 0.9% NaCl',100,'litros','media','entregado','ONG MedGlobal','manual',null)
on conflict (id) do nothing;

insert into insumo_eventos (insumo_id, estado, actor, nota) values
  ('bbbbbbbb-0000-0000-0000-000000000002','solicitado','Hospital de Petare','Lista en pared digitalizada'),
  ('bbbbbbbb-0000-0000-0000-000000000002','en_transito','Cruz Roja','Despachado desde Panamá');

-- Donación monetaria de ejemplo
insert into donaciones_monetarias (hospital_id, monto, moneda, donante, estado, referencia) values
  ('11111111-1111-1111-1111-111111111111', 500, 'USD', 'Anónimo', 'registrada', null);
