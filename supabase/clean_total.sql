-- ─────────────────────────────────────────────────────────────
-- LIMPIEZA TOTAL — borra TODA la data de la aplicación.
-- Además de lo transaccional, borra instituciones y membresías.
-- CONSERVA solo: auth.users (cuentas de acceso) y re-siembra `categorias`
-- (catálogo base que casi nunca cambia).
--
-- Uso: ./scripts/clean.sh dev total
-- ⚠️  Deja el sistema vacío. Los usuarios quedan sin membresía → sin alcance
--     hasta re-asignarlos. Úsalo solo para un arranque desde cero.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tablas text[] := array[
    'personas','persona_historial','insumos','insumo_eventos',
    'ofertas','donaciones','donaciones_monetarias','entregas',
    'inventario','ingresos','donantes','receptores','gastos',
    'solicitudes','notificaciones','cargas','match_sugerencias',
    'documentos','audit_log',
    -- + institucional:
    'membresias','centro_hospital','hospital_refugio',
    'centros_acopio','hospitales','cuentas','categorias'
  ];
  existentes text[] := '{}';
begin
  foreach t in array tablas loop
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      existentes := existentes || t;
    end if;
  end loop;
  if array_length(existentes,1) is not null then
    execute 'truncate table ' || array_to_string(existentes, ', ') || ' restart identity cascade';
    raise notice 'Borradas: %', array_to_string(existentes, ', ');
  end if;
end $$;

-- Re-siembra el catálogo base de categorías.
insert into categorias (nombre, orden) values
 ('Alimentos',1),('Medicinas e Insumos',2),('Higiene personal',3),
 ('Ropa',4),('Mobiliario',5),('Recreación',6)
on conflict (nombre) do nothing;
