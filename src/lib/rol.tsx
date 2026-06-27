"use client";

import { createContext, useContext } from "react";

export type Rol = "admin" | "medico" | "voluntario" | "ong" | "publico";

// Permisos por rol. El rol viene del perfil del usuario autenticado (no editable en UI).
const PERMISOS: Record<Rol, Set<string>> = {
  admin:      new Set(["ver", "editar", "eliminar", "donar", "tracking", "cubrir", "contacto", "panel"]),
  medico:     new Set(["ver", "editar", "tracking", "cubrir", "contacto", "panel"]),
  voluntario: new Set(["ver", "editar", "tracking", "cubrir"]),
  ong:        new Set(["ver", "donar", "tracking", "panel"]),
  publico:    new Set(["ver", "donar"]),
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
