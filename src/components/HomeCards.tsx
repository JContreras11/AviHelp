"use client";

import Link from "next/link";
import { useRol } from "@/lib/rol";

type Counts = { hospitales: number; insumos: number; personas: number; acopio: number };

const CARDS = {
  hospitales: { ver: "hospitales", emoji: "🏥", titulo: "Lista de Hospitales",        desc: "Estado y necesidades",        color: "from-primary/15 to-primary/5 ring-primary/20" },
  insumos:    { ver: "insumos",    emoji: "💊", titulo: "Insumos y Requerimientos",   desc: "Qué se necesita y dónde",     color: "from-amber-500/15 to-amber-500/5 ring-amber-500/20" },
  acopio:     { ver: "acopio",     emoji: "📦", titulo: "Centros de Acopio",          desc: "Dónde entregar ayuda",        color: "from-emerald-500/15 to-emerald-500/5 ring-emerald-500/20" },
} as const;

// Orden/énfasis del home según el rol del usuario autenticado.
const ORDEN: Record<string, (keyof typeof CARDS)[]> = {
  admin:      ["insumos", "hospitales", "acopio"],
  medico:     ["insumos", "hospitales", "acopio"],
  voluntario: ["insumos", "acopio", "hospitales"],
  ong:        ["acopio", "insumos", "hospitales"],
  publico:    ["hospitales", "acopio", "insumos"],
};

export function HomeCards({ counts }: { counts: Counts }) {
  const { rol } = useRol();
  const orden = ORDEN[rol] ?? ORDEN.publico;

  function ir(ver: string) {
    window.dispatchEvent(new CustomEvent("avi-ver", { detail: ver }));
    document.getElementById("datos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4">
      <Link
        href="/refugios"
        className="flex flex-col items-start gap-1 rounded-2xl bg-gradient-to-br ring-1 p-4 sm:p-6 text-left transition active:scale-[0.98] hover:shadow-md from-sky-500/15 to-sky-500/5 ring-sky-500/20"
      >
        <span className="text-3xl sm:text-4xl">🏠</span>
        <span className="text-base sm:text-lg font-bold leading-tight">Refugios La Guaira</span>
        <span className="text-xs text-muted-foreground">Ubicaciones y cómo llegar</span>
      </Link>
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
