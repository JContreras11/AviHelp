-- Fallback: si el hospital NO tiene miembros (sin responsable asignado), la alerta
-- de donación va a TODOS los admins, para que nunca se pierda.
create or replace function notificar_donacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hospital uuid;
  v_item     text;
  v_msg      text;
begin
  if new.estado <> 'en_camino' then return new; end if;
  select hospital_id, nombre into v_hospital, v_item from insumos where id = new.insumo_id;
  if v_hospital is null then return new; end if;
  v_msg := '¡Ayuda en camino! Una ONG ha enviado ' || new.cantidad || ' ' || coalesce(v_item, 'insumo')
        || ' para tu solicitud. Prepárate para la recepción.';

  -- 1) Responsables/miembros del hospital.
  insert into notificaciones (usuario_destino_id, necesidad_id, donacion_id, mensaje)
  select m.user_id, new.insumo_id, new.id, v_msg
  from membresias m
  where m.hospital_id = v_hospital;

  -- 2) Sin miembros -> avisar a los admins (responsable por defecto).
  if not found then
    insert into notificaciones (usuario_destino_id, necesidad_id, donacion_id, mensaje)
    select p.id, new.insumo_id, new.id,
           v_msg || ' (El hospital no tiene responsable asignado: te llega como admin.)'
    from profiles p
    where p.rol = 'admin';
  end if;

  return new;
end; $$;
