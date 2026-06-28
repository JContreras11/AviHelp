"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listarResponsables, usuariosParaAsignar, asignarResponsable, quitarResponsable, crearResponsable,
} from "@/app/actions/responsables";

type Resp = { user_id: string; rol_local: string; nombre: string | null; email: string | null; telefono: string | null };
type Usr = { id: string; nombre: string | null; email: string | null };

const inputCls = "h-10 text-base";
const selCls = "border rounded-lg h-10 px-2 text-base bg-background w-full min-w-0";

// Gestiona los responsables (usuarios reales) de un hospital: ver, asignar existente, crear nuevo.
export function HospitalResponsables({ hospitalId }: { hospitalId: string }) {
  const [resp, setResp] = useState<Resp[]>([]);
  const [usuarios, setUsuarios] = useState<Usr[]>([]);
  const [sel, setSel] = useState("");
  const [selRol, setSelRol] = useState("responsable");
  const [crear, setCrear] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", email: "", telefono: "", password: "", rolLocal: "responsable" });
  const [busy, setBusy] = useState(false);

  async function recargar() {
    setResp(await listarResponsables(hospitalId) as Resp[]);
  }
  useEffect(() => { recargar(); usuariosParaAsignar().then((u) => setUsuarios(u as Usr[])); }, [hospitalId]);

  const yaAsignados = new Set(resp.map((r) => r.user_id));
  const disponibles = usuarios.filter((u) => !yaAsignados.has(u.id));

  async function asignar() {
    if (!sel) { toast.error("Elige un usuario."); return; }
    setBusy(true);
    const r = await asignarResponsable(hospitalId, sel, selRol);
    setBusy(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    setSel(""); toast.success("Responsable asignado."); recargar();
  }
  async function quitar(userId: string) {
    const r = await quitarResponsable(hospitalId, userId);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Responsable quitado."); recargar();
  }
  async function guardarNuevo() {
    setBusy(true);
    const r = await crearResponsable(hospitalId, nuevo);
    setBusy(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Usuario creado y asignado.");
    setNuevo({ nombre: "", email: "", telefono: "", password: "", rolLocal: "responsable" });
    setCrear(false); recargar();
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Responsables (usuarios)</p>

      {resp.length === 0 && <p className="text-xs text-muted-foreground">Sin responsables. Las alertas de donación llegan al admin por defecto.</p>}
      {resp.map((r) => (
        <div key={r.user_id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium truncate">{r.nombre || r.email} <span className="text-xs text-muted-foreground">· {r.rol_local}</span></p>
            <p className="text-xs text-muted-foreground truncate">{r.email}{r.telefono ? ` · 📞 ${r.telefono}` : ""}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" className="text-destructive shrink-0" onClick={() => quitar(r.user_id)}>Quitar</Button>
        </div>
      ))}

      {/* Asignar usuario existente */}
      <div className="flex flex-wrap items-end gap-2">
        <select value={sel} onChange={(e) => setSel(e.target.value)} className={`${selCls} flex-1`}>
          <option value="">— Elegir usuario existente —</option>
          {disponibles.map((u) => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
        </select>
        <select value={selRol} onChange={(e) => setSelRol(e.target.value)} className="border rounded-lg h-10 px-2 text-sm bg-background">
          <option value="responsable">Responsable</option>
          <option value="admin">Admin</option>
        </select>
        <Button type="button" onClick={asignar} disabled={busy}>Asignar</Button>
      </div>

      {/* Crear nuevo */}
      {!crear ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setCrear(true)}>+ Crear usuario nuevo para este hospital</Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <Input placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className={inputCls} />
          <Input type="email" placeholder="Correo" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} className={inputCls} />
          <Input placeholder="Teléfono / contacto" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} className={inputCls} />
          <Input type="text" placeholder="Contraseña (mín. 6)" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} className={inputCls} />
          <select value={nuevo.rolLocal} onChange={(e) => setNuevo({ ...nuevo, rolLocal: e.target.value })} className={selCls}>
            <option value="responsable">Responsable</option>
            <option value="admin">Admin del hospital</option>
          </select>
          <div className="flex gap-2">
            <Button type="button" onClick={guardarNuevo} disabled={busy} className="flex-1">{busy ? "Creando…" : "Crear y asignar"}</Button>
            <Button type="button" variant="ghost" onClick={() => setCrear(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
