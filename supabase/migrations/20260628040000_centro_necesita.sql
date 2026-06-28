-- Los centros de refugiados/acopio también pueden SOLICITAR donaciones:
-- qué necesitan ahora mismo (texto libre).
alter table centros_acopio add column if not exists necesita text;
comment on column centros_acopio.necesita is 'Solicitud de donación: qué necesita el centro ahora';
