"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useRol } from "@/lib/rol";
import { DataTable, type ServerCtl } from "./DataTable";
import { PersonaDialog, InsumoDialog, HospitalDialog, CentroDialog } from "./Detalle";
import { cedulaReal, hace, descargarCSV } from "@/lib/format";
import { listarPersonas, listarInsumos, listarHospitales, listarCentros, areasInsumo } from "@/app/actions/listas";

const TABS = ["personas", "insumos", "hospitales", "acopio"];
const PAGE_SIZE = 25;

const PILL: Record<string, string> = {
  herido: "bg-amber-100 text-amber-800", desaparecido: "bg-red-100 text-red-700",
  fallecido: "bg-gray-200 text-gray-700",
  vivo: "bg-green-100 text-green-700", desconocido: "bg-muted text-muted-foreground",
  solicitado: "bg-blue-100 text-blue-700", en_transito: "bg-amber-100 text-amber-800",
  entregado: "bg-green-100 text-green-700", cubierto: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-gray-200 text-gray-600",
};
const Pill = ({ v }: { v: string }) => (
  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${PILL[v] ?? "bg-muted"}`}>{v?.replace("_", " ")}</span>
);

export type Counts = { personas: number; insumos: number; hospitales: number; acopio: number };
type Col = { id?: string; accessorKey?: string; accessorFn?: (r: any) => any; header: string; sortKey?: string; cell?: (c: { getValue: () => any }) => any };

export function Datos({ counts }: { counts: Counts }) {
  const qc = useQueryClient();
  const { puede } = useRol();
  const verInicial = useSearchParams().get("ver");
  const [tab, setTab] = useState(TABS.includes(verInicial ?? "") ? (verInicial as string) : "personas");
  useEffect(() => {
    const h = (e: Event) => setTab((e as CustomEvent).detail);
    window.addEventListener("avi-ver", h);
    return () => window.removeEventListener("avi-ver", h);
  }, []);

  // Estado de paginación/búsqueda por lista (servidor).
  type Orden = { col: string; dir: "asc" | "desc" } | null;
  const [pPage, setPPage] = useState(0); const [pQ, setPQ] = useState(""); const [pFil, setPFil] = useState<Record<string, string>>({}); const [pOrd, setPOrd] = useState<Orden>(null);
  const [iPage, setIPage] = useState(0); const [iQ, setIQ] = useState(""); const [iFil, setIFil] = useState<Record<string, string>>({}); const [iOrd, setIOrd] = useState<Orden>(null);

  const personasQ = useQuery({
    queryKey: ["personas", pPage, pQ, pFil, pOrd], queryFn: () => listarPersonas({ page: pPage, pageSize: PAGE_SIZE, q: pQ, filtros: pFil, orden: pOrd }),
    enabled: tab === "personas", placeholderData: keepPreviousData,
  });
  const insumosQ = useQuery({
    queryKey: ["insumos", iPage, iQ, iFil, iOrd], queryFn: () => listarInsumos({ page: iPage, pageSize: PAGE_SIZE, q: iQ, filtros: iFil, orden: iOrd }),
    enabled: tab === "insumos", placeholderData: keepPreviousData,
  });
  const hospitalesQ = useQuery({ queryKey: ["hospitales"], queryFn: listarHospitales, enabled: tab === "hospitales" });
  const centrosQ = useQuery({ queryKey: ["centros"], queryFn: listarCentros, enabled: tab === "acopio" });
  const areasQ = useQuery({ queryKey: ["areas"], queryFn: areasInsumo, enabled: tab === "insumos" });

  const [sel, setSel] = useState<{ tipo: string; data: any } | null>(null);
  const cerrar = () => setSel(null);
  // Refresh por evento: invalida (no recarga la página).
  const cambiado = () => ["personas", "insumos", "hospitales", "centros"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const dash = (v: any) => (v == null || v === "" ? <span className="text-muted-foreground">—</span> : v);

  const colPersonas: Col[] = [
    { accessorKey: "nombre", header: "Nombre", cell: (c) => <span className="font-medium">{c.getValue() as string}</span> },
    { id: "cedula", sortKey: "cedula", header: "Cédula", accessorFn: (r) => cedulaReal(r.cedula) ?? "", cell: (c) => dash(c.getValue()) },
    { accessorKey: "edad", header: "Edad", cell: (c) => dash(c.getValue()) },
    { accessorKey: "sexo", header: "Sexo", cell: (c) => dash(c.getValue()) },
    { accessorKey: "estado_salud", header: "Estado", cell: (c) => <Pill v={c.getValue() as string} /> },
    { id: "zona", sortKey: "ubicacion", header: "Procedencia", accessorFn: (r) => r.ubicacion ?? "",
      cell: (c) => c.getValue() ? <span className="font-medium whitespace-nowrap">📍 {c.getValue() as string}</span> : dash("") },
    { id: "hospital", header: "Hospital", accessorFn: (r) => r.hospitales?.nombre ?? "", cell: (c) => dash(c.getValue()) },
    { accessorKey: "telefono_contacto", header: "Teléfono", cell: (c) => dash(c.getValue()) },
    { id: "cargado", sortKey: "created_at", header: "Cargado", accessorFn: (r) => r.created_at ?? r.updated_at,
      cell: (c) => <span className="text-xs text-muted-foreground whitespace-nowrap">{hace(c.getValue() as string)}</span> },
  ];
  const colInsumos: Col[] = [
    { accessorKey: "nombre", header: "Insumo", cell: (c) => <span className="font-medium">{c.getValue() as string}</span> },
    { id: "cant", sortKey: "cantidad", header: "Cant.", accessorFn: (r) => `${r.cantidad ?? ""} ${r.unidad ?? ""}`.trim() || "", cell: (c) => dash(c.getValue()) },
    { accessorKey: "presentacion", header: "Tipo", cell: (c) => dash(c.getValue()) },
    { accessorKey: "area", header: "Servicio", cell: (c) => c.getValue() ? <span className="font-medium whitespace-nowrap">{c.getValue() as string}</span> : dash("") },
    { id: "hospital", header: "Hospital", accessorFn: (r) => r.hospitales?.nombre ?? "", cell: (c) => dash(c.getValue()) },
    { accessorKey: "prioridad", header: "Prioridad", cell: (c) => <span className="capitalize">{c.getValue() as string}</span> },
    { accessorKey: "estado", header: "Estado", cell: (c) => <Pill v={c.getValue() as string} /> },
    { id: "cargado", sortKey: "created_at", header: "Solicitado", accessorFn: (r) => r.created_at,
      cell: (c) => <span className="text-xs text-muted-foreground whitespace-nowrap">{hace(c.getValue() as string)}</span> },
  ];
  const colHosp: Col[] = [
    { accessorKey: "nombre", header: "Hospital", cell: (c) => <span className="font-medium">{c.getValue() as string}</span> },
    { accessorKey: "ubicacion", header: "Ubicación", cell: (c) => (c.getValue() as string) ?? "—" },
    { accessorKey: "personas", header: "Personas" },
    { accessorKey: "insumos", header: "Insumos" },
    { accessorKey: "criticos", header: "Críticos", cell: (c) => {
      const n = c.getValue() as number;
      return <span className={`font-semibold ${n > 3 ? "text-red-600" : n > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{n}</span>;
    } },
    { accessorKey: "completitud", header: "% Entregado", cell: (c) => (
      <div className="flex items-center gap-2 w-28"><Progress value={c.getValue() as number} className="h-2" /><span className="text-xs">{c.getValue() as number}%</span></div>
    ) },
  ];
  const colCentros: Col[] = [
    { accessorKey: "nombre", header: "Centro", cell: (c) => <span className="font-medium">{c.getValue() as string}</span> },
    { accessorKey: "zona", header: "Zona", cell: (c) => c.getValue() ? <span className="font-medium whitespace-nowrap">📍 {c.getValue() as string}</span> : dash("") },
    { accessorKey: "recibe", header: "Recibe", cell: (c) => dash(c.getValue()) },
    { id: "necesita", accessorKey: "necesita", header: "Solicita donación",
      cell: (c) => c.getValue() ? <span className="whitespace-nowrap rounded-full bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">🙏 {String(c.getValue()).slice(0, 30)}</span> : dash("") },
    { accessorKey: "horario", header: "Horario", cell: (c) => dash(c.getValue()) },
    { accessorKey: "contacto_nombre", header: "Contacto", cell: (c) => dash(c.getValue()) },
    { accessorKey: "activo", header: "Activo", cell: (c) => (c.getValue() ? "✅" : "—") },
  ];

  // Controles servidor.
  const personasServer: ServerCtl = {
    total: personasQ.data?.total ?? counts.personas, page: pPage, pageSize: PAGE_SIZE, onPage: setPPage,
    q: pQ, onQ: (s) => { setPQ(s); setPPage(0); }, filtros: pFil, onFiltro: (id, v) => { setPFil((f) => ({ ...f, [id]: v })); setPPage(0); },
    orden: { col: pOrd?.col ?? null, dir: pOrd?.dir ?? "asc" }, onOrden: (col, dir) => { setPOrd({ col, dir }); setPPage(0); },
    loading: personasQ.isFetching,
    onExportAll: async () => {
      const { rows } = await listarPersonas({ page: 0, pageSize: 100000, q: pQ, filtros: pFil });
      descargarCSV("personas", [
        { header: "Nombre", valor: (r) => r.nombre }, { header: "Cédula", valor: (r) => cedulaReal(r.cedula) ?? "" },
        { header: "Edad", valor: (r) => r.edad ?? "" }, { header: "Sexo", valor: (r) => r.sexo ?? "" },
        { header: "Estado", valor: (r) => r.estado_salud }, { header: "Procedencia", valor: (r) => r.ubicacion ?? "" },
        { header: "Hospital", valor: (r) => r.hospitales?.nombre ?? "" }, { header: "Teléfono", valor: (r) => r.telefono_contacto ?? "" },
        { header: "Cargado", valor: (r) => r.created_at ?? r.updated_at ?? "" },
      ], rows);
    },
  };
  const insumosServer: ServerCtl = {
    total: insumosQ.data?.total ?? counts.insumos, page: iPage, pageSize: PAGE_SIZE, onPage: setIPage,
    q: iQ, onQ: (s) => { setIQ(s); setIPage(0); }, filtros: iFil, onFiltro: (id, v) => { setIFil((f) => ({ ...f, [id]: v })); setIPage(0); },
    orden: { col: iOrd?.col ?? null, dir: iOrd?.dir ?? "asc" }, onOrden: (col, dir) => { setIOrd({ col, dir }); setIPage(0); },
    loading: insumosQ.isFetching,
    onExportAll: async () => {
      const { rows } = await listarInsumos({ page: 0, pageSize: 100000, q: iQ, filtros: iFil });
      descargarCSV("insumos", [
        { header: "Insumo", valor: (r) => r.nombre }, { header: "Cantidad", valor: (r) => r.cantidad ?? "" },
        { header: "Tipo", valor: (r) => r.presentacion ?? "" }, { header: "Dosis/unidad", valor: (r) => r.unidad ?? "" },
        { header: "Servicio", valor: (r) => r.area ?? "" }, { header: "Hospital", valor: (r) => r.hospitales?.nombre ?? "" },
        { header: "Prioridad", valor: (r) => r.prioridad }, { header: "Estado", valor: (r) => r.estado },
        { header: "Solicitado", valor: (r) => r.created_at ?? "" },
      ], rows);
    },
  };

  return (
    <div className="max-w-6xl mx-auto w-full">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="personas">Personas ({counts.personas})</TabsTrigger>
          <TabsTrigger value="insumos">Insumos ({counts.insumos})</TabsTrigger>
          <TabsTrigger value="hospitales">Hospitales ({counts.hospitales})</TabsTrigger>
          <TabsTrigger value="acopio">Acopio ({centrosQ.data?.length ?? counts.acopio})</TabsTrigger>
        </TabsList>

        <TabsContent value="personas">
          <DataTable columns={colPersonas} data={personasQ.data?.rows ?? []} placeholder="Buscar persona, cédula, zona…"
            facets={[
              { columnId: "estado_salud", label: "Estado", options: ["vivo", "herido", "desaparecido", "fallecido", "desconocido"] },
              { columnId: "sexo", label: "Sexo", options: ["M", "F", "O", "desconocido"] },
            ]}
            onRowClick={(r) => setSel({ tipo: "persona", data: r })} onExport={() => {}} server={personasServer} />
        </TabsContent>

        <TabsContent value="insumos">
          <DataTable columns={colInsumos} data={insumosQ.data?.rows ?? []} placeholder="Buscar insumo, servicio…"
            facets={[
              { columnId: "estado", label: "Estado", options: ["solicitado", "en_transito", "entregado", "cubierto", "cancelado"] },
              { columnId: "prioridad", label: "Prioridad", options: ["baja", "media", "alta", "critica"] },
              ...((areasQ.data?.length ?? 0) ? [{ columnId: "area", label: "Servicio", options: areasQ.data as string[] }] : []),
            ]}
            onRowClick={(r) => setSel({ tipo: "insumo", data: r })} onExport={() => {}} server={insumosServer} />
        </TabsContent>

        <TabsContent value="hospitales">
          <DataTable columns={colHosp} data={hospitalesQ.data ?? []} placeholder="Buscar hospital…"
            onRowClick={(r) => setSel({ tipo: "hospital", data: r })} />
        </TabsContent>

        <TabsContent value="acopio">
          {puede("editar") && (
            <div className="mb-3 flex justify-end">
              <Button onClick={() => setSel({ tipo: "centro", data: {} })}>➕ Nuevo centro</Button>
            </div>
          )}
          <DataTable columns={colCentros} data={centrosQ.data ?? []} placeholder="Buscar centro de acopio, zona…"
            onRowClick={(r) => setSel({ tipo: "centro", data: r })}
            onExport={(rows) => descargarCSV("centros-acopio", [
              { header: "Centro", valor: (r) => r.nombre }, { header: "Zona", valor: (r) => r.zona ?? "" },
              { header: "Dirección", valor: (r) => r.ubicacion ?? "" }, { header: "Recibe", valor: (r) => r.recibe ?? "" },
              { header: "Horario", valor: (r) => r.horario ?? "" }, { header: "Contacto", valor: (r) => r.contacto_nombre ?? "" },
              { header: "Teléfono", valor: (r) => r.contacto_telefono ?? "" },
            ], rows)} />
        </TabsContent>
      </Tabs>

      {sel?.tipo === "persona" && <PersonaDialog id={sel.data.id} onClose={cerrar} onChanged={cambiado} />}
      {sel?.tipo === "insumo" && <InsumoDialog id={sel.data.id} onClose={cerrar} onChanged={cambiado} />}
      {sel?.tipo === "hospital" && <HospitalDialog hospital={sel.data} onClose={cerrar} onChanged={cambiado} />}
      {sel?.tipo === "centro" && <CentroDialog centro={sel.data} onClose={cerrar} onChanged={cambiado} />}
    </div>
  );
}
