-- AGENTE D (Donaciones) — MODELO DE ESTADO de la donación.
-- Una donación recién creada NO debe contar como "en camino": solo está REGISTRADA
-- (pendiente). Pasa a "en_camino" únicamente cuando alguien la mueve explícitamente
-- (el donante/centro la marca en ruta) y a "recibido" cuando el destino la confirma.
--
-- Antes: donaciones.estado default 'en_camino' -> cada donación nueva inflaba
-- insumos.cantidad_en_camino vía recomputar_necesidad (el famoso "11 en camino").
-- Ahora: default 'registrada'; recomputar_necesidad ya solo suma estado='en_camino',
-- así que las registradas NO inflan el conteo y la Necesidad sigue en "Pendiente".
--
-- NO toca recomputar_solicitud / solicitudes (Agente V). Solo amplía el dominio del
-- check de donaciones.estado y ajusta el default. El trigger recomputar_necesidad ya
-- cuenta correctamente (en_camino / recibido); aquí lo dejamos explícito y a prueba de
-- futuros estados con un comentario.

alter table donaciones drop constraint if exists donaciones_estado_check;
alter table donaciones alter column estado set default 'registrada';
alter table donaciones add constraint donaciones_estado_check
  check (estado in ('registrada', 'en_camino', 'recibido', 'cancelado'));

-- Reafirma la semántica de conteo: 'registrada' NO suma a en_camino ni a recibida.
-- (Mismo cuerpo que la versión vigente — explícito para no depender del orden de
--  ejecución de migraciones; idempotente por create-or-replace.)
create or replace function recomputar_necesidad(p_insumo uuid)
returns void language plpgsql as $$
declare
  v_solicitada int;
  v_camino     int;
  v_recibida   int;
begin
  select coalesce(cantidad, 0) into v_solicitada from insumos where id = p_insumo;
  -- Solo cuentan EN CAMINO las donaciones marcadas explícitamente como tal.
  select coalesce(sum(cantidad), 0) into v_camino   from donaciones where insumo_id = p_insumo and estado = 'en_camino';
  select coalesce(sum(cantidad), 0) into v_recibida from donaciones where insumo_id = p_insumo and estado = 'recibido';
  update insumos set
    cantidad_en_camino = v_camino,
    cantidad_recibida  = v_recibida,
    estado = case
      when v_solicitada > 0 and v_recibida >= v_solicitada then 'cubierto'
      when v_camino > 0 or v_recibida > 0                  then 'en_transito'
      else 'solicitado'
    end,
    cubierto_at = case when v_solicitada > 0 and v_recibida >= v_solicitada then now() else cubierto_at end
  where id = p_insumo and estado <> 'cancelado';
end; $$;
