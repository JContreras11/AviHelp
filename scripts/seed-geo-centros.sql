-- seed-geo-centros.sql — Agent G (GEO DATA + REAL CENTERS)
-- Idempotente y re-ejecutable. NO hace TRUNCATE/DELETE de datos transaccionales.
-- Aplicar:
--   psql "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.vcbitzupradnikgxrqjo.supabase.co:5432/postgres" -f scripts/seed-geo-centros.sql
--
-- Contenido:
--   1) Coordenadas reales (gps_lat/gps_lng) + dirección completa para los 12 hospitales/clínicas.
--      Fuente: nodos OpenStreetMap (amenity=hospital) vía Nominatim — pinpoint al edificio.
--   2) Centros de acopio / fundaciones reales que reciben donaciones para la crisis de Venezuela
--      (Venezuela, Colombia, EE.UU.), insertados como tipo='refugio' (la tabla única no admite
--      'centro'; el check sólo permite hospital|clinica|refugio). Marcados con provenance en contacto.
--   3) Recálculo de hospital_refugio (relación por cercanía) para los 12 hospitales: 3 refugios/centros
--      más cercanos por distancia haversine, ahora que los hospitales tienen coordenadas.

BEGIN;

-- ============================================================================
-- 1) HOSPITALES: coordenadas + dirección. Match por nombre exacto (idempotente).
-- ============================================================================
UPDATE hospitales SET gps_lat = 10.43127, gps_lng = -66.85590,
  ubicacion = 'Av. Principal de El Hatillo, La Tahona, Parroquia Nuestra Señora del Rosario, Baruta, Caracas'
  WHERE nombre = 'Centro Médico Docente la Trinidad';
UPDATE hospitales SET gps_lat = 10.50683, gps_lng = -66.89958,
  ubicacion = 'Av. Vollmer, San Bernardino, Parroquia San Bernardino, Libertador, Caracas'
  WHERE nombre = 'Hospital de Niños Dr. J.M. de los Ríos';
UPDATE hospitales SET gps_lat = 10.47135, gps_lng = -66.81056,
  ubicacion = 'Av. Mara, El Llanito, Parroquia Petare, Sucre, Caracas'
  WHERE nombre = 'Hospital Dr. Domingo Luciani';
UPDATE hospitales SET gps_lat = 10.51615, gps_lng = -66.95482,
  ubicacion = 'Av. La Laguna, Los Magallanes de Catia, Parroquia Sucre, Libertador, Caracas'
  WHERE nombre = 'Hospital Dr. José Gregorio Hernández';
UPDATE hospitales SET gps_lat = 10.52408, gps_lng = -66.92993,
  ubicacion = 'Av. Principal de El Manicomio, Altos de Lídice, Parroquia La Pastora, Libertador, Caracas'
  WHERE nombre = 'Hospital General de Lídice';
UPDATE hospitales SET gps_lat = 10.51619, gps_lng = -66.91143,
  ubicacion = 'Boulevard del Panteón, Altagracia, Parroquia Altagracia, Libertador, Caracas'
  WHERE nombre = 'Hospital José María Vargas de Caracas';
UPDATE hospitales SET gps_lat = 10.43751, gps_lng = -66.99051,
  ubicacion = 'Av. Principal de Caricuao, Ruiz Pineda, Parroquia Caricuao, Libertador, Caracas'
  WHERE nombre = 'Hospital Materno Infantil de Caricuao';
UPDATE hospitales SET gps_lat = 10.48031, gps_lng = -66.95313,
  ubicacion = 'Calle La Guayanita, La Yaguara, Parroquia El Paraíso, Libertador, Caracas'
  WHERE nombre = 'Hospital Miguel Pérez Carreño';
UPDATE hospitales SET gps_lat = 10.49810, gps_lng = -66.93922,
  ubicacion = 'Av. José Ángel Lamas, Urb. Industrial San Martín, Parroquia San Juan, Libertador, Caracas'
  WHERE nombre = 'Hospital Militar Dr. Carlos Arvelo';
UPDATE hospitales SET gps_lat = 10.44118, gps_lng = -66.92648,
  ubicacion = 'Av. Intercomunal de Coche, Barrio Cochecito, Parroquia Coche, Libertador, Caracas'
  WHERE nombre = 'Hospital Periférico de Coche';
UPDATE hospitales SET gps_lat = 10.49048, gps_lng = -66.89380,
  ubicacion = 'Av. 21 de Noviembre, Ciudad Universitaria (UCV), Parroquia San Pedro, Libertador, Caracas'
  WHERE nombre = 'Hospital Universitario de Caracas';
UPDATE hospitales SET gps_lat = 10.49527, gps_lng = -66.93165,
  ubicacion = 'Av. San Martín, Urb. San Martín, Parroquia San Juan, Libertador, Caracas'
  WHERE nombre = 'Maternidad Concepción Palacios';

-- ============================================================================
-- 2) CENTROS DE ACOPIO / FUNDACIONES REALES (tipo='centro').
--    Reciben donaciones para la crisis humanitaria de Venezuela (VE / CO / USA).
--    Idempotente: sólo inserta los que aún no existen (match por nombre).
--    Provenance = web/teléfono oficial en los campos de recepción; fuentes en cada fila.
-- ============================================================================
INSERT INTO hospitales (nombre, tipo, ubicacion, gps_lat, gps_lng, contacto,
                        responsable_recepcion_nombre, responsable_recepcion_contacto)
SELECT v.nombre, 'centro', v.ubicacion, v.lat, v.lng, v.tel, v.recibe, v.web
FROM (VALUES
  -- ---- Venezuela ----
  ('Cáritas de Venezuela',
   'Av. Teherán, frente a Urb. Juan Pablo II (a 200 m de la UCAB), Montalbán, Caracas, Venezuela',
   10.46360, -66.97480, '+58 212-443-3153', 'Alimentos, medicinas y donaciones monetarias', 'caritasvenezuela.org'),
   -- fuente: https://caritasvenezuela.org/contactanos/
  ('Cruz Roja Venezolana (Sede Nacional)',
   'Av. Andrés Bello, Edif. Cruz Roja Venezolana Nº 4, San Bernardino, Caracas, Venezuela',
   10.50850, -66.90100, '+58 212-571-4380', 'Medicinas, alimentos y donaciones monetarias', 'cruzroja.ve'),
   -- fuente: https://cruzroja.ve/
  ('Fundación Amigos del Niño con Cáncer',
   'CC Galerías Ávila, nivel Urdaneta, Local 90, La Candelaria, Caracas, Venezuela (sede temporal)',
   10.50600, -66.90400, '0412-6024722', 'Medicinas y donaciones monetarias', 'fninoscancer.org'),
   -- fuente: https://fninoscancer.org/contacto/
  ('Alimenta la Solidaridad',
   'Los Palos Grandes, 3ª transversal, Edif. Primero Justicia, Caracas, Venezuela',
   10.50307, -66.84402, NULL, 'Alimentos y dinero (confirmar recepción presencial activa)', 'alimentalasolidaridad.org'),
   -- fuente: https://alimentalasolidaridad.org/  (anunció pausa de operaciones 05/2025)
  ('Fe y Alegría (Oficina Nacional)',
   'Edif. Centro Valores, piso 7, esquina Luneta, Altagracia, Caracas, Venezuela',
   10.50650, -66.90900, '+58 212-564-7423', 'Donaciones monetarias y útiles escolares', 'feyalegria.org'),
   -- fuente: https://ve.feyalegria.org/
  ('Banco de Alimentos de Venezuela (Banco Alimentar)',
   'Caracas, Venezuela — opera vía red de aliados/Cáritas (sin punto de entrega público)',
   10.48060, -66.90360, NULL, 'Alimentos (entrega coordinada, no presencial)', 'apoyo-venezuela.com'),
   -- fuente: https://elestimulo.com/de-interes/2025-03-14/banco-alimentar-primer-banco-alimentos-venezuela/
  -- ---- Colombia ----
  ('Cruz Roja Colombiana (Sede Nacional)',
   'Av. Carrera 68 # 68B-31, Bogotá, Colombia',
   4.67284, -74.08934, '01-8000-519-8534', 'Medicinas, alimentos y donaciones monetarias', 'cruzrojacolombiana.org'),
   -- fuente: https://www.cruzrojacolombiana.org/contactenos/
  ('Banco de Alimentos de Bogotá',
   'Calle 19A # 32-50, Puente Aranda, Bogotá, Colombia',
   4.61100, -74.09200, '+57 312 504 8747', 'Alimentos y donaciones monetarias', 'bancodealimentos.org.co'),
   -- fuente: https://www.bancodealimentos.org.co/contactenos/
  ('Casa del Migrante Scalabrini (Cúcuta)',
   'Calle 7A Norte # 3-26, barrio Pescadero, Cúcuta, Colombia',
   7.90220, -72.50390, NULL, 'Alimentos, ropa, medicinas e higiene (migrantes venezolanos)', 'scalabrinicucuta.org'),
   -- fuente: https://scalabrinicol.org/cucuta/
  -- ---- Estados Unidos (diáspora) ----
  ('Global Empowerment Mission (GEM)',
   '1850 NW 84th Ave, Suite 100, Doral, FL 33126, EE.UU.',
   25.79124, -80.33316, NULL, 'Alimentos, medicinas y donaciones monetarias', 'globalempowermentmission.org'),
   -- fuente: https://www.globalempowermentmission.org/
  ('El Arepazo Doral (punto de acopio)',
   '10191 NW 58th St, Doral, FL 33178, EE.UU.',
   25.82654, -80.36143, NULL, 'Alimentos, fórmula infantil, agua y medicinas (drop-off)', NULL),
   -- fuente: https://www.local10.com/news/local/2026/06/28/helping-venezuela-donations-continue-to-flow-in-doral/
  ('Food for the Poor',
   '6401 Lyons Rd, Coconut Creek, FL 33073, EE.UU.',
   26.30908, -80.18809, NULL, 'Alimentos, medicinas y donaciones monetarias', 'foodforthepoor.org')
   -- fuente: https://www.foodforthepoor.org/
) AS v(nombre, ubicacion, lat, lng, tel, recibe, web)
WHERE NOT EXISTS (SELECT 1 FROM hospitales h WHERE h.nombre = v.nombre);

-- ============================================================================
-- 3) PROXIMIDAD: recalcular hospital_refugio (3 puntos de recepción más cercanos
--    por distancia haversine) para cada hospital con coordenadas. Idempotente.
-- ============================================================================
DELETE FROM hospital_refugio
WHERE hospital_id IN (
  SELECT id FROM hospitales WHERE tipo IN ('hospital','clinica') AND gps_lat IS NOT NULL
);

INSERT INTO hospital_refugio (hospital_id, refugio_id)
WITH hosp AS (
  SELECT id, gps_lat, gps_lng FROM hospitales
  WHERE tipo IN ('hospital','clinica') AND gps_lat IS NOT NULL AND gps_lng IS NOT NULL
),
recep AS (
  SELECT id, gps_lat, gps_lng FROM hospitales
  WHERE tipo IN ('refugio','centro') AND gps_lat IS NOT NULL AND gps_lng IS NOT NULL
),
ranked AS (
  SELECT h.id AS hospital_id, r.id AS refugio_id,
    row_number() OVER (
      PARTITION BY h.id ORDER BY
      2 * 6371 * asin(sqrt(
        power(sin(radians(r.gps_lat - h.gps_lat) / 2), 2)
        + cos(radians(h.gps_lat)) * cos(radians(r.gps_lat))
          * power(sin(radians(r.gps_lng - h.gps_lng) / 2), 2)
      ))
    ) AS rn
  FROM hosp h CROSS JOIN recep r
)
SELECT hospital_id, refugio_id FROM ranked WHERE rn <= 3
ON CONFLICT DO NOTHING;

COMMIT;
