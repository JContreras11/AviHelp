-- Quitar el estado "detenido": migrar datos existentes y ajustar el check.
update personas set estado_salud = 'desconocido' where estado_salud = 'detenido';
update persona_historial set estado_salud = 'desconocido' where estado_salud = 'detenido';

do $$ begin
  alter table personas drop constraint if exists personas_estado_salud_check;
  alter table personas add constraint personas_estado_salud_check
    check (estado_salud in ('vivo','herido','desaparecido','fallecido','desconocido'));
end $$;
