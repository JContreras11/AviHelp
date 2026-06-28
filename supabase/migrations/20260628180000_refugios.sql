-- Refugios = institución más (como hospital/clínica) para que puedan SOLICITAR insumos.
-- Reusa hospitales: insumos.hospital_id (Necesidad), membresias.hospital_id (scope) y
-- toda la verificación de alcance funcionan sin cambios.
alter table hospitales drop constraint if exists hospitales_tipo_check;
alter table hospitales add constraint hospitales_tipo_check check (tipo in ('hospital', 'clinica', 'refugio'));

-- Seed de los refugios de La Guaira (idempotente por nombre).
insert into hospitales (nombre, ubicacion, tipo)
select v.nombre, v.ubicacion, 'refugio'
from (values
  ('Refugio para abuelos y abuelas (sin amparo familiar)', 'UENB Santa Eduvigis, Bloque Unidos 1 y 2, Sector Aeropuerto · Parroquia Urimare'),
  ('Refugio para niños y niñas (sin amparo familiar)', 'Urb. Armando Reverón, sector Guaracarumbo, edif. PDVAL'),
  ('Centro de Adiestramiento Naval Escuela de Grumetes', 'Av. La Páez · Parroquia Catia La Mar'),
  ('UEN Juan Germán Roscio', 'Navarrete a Buena Vista · Parroquia Maiquetía'),
  ('Liceo Armando Reverón', 'Urb. Guaracarumbo · Parroquia Raúl Leoni'),
  ('Complejo Educativo República de Panamá', 'Avenida Soublette · Parroquia La Guaira'),
  ('Liceo Nacional Lorenzo González', 'Distribuidor El Trébol, sector Simetaca · Parroquia Carlos Soublette'),
  ('UEE La Guaira', 'Pachano a San Juan de Dios · Parroquia La Guaira'),
  ('UENB 10 de Marzo', 'Prolongación 10 de Marzo, bloque 1 · Parroquia Carlos Soublette'),
  ('CEIS Manuelita Sáenz', 'Sector Marapa Marina · Parroquia Catia La Mar'),
  ('Universidad Marítima del Caribe', 'Av. El Ejército · Parroquia Catia La Mar')
) as v(nombre, ubicacion)
where not exists (select 1 from hospitales h where h.nombre = v.nombre);
