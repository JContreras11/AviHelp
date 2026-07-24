-- LANE V — Mejoras al registro de VOLUNTARIOS (revisión de onboarding, org genérica).
-- El voluntariado deja de ser "solo personal de salud": se agregan área(s) de interés
-- multi-selección, disponibilidad por día específico, otra habilidad libre, correo
-- obligatorio y la organización a la que se presta servicio.
-- Aditiva e IDEMPOTENTE (IF NOT EXISTS). NO aplicada automáticamente.

-- Correo electrónico (ahora obligatorio en el formulario público).
alter table voluntarios add column if not exists email text;

-- Área(s) de interés o conocimiento (multi-selección, opcional).
alter table voluntarios add column if not exists area_interes text[] not null default '{}';

-- Otra habilidad o herramienta que desee aportar (texto libre, opcional).
alter table voluntarios add column if not exists otra_habilidad text;

-- Disponibilidad por DÍA específico (lunes…domingo) en vez de "entre semana / fin de semana".
alter table voluntarios add column if not exists dias_disponibles text[] not null default '{}';

-- Organización a la que se presta servicio (obligatoria en el formulario).
alter table voluntarios add column if not exists organizacion_id uuid references hospitales(id) on delete set null;
alter table voluntarios add column if not exists organizacion_nombre text;

create index if not exists idx_voluntarios_organizacion on voluntarios (organizacion_id);
