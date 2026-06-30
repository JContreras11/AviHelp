"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

// REGLA DE ORO: todo select de la app debe ser buscable. Combobox reutilizable,
// accesible y MOBILE-FIRST, sin dependencias nuevas (div + input + Tailwind).

export type SearchableOption = {
  value: string;
  label: string;
  keywords?: string;
};

export type SearchableSelectProps = {
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Permite crear una opción nueva cuando el filtro no encuentra nada. */
  allowCreate?: boolean;
  createLabel?: (query: string) => string;
  onCreate?: (query: string) => void;
};

// Normaliza acentos + minúsculas (mismo patrón usado en toda la app).
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

// Multi-token: cada palabra del query debe aparecer en label/keywords.
function matches(opt: SearchableOption, tokens: string[]) {
  if (!tokens.length) return true;
  const hay = norm(`${opt.label} ${opt.keywords ?? ""}`);
  return tokens.every((t) => hay.includes(t));
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Selecciona…",
  disabled = false,
  className,
  allowCreate = false,
  createLabel = (q) => `Crear “${q}”`,
  onCreate,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selected = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const tokens = React.useMemo(
    () => norm(query).split(/\s+/).filter(Boolean),
    [query]
  );

  const filtered = React.useMemo(
    () => options.filter((o) => matches(o, tokens)),
    [options, tokens]
  );

  // ¿Mostrar la fila "crear"? Sólo si está habilitado, hay texto y no hay match exacto.
  const showCreate =
    allowCreate &&
    !!onCreate &&
    query.trim().length > 0 &&
    !options.some((o) => norm(o.label) === norm(query.trim()));

  // total de filas navegables (opciones + fila crear).
  const rowCount = filtered.length + (showCreate ? 1 : 0);

  // Cierra al hacer click fuera.
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Al abrir: enfoca el filtro y resetea el cursor.
  React.useEffect(() => {
    if (open) {
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setQuery("");
  }, [open]);

  // Mantiene visible la fila activa.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(idx: number) {
    if (idx < filtered.length) {
      onChange(filtered[idx].value);
      setOpen(false);
    } else if (showCreate) {
      onCreate?.(query.trim());
      setOpen(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (rowCount ? (a + 1) % rowCount : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (rowCount ? (a - 1 + rowCount) % rowCount : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rowCount) choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:text-sm dark:bg-input/30",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate text-left">
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpiar selección"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronsUpDown className="size-4 opacity-50" />
        </span>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md"
          role="listbox"
        >
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Buscar…"
              className="h-11 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:h-9 md:text-sm"
            />
          </div>

          <div ref={listRef} className="max-h-64 overflow-auto p-1">
            {rowCount === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Sin resultados
              </div>
            )}

            {filtered.map((opt, idx) => {
              const isActive = idx === active;
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  data-idx={idx}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(idx)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-base md:min-h-9 md:text-sm",
                    isActive && "bg-accent text-accent-foreground"
                  )}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{opt.label}</span>
                </div>
              );
            })}

            {showCreate && (
              <div
                data-idx={filtered.length}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActive(filtered.length)}
                onClick={() => choose(filtered.length)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-base font-medium text-primary md:min-h-9 md:text-sm",
                  active === filtered.length && "bg-accent"
                )}
              >
                <Plus className="size-4 shrink-0" />
                <span className="truncate">{createLabel(query.trim())}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchableSelect;
