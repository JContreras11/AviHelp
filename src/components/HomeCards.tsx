"use client";

import { useRol } from "@/lib/rol";

type Counts = { hospitales: number; insumos: number; personas: number; acopio: number };

const CARDS = {
  personas:   { ver: "personas",   emoji: "🔍", titulo: "Buscar / Reportar Personas", desc: "Desaparecidos y encontrados", color: "from-red-500/15 to-red-500/5 ring-red-500/20" },
  hospitales: { ver: "hospitales", emoji: "🏥", titulo: "Lista de Hospitales",        desc: "Estado y necesidades",        color: "from-primary/15 to-primary/5 ring-primary/20" },
  insumos:    { ver: "insumos",    emoji: "💊", titulo: "Insumos y Requerimientos",   desc: "Qué se necesita y dónde",     color: "from-amber-500/15 to-amber-500/5 ring-amber-500/20" },
  acopio:     { ver: "acopio",     emoji: "📦", titulo: "Centros de Acopio",          desc: "Dónde entregar ayuda",        color: "from-emerald-500/15 to-emerald-500/5 ring-emerald-500/20" },
} as const;

// Orden/énfasis del home según el rol del usuario autenticado.
const ORDEN: Record<string, (keyof typeof CARDS)[]> = {
  admin:      ["insumos", "hospitales", "personas", "acopio"],
  medico:     ["insumos", "hospitales", "personas", "acopio"],
  voluntario: ["insumos", "acopio", "hospitales", "personas"],
  ong:        ["acopio", "insumos", "hospitales", "personas"],
  publico:    ["personas", "hospitales", "acopio", "insumos"],
};

export function HomeCards({ counts }: { counts: Counts }) {
  const { rol, puede } = useRol();
  let orden = ORDEN[rol] ?? ORDEN.publico;
  if (!puede("personas")) orden = orden.filter((k) => k !== "personas"); // lista de pacientes oculta al público

  function ir(ver: string) {
    window.dispatchEvent(new CustomEvent("avi-ver", { detail: ver }));
    document.getElementById("datos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4">
      {orden.map((k) => {
        const c = CARDS[k];
        return (
          <button
            key={k}
            onClick={() => ir(c.ver)}
            className={`flex flex-col items-start gap-1 rounded-2xl bg-gradient-to-br ring-1 p-4 sm:p-6 text-left transition active:scale-[0.98] hover:shadow-md ${c.color}`}
          >
            <span className="text-3xl sm:text-4xl">{c.emoji}</span>
            <span className="text-base sm:text-lg font-bold leading-tight">{c.titulo}</span>
            <span className="text-xs text-muted-foreground">{c.desc}</span>
            <span className="mt-1 text-sm font-semibold">{counts[k]}</span>
          </button>
        );
      })}
    </div>
  );
}
