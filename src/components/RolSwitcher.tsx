"use client";

import { ROLES, useRol } from "@/lib/rol";

// Selector de rol (MVP). Cambia los botones/acciones visibles.
export function RolSwitcher() {
  const { rol, setRol } = useRol();
  return (
    <select
      value={rol}
      onChange={(e) => setRol(e.target.value as any)}
      className="h-9 rounded-lg border bg-background px-2 text-sm"
      title="Rol (demo)"
    >
      {ROLES.map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.label}</option>)}
    </select>
  );
}
