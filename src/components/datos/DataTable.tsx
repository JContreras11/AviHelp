"use client";

import { useEffect, useState } from "react";
import {
  type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Facet = { columnId: string; label: string; options: string[] };

// Modo servidor: paginación/búsqueda/filtros los maneja el padre (no carga todo).
export type ServerCtl = {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  q: string;
  onQ: (s: string) => void;
  filtros: Record<string, string>;
  onFiltro: (id: string, v: string) => void;
  loading?: boolean;
  onExportAll?: () => void;
};

export function DataTable<T>({
  columns, data, onRowClick, placeholder = "Buscar…", facets = [], onExport, server,
}: {
  columns: ColumnDef<T, any>[];
  data: T[];
  onRowClick?: (row: T) => void;
  placeholder?: string;
  facets?: Facet[];
  onExport?: (rows: T[]) => void;
  server?: ServerCtl;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [busqLocal, setBusqLocal] = useState(server?.q ?? "");

  // Debounce de la búsqueda en modo servidor (no consulta por cada tecla).
  useEffect(() => {
    if (!server) return;
    const t = setTimeout(() => server.onQ(busqLocal), 350);
    return () => clearTimeout(t);
  }, [busqLocal, server]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      ...(server ? {} : {
        globalFilter,
        columnFilters: Object.entries(colFilters).filter(([, v]) => v).map(([id, value]) => ({ id, value })),
      }),
      ...(server ? { pagination: { pageIndex: server.page, pageSize: server.pageSize } } : {}),
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(server
      ? { manualPagination: true, manualFiltering: true, pageCount: Math.max(1, Math.ceil(server.total / server.pageSize)) }
      : { getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 20 } } }),
  });

  const totalRes = server ? server.total : table.getFilteredRowModel().rows.length;
  const pageCount = server ? Math.max(1, Math.ceil(server.total / server.pageSize)) : Math.max(1, table.getPageCount());
  const pageIndex = server ? server.page : table.getState().pagination.pageIndex;
  const prev = () => (server ? server.onPage(Math.max(0, server.page - 1)) : table.previousPage());
  const next = () => (server ? server.onPage(server.page + 1) : table.nextPage());
  const canPrev = server ? server.page > 0 : table.getCanPreviousPage();
  const canNext = server ? server.page < pageCount - 1 : table.getCanNextPage();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        {server ? (
          <Input value={busqLocal} onChange={(e) => setBusqLocal(e.target.value)} placeholder={placeholder} className="h-11 text-base flex-1 min-w-[180px]" />
        ) : (
          <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={placeholder} className="h-11 text-base flex-1 min-w-[180px]" />
        )}
        {facets.map((f) => (
          <select key={f.columnId}
            value={server ? (server.filtros[f.columnId] ?? "") : (colFilters[f.columnId] ?? "")}
            onChange={(e) => server ? server.onFiltro(f.columnId, e.target.value) : setColFilters((c) => ({ ...c, [f.columnId]: e.target.value }))}
            className="h-11 text-sm border rounded-lg px-2 bg-background capitalize">
            <option value="">{f.label}: todos</option>
            {f.options.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
          </select>
        ))}
        {onExport && (
          <Button variant="outline" className="h-11"
            onClick={() => server?.onExportAll ? server.onExportAll() : onExport(table.getFilteredRowModel().rows.map((r) => r.original))}>
            ⬇ Exportar
          </Button>
        )}
      </div>

      <div className="rounded-xl border overflow-x-auto relative">
        {server?.loading && <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center text-sm text-muted-foreground">Cargando…</div>}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="whitespace-nowrap">
                    {h.isPlaceholder ? null : (
                      <button className="inline-flex items-center gap-1 font-semibold"
                        onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {{ asc: " ▲", desc: " ▼" }[h.column.getIsSorted() as string] ?? ""}
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} onClick={() => onRowClick?.(row.original)}
                  className="cursor-pointer hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">{server?.loading ? "Cargando…" : "Sin resultados"}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{totalRes} resultado(s)</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prev} disabled={!canPrev}>‹</Button>
          <span>{pageIndex + 1} / {pageCount}</span>
          <Button variant="outline" size="sm" onClick={next} disabled={!canNext}>›</Button>
        </div>
      </div>
    </div>
  );
}
