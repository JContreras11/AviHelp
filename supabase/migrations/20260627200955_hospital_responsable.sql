-- Responsable de recepción del hospital. El contacto NO es público: se revela
-- solo tras pulsar "Quiero donar" (ver UI). Aquí solo se guardan los datos.

alter table hospitales
  add column if not exists responsable_recepcion_nombre   text,
  add column if not exists responsable_recepcion_contacto text;
