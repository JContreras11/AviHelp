"use client";

import { useState } from "react";
import { ArrowUpRight, User, Pill, Building2, Package } from "lucide-react";
import { toast } from "sonner";
import { useRol } from "@/lib/rol";
import { PersonaDialog, InsumoDialog, HospitalDialog, CentroDialog } from "@/components/datos/Detalle";

export type ResultadoChat = {
  tipo: "persona" | "insumo" | "hospital" | "centro" | "externo";
  id?: string; titulo: string; estado?: string | null; sub?: string | null; foto?: string | null; url?: string | null;
};

const PILL: Record<string, string> = {
  herido: "bg-amber-100 text-amber-800", desaparecido: "bg-red-100 text-red-700", fallecido: "bg-gray-200 text-gray-700",
  vivo: "bg-green-100 text-green-700", desconocido: "bg-muted text-muted-foreground",
  solicitado: "bg-blue-100 text-blue-700", en_transito: "bg-amber-100 text-amber-800",
  entregado: "bg-green-100 text-green-700", cubierto: "bg-emerald-100 text-emerald-700", cancelado: "bg-gray-200 text-gray-600",
  externo: "bg-violet-100 text-violet-700",
};
const ICONO = { persona: User, insumo: Pill, hospital: Building2, centro: Package, externo: User } as const;
const TINTE = { persona: "bg-rose-100 text-rose-500", insumo: "bg-amber-100 text-amber-600", hospital: "bg-primary/10 text-primary", centro: "bg-emerald-100 text-emerald-600", externo: "bg-violet-100 text-violet-600" } as const;

export function ResultadoCards({ resultados }: { resultados: ResultadoChat[] }) {
  const { puede, rol } = useRol();
  const [sel, setSel] = useState<ResultadoChat | null>(null);
  const cerrar = () => setSel(null);

  function abrir(r: ResultadoChat) {
    if (r.tipo === "externo") { if (r.url) window.open(r.url, "_blank", "noreferrer"); return; }
    if (!r.id) return;
    // Detalle de paciente = sensible: solo personal autorizado.
    if (r.tipo === "persona" && !(rol === "admin" || puede("personas"))) {
      toast.info("Inicia sesión como personal autorizado para ver el detalle del paciente.");
      return;
    }
    setSel(r);
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {resultados.map((r, i) => {
        const Icon = ICONO[r.tipo] ?? User;
        return (
          <button key={i} onClick={() => abrir(r)} style={{ animationDelay: `${i * 60}ms` }}
            className="group w-full flex items-center gap-3 rounded-xl border bg-card p-2.5 text-left transition hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
            {r.foto
              ? <img src={r.foto} alt="" className="size-11 rounded-lg object-cover shrink-0 ring-1 ring-border" />
              : <span className={`grid place-items-center size-11 rounded-lg shrink-0 ${TINTE[r.tipo]}`}><Icon className="size-5" /></span>}
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate leading-tight">{r.titulo}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs min-w-0">
                {r.estado && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize shrink-0 ${PILL[r.estado] ?? "bg-muted"}`}>{String(r.estado).replace("_", " ")}</span>}
                {r.sub && <span className="text-muted-foreground truncate">{r.estado ? "— " : ""}{r.sub}</span>}
              </p>
            </div>
            <ArrowUpRight className="size-4 text-muted-foreground shrink-0 transition group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        );
      })}

      {sel?.tipo === "persona" && sel.id && <PersonaDialog id={sel.id} onClose={cerrar} onChanged={() => {}} />}
      {sel?.tipo === "insumo" && sel.id && <InsumoDialog id={sel.id} onClose={cerrar} onChanged={() => {}} />}
      {sel?.tipo === "hospital" && sel.id && <HospitalDialog hospital={{ id: sel.id, nombre: sel.titulo }} onClose={cerrar} />}
      {sel?.tipo === "centro" && sel.id && <CentroDialog centro={{ id: sel.id, nombre: sel.titulo, zona: sel.sub }} onClose={cerrar} />}
    </div>
  );
}
