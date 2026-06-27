-- Fase 2: Centros de acopio (lugares fuera de hospitales donde se recibe ayuda
-- física) + el "servicio/departamento" de los insumos ya vive en insumos.area.

create table if not exists centros_acopio (
  id                uuid primary key default uuid_generate_v4(),
  nombre            text not null,
  zona              text,                 -- zona específica (ej. Los Palos Grandes)
  ubicacion         text,                 -- dirección / referencia
  gps_lat           double precision,
  gps_lng           double precision,
  contacto_nombre   text,
  contacto_telefono text,
  horario           text,                 -- ej. "8am-6pm"
  recibe            text,                 -- qué reciben: alimentos, ropa, medicinas...
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_centros_acopio_updated on centros_acopio;
create trigger trg_centros_acopio_updated before update on centros_acopio
  for each row execute function set_updated_at();

-- Servicio/Departamento de cada solicitud de insumos = insumos.area (ya existe).
-- Se mantiene nullable en BD (datos históricos) pero la UI lo pide al cargar.
comment on column insumos.area is 'Servicio/Departamento del hospital (Traumatología, UCI Pediátrica, ...)';
-- Zona específica de personas = personas.ubicacion (ya existe).
comment on column personas.ubicacion is 'Zona/ubicación específica (barrio, edificio, referencia)';
