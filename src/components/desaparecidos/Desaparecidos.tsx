"use client";

import { useState, useMemo } from "react";
import { Img } from "@/components/Img";

type Persona = {
  id: string; nombre: string; edad: number | null; sexo: string | null;
  ubicacion: string | null; descripcion_fisica: string | null;
  telefono_contacto: string | null; contacto_nombre: string | null;
  fotos: string[] | null; created_at: string | null;
};

// Búsqueda flexible: sin acentos, minúsculas, multi-palabra.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Desaparecidos({ personas }: { personas: Persona[] }) {
  const [q, setQ] = useState("");
  const filtrados = useMemo(() => {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return personas;
    return personas.filter((p) => {
      const t = norm(`${p.nombre} ${p.ubicacion ?? ""} ${p.descripcion_fisica ?? ""}`);
      return toks.every((x) => t.includes(x));
    });
  }, [q, personas]);

  return (
    <>
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="🔎 Buscar por nombre, zona, descripción…"
        className="w-full h-11 px-3 mb-4 rounded-xl border bg-background text-base"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filtrados.map((p) => (
          <div key={p.id} className="rounded-2xl border bg-card overflow-hidden flex flex-col">
            <div className="aspect-square bg-muted grid place-items-center overflow-hidden">
              {p.fotos?.[0]
                ? <Img src={p.fotos[0]} className="w-full h-full object-cover" />
                : <span className="text-4xl text-muted-foreground">👤</span>}
            </div>
            <div className="p-3 flex flex-col gap-1 flex-1">
              <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Desaparecido</span>
              <p className="font-semibold leading-tight">{p.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {[p.edad ? `${p.edad} años` : null, p.sexo].filter(Boolean).join(" · ")}
              </p>
              {p.ubicacion && <p className="text-xs text-muted-foreground">📍 {p.ubicacion}</p>}
              {p.descripcion_fisica && <p className="text-xs text-muted-foreground line-clamp-2">{p.descripcion_fisica}</p>}
              {p.telefono_contacto && (
                <a href={`tel:${p.telefono_contacto}`} className="mt-auto pt-2 text-sm text-center rounded-lg bg-primary text-primary-foreground py-1.5 font-medium">
                  📞 Tengo información
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      {filtrados.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {personas.length === 0 ? "No hay personas reportadas como desaparecidas todavía." : `Sin resultados para “${q}”.`}
        </p>
      )}
    </>
  );
}
