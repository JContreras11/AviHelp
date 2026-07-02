-- Ciclo de entrega COMPLETO con pierna de CENTRO DE ACOPIO.
-- entregas.estado pasa de {pendiente,en_transito,recibido,rechazado} al ciclo real:
--   registrada → en_camino_acopio → en_acopio → en_camino_hospital → recibido
--   (+ rechazado / cancelado)
-- Administración por rol: el centro de acopio marca su pierna (llegó / despachado);
-- el hospital confirma la recepción final. La conciliación de la necesidad sigue
-- manejándose por `donaciones` (trigger recomputar_necesidad); las acciones del
-- servidor sincronizan donaciones.estado con la pierna de la entrega.

-- 1) Quita el check viejo ANTES de mapear (si no, el update viola el check anterior).
alter table entregas drop constraint if exists entregas_estado_check;
alter table entregas drop constraint if exists entregas_estado_chk;

-- 2) Mapea valores viejos al nuevo ciclo.
update entregas set estado = 'registrada'         where estado = 'pendiente';
update entregas set estado = 'en_camino_hospital' where estado = 'en_transito';

-- 3) Aplica el nuevo check.
alter table entregas add constraint entregas_estado_chk check (
  estado in ('registrada','en_camino_acopio','en_acopio','en_camino_hospital','recibido','rechazado','cancelado')
);
alter table entregas alter column estado set default 'registrada';

-- Índices para las bandejas por rol (acopio por refugio_id, hospital por hospital_id).
create index if not exists idx_entregas_refugio_estado on entregas(refugio_id, estado);
create index if not exists idx_entregas_hospital_estado on entregas(hospital_id, estado);
