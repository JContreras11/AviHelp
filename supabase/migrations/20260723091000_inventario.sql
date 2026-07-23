-- LANE B — Inventario de stock físico (STOCK real en bodega/centro de acopio).
-- OJO: distinto de `insumos` (esa tabla es NECESIDAD/demanda del hospital). Aquí va lo que
-- físicamente existe y se puede entregar. Aditivo e idempotente.
-- `categorias` la crea la migración de Lane A (catálogo). Se referencia por nombre.
create table if not exists inventario (
  id uuid primary key default uuid_generate_v4(),
  categoria_id uuid references categorias(id) on delete set null,
  centro_id uuid references centros_acopio(id) on delete set null,
  nombre text not null,
  descripcion text,
  cantidad numeric not null default 0,          -- total en unidades base
  unidad text,                                   -- unidades, kg, ml
  presentacion text,                             -- paca, caja, frasco
  por_presentacion numeric,                      -- unidades por 1 presentación
  cantidad_presentaciones numeric,               -- nº de pacas/cajas
  estatus text not null default 'por_revisar'
    check (estatus in ('por_revisar','rechazado','danado','disponible','en_entrega','entregado')),
  vencimiento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inventario_categoria on inventario (categoria_id);
create index if not exists idx_inventario_estatus on inventario (estatus);
drop trigger if exists trg_inventario_updated on inventario;
create trigger trg_inventario_updated before update on inventario for each row execute function set_updated_at();
