"use client";

import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PersonaDialog } from "@/components/datos/Detalle";
import { listarPersonas } from "@/app/actions/listas";
import { hace } from "@/lib/format";

const PILL: Record<string, string> = {
  herido: "bg-amber-100 text-amber-800", desaparecido: "bg-red-100 text-red-700",
  fallecido: "bg-gray-200 text-gray-700",
  vivo: "bg-green-100 text-green-700", desconocido: "bg-muted text-muted-foreground",
};
const Pill = ({ v }: { v: string }) => (
  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize shrink-0 ${PILL[v] ?? "bg-muted"}`}>
    {v?.replace("_", " ")}
  </span>
);

// Drill-down desde el dashboard: lista las personas de un hospital con búsqueda
// y abre PersonaDialog para ver/editar estado (alta/fallecido/herido…) rápido.
export function HospitalPersonasDialog({
  hospital,
  onClose,
}: {
  hospital: { id: string; nombre: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);

  const personasQ = useQuery({
    queryKey: ["hospital-personas", hospital.id, q],
    queryFn: () => listarPersonas({ page: 0, pageSize: 100, q, filtros: { hospital_id: hospital.id } }),
    placeholderData: keepPreviousData,
  });

  // Tras editar/guardar en PersonaDialog: invalida esta lista y las del resto (no recarga página).
  const cambiado = () =>
    ["hospital-personas", "personas"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const rows = personasQ.data?.rows ?? [];
  const total = personasQ.data?.total ?? 0;

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[88vh] overflow-hidden flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl pr-8">🏥 {hospital.nombre} — personas</DialogTitle>
          </DialogHeader>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, cédula, procedencia…"
            className="h-11 text-base"
          />
          <div className="flex-1 overflow-auto -mx-1 px-1">
            {personasQ.isLoading ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Cargando…</p>
            ) : rows.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                {q ? "Sin coincidencias." : "Este hospital no tiene personas registradas."}
              </p>
            ) : (
              <ul className="divide-y">
                {rows.map((p: any) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelId(p.id)}
                      className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/50 rounded-lg px-2 -mx-1"
                    >
                      <span className="min-w-0">
                        <span className="font-medium block truncate">{p.nombre || "Sin nombre"}</span>
                        <span className="text-xs text-muted-foreground">
                          {[p.edad ? `${p.edad} años` : null, p.sexo === "M" || p.sexo === "F" ? p.sexo : null, p.ubicacion]
                            .filter(Boolean)
                            .join(" · ") || `Cargado ${hace(p.created_at ?? p.updated_at)}`}
                        </span>
                      </span>
                      <Pill v={p.estado_salud} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center pt-1">
            {total > rows.length ? `Mostrando ${rows.length} de ${total}. Afina la búsqueda.` : `${total} ${total === 1 ? "persona" : "personas"}`}
          </p>
        </DialogContent>
      </Dialog>
      {selId && <PersonaDialog id={selId} onClose={() => setSelId(null)} onChanged={cambiado} />}
    </>
  );
}

export default HospitalPersonasDialog;
