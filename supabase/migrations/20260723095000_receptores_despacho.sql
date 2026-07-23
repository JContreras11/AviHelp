-- LANE F (Beneficiarios/Receptores + despacho) — ADITIVO.
-- Añade el RECEPTOR FINAL (beneficiario/comunidad) del ciclo de ayuda y extiende
-- la tabla `entregas` existente (NO crea una tabla paralela de despachos): a la
-- traza actual (registrada→…→recibido) se le suma a quién se despacha finalmente
-- + una imagen de PRE-DESPACHO (evidencia antes de salir) y la firma de recibido.
-- Idempotente. Reutiliza set_updated_at() y uuid_generate_v4() ya presentes.

create table if not exists receptores (
  id uuid primary key default uuid_generate_v4(),
  id_fiscal_prefijo text check (id_fiscal_prefijo in ('V','E','J','G','P')),
  id_fiscal_numero text,
  nombre text, razon_social text,
  whatsapp_prefijo text, whatsapp_numero text,
  ubicacion_estado text, ubicacion_direccion text,
  gps_lat double precision, gps_lng double precision,
  tamano_personas int,
  prioridad text check (prioridad in ('alta','media','baja')) default 'media',
  responsable_nombre text, responsable_correo text, responsable_whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_receptores_updated on receptores;
create trigger trg_receptores_updated before update on receptores for each row execute function set_updated_at();
-- Extiende entregas (aditivo): receptor final + evidencia de pre-despacho.
alter table entregas add column if not exists receptor_id uuid references receptores(id) on delete set null;
alter table entregas add column if not exists imagen_predespacho text;
alter table entregas add column if not exists firma_recibido text;
