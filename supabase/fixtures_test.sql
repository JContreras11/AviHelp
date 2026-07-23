-- Fixtures de PRUEBA (solo DEV). Idempotente. Crea el andamiaje mínimo para
-- correr la suite e2e con un usuario de LOGÍSTICA no-admin:
--   - 1 centro de acopio de prueba
--   - membresía aprobada de e2e-voluntario a ese centro (responsable)
-- Los flujos operativos (donantes, ingresos, inventario…) los CREA la suite por UI.
-- No sembrar aquí data transaccional.

insert into centros_acopio (nombre, zona, ubicacion, activo)
values ('Centro de Acopio Central (TEST)', 'Chacao', 'Av. Principal, Caracas', true)
on conflict do nothing;

-- Membresía aprobada del voluntario de prueba al centro TEST (rol logística).
do $$
declare
  v_centro uuid;
  v_user   uuid;
begin
  select id into v_centro from centros_acopio where nombre = 'Centro de Acopio Central (TEST)' limit 1;
  select id into v_user   from auth.users where email = 'e2e-voluntario@avihelp.test' limit 1;
  if v_centro is not null and v_user is not null
     and not exists (select 1 from membresias where user_id=v_user and centro_id=v_centro) then
    insert into membresias (user_id, centro_id, rol_local, estado)
    values (v_user, v_centro, 'responsable', 'aprobado');
  end if;
end $$;
