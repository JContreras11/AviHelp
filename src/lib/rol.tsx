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

export type Sesion = { rol: Rol; email: string | null; nombre: string | null; hospitalIds?: string[]; centroIds?: string[]; impersonando?: boolean };

type CtxV = {
  rol: Rol; email: string | null; nombre: string | null;
  impersonando: boolean; // un admin está "viendo como" este usuario
  puede: (a: string) => boolean;
  // ¿Gestiona esta institución? admin=siempre; resto=solo si es miembro. (Escritura real se valida en el servidor.)
  gestiona: (hospitalId?: string | null, centroId?: string | null) => boolean;
  donante: boolean; // miembro de algún centro/ONG (o admin): puede registrar donaciones
  coordinador: boolean; // admin o miembro de algún hospital: ve el triage logístico
};
const Ctx = createContext<CtxV>({
  rol: "publico", email: null, nombre: null, impersonando: false, puede: () => false, gestiona: () => false, donante: false, coordinador: false,
});

export function RolProvider({ sesion, children }: { sesion: Sesion; children: React.ReactNode }) {
  const rol = PERMISOS[sesion.rol] ? sesion.rol : "publico";
  const hospitalIds = sesion.hospitalIds ?? [];
  const centroIds = sesion.centroIds ?? [];
  const puede = (a: string) => PERMISOS[rol].has(a);
  const gestiona = (hospitalId?: string | null, centroId?: string | null) =>
    rol === "admin" || (!!hospitalId && hospitalIds.includes(hospitalId)) || (!!centroId && centroIds.includes(centroId));
  const donante = rol === "admin" || rol === "ong" || centroIds.length > 0;
  const coordinador = rol === "admin" || hospitalIds.length > 0;
  return <Ctx.Provider value={{ rol, email: sesion.email, nombre: sesion.nombre, impersonando: !!sesion.impersonando, puede, gestiona, donante, coordinador }}>{children}</Ctx.Provider>;
}

export const useRol = () => useContext(Ctx);
