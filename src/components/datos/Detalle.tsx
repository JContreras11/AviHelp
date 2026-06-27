"use client";

import { useEffect, useState } from "react";
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
  actualizarInsumo, eliminarInsumo, cambiarEstadoInsumo, cubrirInsumo, getInsumo, registrarDonacion,
} from "@/app/actions/crud";

const PRESENTACIONES = ["", "frasco", "tableta", "comprimido", "vial", "ampolla", "polvo", "jarabe", "solución", "otro"];

const ESTADOS = ["vivo", "herido", "desaparecido", "detenido", "fallecido", "desconocido"];
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
  const { puede } = useRol();
  const editable = puede("editar");
  const [p, setP] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { getPersona(id).then((r) => { setP(r.persona); setHistorial(r.historial); }); }, [id]);

  async function guardar() {
    setGuardando(true);
    const r = await actualizarPersona(id, p);
    setGuardando(false);
    if (r.ok) { toast.success("Persona actualizada"); onChanged(); onClose(); } else toast.error((r as any).error);
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
        <DialogHeader><DialogTitle className="text-xl">{p?.nombre ?? "Cargando…"}</DialogTitle></DialogHeader>
        {p && (
          <div className="flex flex-col gap-3">
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
              <Campo label="Sexo">
                <select disabled={ro} value={p.sexo ?? "desconocido"} onChange={(e) => setP({ ...p, sexo: e.target.value })} className={selectCls}>
                  {["M", "F", "O", "desconocido"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Campo>
            </div>
            <Campo label="Hospital / ubicación">
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
  const { puede } = useRol();
  const [i, setI] = useState<any>(null);
  const [eventos, setEventos] = useState<any[]>([]);
  const [donante, setDonante] = useState("");
  const [monto, setMonto] = useState("");
  const editable = puede("editar"), tracking = puede("tracking"), donar = puede("donar"), cubrir = puede("cubrir");
  const ro = !editable;

  const cargar = () => getInsumo(id).then((r) => { setI(r.insumo); setEventos(r.eventos); });
  useEffect(() => { cargar(); }, [id]);

  async function cambiarEstado(estado: string) {
    const r = await cambiarEstadoInsumo(id, estado, donante || undefined);
    if (r.ok) { toast.success(`Marcado: ${estado.replace("_", " ")}`); cargar(); onChanged(); } else toast.error((r as any).error);
  }
  async function marcarCubierto() {
    if (!confirm("¿Confirmas que el hospital ya RECIBIÓ este insumo? Saldrá de la lista de pendientes.")) return;
    const r = await cubrirInsumo(id, donante || undefined);
    if (r.ok) { toast.success("Insumo cubierto ✓"); cargar(); onChanged(); } else toast.error((r as any).error);
  }
  async function guardar() {
    const r = await actualizarInsumo(id, i);
    if (r.ok) { toast.success("Insumo actualizado"); onChanged(); } else toast.error((r as any).error);
  }
  async function borrar() {
    if (!confirm("¿Eliminar este insumo?")) return;
    const r = await eliminarInsumo(id);
    if (r.ok) { toast.success("Eliminado"); onChanged(); onClose(); } else toast.error((r as any).error);
  }
  async function donarMonto() {
    const m = Number(monto);
    if (!m || !i?.hospital_id) return toast.error("Monto inválido o sin hospital");
    const r = await registrarDonacion(i.hospital_id, m, donante || "Anónimo");
    if (r.ok) { toast.success(`Donación de $${m} registrada`); setMonto(""); onChanged(); } else toast.error((r as any).error);
  }
  const h = i?.hospitales;
  const maps = h && mapsUrl(h.gps_lat, h.gps_lng, h.nombre);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-xl">{i?.nombre ?? "Cargando…"}</DialogTitle></DialogHeader>
        {i && (
          <div className="flex flex-col gap-3">
            <Campo label="Nombre"><Input readOnly={ro} value={i.nombre ?? ""} onChange={(e) => setI({ ...i, nombre: e.target.value })} className={inputCls} /></Campo>
            <div className="grid grid-cols-3 gap-2">
              <Campo label="Cantidad"><Input readOnly={ro} value={i.cantidad ?? ""} inputMode="numeric" onChange={(e) => setI({ ...i, cantidad: e.target.value ? Number(e.target.value) : null })} className={inputCls} /></Campo>
              <Campo label="Tipo">
                <select disabled={ro} value={i.presentacion ?? ""} onChange={(e) => setI({ ...i, presentacion: e.target.value || null })} className={`${selectCls} capitalize`}>
                  {PRESENTACIONES.map((s) => <option key={s} value={s}>{s || "—"}</option>)}
                </select>
              </Campo>
              <Campo label="Dosis/unidad"><Input readOnly={ro} value={i.unidad ?? ""} placeholder="mg, ml…" onChange={(e) => setI({ ...i, unidad: e.target.value })} className={inputCls} /></Campo>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Área"><Input readOnly={ro} value={i.area ?? ""} placeholder="Trauma, Neonato…" onChange={(e) => setI({ ...i, area: e.target.value })} className={inputCls} /></Campo>
              <Campo label="Estado">
                <select disabled={ro} value={i.estado} onChange={(e) => setI({ ...i, estado: e.target.value })} className={`${selectCls} capitalize`}>
                  {ESTADOS_INSUMO.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </Campo>
            </div>
            <Campo label="¿Para qué sirve?"><Input readOnly={ro} value={i.para_que_sirve ?? ""} onChange={(e) => setI({ ...i, para_que_sirve: e.target.value })} className={inputCls} /></Campo>
            <Campo label="Alternativas si no se consigue"><Input readOnly={ro} value={i.alternativas ?? ""} onChange={(e) => setI({ ...i, alternativas: e.target.value })} className={inputCls} /></Campo>
            {h && <p className="text-base">🏥 {h.nombre}{h.ubicacion ? ` · ${h.ubicacion}` : ""}</p>}
            <p className="text-xs text-muted-foreground" title={fechaHora(i.created_at)}>
              🕑 Solicitado {hace(i.created_at)}{i.estado === "cubierto" && i.cubierto_at ? ` · cubierto ${hace(i.cubierto_at)}` : ""}
            </p>

            {tracking && (<>
              <Separator /><p className="text-sm font-semibold">Tracking</p>
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" variant={i.estado === "en_transito" ? "default" : "outline"} onClick={() => cambiarEstado("en_transito")}>🚚 En tránsito</Button>
                <Button size="lg" variant={i.estado === "entregado" ? "default" : "outline"} onClick={() => cambiarEstado("entregado")}>✅ Entregado</Button>
              </div>
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

            {donar && (<>
              <Separator /><p className="text-sm font-semibold">Donar 💜</p>
              <Input value={donante} onChange={(e) => setDonante(e.target.value)} placeholder="Tu nombre / ONG" className={inputCls} />
              <Button size="lg" variant="outline" onClick={() => cambiarEstado("en_transito")} className="w-full">Donar este insumo</Button>
              <div className="flex gap-2">
                <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" placeholder="$ monto" className={`${inputCls} flex-1`} />
                <Button size="lg" variant="outline" onClick={donarMonto}>Donación $</Button>
              </div>
            </>)}

            {eventos.length > 0 && (
              <><Separator /><div><p className="text-sm font-medium mb-1">Eventos</p>
                {eventos.map((e) => <p key={e.id} className="text-sm text-muted-foreground">• {e.estado.replace("_", " ")} {e.actor ? `· ${e.actor}` : ""}</p>)}
              </div></>
            )}
          </div>
        )}
        {editable && (
          <DialogFooter className="gap-2">
            {puede("eliminar") && <Button variant="ghost" size="lg" onClick={borrar} className="text-destructive sm:mr-auto">Eliminar</Button>}
            <Button size="lg" onClick={guardar} className="px-8">Guardar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function HospitalDialog({ hospital, onClose }: { hospital: any; onClose: () => void }) {
  const maps = mapsUrl(hospital.gps_lat, hospital.gps_lng, hospital.nombre);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-xl">🏥 {hospital.nombre}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          {hospital.ubicacion && <p>📍 {hospital.ubicacion}</p>}
          <p>{hospital.personas ?? 0} personas · {hospital.insumos ?? 0} insumos · {hospital.criticos ?? 0} críticos</p>
          {maps && <a href={maps} target="_blank" rel="noreferrer"><Button size="lg" variant="outline" className="w-full">📍 Ver en mapa</Button></a>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
