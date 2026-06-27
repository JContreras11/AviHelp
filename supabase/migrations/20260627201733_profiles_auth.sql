-- Perfiles de usuario ligados a auth.users. El rol define permisos en la UI.
-- Sin registro público: las cuentas se crean/asignan una por una (admin API).

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  nombre      text,
  rol         text not null default 'voluntario'
              check (rol in ('admin','medico','voluntario','ong','publico')),
  hospital_id uuid references hospitales(id) on delete set null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on profiles;
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Crea automáticamente un perfil al registrar un usuario (rol por defecto).
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
