create table if not exists categorias (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null unique,
  descripcion text,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
insert into categorias (nombre, orden) values
 ('Alimentos',1),('Medicinas e Insumos',2),('Higiene personal',3),('Ropa',4),('Mobiliario',5),('Recreación',6)
on conflict (nombre) do nothing;

create table if not exists donantes (
  id uuid primary key default uuid_generate_v4(),
  id_fiscal_prefijo text check (id_fiscal_prefijo in ('V','E','J','G','P')),
  id_fiscal_numero text,
  nombre text, apellido text, razon_social text,
  whatsapp_prefijo text, whatsapp_numero text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_donante_fiscal on donantes (id_fiscal_prefijo, id_fiscal_numero) where id_fiscal_numero is not null;
drop trigger if exists trg_donantes_updated on donantes;
create trigger trg_donantes_updated before update on donantes for each row execute function set_updated_at();
