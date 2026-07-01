-- Migration: Set GPS coordinates for main Caracas hospitals and relate them to region-based refugios/centros.

-- 1. Update coordinates of major hospitals in Caracas if not already set.
UPDATE hospitales SET gps_lat = 10.4891, gps_lng = -66.8906 WHERE nombre ILIKE '%Universitario%Caracas%' AND (gps_lat IS NULL OR gps_lat = 0);
UPDATE hospitales SET gps_lat = 10.4812, gps_lng = -66.8094 WHERE (nombre ILIKE '%Domingo Luciani%' OR nombre ILIKE '%Llanito%') AND (gps_lat IS NULL OR gps_lat = 0);
UPDATE hospitales SET gps_lat = 10.4770, gps_lng = -66.9664 WHERE (nombre ILIKE '%Pérez Carreño%' OR nombre ILIKE '%Perez Carreno%') AND (gps_lat IS NULL OR gps_lat = 0);
UPDATE hospitales SET gps_lat = 10.5312, gps_lng = -66.9472 WHERE (nombre ILIKE '%José Gregorio%' OR nombre ILIKE '%Magallanes%') AND (gps_lat IS NULL OR gps_lat = 0);

-- 2. Connect Caracas hospitals to Caracas refugios, and La Guaira hospitals to La Guaira refugios.
INSERT INTO hospital_refugio (hospital_id, refugio_id)
SELECT h.id, r.id
FROM hospitales h
CROSS JOIN hospitales r
WHERE h.tipo IN ('hospital', 'clinica')
  AND r.tipo = 'refugio'
  AND (
    (h.nombre ILIKE '%Caracas%' OR h.nombre ILIKE '%Llanito%' OR h.nombre ILIKE '%Pérez Carreño%' OR h.nombre ILIKE '%Magallanes%' OR h.ubicacion ILIKE '%Caracas%') 
    = 
    (r.nombre ILIKE '%Caracas%' OR r.nombre ILIKE '%Este%' OR r.nombre ILIKE '%Oeste%' OR r.nombre ILIKE '%Martín%' OR r.ubicacion ILIKE '%Caracas%')
  )
ON CONFLICT DO NOTHING;
