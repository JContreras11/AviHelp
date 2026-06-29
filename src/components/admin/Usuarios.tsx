"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { crearUsuario, actualizarUsuario, cambiarPasswordUsuario, eliminarUsuario, listarUsuarios,
  listarInstituciones, getMembresias, setMembresias } from "@/app/actions/usuarios";
import { impersonar } from "@/app/actions/impersonar";

const ROLES = [
  { v: "admin", l: "🛡️ Admin" },
  { v: "medico", l: "🩺 Médico" },
  { v: "voluntario", l: "🙋 Voluntario" },
  { v: "ong", l: "🤝 ONG" },
  { v: "publico", l: "👁️ Público" },
] as const;
const rolLabel = (r: string) => ROLES.find((x) => x.v === r)?.l ?? r;

type Hospital = { id: string; nombre: string };
type Usuario = { id: string; email: string | null; nombre: string | null; telefono?: string | null; rol: string; hospital_id: string | null; activo: boolean; hospitales?: { nombre: string } | null };

const selCls = "border rounded-lg h-10 px-2 text-base bg-background w-full min-w-0";

export function Usuarios({ inicial, hospitales }: { inicial: Usuario[]; hospitales: Hospital[] }) {
  const [usuarios, setUsuarios] = useState(inicial);
  const [editar, setEditar] = useState<Usuario | null>(null);
  const [creando, setCreando] = useState(false);
  const [, refrescar] = useTransition();

  async function recargar() {
    try {
      setUsuarios(await listarUsuarios() as Usuario[]);
    } catch {
      toast.error("No se pudo refrescar la lista de usuarios.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreando(true)}>+ Nuevo usuario</Button>
      </div>

      <div className="rounded-xl border divide-y">
        {usuarios.map((u) => (
          <button key={u.id} onClick={() => setEditar(u)}
            className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50 transition">
            <div className="min-w-0">
              <p className="font-medium truncate">{u.nombre || u.email}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}{u.telefono ? ` · 📞 ${u.telefono}` : ""}{u.hospitales?.nombre ? ` · ${u.hospitales.nombre}` : ""}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!u.activo && <span className="text-xs rounded-full bg-destructive/10 text-destructive px-2 py-0.5">inactivo</span>}
              <span className="text-xs rounded-full bg-muted px-2 py-0.5">{rolLabel(u.rol)}</span>
            </div>
          </button>
        ))}
        {usuarios.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin usuarios.</p>}
      </div>

      {(creando || editar) && (
        <UsuarioDialog
          u={editar}
          hospitales={hospitales}
          onClose={() => { setCreando(false); setEditar(null); }}
          onSaved={() => { setCreando(false); setEditar(null); refrescar(recargar); }}
        />
      )}
    </div>
  );
}

function UsuarioDialog({ u, hospitales, onClose, onSaved }: { u: Usuario | null; hospitales: Hospital[]; onClose: () => void; onSaved: () => void }) {
  const nuevo = !u;
  const [email, setEmail] = useState(u?.email ?? "");
  const [nombre, setNombre] = useState(u?.nombre ?? "");
  const [telefono, setTelefono] = useState(u?.telefono ?? "");
  const [rol, setRol] = useState(u?.rol ?? "voluntario");
  const [hospitalId, setHospitalId] = useState(u?.hospital_id ?? "");
  const [activo, setActivo] = useState(u?.activo ?? true);
  const [password, setPassword] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Membresías (M:M con hospitales/centros) + rol_local. Solo al editar un usuario existente.
  const [inst, setInst] = useState<{ hospitales: { id: string; nombre: string; tipo?: string }[]; centros: { id: string; nombre: string }[] }>({ hospitales: [], centros: [] });
  const [selH, setSelH] = useState<Map<string, string>>(new Map());
  const [selC, setSelC] = useState<Map<string, string>>(new Map());
  const [cargandoInst, setCargandoInst] = useState(false);
  useEffect(() => {
    if (nuevo) return;
    setCargandoInst(true);
    Promise.all([
      listarInstituciones().then(setInst),
      getMembresias(u!.id).then((m) => {
        setSelH(new Map(m.hospitalIds.map((id) => [id, m.roles[id] ?? "responsable"])));
        setSelC(new Map(m.centroIds.map((id) => [id, m.roles[id] ?? "responsable"])));
      }),
    ])
      .catch(() => toast.error("No se pudieron cargar las instituciones del usuario."))
      .finally(() => setCargandoInst(false));
  }, [nuevo, u]);
  const toggle = (map: Map<string, string>, fn: (m: Map<string, string>) => void, id: string) => {
    const n = new Map(map); n.has(id) ? n.delete(id) : n.set(id, "responsable"); fn(n);
  };
  const cambiarRolLocal = (map: Map<string, string>, fn: (m: Map<string, string>) => void, id: string, rl: string) => {
    const n = new Map(map); n.set(id, rl); fn(n);
  };
  async function guardarMembresias() {
    const toArr = (m: Map<string, string>) => [...m].map(([id, rol_local]) => ({ id, rol_local }));
    const r = await setMembresias(u!.id, toArr(selH), toArr(selC));
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Instituciones actualizadas.");
  }

  async function guardar() {
    // Validación cliente: NO cerramos ni limpiamos el form al fallar (reintento sin perder datos).
    if (nuevo) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) { toast.error("Escribe un correo válido."); return; }
      if (password.length < 6) { toast.error("La contraseña debe tener mínimo 6 caracteres."); return; }
    }
    setGuardando(true);
    const r = nuevo
      ? await crearUsuario({ email, password, nombre, telefono, rol, hospital_id: hospitalId })
      : await actualizarUsuario(u!.id, { nombre, telefono, rol, hospital_id: hospitalId, activo });
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(nuevo ? "Usuario creado." : "Usuario actualizado.");
    onSaved();
  }

  async function resetPassword() {
    if (!password) { toast.error("Escribe la nueva contraseña."); return; }
    const r = await cambiarPasswordUsuario(u!.id, password);
    if (!r.ok) { toast.error(r.error); return; }
    setPassword("");
    toast.success("Contraseña cambiada.");
  }

  async function verComo() {
    const r = await impersonar(u!.id);
    if (!r.ok) { toast.error((r as any).error); return; }
    window.location.href = "/"; // recarga dura -> entra a la vista del usuario
  }

  async function borrar() {
    if (!confirm(`¿Eliminar a ${u!.nombre || u!.email}? No se puede deshacer.`)) return;
    const r = await eliminarUsuario(u!.id);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Usuario eliminado.");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{nuevo ? "Nuevo usuario" : "Editar usuario"}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 min-w-0">
          <label className="flex flex-col gap-1 text-sm font-medium">Correo
            <Input type="email" value={email} disabled={!nuevo} onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@correo.com" className="h-11 text-base" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Nombre
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-11 text-base" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">📞 Teléfono de contacto <span className="text-xs font-normal text-muted-foreground">(solo visible para admins)</span>
            <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+58…" className="h-11 text-base" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Rol
            <select value={rol} onChange={(e) => setRol(e.target.value)} className={selCls}>
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Hospital (opcional)
            <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className={selCls}>
              <option value="">— Ninguno —</option>
              {hospitales.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
            </select>
          </label>

          {nuevo ? (
            <label className="flex flex-col gap-1 text-sm font-medium">Contraseña
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="mínimo 6 caracteres" className="h-11 text-base" />
            </label>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="size-4" />
                Cuenta activa (puede entrar)
              </label>
              <div className="flex items-end gap-2">
                <label className="flex flex-col gap-1 text-sm font-medium flex-1 min-w-0">Nueva contraseña
                  <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="dejar vacío para no cambiar" className="h-11 text-base" />
                </label>
                <Button type="button" variant="outline" onClick={resetPassword}>Cambiar</Button>
              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-1">Instituciones que gestiona</p>
                <p className="text-xs text-muted-foreground mb-2">El usuario verá/gestionará (como admin) solo lo de estas instituciones. Admin global no necesita esto.</p>
                <div className="max-h-44 overflow-auto rounded-lg border divide-y">
                  {cargandoInst && <p className="p-2 text-xs text-muted-foreground">Cargando instituciones…</p>}
                  {!cargandoInst && inst.hospitales.length === 0 && inst.centros.length === 0 && (
                    <p className="p-2 text-xs text-muted-foreground">No hay instituciones registradas.</p>
                  )}
                  {inst.hospitales.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 p-2 text-sm">
                      <label className="flex items-center gap-2 flex-1 min-w-0">
                        <input type="checkbox" className="size-4" checked={selH.has(h.id)} onChange={() => toggle(selH, setSelH, h.id)} />
                        <span className="truncate">🏥 {h.nombre}{h.tipo === "clinica" ? " (clínica)" : ""}</span>
                      </label>
                      {selH.has(h.id) && (
                        <select value={selH.get(h.id)} onChange={(e) => cambiarRolLocal(selH, setSelH, h.id, e.target.value)} className="border rounded h-8 text-xs bg-background">
                          <option value="responsable">Responsable</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </div>
                  ))}
                  {inst.centros.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 p-2 text-sm">
                      <label className="flex items-center gap-2 flex-1 min-w-0">
                        <input type="checkbox" className="size-4" checked={selC.has(c.id)} onChange={() => toggle(selC, setSelC, c.id)} />
                        <span className="truncate">📦 {c.nombre}</span>
                      </label>
                      {selC.has(c.id) && (
                        <select value={selC.get(c.id)} onChange={(e) => cambiarRolLocal(selC, setSelC, c.id, e.target.value)} className="border rounded h-8 text-xs bg-background">
                          <option value="responsable">Responsable</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={guardarMembresias}>Guardar instituciones</Button>
              </div>
            </>
          )}
          {!nuevo && u && u.rol !== "admin" && (
            <Button type="button" variant="secondary" className="w-full" onClick={verComo}>👁️ Ver como este usuario</Button>
          )}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {!nuevo && <Button variant="destructive" onClick={borrar}>Eliminar</Button>}
          <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
