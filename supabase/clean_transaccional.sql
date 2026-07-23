-- ─────────────────────────────────────────────────────────────
-- LIMPIEZA TRANSACCIONAL — deja el sistema listo para arrancar en producción.
-- Borra TODO el movimiento operativo (donaciones, insumos, personas, inventario…)
-- y CONSERVA la configuración institucional (hospitales, centros de acopio,
-- categorías, cuentas bancarias, usuarios y membresías).
--
-- Uso: ./scripts/clean.sh dev transaccional
-- Idempotente y resiliente: solo trunca las tablas que existan.
--
-- CONSERVA: hospitales · centros_acopio · categorias · cuentas · profiles ·
--           auth.users · membresias · centro_hospital · hospital_refugio
-- ─────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tablas text[] := array[
    'personas','persona_historial','insumos','insumo_eventos',
    'ofertas','donaciones','donaciones_monetarias','entregas',
    'inventario','ingresos','donantes','receptores','gastos',
    'solicitudes','notificaciones','cargas','match_sugerencias',
    'documentos','audit_log'
  ];
  existentes text[] := '{}';
begin
  foreach t in array tablas loop
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      existentes := existentes || t;
    end if;
  end loop;
  if array_length(existentes,1) is null then
    raise notice 'No hay tablas transaccionales que limpiar.';
  else
    execute 'truncate table ' || array_to_string(existentes, ', ') || ' restart identity cascade';
    raise notice 'Limpiadas: %', array_to_string(existentes, ', ');
  end if;
end $$;
