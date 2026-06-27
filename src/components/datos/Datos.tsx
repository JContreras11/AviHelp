"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useRol } from "@/lib/rol";
import { DataTable } from "./DataTable";
import { PersonaDialog, InsumoDialog, HospitalDialog, CentroDialog } from "./Detalle";
import { cedulaReal, hace, descargarCSV } from "@/lib/format";

const TABS = ["personas", "insumos", "hospitales", "acopio"];

const PILL: Record<string, string> = {
  herido: "bg-amber-100 text-amber-800", desaparecido: "bg-red-100 text-red-700",
  detenido: "bg-purple-100 text-purple-700", fallecido: "bg-gray-200 text-gray-700",
  vivo: "bg-green-100 text-green-700", desconocido: "bg-muted text-muted-foreground",
  solicitado: "bg-blue-100 text-blue-700", en_transito: "bg-amber-100 text-amber-800",
  entregado: "bg-green-100 text-green-700", cubierto: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-gray-200 text-gray-600",
};
const Pill = ({ v }: { v: string }) => (
  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${PILL[v] ?? "bg-muted"}`}>{v?.replace("_", " ")}</span>
);

export function Datos({ personas, insumos, hospitales, centros }: { personas: any[]; insumos: any[]; hospitales: any[]; centros: any[] }) {
  const router = useRouter();
  const { puede } = useRol();
  const verInicial = useSearchParams().get("ver");
  const [tab, setTab] = useState(TABS.includes(verInicial ?? "") ? (verInicial as string) : "personas");
  // Las tarjetas del home cambian de tab por evento (sin recargar el servidor).
  useEffect(() => {
    const h = (e: Event) => setTab((e as CustomEvent).detail);
    window.addEventListener("avi-ver", h);
    return () => window.removeEventListener("avi-ver", h);
  }, []);
  const [sel, setSel] = useState<{ tipo: string; data: any } | null>(null);
  const cerrar = () => setSel(null);
  const cambiado = () => router.refresh();

  const areasInsumos = [...new Set(insumos.map((i) => i.area).filter(Boolean) as string[])].sort();
  const dash = (v: any) => (v == null || v === "" ? <span className="text-muted-foreground">—</span> : v);
  const colPersonas: ColumnDef<any>[] = [
    { accessorKey: "nombre", header: "Nombre", cell: (c) => <span className="font-medium">{c.getValue() as string}</span> },
    { id: "cedula", header: "Cédula", accessorFn: (r) => cedulaReal(r.cedula) ?? "", cell: (c) => dash(c.getValue()) },
    { accessorKey: "edad", header: "Edad", cell: (c) => dash(c.getValue()) },
    { accessorKey: "sexo", header: "Sexo", cell: (c) => dash(c.getValue()) },
    { accessorKey: "estado_salud", header: "Estado", filterFn: "equalsString", cell: (c) => <Pill v={c.getValue() as string} /> },
    { id: "zona", header: "Zona / ubicación", accessorFn: (r) => r.ubicacion ?? "",
      cell: (c) => c.getValue() ? <span className="font-medium whitespace-nowrap">📍 {c.getValue() as string}</span> : dash("") },
    { id: "hospital", header: "Hospital", accessorFn: (r) => r.hospitales?.nombre ?? "", cell: (c) => dash(c.getValue()) },
    { accessorKey: "telefono_contacto", header: "Teléfono", cell: (c) => dash(c.getValue()) },
    { id: "cargado", header: "Cargado", accessorFn: (r) => r.created_at ?? r.updated_at,
      sortingFn: "datetime", cell: (c) => <span className="text-xs text-muted-foreground whitespace-nowrap">{hace(c.getValue() as string)}</span> },
  ];
  const colInsumos: ColumnDef<any>[] = [
    { accessorKey: "nombre", header: "Insumo", cell: (c) => <span className="font-medium">{c.getValue() as string}</span> },
    { id: "cant", header: "Cant.", accessorFn: (r) => `${r.cantidad ?? ""} ${r.unidad ?? ""}`.trim() || "", cell: (c) => dash(c.getValue()) },
    { accessorKey: "presentacion", header: "Tipo", cell: (c) => dash(c.getValue()) },
    { accessorKey: "area", header: "Servicio", filterFn: "equalsString",
      cell: (c) => c.getValue() ? <span className="font-medium whitespace-nowrap">{c.getValue() as string}</span> : dash("") },
    { id: "hospital", header: "Hospital", accessorFn: (r) => r.hospitales?.nombre ?? "", cell: (c) => dash(c.getValue()) },
    { accessorKey: "prioridad", header: "Prioridad", filterFn: "equalsString", cell: (c) => <span className="capitalize">{c.getValue() as string}</span> },
    { accessorKey: "estado", header: "Estado", filterFn: "equalsString", cell: (c) => <Pill v={c.getValue() as string} /> },
    { id: "cargado", header: "Solicitado", accessorFn: (r) => r.created_at, sortingFn: "datetime",
      cell: (c) => <span className="text-xs text-muted-foreground whitespace-nowrap">{hace(c.getValue() as string)}</span> },
  ];
  const colHosp: ColumnDef<any>[] = [
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
  const colCentros: ColumnDef<any>[] = [
    { accessorKey: "nombre", header: "Centro", cell: (c) => <span className="font-medium">{c.getValue() as string}</span> },
    { accessorKey: "zona", header: "Zona", cell: (c) => c.getValue() ? <span className="font-medium whitespace-nowrap">📍 {c.getValue() as string}</span> : dash("") },
    { accessorKey: "recibe", header: "Recibe", cell: (c) => dash(c.getValue()) },
    { accessorKey: "horario", header: "Horario", cell: (c) => dash(c.getValue()) },
    { accessorKey: "contacto_nombre", header: "Contacto", cell: (c) => dash(c.getValue()) },
    { accessorKey: "activo", header: "Activo", cell: (c) => (c.getValue() ? "✅" : "—") },
  ];

  return (
    <div className="max-w-6xl mx-auto w-full">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="personas">Personas ({personas.length})</TabsTrigger>
          <TabsTrigger value="insumos">Insumos ({insumos.length})</TabsTrigger>
          <TabsTrigger value="hospitales">Hospitales ({hospitales.length})</TabsTrigger>
          <TabsTrigger value="acopio">Acopio ({centros.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="personas">
          <DataTable columns={colPersonas} data={personas} placeholder="Buscar persona, cédula, hospital…"
            facets={[{ columnId: "estado_salud", label: "Estado", options: ["vivo", "herido", "desaparecido", "detenido", "fallecido", "desconocido"] }]}
            onRowClick={(r) => setSel({ tipo: "persona", data: r })}
            onExport={(rows) => descargarCSV("personas", [
              { header: "Nombre", valor: (r) => r.nombre },
              { header: "Cédula", valor: (r) => cedulaReal(r.cedula) ?? "" },
              { header: "Edad", valor: (r) => r.edad ?? "" },
              { header: "Sexo", valor: (r) => r.sexo ?? "" },
              { header: "Estado", valor: (r) => r.estado_salud },
              { header: "Zona/ubicación", valor: (r) => r.ubicacion ?? "" },
              { header: "Hospital", valor: (r) => r.hospitales?.nombre ?? "" },
              { header: "Teléfono", valor: (r) => r.telefono_contacto ?? "" },
              { header: "Cargado", valor: (r) => r.created_at ?? r.updated_at ?? "" },
            ], rows)} />
        </TabsContent>
        <TabsContent value="insumos">
          <DataTable columns={colInsumos} data={insumos} placeholder="Buscar insumo, área, hospital…"
            facets={[
              { columnId: "estado", label: "Estado", options: ["solicitado", "en_transito", "entregado", "cubierto", "cancelado"] },
              { columnId: "prioridad", label: "Prioridad", options: ["baja", "media", "alta", "critica"] },
              ...(areasInsumos.length ? [{ columnId: "area", label: "Servicio", options: areasInsumos }] : []),
            ]}
            onRowClick={(r) => setSel({ tipo: "insumo", data: r })}
            onExport={(rows) => descargarCSV("insumos", [
              { header: "Insumo", valor: (r) => r.nombre },
              { header: "Cantidad", valor: (r) => r.cantidad ?? "" },
              { header: "Tipo", valor: (r) => r.presentacion ?? "" },
              { header: "Dosis/unidad", valor: (r) => r.unidad ?? "" },
              { header: "Servicio", valor: (r) => r.area ?? "" },
              { header: "Hospital", valor: (r) => r.hospitales?.nombre ?? "" },
              { header: "Prioridad", valor: (r) => r.prioridad },
              { header: "Estado", valor: (r) => r.estado },
              { header: "Solicitado", valor: (r) => r.created_at ?? "" },
            ], rows)} />
        </TabsContent>
        <TabsContent value="hospitales">
          <DataTable columns={colHosp} data={hospitales} placeholder="Buscar hospital…"
            onRowClick={(r) => setSel({ tipo: "hospital", data: r })} />
        </TabsContent>
        <TabsContent value="acopio">
          {puede("editar") && (
            <div className="mb-3 flex justify-end">
              <Button onClick={() => setSel({ tipo: "centro", data: {} })}>➕ Nuevo centro</Button>
            </div>
          )}
          <DataTable columns={colCentros} data={centros} placeholder="Buscar centro de acopio, zona…"
            onRowClick={(r) => setSel({ tipo: "centro", data: r })}
            onExport={(rows) => descargarCSV("centros-acopio", [
              { header: "Centro", valor: (r) => r.nombre },
              { header: "Zona", valor: (r) => r.zona ?? "" },
              { header: "Dirección", valor: (r) => r.ubicacion ?? "" },
              { header: "Recibe", valor: (r) => r.recibe ?? "" },
              { header: "Horario", valor: (r) => r.horario ?? "" },
              { header: "Contacto", valor: (r) => r.contacto_nombre ?? "" },
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
