-- Categoría de cada carga (personas / insumos / donaciones): permite agrupar y filtrar
-- "Mis cargas" y mostrarla SIEMPRE en la tarjeta. Se infiere de lo que extrajo la IA.
-- Aditiva e idempotente. Aplicada a DEV.

alter table cargas add column if not exists categoria text;

-- Respaldo: clasifica las cargas existentes por su "tipo" para que no queden sin categoría.
update cargas
set categoria = case
  when tipo = 'lista_insumos' then 'insumos'
  else 'personas'
end
where categoria is null;

create index if not exists idx_cargas_categoria on cargas (user_id, categoria, created_at desc);
