"use client";

import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

// Institución (hospital / clínica / refugio) que se puede elegir o crear.
export type HospitalOpt = { id: string; nombre: string; tipo: string };

// Forma del hospital dentro del documento analizado: id (existente) o id=null+nombre (a crear).
export type HospFiltro = { id?: string | null; nombre: string | null; ubicacion: string | null } | null;

const sufijo = (t: string) => (t === "clinica" ? " (clínica)" : t === "refugio" ? " (refugio)" : "");

export function hospitalOptions(hospitales: HospitalOpt[]): SearchableOption[] {
  return hospitales.map((h) => ({ value: h.id, label: `${h.nombre}${sufijo(h.tipo)}`, keywords: h.nombre }));
}

// Selector de institución BUSCABLE con "crear nueva". Sustituye al <select> nativo (que no
// permitía elegir hospital). Sirve para la tarjeta individual y para el asignador global.
export function HospitalSelect({
  hospitales,
  value,
  onChange,
  placeholder = "— Ninguna —",
  className,
}: {
  hospitales: HospitalOpt[];
  value: HospFiltro;
  onChange: (h: HospFiltro) => void;
  placeholder?: string;
  className?: string;
}) {
  const opts = hospitalOptions(hospitales);
  // Institución NUEVA pendiente (id null + nombre, p.ej. detectada por IA y aún sin crear):
  // se añade como opción sintética para que se vea seleccionada en el botón.
  const esNueva = !!value && value.id == null && !!value.nombre;
  const options = esNueva
    ? [...opts, { value: "__nuevo__", label: `➕ ${value!.nombre} (nueva)`, keywords: value!.nombre ?? "" }]
    : opts;
  const selected = value?.id ?? (esNueva ? "__nuevo__" : null);

  return (
    <SearchableSelect
      className={className}
      options={options}
      value={selected}
      onChange={(v) => {
        if (!v) { onChange(null); return; }
        if (v === "__nuevo__") return; // ya es la institución nueva en curso
        const h = hospitales.find((x) => x.id === v);
        onChange({ id: v, nombre: h?.nombre ?? "", ubicacion: value?.ubicacion ?? null });
      }}
      onCreate={(q) => onChange({ id: null, nombre: q, ubicacion: value?.ubicacion ?? null })}
      allowCreate
      createLabel={(q) => `➕ Crear institución “${q}”`}
      placeholder={placeholder}
    />
  );
}
