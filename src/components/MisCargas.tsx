"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Img } from "@/components/Img";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonaDialog, InsumoDialog } from "@/components/datos/Detalle";
import { misCargas, type CargaConEntidades } from "@/app/actions/cargas";
import { crearPersona } from "@/app/actions/crud";
import { hace } from "@/lib/format";

// Etiqueta + emoji por tipo de documento (de la IA).
const TIPO: Record<string, { icon: string; label: string }> = {
  cedula: { icon: "🪪", label: "Cédula" },
  lista_pacientes: { icon: "🧑‍🤝‍🧑", label: "Lista de pacientes" },
  cartel_desaparecidos: { icon: "📋", label: "Desaparecidos" },
  lista_estado: { icon: "📝", label: "Lista de personas" },
  lista_insumos: { icon: "📦", label: "Insumos" },
  otro: { icon: "📄", label: "Documento" },
};
const PERSONA_TIPOS = ["cedula", "lista_pacientes", "cartel_desaparecidos", "lista_estado"];

const PILL: Record<string, string> = {
  herido: "bg-amber-100 text-amber-800", desaparecido: "bg-red-100 text-red-700",
  fallecido: "bg-gray-200 text-gray-700", vivo: "bg-green-100 text-green-700",
  desconocido: "bg-muted text-muted-foreground",
  solicitado: "bg-blue-100 text-blue-700", en_transito: "bg-amber-100 text-amber-800",
  entregado: "bg-green-100 text-green-700", cubierto: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-gray-200 text-gray-600",
};
const Pill = ({ v }: { v: string }) => (
  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${PILL[v] ?? "bg-muted"}`}>{v?.replace("_", " ")}</span>
);

export function MisCargas({ inicial }: { inicial: CargaConEntidades[] }) {
  const qc = useQueryClient();
  const { data: cargas = [] } = useQuery({ queryKey: ["mis-cargas"], queryFn: misCargas, initialData: inicial });
  const refrescar = () => qc.invalidateQueries({ queryKey: ["mis-cargas"] });

  const [sel, setSel] = useState<{ tipo: "persona" | "insumo"; id: string } | null>(null);
  const [addCarga, setAddCarga] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function anadirPersona(cargaId: string) {
    const n = nombre.trim();
    if (!n) return;
    setGuardando(true);
    const r = await crearPersona(cargaId, { nombre: n });
    setGuardando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    setNombre(""); setAddCarga(null);
    refrescar();
    toast.success("Persona añadida");
    setSel({ tipo: "persona", id: (r as any).persona.id }); // abre para completar el resto
  }

  if (cargas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
        <div className="text-4xl mb-2">📭</div>
        <p className="font-medium">Aún no has subido nada</p>
        <p className="text-sm mt-1">Cuando cargues una foto, lista o nota de voz, aparecerá aquí con lo que la IA extrajo.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cargas.map((c) => {
          const t = TIPO[c.tipo ?? "otro"] ?? TIPO.otro;
          const esPersonas = c.personas.length > 0 || PERSONA_TIPOS.includes(c.tipo ?? "");
          const esInsumos = c.insumos.length > 0 || c.tipo === "lista_insumos";
          return (
            <div key={c.id} className="rounded-2xl border bg-card overflow-hidden flex flex-col sm:flex-row">
              {/* Imagen (zoom al tocar) o placeholder para voz/texto. */}
              <div className="sm:w-40 shrink-0 bg-muted/40 flex items-center justify-center p-3">
                {c.foto ? (
                  <Img src={c.foto} className="w-full sm:w-auto max-h-48 sm:max-h-40 rounded-xl object-cover cursor-zoom-in" />
                ) : (
                  <div className="text-5xl py-6" aria-hidden>{t.icon}</div>
                )}
              </div>

              {/* Info extraída. */}
              <div className="flex-1 min-w-0 p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{t.icon} {t.label}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{hace(c.created_at)}</span>
                </div>
                {c.hospitales?.nombre && (
                  <p className="text-sm">🏥 {c.hospitales.nombre}{c.hospitales.ubicacion ? ` · ${c.hospitales.ubicacion}` : ""}</p>
                )}
                {c.resumen && <p className="text-xs text-muted-foreground">{c.resumen}</p>}

                {esInsumos && (
                  <div className="flex flex-col gap-1">
                    {c.insumos.length === 0 && <p className="text-xs text-muted-foreground">Sin insumos guardados.</p>}
                    {c.insumos.map((i: any) => (
                      <button key={i.id} onClick={() => setSel({ tipo: "insumo", id: i.id })}
                        className="flex items-center justify-between gap-2 text-left text-sm rounded-lg border px-2 py-1.5 hover:bg-muted/50">
                        <span className="min-w-0 truncate">
                          {i.nombre}{i.cantidad ? ` · ${i.cantidad}${i.unidad ? " " + i.unidad : ""}` : ""}
                          {i.area ? <span className="text-muted-foreground"> · {i.area}</span> : null}
                        </span>
                        <Pill v={i.estado} />
                      </button>
                    ))}
                  </div>
                )}

                {esPersonas && (
                  <div className="flex flex-col gap-1">
                    {c.personas.map((p: any) => (
                      <button key={p.id} onClick={() => setSel({ tipo: "persona", id: p.id })}
                        className="flex items-center justify-between gap-2 text-left text-sm rounded-lg border px-2 py-1.5 hover:bg-muted/50">
                        <span className="min-w-0 truncate">
                          {p.nombre}{p.edad ? ` · ${p.edad}a` : ""}{p.cedula ? <span className="text-muted-foreground"> · {p.cedula}</span> : null}
                        </span>
                        <Pill v={p.estado_salud} />
                      </button>
                    ))}
                    {addCarga === c.id ? (
                      <div className="flex gap-2 mt-1">
                        <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la persona"
                          onKeyDown={(e) => e.key === "Enter" && anadirPersona(c.id)} className="h-9 text-sm" />
                        <Button size="sm" disabled={guardando || !nombre.trim()} onClick={() => anadirPersona(c.id)}>Añadir</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAddCarga(null); setNombre(""); }}>✕</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="self-start mt-1" onClick={() => { setAddCarga(c.id); setNombre(""); }}>
                        ➕ Añadir persona
                      </Button>
                    )}
                  </div>
                )}

                {!esPersonas && !esInsumos && c.contexto && (
                  <p className="text-sm whitespace-pre-wrap">{c.contexto}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sel?.tipo === "persona" && <PersonaDialog id={sel.id} onClose={() => setSel(null)} onChanged={refrescar} />}
      {sel?.tipo === "insumo" && <InsumoDialog id={sel.id} onClose={() => setSel(null)} onChanged={refrescar} />}
    </>
  );
}
