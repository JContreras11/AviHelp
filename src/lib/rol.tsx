"use client";

import { createContext, useContext } from "react";

export type Rol = "admin" | "medico" | "voluntario" | "ong" | "publico";

// Permisos por rol. El rol viene del perfil del usuario autenticado (no editable en UI).
// "cargar" = subir documentos (solo responsables/representantes verificados de hospitales).
// "personas" = ver la lista de pacientes (oculta al público por seguridad).
// NO existe "donar": AviHelp es un puente de comunicación, no procesa donaciones.
const PERMISOS: Record<Rol, Set<string>> = {
  admin:      new Set(["ver", "editar", "eliminar", "tracking", "cubrir", "contacto", "panel", "cargar", "personas"]),
  medico:     new Set(["ver", "editar", "tracking", "cubrir", "contacto", "panel", "cargar", "personas"]),
  voluntario: new Set(["ver", "editar", "tracking", "cubrir", "cargar", "personas"]),
  ong:        new Set(["ver", "tracking", "panel"]),
  publico:    new Set(["ver"]),
};

export type Sesion = { rol: Rol; email: string | null; nombre: string | null };

const Ctx = createContext<{ rol: Rol; email: string | null; nombre: string | null; puede: (a: string) => boolean }>({
  rol: "publico", email: null, nombre: null, puede: () => false,
});

export function RolProvider({ sesion, children }: { sesion: Sesion; children: React.ReactNode }) {
  const rol = PERMISOS[sesion.rol] ? sesion.rol : "publico";
  const puede = (a: string) => PERMISOS[rol].has(a);
  return <Ctx.Provider value={{ rol, email: sesion.email, nombre: sesion.nombre, puede }}>{children}</Ctx.Provider>;
}

export const useRol = () => useContext(Ctx);
