-- LANE C — Cuentas bancarias + Gastos (dinero). Aditiva e idempotente. NO aplicar aún.
-- Cuentas bancarias (Bank of America en VES/USD), movimientos (ingreso/egreso) y
-- vínculo income↔expense vía referencia. Extiende donaciones_monetarias (no la reemplaza).

create table if not exists cuentas (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  banco text,
  moneda text not null default 'USD' check (moneda in ('USD','VES')),
  numero text, titular text,
  saldo_inicial numeric not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_cuentas_updated on cuentas;
create trigger trg_cuentas_updated before update on cuentas for each row execute function set_updated_at();

create table if not exists gastos (
  id uuid primary key default uuid_generate_v4(),
  cuenta_id uuid references cuentas(id) on delete set null,
  tipo text not null check (tipo in ('ingreso','egreso')),
  concepto text not null,
  monto numeric not null check (monto > 0),
  moneda text not null default 'USD' check (moneda in ('USD','VES')),
  categoria_id uuid references categorias(id) on delete set null,
  referencia text,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_gastos_cuenta on gastos (cuenta_id, fecha desc);
alter table donaciones_monetarias add column if not exists cuenta_id uuid references cuentas(id) on delete set null;
