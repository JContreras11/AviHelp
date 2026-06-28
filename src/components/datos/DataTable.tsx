"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Facet = { columnId: string; label: string; options: string[] };
type Dir = "asc" | "desc";

// Modo servidor: paginación/búsqueda/filtros/orden los maneja el padre.
export type ServerCtl = {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  q: string;
  onQ: (s: string) => void;
  filtros: Record<string, string>;
  onFiltro: (id: string, v: string) => void;
  orden?: { col: string | null; dir: Dir };
  onOrden?: (col: string, dir: Dir) => void;
  loading?: boolean;
  onExportAll?: () => void;
};

// Columnas compatibles con el formato previo + sortKey opcional (columna DB para ordenar).
type Col = { id?: string; accessorKey?: string; accessorFn?: (r: any) => any; header: string; sortKey?: string; cell?: (c: { getValue: () => any }) => any };

const valueOf = (col: Col, row: any) =>
  col.accessorFn ? col.accessorFn(row) : col.accessorKey ? row[col.accessorKey] : undefined;
const renderCell = (col: Col, row: any) => {
  const v = valueOf(col, row);
  return col.cell ? col.cell({ getValue: () => v }) : (v as any);
};
const sortKeyOf = (col: Col) => col.sortKey ?? col.accessorKey ?? null;

const CLIENT_PAGE = 20;

export function DataTable<T>({
  columns, data, onRowClick, placeholder = "Buscar…", facets = [], onExport, server,
}: {
  columns: any[];
  data: T[];
  onRowClick?: (row: T) => void;
  placeholder?: string;
  facets?: Facet[];
  onExport?: (rows: T[]) => void;
  server?: ServerCtl;
}) {
  const cols = columns as Col[];
  const [q, setQ] = useState("");
  const [colF, setColF] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [sortC, setSortC] = useState<{ key: string; dir: Dir } | null>(null);
  const [busqLocal, setBusqLocal] = useState(server?.q ?? "");

  // Debounce solo al cambiar el texto (no en cada render -> antes reseteaba la página).
  const onQRef = useRef(server?.onQ);
  onQRef.current = server?.onQ;
  const primeraVez = useRef(true);
  useEffect(() => {
    if (!server) return;
    if (primeraVez.current) { primeraVez.current = false; return; }
    const t = setTimeout(() => onQRef.current?.(busqLocal), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqLocal]);

  function clickHeader(col: Col) {
    const key = sortKeyOf(col);
    if (!key) return;
    const dir: Dir = sortC?.key === key && sortC.dir === "asc" ? "desc" : "asc";
    if (server) { server.onOrden?.(key, dir); }
    else { setSortC({ key, dir }); }
  }
  const flecha = (col: Col) => {
    const key = sortKeyOf(col);
    const active = server ? server.orden?.col === key : sortC?.key === key;
    if (!active) return "";
    const dir = server ? server.orden?.dir : sortC?.dir;
    return dir === "asc" ? " ▲" : " ▼";
  };

  let rows: any[] = data as any[];
  let filtered: any[] = data as any[];
  let total: number, pageCount: number, pageIndex: number;
  let prev: () => void, next: () => void, canPrev: boolean, canNext: boolean;

  if (server) {
    total = server.total;
    pageCount = Math.max(1, Math.ceil(server.total / server.pageSize));
    pageIndex = server.page;
    prev = () => server.onPage(Math.max(0, server.page - 1));
    next = () => server.onPage(server.page + 1);
    canPrev = server.page > 0;
    canNext = server.page < pageCount - 1;
  } else {
    const ql = q.trim().toLowerCase();
    filtered = (data as any[]).filter((row) => {
      if (ql && !cols.some((c) => String(valueOf(c, row) ?? "").toLowerCase().includes(ql))) return false;
      for (const [id, v] of Object.entries(colF)) {
        if (!v) continue;
        const col = cols.find((c) => (c.id || c.accessorKey) === id);
        if (col && String(valueOf(col, row) ?? "") !== v) return false;
      }
      return true;
    });
    if (sortC) {
      const col = cols.find((c) => sortKeyOf(c) === sortC.key);
      if (col) {
        filtered = [...filtered].sort((a, b) => {
          const va = valueOf(col, a), vb = valueOf(col, b);
          let cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""));
          return sortC.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    total = filtered.length;
    pageCount = Math.max(1, Math.ceil(total / CLIENT_PAGE));
    pageIndex = Math.min(page, pageCount - 1);
    rows = filtered.slice(pageIndex * CLIENT_PAGE, pageIndex * CLIENT_PAGE + CLIENT_PAGE);
    prev = () => setPage((p) => Math.max(0, p - 1));
    next = () => setPage((p) => Math.min(pageCount - 1, p + 1));
    canPrev = pageIndex > 0;
    canNext = pageIndex < pageCount - 1;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        {server ? (
          <Input value={busqLocal} onChange={(e) => setBusqLocal(e.target.value)} placeholder={placeholder} className="h-11 text-base flex-1 min-w-[180px]" />
        ) : (
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={placeholder} className="h-11 text-base flex-1 min-w-[180px]" />
        )}
        {facets.map((f) => (
          <select key={f.columnId}
            value={server ? (server.filtros[f.columnId] ?? "") : (colF[f.columnId] ?? "")}
            onChange={(e) => server ? server.onFiltro(f.columnId, e.target.value) : (setColF((c) => ({ ...c, [f.columnId]: e.target.value })), setPage(0))}
            className="h-11 text-sm border rounded-lg px-2 bg-background capitalize">
            <option value="">{f.label}: todos</option>
            {f.options.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
          </select>
        ))}
        {onExport && (
          <Button variant="outline" className="h-11"
            onClick={() => server?.onExportAll ? server.onExportAll() : onExport(filtered as T[])}>
            ⬇ Exportar
          </Button>
        )}
      </div>

      <div className="rounded-xl border overflow-x-auto relative">
        {server?.loading && <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center text-sm text-muted-foreground">Cargando…</div>}
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c, i) => {
                const sortable = !!sortKeyOf(c);
                return (
                  <TableHead key={i} className="whitespace-nowrap">
                    {sortable ? (
                      <button className="inline-flex items-center gap-1 font-semibold hover:text-foreground" onClick={() => clickHeader(c)} title="Ordenar">
                        {c.header}
                        {flecha(c) || <span className="text-muted-foreground/40 text-xs">↕</span>}
                      </button>
                    ) : <span className="font-semibold">{c.header}</span>}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row, ri) => (
                <TableRow key={row.id ?? ri} onClick={() => onRowClick?.(row)} className="cursor-pointer hover:bg-muted/50">
                  {cols.map((c, ci) => <TableCell key={ci} className="py-3">{renderCell(c, row)}</TableCell>)}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={cols.length} className="text-center text-muted-foreground py-8">{server?.loading ? "Cargando…" : "Sin resultados"}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{total} resultado(s)</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prev} disabled={!canPrev}>‹</Button>
          <span>{pageIndex + 1} / {pageCount}</span>
          <Button variant="outline" size="sm" onClick={next} disabled={!canNext}>›</Button>
        </div>
      </div>
    </div>
  );
}
