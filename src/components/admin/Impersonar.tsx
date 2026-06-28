"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { impersonar } from "@/app/actions/impersonar";

type U = { id: string; email: string | null; nombre: string | null; rol: string };

const ROL_LABEL: Record<string, string> = {
  admin: "🛡️ Admin", medico: "🩺 Médico", voluntario: "🙋 Voluntario", ong: "🤝 ONG", publico: "👁️ Público",
};

export function Impersonar({ usuarios }: { usuarios: U[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState<string | null>(null);

  const filtro = q.trim().toLowerCase();
  const lista = filtro
    ? usuarios.filter((u) => (u.nombre ?? "").toLowerCase().includes(filtro) || (u.email ?? "").toLowerCase().includes(filtro))
    : usuarios;

  async function ver(u: U) {
    setCargando(u.id);
    const r = await impersonar(u.id);
    setCargando(null);
    if (!r.ok) { toast.error((r as any).error); return; }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo…" className="h-11 text-base" />
      <div className="rounded-xl border divide-y">
        {lista.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{u.nombre || u.email}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email} · {ROL_LABEL[u.rol] ?? u.rol}</p>
            </div>
            <Button size="sm" variant="outline" disabled={cargando === u.id || u.rol === "admin"} onClick={() => ver(u)}>
              {u.rol === "admin" ? "Admin" : cargando === u.id ? "…" : "Ver como"}
            </Button>
          </div>
        ))}
        {lista.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin coincidencias.</p>}
      </div>
    </div>
  );
}
