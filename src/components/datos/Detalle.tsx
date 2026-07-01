"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Img } from "@/components/Img";
import { useRol } from "@/lib/rol";
import { fechaHora, hace } from "@/lib/format";
import {
  actualizarPersona, eliminarPersona, getPersona,
  actualizarInsumo, eliminarInsumo, cambiarEstadoInsumo, cubrirInsumo, getInsumo,
  getHospital, actualizarHospital, eliminarHospital, upsertCentro, eliminarCentro,
} from "@/app/actions/crud";
import { crearDonacion, marcarRecibido, cancelarDonacion, avisarDonacionHospital, setCentroHospitales, hospitalesDeCentro } from "@/app/actions/donaciones";
import { listarHospitales } from "@/app/actions/listas";
import { HospitalResponsables } from "@/components/datos/HospitalResponsables";

const PRESENTACIONES = ["", "bombona", "caja", "frasco", "tableta", "cápsula", "comprimido", "vial", "ampolla", "polvo", "jarabe", "solución", "tubo", "bolsa", "sobre", "crema", "pomada", "inhalador", "parche", "blíster", "unidad", "otro"];

const ESTADOS = ["vivo", "herido", "desaparecido", "fallecido", "desconocido"];
const ESTADOS_INSUMO = ["solicitado", "en_transito", "entregado", "cubierto", "cancelado"];
const inputCls = "h-11 text-base text-foreground";
const selectCls = "h-11 text-base border rounded-lg px-2 bg-background w-full";

function mapsUrl(lat?: number | null, lng?: number | null, q?: string | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps?q=${lat},${lng}`;
  if (q) return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
  return null;
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">{label}{children}</label>;
}

export function PersonaDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { puede, gestiona } = useRol();
  const [p, setP] = useState<any>(null);
  const editable = puede("editar") && gestiona(p?.hospital_id);
  const [historial, setHistorial] = useState<any[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Mueve el foco al cuerpo del diálogo cuando carga (teclado/lector de pantalla
  // entran al modal, no quedan en la fila que lo abrió). Div, no input: en móvil no abre teclado.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (p || err) bodyRef.current?.focus(); }, [p, err]);

  useEffect(() => {
    let vivo = true;
    setErr(null); setP(null);
    getPersona(id)
      .then((r) => {
        if (!vivo) return;
        if (!r?.persona) { setErr("No se encontró esta persona."); return; }
        setP(r.persona); setHistorial(r.historial ?? []);
      })
      .catch(() => { if (vivo) setErr("No se pudo cargar. Revisa tu conexión e inténtalo de nuevo."); });
    return () => { vivo = false; };
  }, [id]);

  async function guardar() {
    if (!p?.nombre?.trim()) { toast.error("El nombre es obligatorio."); return; }
    setGuardando(true);
    const r = await actualizarPersona(id, p);
    setGuardando(false);
    // En error: NO cerramos ni reseteamos `p` — los cambios del usuario quedan intactos para reintentar.
    if (r.ok) { toast.success("Persona actualizada"); onChanged(); onClose(); }
    else toast.error((r as any).error ?? "No se pudo guardar. Inténtalo de nuevo.");
  }
  async function borrar() {
    if (!confirm("¿Eliminar esta persona?")) return;
    const r = await eliminarPersona(id);
    if (r.ok) { toast.success("Eliminada"); onChanged(); onClose(); } else toast.error((r as any).error);
  }
  const maps = p && mapsUrl(p.gps_lat, p.gps_lng, p.ubicacion);
  const ro = !editable;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-xl pr-8">{p?.nombre ?? (err ? "Error" : "Cargando…")}</DialogTitle></DialogHeader>
        {err && (
          <div ref={bodyRef} tabIndex={-1} className="py-6 text-center text-sm text-muted-foreground outline-none">
            <p className="mb-3">⚠️ {err}</p>
            <Button variant="outline" size="lg" onClick={onClose}>Cerrar</Button>
          </div>
        )}
        {!p && !err && <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">Cargando…</div>}
        {p && (
          <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
            {p.fotos?.length > 0 && (
              <div className="flex gap-2 overflow-auto pb-1">
                {p.fotos.map((f: string) => <Img key={f} src={f} className="h-28 rounded-xl object-cover cursor-zoom-in shrink-0" />)}
              </div>
            )}
            <Campo label="Nombre"><Input readOnly={ro} value={p.nombre ?? ""} onChange={(e) => setP({ ...p, nombre: e.target.value })} className={inputCls} /></Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Cédula"><Input readOnly={ro} value={p.cedula ?? ""} onChange={(e) => setP({ ...p, cedula: e.target.value })} className={inputCls} /></Campo>
              <Campo label="Edad"><Input readOnly={ro} value={p.edad ?? ""} inputMode="numeric" onChange={(e) => setP({ ...p, edad: e.target.value ? Number(e.target.value) : null })} className={inputCls} /></Campo>
              <Campo label="Estado">
                <select disabled={ro} value={p.estado_salud} onChange={(e) => setP({ ...p, estado_salud: e.target.value })} className={selectCls}>
                  {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Campo>
              {/* Sexo: enum M/F. La IA lo prellena desde el nombre; siempre editable por selector. */}
              <Campo label="Sexo">
                <select disabled={ro} value={p.sexo === "M" || p.sexo === "F" ? p.sexo : ""} onChange={(e) => setP({ ...p, sexo: e.target.value })} className={selectCls}>
                  {!(p.sexo === "M" || p.sexo === "F") && <option value="" disabled>—</option>}
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </Campo>
            </div>
            <Campo label="Hospital / procedencia">
              <Input readOnly={ro} value={p.hospitales?.nombre ?? p.ubicacion ?? ""} onChange={(e) => setP({ ...p, ubicacion: e.target.value })} className={inputCls} />
            </Campo>
            <Campo label="Teléfono de contacto"><Input readOnly={ro} value={p.telefono_contacto ?? ""} onChange={(e) => setP({ ...p, telefono_contacto: e.target.value })} className={inputCls} /></Campo>
            <Campo label="Descripción física"><Input readOnly={ro} value={p.descripcion_fisica ?? ""} onChange={(e) => setP({ ...p, descripcion_fisica: e.target.value })} className={inputCls} /></Campo>
            <p className="text-xs text-muted-foreground" title={fechaHora(p.created_at)}>
              🕑 Cargado {hace(p.created_at)}{p.updated_at && p.updated_at !== p.created_at ? ` · actualizado ${hace(p.updated_at)}` : ""}
            </p>

            {historial.length > 0 && (
              <><Separator /><div><p className="text-sm font-medium mb-1">Historial</p>
                {historial.map((h) => <p key={h.id} className="text-sm text-muted-foreground">• {h.estado_salud} {h.ubicacion ? `· ${h.ubicacion}` : ""}</p>)}
              </div></>
            )}
            <div className="flex flex-wrap gap-2">
              {p.telefono_contacto && <a href={`tel:${p.telefono_contacto}`} className="flex-1"><Button variant="outline" size="lg" className="w-full">📞 Llamar</Button></a>}
              {maps && <a href={maps} target="_blank" rel="noreferrer" className="flex-1"><Button variant="outline" size="lg" className="w-full">📍 Mapa</Button></a>}
            </div>
          </div>
        )}
        {editable && (
          <DialogFooter className="gap-2">
            {puede("eliminar") && <Button variant="ghost" size="lg" onClick={borrar} className="text-destructive sm:mr-auto">Eliminar</Button>}
            <Button size="lg" onClick={guardar} disabled={guardando} className="px-8">{guardando ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function InsumoDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { puede, gestiona, donante } = useRol();
  const [i, setI] = useState<any>(null);
  const [eventos, setEventos] = useState<any[]>([]);
  const [donaciones, setDonaciones] = useState<any[]>([]);
  const [montoDon, setMontoDon] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (i || err) bodyRef.current?.focus(); }, [i, err]);
  // Solo gestiona (admin o miembro del hospital) puede editar/tracking/cubrir.
  const gestion = gestiona(i?.hospital_id);
  const editable = puede("editar") && gestion, tracking = puede("tracking") && gestion, cubrir = puede("cubrir") && gestion;

  // cargar se reusa tras cada mutación (no blanquea el modal); el reset vive en el effect por id.
  const cargar = () =>
    getInsumo(id)
      .then((r) => {
        if (!r?.insumo) { setErr("No se encontró este insumo."); return; }
        setErr(null); setI(r.insumo); setEventos(r.eventos ?? []); setDonaciones(r.donaciones ?? []);
      })
      .catch(() => setErr("No se pudo cargar. Revisa tu conexión e inténtalo de nuevo."));
  useEffect(() => { setI(null); setErr(null); cargar(); }, [id]);

  // Conciliación (match): pendiente = solicitada − en camino − recibida.
  const solicitada = Number(i?.cantidad ?? 0);
  const enCamino = Number(i?.cantidad_en_camino ?? 0);
  const recibida = Number(i?.cantidad_recibida ?? 0);
  const pendiente = Math.max(0, solicitada - enCamino - recibida);

  async function registrarDonacion() {
    const cant = Math.floor(Number(montoDon || pendiente));
    if (!cant || cant <= 0) { toast.error("Indica una cantidad válida."); return; }
    const r = await crearDonacion(id, cant);
    if (r.ok) { toast.success("Donación registrada (en camino)"); setMontoDon(""); cargar(); onChanged(); } else toast.error((r as any).error);
  }
  async function recibir(donId: string) {
    const r = await marcarRecibido(donId);
    if (r.ok) { toast.success("Marcado como recibido"); cargar(); onChanged(); } else toast.error((r as any).error);
  }
  async function cancelar(donId: string) {
    if (!confirm("¿Cancelar esta donación en camino? Volverá a quedar pendiente.")) return;
    const r = await cancelarDonacion(donId);
    if (r.ok) { toast.success("Donación cancelada"); cargar(); onChanged(); } else toast.error((r as any).error);
  }

  async function cambiarEstado(estado: string) {
    const r = await cambiarEstadoInsumo(id, estado);
    if (r.ok) { toast.success(`Marcado: ${estado.replace("_", " ")}`); cargar(); onChanged(); } else toast.error((r as any).error);
  }
  async function marcarCubierto() {
    if (!confirm("¿Confirmas que el hospital ya RECIBIÓ este insumo? Saldrá de la lista de pendientes.")) return;
    const r = await cubrirInsumo(id);
    if (r.ok) { toast.success("Insumo cubierto ✓"); cargar(); onChanged(); } else toast.error((r as any).error);
  }
  async function guardar() {
    if (!i?.nombre?.trim()) { toast.error("El nombre del insumo es obligatorio."); return; }
    setGuardando(true);
    const r = await actualizarInsumo(id, i);
    setGuardando(false);
    // En error: no se cierra ni se resetea `i` — los cambios quedan para reintentar.
    if (r.ok) { toast.success("Insumo actualizado"); onChanged(); }
    else toast.error((r as any).error ?? "No se pudo guardar. Inténtalo de nuevo.");
  }
  async function borrar() {
    if (!confirm("¿Eliminar este insumo?")) return;
    const r = await eliminarInsumo(id);
    if (r.ok) { toast.success("Eliminado"); onChanged(); onClose(); } else toast.error((r as any).error);
  }
  const h = i?.hospitales;
  const maps = h && mapsUrl(h.gps_lat, h.gps_lng, h.nombre);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-xl pr-8">{i?.nombre ?? (err ? "Error" : "Cargando…")}</DialogTitle></DialogHeader>
        {err && (
          <div ref={bodyRef} tabIndex={-1} className="py-6 text-center text-sm text-muted-foreground outline-none">
            <p className="mb-3">⚠️ {err}</p>
            <Button variant="outline" size="lg" onClick={onClose}>Cerrar</Button>
          </div>
        )}
        {!i && !err && <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">Cargando…</div>}
        {i && (
          <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
            {/* Solo personal con permiso edita. El público abierto ve la necesidad en solo-lectura. */}
            {editable ? (<>
              <Campo label="Nombre"><Input value={i.nombre ?? ""} onChange={(e) => setI({ ...i, nombre: e.target.value })} className={inputCls} /></Campo>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Campo label="Cantidad"><Input value={i.cantidad ?? ""} inputMode="numeric" onChange={(e) => setI({ ...i, cantidad: e.target.value ? Number(e.target.value) : null })} className={inputCls} /></Campo>
                <Campo label="Tipo">
                  <select value={i.presentacion ?? ""} onChange={(e) => setI({ ...i, presentacion: e.target.value || null })} className={`${selectCls} capitalize`}>
                    {PRESENTACIONES.map((s) => <option key={s} value={s}>{s || "—"}</option>)}
                  </select>
                </Campo>
                <Campo label="Dosis/unidad"><Input value={i.unidad ?? ""} placeholder="mg, ml…" onChange={(e) => setI({ ...i, unidad: e.target.value })} className={inputCls} /></Campo>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Área"><Input value={i.area ?? ""} placeholder="Trauma, Neonato…" onChange={(e) => setI({ ...i, area: e.target.value })} className={inputCls} /></Campo>
                <Campo label="Estado">
                  <select value={i.estado} onChange={(e) => setI({ ...i, estado: e.target.value })} className={`${selectCls} capitalize`}>
                    {ESTADOS_INSUMO.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </Campo>
              </div>
              <Campo label="¿Para qué sirve?"><Input value={i.para_que_sirve ?? ""} onChange={(e) => setI({ ...i, para_que_sirve: e.target.value })} className={inputCls} /></Campo>
              <Campo label="Alternativas si no se consigue"><Input value={i.alternativas ?? ""} onChange={(e) => setI({ ...i, alternativas: e.target.value })} className={inputCls} /></Campo>
            </>) : (
              <div className="flex flex-col gap-2 text-base">
                <div className="flex flex-wrap items-center gap-2">
                  {(i.cantidad || i.presentacion || i.unidad) && <span className="font-medium">{[i.cantidad, i.presentacion, i.unidad].filter(Boolean).join(" ")}</span>}
                  {i.area && <span className="rounded-full bg-muted px-2 py-0.5 text-sm">{i.area}</span>}
                  <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-sm font-medium capitalize">{String(i.estado).replace("_", " ")}</span>
                </div>
                {i.para_que_sirve && <p className="text-sm"><span className="text-muted-foreground">¿Para qué sirve? </span>{i.para_que_sirve}</p>}
                {i.alternativas && <p className="text-sm"><span className="text-muted-foreground">Alternativas: </span>{i.alternativas}</p>}
              </div>
            )}
            {h && <p className="text-base">🏥 {h.nombre}{h.ubicacion ? ` · ${h.ubicacion}` : ""}</p>}
            <p className="text-xs text-muted-foreground" title={fechaHora(i.created_at)}>
              🕑 Solicitado {hace(i.created_at)}{i.estado === "cubierto" && i.cubierto_at ? ` · cubierto ${hace(i.cubierto_at)}` : ""}
            </p>

            {/* Conciliación Necesidad ↔ Donación (visible a todos). */}
            {solicitada > 0 && (
              <div className="rounded-xl border p-3 text-sm">
                <p className="font-semibold mb-1">Conciliación</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-lg font-bold text-amber-600">{pendiente}</div><div className="text-xs text-muted-foreground">Pendiente</div></div>
                  <div><div className="text-lg font-bold text-blue-600">{enCamino}</div><div className="text-xs text-muted-foreground">En camino</div></div>
                  <div><div className="text-lg font-bold text-green-600">{recibida}</div><div className="text-xs text-muted-foreground">Recibido</div></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1 text-center">Solicitado: {solicitada}</p>
              </div>
            )}

            {/* Donante institucional (centro/ONG) registra envío -> pasa a "En camino". */}
            {donante && pendiente > 0 && (
              <div className="flex items-end gap-2">
                <Campo label="🎁 Donar (en camino)">
                  <Input inputMode="numeric" value={montoDon} placeholder={String(pendiente)}
                    onChange={(e) => setMontoDon(e.target.value)} className={inputCls} />
                </Campo>
                <Button size="lg" onClick={registrarDonacion}>Registrar</Button>
              </div>
            )}

            {/* Listado de donaciones de esta necesidad. */}
            {donaciones.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Donaciones</p>
                {donaciones.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 text-sm border-b py-1">
                    <span>
                      {d.cantidad} · <span className="capitalize">{String(d.estado).replace("_", " ")}</span>
                      {d.centros_acopio?.nombre ? ` · ${d.centros_acopio.nombre}` : d.donante_nombre ? ` · ${d.donante_nombre}` : ""}
                    </span>
                    {d.estado === "en_camino" && (
                      <span className="flex gap-1 shrink-0">
                        {gestion && <Button size="sm" variant="outline" onClick={() => recibir(d.id)}>Recibí</Button>}
                        {(donante || gestion) && <Button size="sm" variant="ghost" aria-label="Cancelar donación" title="Cancelar donación" className="text-destructive" onClick={() => cancelar(d.id)}>✕</Button>}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tracking && (<>
              <Separator /><p className="text-sm font-semibold">Tracking</p>
              {/* Reversible: toca cualquier estado para cambiarlo. "Pendiente" = aún nadie atiende esta necesidad. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button size="lg" variant={i.estado === "solicitado" ? "default" : "outline"} onClick={() => cambiarEstado("solicitado")}>📋 Pendiente</Button>
                <Button size="lg" variant={i.estado === "en_transito" ? "default" : "outline"} onClick={() => cambiarEstado("en_transito")}>🚚 En tránsito</Button>
                <Button size="lg" variant={i.estado === "entregado" ? "default" : "outline"} onClick={() => cambiarEstado("entregado")}>✅ Entregado</Button>
              </div>
              <p className="text-xs text-muted-foreground">Toca cualquier estado para cambiarlo. Si te equivocaste, vuelve a “Pendiente”.</p>
            </>)}
            {cubrir && i.estado !== "cubierto" && (
              <Button size="lg" variant="default" onClick={marcarCubierto} className="w-full bg-green-600 hover:bg-green-700">
                ✔ Marcar como Cubierto (recibido)
              </Button>
            )}
            {i.estado === "cubierto" && (
              <p className="text-sm font-medium text-green-700 text-center">✔ Cubierto{i.cubierto_por ? ` por ${i.cubierto_por}` : ""}</p>
            )}
            {maps && <a href={maps} target="_blank" rel="noreferrer"><Button size="lg" variant="outline" className="w-full">📍 Hospital en mapa</Button></a>}

            {eventos.length > 0 && (
              <><Separator /><div><p className="text-sm font-medium mb-1">Eventos</p>
                {eventos.map((e) => (
                  <p key={e.id} className="text-sm text-muted-foreground">
                    • <span className="capitalize font-medium text-foreground">{e.estado.replace("_", " ")}</span>
                    {e.created_at ? ` · ${fechaHora(e.created_at)}` : ""}{e.actor ? ` · ${e.actor}` : ""}
                  </p>
                ))}
              </div></>
            )}

            <p className="text-xs text-muted-foreground border-t pt-2 mt-1 leading-snug">
              No nos hacemos responsables del tiempo de cambio de estatus: depende de la gestión de los encargados de cada centro. AviHelp es un puente de comunicación; la repartición se gestiona en cada centro de acopio según la necesidad reflejada.
            </p>
          </div>
        )}
        {editable && (
          <DialogFooter className="gap-2">
            {puede("eliminar") && <Button variant="ghost" size="lg" onClick={borrar} className="text-destructive sm:mr-auto">Eliminar</Button>}
            <Button size="lg" onClick={guardar} disabled={guardando} className="px-8">{guardando ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Centro de acopio: alta/edición (admin) y vista de contacto/mapa (todos).
export function CentroDialog({ centro, onClose, onChanged }: { centro: any; onClose: () => void; onChanged?: () => void }) {
  const { puede, gestiona } = useRol();
  const { rol } = useRol();
  const [c, setC] = useState<any>({ activo: true, ...centro });
  const nuevo = !centro?.id;
  // Crear centro = admin; editar uno existente = admin o miembro del centro.
  const editable = puede("editar") && (nuevo ? gestiona() : gestiona(null, centro?.id));

  const [guardando, setGuardando] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.focus(); }, []);
  // Relación N:M centro -> hospitales que atiende (solo admin, centro existente).
  const [hosps, setHosps] = useState<any[]>([]);
  const [selHosp, setSelHosp] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (nuevo || rol !== "admin") return;
    listarHospitales().then((hs) => setHosps((hs ?? []).filter((h: any) => h.tipo !== "refugio")));
    hospitalesDeCentro(centro.id).then((ids: string[]) => setSelHosp(new Set(ids)));
  }, [nuevo, rol, centro?.id]);
  async function guardarHospitales() {
    const r = await setCentroHospitales(centro.id, [...selHosp]);
    if ((r as any).ok) toast.success("Hospitales que atiende actualizados"); else toast.error((r as any).error);
  }

  async function guardar() {
    if (!c?.nombre?.trim()) { toast.error("El nombre del centro es obligatorio."); return; }
    setGuardando(true);
    const r = await upsertCentro(c);
    setGuardando(false);
    // En error: no se cierra ni se resetea `c` — los cambios quedan para reintentar.
    if (r.ok) { toast.success(nuevo ? "Centro creado" : "Centro actualizado"); onChanged?.(); onClose(); }
    else toast.error((r as any).error ?? "No se pudo guardar. Inténtalo de nuevo.");
  }
  async function borrar() {
    if (!confirm("¿Eliminar este centro de acopio?")) return;
    const r = await eliminarCentro(centro.id);
    if (r.ok) { toast.success("Eliminado"); onChanged?.(); onClose(); } else toast.error((r as any).error);
  }
  const maps = mapsUrl(c.gps_lat, c.gps_lng, [c.nombre, c.zona, c.ubicacion].filter(Boolean).join(" "));
  const ro = !editable;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-xl pr-8">📦 {nuevo ? "Nuevo centro de acopio" : c.nombre}</DialogTitle></DialogHeader>
        <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
          <Campo label="Nombre"><Input readOnly={ro} value={c.nombre ?? ""} onChange={(e) => setC({ ...c, nombre: e.target.value })} className={inputCls} /></Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Zona"><Input readOnly={ro} value={c.zona ?? ""} placeholder="Los Palos Grandes…" onChange={(e) => setC({ ...c, zona: e.target.value })} className={inputCls} /></Campo>
            <Campo label="Horario"><Input readOnly={ro} value={c.horario ?? ""} placeholder="8am-6pm" onChange={(e) => setC({ ...c, horario: e.target.value })} className={inputCls} /></Campo>
          </div>
          <Campo label="Dirección / referencia"><Input readOnly={ro} value={c.ubicacion ?? ""} onChange={(e) => setC({ ...c, ubicacion: e.target.value })} className={inputCls} /></Campo>
          <Campo label="¿Qué recibe?"><Input readOnly={ro} value={c.recibe ?? ""} placeholder="Alimentos, medicinas, ropa…" onChange={(e) => setC({ ...c, recibe: e.target.value })} className={inputCls} /></Campo>
          <Campo label="🙏 Solicitar donación — ¿qué necesitan ahora?">
            <textarea readOnly={ro} value={c.necesita ?? ""} placeholder="Ej: pañales, agua, colchonetas, fórmula infantil…"
              onChange={(e) => setC({ ...c, necesita: e.target.value })} rows={2}
              className="border rounded-lg p-2 text-base bg-background w-full" />
          </Campo>
          {ro && c.necesita && (
            <div className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              <p className="font-semibold mb-1">🙏 Solicita donación</p>
              <p className="whitespace-pre-wrap">{c.necesita}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Contacto"><Input readOnly={ro} value={c.contacto_nombre ?? ""} onChange={(e) => setC({ ...c, contacto_nombre: e.target.value })} className={inputCls} /></Campo>
            <Campo label="Teléfono"><Input readOnly={ro} value={c.contacto_telefono ?? ""} onChange={(e) => setC({ ...c, contacto_telefono: e.target.value })} className={inputCls} /></Campo>
          </div>
          {editable && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={c.activo ?? true} onChange={(e) => setC({ ...c, activo: e.target.checked })} /> Activo
            </label>
          )}

          {/* Hospitales que atiende este centro (a dónde llevan las donaciones). Solo admin. */}
          {!nuevo && rol === "admin" && (
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-1">🏥 Hospitales que atiende</p>
              <p className="text-xs text-muted-foreground mb-2">Cuando alguien dona a una necesidad de estos hospitales, se le indica este centro para entregar.</p>
              <div className="max-h-40 overflow-auto rounded-lg border divide-y">
                {hosps.map((h) => (
                  <label key={h.id} className="flex items-center gap-2 p-2 text-sm">
                    <input type="checkbox" className="size-4" checked={selHosp.has(h.id)}
                      onChange={() => setSelHosp((s) => { const n = new Set(s); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n; })} />
                    {h.nombre}
                  </label>
                ))}
                {hosps.length === 0 && <p className="p-2 text-xs text-muted-foreground">Sin hospitales.</p>}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={guardarHospitales}>Guardar hospitales</Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {c.contacto_telefono && <a href={`tel:${c.contacto_telefono}`} className="flex-1"><Button variant="outline" size="lg" className="w-full">📞 Llamar</Button></a>}
            {maps && <a href={maps} target="_blank" rel="noreferrer" className="flex-1"><Button variant="outline" size="lg" className="w-full">📍 Mapa</Button></a>}
          </div>
        </div>
        {editable && (
          <DialogFooter className="gap-2">
            {!nuevo && <Button variant="ghost" size="lg" onClick={borrar} className="text-destructive sm:mr-auto">Eliminar</Button>}
            <Button size="lg" onClick={guardar} disabled={guardando} className="px-8">{guardando ? "Guardando…" : nuevo ? "Crear" : "Guardar"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

const PRIO_ORD: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

export function HospitalDialog({ hospital, onClose, onChanged }: { hospital: any; onClose: () => void; onChanged?: () => void }) {
  const { puede, gestiona, rol } = useRol();
  const gestion = puede("editar") && gestiona(hospital.id); // admin o miembro del hospital
  const [h, setH] = useState<any>(null);
  const [insumos, setInsumos] = useState<any[]>([]);
  const [nota, setNota] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [resp, setResp] = useState<{ nombre?: string | null; contacto?: string | null } | null>(null);
  const [donando, setDonando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (h || err) bodyRef.current?.focus(); }, [h, err]);
  async function donar() {
    if (!nota.trim()) { toast.error("Escribe qué quieres donar."); return; }
    setDonando(true);
    const r = await avisarDonacionHospital(hospital.id, nota);
    setDonando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    setResp(r.responsable); setEnviado(true);
    toast.success("¡Gracias! 💜 Avisamos al hospital.");
  }

  useEffect(() => {
    let vivo = true;
    setErr(null); setH(null);
    getHospital(hospital.id)
      .then((r) => { if (!vivo) return; if (!r?.hospital) { setErr("No se encontró este hospital."); return; } setH(r.hospital); setInsumos(r.insumos ?? []); })
      .catch(() => { if (vivo) setErr("No se pudo cargar. Revisa tu conexión e inténtalo de nuevo."); });
    return () => { vivo = false; };
  }, [hospital.id]);

  async function guardarResp() {
    if (!h?.nombre?.trim()) { toast.error("El nombre del hospital es obligatorio."); return; }
    setGuardando(true);
    const r = await actualizarHospital(hospital.id, h);
    setGuardando(false);
    if (r.ok) { toast.success("Hospital actualizado"); onChanged?.(); }
    else toast.error((r as any).error ?? "No se pudo guardar. Inténtalo de nuevo.");
  }
  async function borrarHospital() {
    if (!confirm(`¿Eliminar ${hospital.nombre}? Se borran sus insumos. No se puede deshacer.`)) return;
    const r = await eliminarHospital(hospital.id);
    if (r.ok) { toast.success("Hospital eliminado"); onChanged?.(); onClose(); } else toast.error((r as any).error);
  }

  const maps = h && mapsUrl(h.gps_lat, h.gps_lng, h.nombre);
  // Agrupa necesidades por área para una lista clara (lo que el hospital requiere ahora).
  const porArea = insumos.reduce((acc: Record<string, any[]>, i) => {
    const k = i.area || "General";
    (acc[k] ??= []).push(i); return acc;
  }, {});

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-xl pr-8">🏥 {hospital.nombre}</DialogTitle></DialogHeader>
        {err && (
          <div ref={bodyRef} tabIndex={-1} className="py-6 text-center text-sm text-muted-foreground outline-none">
            <p className="mb-3">⚠️ {err}</p>
            <Button variant="outline" size="lg" onClick={onClose}>Cerrar</Button>
          </div>
        )}
        {!h && !err && <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">Cargando…</div>}
        {h && (
          <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-3 text-sm outline-none">
            {h.ubicacion && <p>📍 {h.ubicacion}</p>}
            <p className="text-muted-foreground">{hospital.personas ?? 0} personas · {insumos.length} insumos pendientes · {hospital.criticos ?? 0} críticos</p>

            <div className="flex gap-2">
              <a href={`/print/hospital/${hospital.id}`} target="_blank" rel="noreferrer" className="flex-1">
                <Button size="lg" variant="outline" className="w-full">🖨️ Imprimir / PDF</Button>
              </a>
              {maps && <a href={maps} target="_blank" rel="noreferrer" className="flex-1"><Button size="lg" variant="outline" className="w-full">📍 Mapa</Button></a>}
            </div>

            {insumos.length > 0 && (
              <><Separator /><p className="font-semibold">Necesidades actuales</p>
                {Object.entries(porArea).map(([area, items]) => (
                  <div key={area}>
                    <p className="text-xs font-semibold text-primary uppercase mt-2">🏷️ Servicio: {area}</p>
                    {(items as any[]).sort((a, b) => (PRIO_ORD[a.prioridad] ?? 9) - (PRIO_ORD[b.prioridad] ?? 9)).map((i) => (
                      <p key={i.id} className="flex justify-between gap-2 border-b py-1">
                        <span className="min-w-0 truncate">{i.nombre}{i.presentacion ? ` · ${i.presentacion}` : ""}{i.cantidad ? ` (${i.cantidad}${i.unidad ? " " + i.unidad : ""})` : ""}</span>
                        <span className={`text-xs ${i.prioridad === "critica" || i.prioridad === "alta" ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{i.prioridad}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </>
            )}

            <Separator />
            {/* Donar SIEMPRE procede. El aviso llega al responsable (si hay) y al admin. Nunca se bloquea. */}
            {!enviado ? (
              <>
                <p className="font-semibold">¿Quieres donar a este hospital? 💜</p>
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2}
                  placeholder="¿Qué quieres donar? Ej: 10 ampollas de midazolam, agua, pañales…"
                  className="border rounded-lg p-2 text-base bg-background" />
                <Button size="lg" onClick={donar} disabled={donando || !nota.trim()} className="w-full">
                  {donando ? "Enviando…" : "Quiero donar"}
                </Button>
                <p className="text-xs text-muted-foreground">Tu intención llega al responsable del hospital y al equipo de AviHelp para coordinar la recepción.</p>
              </>
            ) : (
              <div className="rounded-xl bg-primary/10 p-3">
                <p className="font-semibold mb-1">¡Listo! 💜 Recibimos tu intención de donar.</p>
                {resp ? (
                  <>
                    <p className="text-sm">Coordina la entrega con el responsable de recepción:</p>
                    {resp.nombre && <p>👤 {resp.nombre}</p>}
                    {resp.contacto && (
                      <a href={`tel:${resp.contacto}`} className="text-primary font-medium underline">📞 {resp.contacto}</a>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Este hospital aún no tiene responsable asignado, así que avisamos al equipo de AviHelp (admin). Te contactarán para coordinar la recepción.</p>
                )}
              </div>
            )}

            {gestion && (
              <><Separator /><p className="text-sm font-semibold">Gestión (admin / responsable)</p>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Nombre"><Input value={h.nombre ?? ""} onChange={(e) => setH({ ...h, nombre: e.target.value })} className={inputCls} /></Campo>
                  <Campo label="Tipo">
                    <select value={h.tipo ?? "hospital"} onChange={(e) => setH({ ...h, tipo: e.target.value })} className={selectCls}>
                      <option value="hospital">Hospital</option>
                      <option value="clinica">Clínica</option>
                      <option value="refugio">Refugio</option>
                    </select>
                  </Campo>
                </div>
                <Campo label="Ubicación"><Input value={h.ubicacion ?? ""} onChange={(e) => setH({ ...h, ubicacion: e.target.value })} className={inputCls} /></Campo>
                <Campo label="Nombre del responsable">
                  <Input value={h.responsable_recepcion_nombre ?? ""} onChange={(e) => setH({ ...h, responsable_recepcion_nombre: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Teléfono / contacto">
                  <Input value={h.responsable_recepcion_contacto ?? ""} onChange={(e) => setH({ ...h, responsable_recepcion_contacto: e.target.value })} className={inputCls} />
                </Campo>
                <div className="flex gap-2">
                  <Button size="lg" onClick={guardarResp} disabled={guardando} className="flex-1">{guardando ? "Guardando…" : "Guardar"}</Button>
                  {rol === "admin" && <Button size="lg" variant="ghost" onClick={borrarHospital} className="text-destructive">Eliminar</Button>}
                </div>
                <Separator />
                <HospitalResponsables hospitalId={hospital.id} />
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
