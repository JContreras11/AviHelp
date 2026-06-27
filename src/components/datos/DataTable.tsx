"use client";

import { useState } from "react";
import {
  type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Facet = { columnId: string; label: string; options: string[] };

export function DataTable<T>({
  columns, data, onRowClick, placeholder = "Buscar…", facets = [],
}: {
  columns: ColumnDef<T, any>[];
  data: T[];
  onRowClick?: (row: T) => void;
  placeholder?: string;
  facets?: Facet[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters: Object.entries(colFilters).filter(([, v]) => v).map(([id, value]) => ({ id, value })),
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={placeholder} className="h-11 text-base flex-1 min-w-[180px]" />
        {facets.map((f) => (
          <select key={f.columnId} value={colFilters[f.columnId] ?? ""}
            onChange={(e) => setColFilters((c) => ({ ...c, [f.columnId]: e.target.value }))}
            className="h-11 text-sm border rounded-lg px-2 bg-background capitalize">
            <option value="">{f.label}: todos</option>
            {f.options.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
          </select>
        ))}
      </div>

      <div className="rounded-xl border overflow-x-auto">
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
              <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">Sin resultados</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {table.getFilteredRowModel().rows.length} resultado(s)
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>‹</Button>
          <span>{table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}</span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>›</Button>
        </div>
      </div>
    </div>
  );
}
