"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Rol = "admin" | "voluntario" | "ong" | "publico";

// Permisos por rol. MVP sin auth real: el rol vive en localStorage (cambiar a auth real luego).
const PERMISOS: Record<Rol, Set<string>> = {
  admin: new Set(["ver", "editar", "eliminar", "donar", "tracking", "cubrir", "contacto", "panel"]),
  voluntario: new Set(["ver", "editar", "tracking", "cubrir", "contacto"]),
  ong: new Set(["ver", "donar", "tracking", "panel"]),
  publico: new Set(["ver", "donar"]),
};

export const ROLES: { id: Rol; label: string; emoji: string }[] = [
  { id: "admin", label: "Admin", emoji: "🛡️" },
  { id: "voluntario", label: "Voluntario", emoji: "🙋" },
  { id: "ong", label: "ONG / Donante", emoji: "🤝" },
  { id: "publico", label: "Público", emoji: "👁️" },
];

const Ctx = createContext<{ rol: Rol; setRol: (r: Rol) => void; puede: (a: string) => boolean }>({
  rol: "admin", setRol: () => {}, puede: () => true,
});

export function RolProvider({ children }: { children: React.ReactNode }) {
  const [rol, setRolState] = useState<Rol>("admin");
  useEffect(() => {
    const r = localStorage.getItem("avihelp-rol") as Rol | null;
    if (r && PERMISOS[r]) setRolState(r);
  }, []);
  const setRol = (r: Rol) => { setRolState(r); localStorage.setItem("avihelp-rol", r); };
  const puede = (a: string) => PERMISOS[rol].has(a);
  return <Ctx.Provider value={{ rol, setRol, puede }}>{children}</Ctx.Provider>;
}

export const useRol = () => useContext(Ctx);
