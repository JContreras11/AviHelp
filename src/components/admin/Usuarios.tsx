"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { crearUsuario, actualizarUsuario, cambiarPasswordUsuario, eliminarUsuario, listarUsuarios,
  listarInstituciones, getMembresias, setMembresias,
  listarRegistrosPendientes, aprobarRegistro, rechazarRegistro } from "@/app/actions/usuarios";
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
      <RegistrosPendientes onCambio={recargar} />

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

// ── Registros pendientes de aprobación (auto-registro) ──
type Pendiente = { membresiaId: string; userId: string; email: string | null; nombre: string | null; telefono: string | null; rolSolicitado: string; institucion: string; created_at: string };

function RegistrosPendientes({ onCambio }: { onCambio: () => void }) {
  const [lista, setLista] = useState<Pendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [procesando, setProcesando] = useState<string | null>(null);

  async function recargar() {
    try {
      const p = await listarRegistrosPendientes() as Pendiente[];
      setLista(p);
      setRoles(Object.fromEntries(p.map((x) => [x.membresiaId, x.rolSolicitado])));
    } catch { toast.error("No se pudieron cargar los registros pendientes."); }
    finally { setCargando(false); }
  }
  useEffect(() => { recargar(); }, []);

  async function aprobar(m: Pendiente) {
    setProcesando(m.membresiaId);
    const r = await aprobarRegistro(m.membresiaId, roles[m.membresiaId]);
    setProcesando(null);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success(`Acceso aprobado para ${m.nombre || m.email}.`);
    recargar(); onCambio();
  }
  async function rechazar(m: Pendiente) {
    if (!confirm(`¿Rechazar la solicitud de ${m.nombre || m.email}?`)) return;
    setProcesando(m.membresiaId);
    const r = await rechazarRegistro(m.membresiaId);
    setProcesando(null);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Solicitud rechazada.");
    recargar(); onCambio();
  }

  if (cargando || lista.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex flex-col gap-2">
      <p className="font-semibold text-sm flex items-center gap-2">
        <span className="grid place-items-center size-5 rounded-full bg-amber-500 text-white text-xs">{lista.length}</span>
        Registros pendientes de aprobación
      </p>
      <div className="flex flex-col gap-2">
        {lista.map((m) => (
          <div key={m.membresiaId} className="rounded-lg border bg-background p-3 flex flex-col gap-2">
            <div className="min-w-0">
              <p className="font-medium truncate">{m.nombre || m.email}</p>
              <p className="text-xs text-muted-foreground truncate">
                {m.email}{m.telefono ? ` · 📞 ${m.telefono}` : ""} · 🏥 {m.institucion}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={roles[m.membresiaId] ?? m.rolSolicitado}
                onChange={(e) => setRoles((r) => ({ ...r, [m.membresiaId]: e.target.value }))}
                className={selCls + " flex-1 min-w-[8rem]"}>
                {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
              <Button size="sm" disabled={procesando === m.membresiaId} onClick={() => aprobar(m)}>Aprobar</Button>
              <Button size="sm" variant="outline" disabled={procesando === m.membresiaId} onClick={() => rechazar(m)}>Rechazar</Button>
            </div>
          </div>
        ))}
      </div>
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
  const [initSelH, setInitSelH] = useState<Map<string, string>>(new Map());
  const [initSelC, setInitSelC] = useState<Map<string, string>>(new Map());
  const [cargandoInst, setCargandoInst] = useState(false);

  useEffect(() => {
    if (nuevo) return;
    setCargandoInst(true);
    Promise.all([
      listarInstituciones().then(setInst),
      getMembresias(u!.id).then((m) => {
        const hMap = new Map(m.hospitalIds.map((id) => [id, m.roles[id] ?? "responsable"]));
        const cMap = new Map(m.centroIds.map((id) => [id, m.roles[id] ?? "responsable"]));
        setSelH(hMap);
        setSelC(cMap);
        setInitSelH(new Map(hMap));
        setInitSelC(new Map(cMap));
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

  const hasProfileChanges = useMemo(() => {
    if (nuevo) return true;
    return (
      nombre !== (u!.nombre ?? "") ||
      telefono !== (u!.telefono ?? "") ||
      rol !== (u!.rol ?? "") ||
      hospitalId !== (u!.hospital_id ?? "") ||
      activo !== (u!.activo ?? true)
    );
  }, [nuevo, u, nombre, telefono, rol, hospitalId, activo]);

  const mapsEqual = (m1: Map<string, string>, m2: Map<string, string>) => {
    if (m1.size !== m2.size) return false;
    for (const [k, v] of m1) {
      if (m2.get(k) !== v) return false;
    }
    return true;
  };

  const hasMembresiaChanges = useMemo(() => {
    if (nuevo) return false;
    return !mapsEqual(selH, initSelH) || !mapsEqual(selC, initSelC);
  }, [nuevo, selH, initSelH, selC, initSelC]);

  const hayCambios = nuevo || hasProfileChanges || hasMembresiaChanges;

  const allIds = useMemo(() => {
    return [
      ...inst.hospitales.map((h) => ({ id: h.id, type: "h" })),
      ...inst.centros.map((c) => ({ id: c.id, type: "c" }))
    ];
  }, [inst]);

  const allSelected = useMemo(() => {
    if (allIds.length === 0) return false;
    return allIds.every(item => item.type === "h" ? selH.has(item.id) : selC.has(item.id));
  }, [allIds, selH, selC]);

  const toggleAll = () => {
    if (allSelected) {
      setSelH(new Map());
      setSelC(new Map());
    } else {
      const newH = new Map(selH);
      const newC = new Map(selC);
      inst.hospitales.forEach(h => newH.set(h.id, "responsable"));
      inst.centros.forEach(c => newC.set(c.id, "responsable"));
      setSelH(newH);
      setSelC(newC);
    }
  };

  async function guardar() {
    if (nuevo) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) { toast.error("Escribe un correo válido."); return; }
      if (password.length < 6) { toast.error("La contraseña debe tener mínimo 6 caracteres."); return; }
    }
    setGuardando(true);
    
    if (nuevo) {
      const r = await crearUsuario({ email, password, nombre, telefono, rol, hospital_id: hospitalId });
      setGuardando(false);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Usuario creado.");
      onSaved();
    } else {
      const toArr = (m: Map<string, string>) => [...m].map(([id, rol_local]) => ({ id, rol_local }));
      const [r1, r2] = await Promise.all([
        actualizarUsuario(u!.id, { nombre, telefono, rol, hospital_id: hospitalId, activo }),
        setMembresias(u!.id, toArr(selH), toArr(selC))
      ]);
      setGuardando(false);
      if (!r1.ok) { toast.error(r1.error); return; }
      if (!r2.ok) { toast.error(r2.error); return; }
      toast.success("Usuario actualizado.");
      onSaved();
    }
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
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">Instituciones que gestiona</p>
                  {!cargandoInst && allIds.length > 0 && (
                    <button type="button" onClick={toggleAll} className="text-xs text-primary underline hover:opacity-85">
                      {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
                    </button>
                  )}
                </div>
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
              </div>
            </>
          )}
          {!nuevo && u && u.rol !== "admin" && (
            <Button type="button" variant="secondary" className="w-full" onClick={verComo}>👁️ Ver como este usuario</Button>
          )}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {!nuevo && <Button variant="destructive" onClick={borrar}>Eliminar</Button>}
          <Button onClick={guardar} disabled={guardando || !hayCambios}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
