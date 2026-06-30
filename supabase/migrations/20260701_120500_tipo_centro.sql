-- Amplía los tipos de institución para distinguir un "centro de acopio / fundación"
-- (punto que recibe donaciones) de un "refugio" (resguarda personas). Tabla única = hospitales.
-- Sólo amplía el conjunto permitido; las filas existentes no se ven afectadas.
ALTER TABLE hospitales DROP CONSTRAINT IF EXISTS hospitales_tipo_check;
ALTER TABLE hospitales
  ADD CONSTRAINT hospitales_tipo_check
  CHECK (tipo = ANY (ARRAY['hospital'::text, 'clinica'::text, 'refugio'::text, 'centro'::text]));
