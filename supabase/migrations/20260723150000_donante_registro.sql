-- Registro de DONANTE (persona que dona insumos vía centro de acopio).
-- La tabla `donantes` ya existe (20260723090000_categorias_donantes). Aquí SOLO se
-- añaden, de forma idempotente, los campos del registro que pide el flujo de donación
-- por chat/wizard: cédula, edad, teléfono y un vínculo OPCIONAL con una ONG.
-- Mismo espíritu que el registro de voluntarios (identidad mínima + contacto).
-- Aditiva e idempotente. NO se aplica automáticamente.

alter table donantes add column if not exists cedula text;
alter table donantes add column if not exists edad int;
alter table donantes add column if not exists telefono text;
-- Vínculo opcional con una ONG (id de perfil rol='ong' si se conoce; texto libre si no).
alter table donantes add column if not exists ong_id uuid;
alter table donantes add column if not exists ong_nombre text;
-- Liga el donante a su cuenta cuando se registra logueado (o tras crear contraseña).
alter table donantes add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Búsqueda/deduplicado por cédula (un donante por cédula cuando se indica).
create unique index if not exists uq_donante_cedula on donantes (cedula) where cedula is not null;
create index if not exists idx_donante_user on donantes (user_id) where user_id is not null;
