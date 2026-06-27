"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Img } from "@/components/Img";
import { buscarRegistros } from "@/app/actions/buscar";
import {
  actualizarPersona, eliminarPersona, getPersona,
  actualizarInsumo, eliminarInsumo, cambiarEstadoInsumo, getInsumo, registrarDonacion,
} from "@/app/actions/crud";

const ESTADO_PILL: Record<string, string> = {
  herido: "bg-amber-100 text-amber-800", desaparecido: "bg-red-100 text-red-700",
  detenido: "bg-purple-100 text-purple-700", fallecido: "bg-gray-200 text-gray-700",
  vivo: "bg-green-100 text-green-700", desconocido: "bg-muted text-muted-foreground",
};
const ESTADOS = ["vivo", "herido", "desaparecido", "detenido", "fallecido", "desconocido"];
const ESTADOS_INSUMO = ["solicitado", "en_transito", "entregado", "cancelado"];
const inputCls = "h-11 text-base text-foreground";
const selectCls = "h-11 text-base border rounded-lg px-2 bg-background w-full";

function iniciales(n: string) {
  return n.split(" ").slice(0, 2).map((x) => x[0]).join("").toUpperCase();
}
function mapsUrl(lat?: number | null, lng?: number | null, q?: string | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps?q=${lat},${lng}`;
  if (q) return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
  return null;
}
function fecha(s?: string | null) {
  if (!s) return null;
  try { return new Date(s).toLocaleDateString("es-VE", { day: "2-digit", month: "short" }); } catch { return null; }
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{children}</span>;
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">{label}{children}</label>;
}

export function Registros({ personas: pIni, insumos: iIni }: { personas: any[]; insumos: any[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [personas, setPersonas] = useState(pIni);
  const [insumos, setInsumos] = useState(iIni);
  const [, startSearch] = useTransition();
  const [sel, setSel] = useState<{ tipo: "persona" | "insumo"; id: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      startSearch(async () => {
        const r = await buscarRegistros(q);
        setPersonas(r.personas); setInsumos(r.insumos);
      });
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const refrescar = () => { router.refresh(); buscarRegistros(q).then((r) => { setPersonas(r.personas); setInsumos(r.insumos); }); };

  return (
    <div className="max-w-5xl mx-auto w-full">
      <Input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Buscar persona, cédula, ubicación o insumo…" className="h-12 text-base mb-6" />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="font-semibold mb-3 text-lg">Personas {q && `(${personas.length})`}</h2>
          <div className="space-y-3">
            {personas.map((p) => (
              <button key={p.id} onClick={() => setSel({ tipo: "persona", id: p.id })}
                className="w-full text-left flex gap-3 border rounded-2xl p-3.5 hover:bg-muted/40 hover:border-primary/40 active:scale-[0.99] transition">
                <div className="size-12 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-bold shrink-0">
                  {iniciales(p.nombre)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-base truncate">{p.nombre}</p>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${ESTADO_PILL[p.estado_salud] ?? "bg-muted"}`}>
                      {p.estado_salud}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {p.cedula && <Chip>🪪 {p.cedula}</Chip>}
                    {p.edad && <Chip>{p.edad} años</Chip>}
                    {p.sexo && p.sexo !== "desconocido" && <Chip>{p.sexo}</Chip>}
                    {p.ubicacion && <Chip>📍 {p.ubicacion}</Chip>}
                    {p.telefono_contacto && <Chip>📞 {p.telefono_contacto}</Chip>}
                    {fecha(p.updated_at) && <Chip>🕑 {fecha(p.updated_at)}</Chip>}
                  </div>
                </div>
              </button>
            ))}
            {!personas.length && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-3 text-lg">Insumos {q && `(${insumos.length})`}</h2>
          <div className="space-y-3">
            {insumos.map((i) => (
              <button key={i.id} onClick={() => setSel({ tipo: "insumo", id: i.id })}
                className="w-full text-left flex gap-3 border rounded-2xl p-3.5 hover:bg-muted/40 hover:border-primary/40 active:scale-[0.99] transition">
                <div className="size-12 rounded-full bg-accent grid place-items-center text-xl shrink-0">📦</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-base truncate">{i.nombre}</p>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted capitalize shrink-0">{i.estado?.replace("_", " ")}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {i.cantidad && <Chip>{i.cantidad} {i.unidad ?? ""}</Chip>}
                    {i.hospitales?.nombre && <Chip>🏥 {i.hospitales.nombre}</Chip>}
                    {i.prioridad && <Chip>⚑ {i.prioridad}</Chip>}
                  </div>
                </div>
              </button>
            ))}
            {!insumos.length && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
          </div>
        </section>
      </div>

      {sel?.tipo === "persona" && <PersonaDialog id={sel.id} onClose={() => setSel(null)} onChanged={refrescar} />}
      {sel?.tipo === "insumo" && <InsumoDialog id={sel.id} onClose={() => setSel(null)} onChanged={refrescar} />}
    </div>
  );
}

function PersonaDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
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
            <Campo label="Nombre"><Input value={p.nombre ?? ""} onChange={(e) => setP({ ...p, nombre: e.target.value })} className={inputCls} /></Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Cédula"><Input value={p.cedula ?? ""} onChange={(e) => setP({ ...p, cedula: e.target.value })} className={inputCls} /></Campo>
              <Campo label="Edad"><Input value={p.edad ?? ""} inputMode="numeric" onChange={(e) => setP({ ...p, edad: e.target.value ? Number(e.target.value) : null })} className={inputCls} /></Campo>
              <Campo label="Estado">
                <select value={p.estado_salud} onChange={(e) => setP({ ...p, estado_salud: e.target.value })} className={selectCls}>
                  {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Campo>
              <Campo label="Sexo">
                <select value={p.sexo ?? "desconocido"} onChange={(e) => setP({ ...p, sexo: e.target.value })} className={selectCls}>
                  {["M", "F", "O", "desconocido"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Campo>
            </div>
            <Campo label="Ubicación"><Input value={p.ubicacion ?? ""} onChange={(e) => setP({ ...p, ubicacion: e.target.value })} className={inputCls} /></Campo>
            <Campo label="Teléfono de contacto"><Input value={p.telefono_contacto ?? ""} onChange={(e) => setP({ ...p, telefono_contacto: e.target.value })} className={inputCls} /></Campo>
            <Campo label="Descripción física"><Input value={p.descripcion_fisica ?? ""} onChange={(e) => setP({ ...p, descripcion_fisica: e.target.value })} className={inputCls} /></Campo>
            <Campo label="Notas"><Input value={p.notas ?? ""} onChange={(e) => setP({ ...p, notas: e.target.value })} className={inputCls} /></Campo>

            {historial.length > 0 && (
              <><Separator /><div><p className="text-sm font-medium mb-1">Historial</p>
                {historial.map((h) => <p key={h.id} className="text-sm text-muted-foreground">• {h.estado_salud} {h.ubicacion ? `· ${h.ubicacion}` : ""}</p>)}
              </div></>
            )}
            <div className="flex flex-wrap gap-2">
              {p.telefono_contacto && <a href={`tel:${p.telefono_contacto}`} className="flex-1"><Button variant="outline" size="lg" className="w-full">📞 Llamar</Button></a>}
              {maps && <a href={maps} target="_blank" rel="noreferrer" className="flex-1"><Button variant="outline" size="lg" className="w-full">📍 Ver en mapa</Button></a>}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="lg" onClick={borrar} className="text-destructive sm:mr-auto">Eliminar</Button>
          <Button size="lg" onClick={guardar} disabled={guardando} className="px-8">{guardando ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InsumoDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [i, setI] = useState<any>(null);
  const [eventos, setEventos] = useState<any[]>([]);
  const [donante, setDonante] = useState("");
  const [monto, setMonto] = useState("");

  const cargar = () => getInsumo(id).then((r) => { setI(r.insumo); setEventos(r.eventos); });
  useEffect(() => { cargar(); }, [id]);

  async function cambiarEstado(estado: string) {
    const r = await cambiarEstadoInsumo(id, estado, donante || undefined);
    if (r.ok) { toast.success(`Marcado: ${estado.replace("_", " ")}`); cargar(); onChanged(); } else toast.error((r as any).error);
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
  async function donar() {
    const m = Number(monto);
    if (!m || !i?.hospital_id) return toast.error("Monto inválido o sin hospital");
    const r = await registrarDonacion(i.hospital_id, m, donante || "Anónimo");
    if (r.ok) { toast.success(`Donación de $${m} registrada`); setMonto(""); } else toast.error((r as any).error);
  }
  const h = i?.hospitales;
  const maps = h && mapsUrl(h.gps_lat, h.gps_lng, h.nombre);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-xl">{i?.nombre ?? "Cargando…"}</DialogTitle></DialogHeader>
        {i && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Nombre"><Input value={i.nombre ?? ""} onChange={(e) => setI({ ...i, nombre: e.target.value })} className={inputCls} /></Campo>
              <Campo label="Cantidad"><Input value={i.cantidad ?? ""} inputMode="numeric" onChange={(e) => setI({ ...i, cantidad: e.target.value ? Number(e.target.value) : null })} className={inputCls} /></Campo>
              <Campo label="Unidad"><Input value={i.unidad ?? ""} onChange={(e) => setI({ ...i, unidad: e.target.value })} className={inputCls} /></Campo>
              <Campo label="Estado">
                <select value={i.estado} onChange={(e) => setI({ ...i, estado: e.target.value })} className={`${selectCls} capitalize`}>
                  {ESTADOS_INSUMO.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </Campo>
            </div>
            {h && <p className="text-base">🏥 {h.nombre}{h.ubicacion ? ` · ${h.ubicacion}` : ""}</p>}

            <Separator /><p className="text-sm font-semibold">Tracking</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" variant={i.estado === "en_transito" ? "default" : "outline"} onClick={() => cambiarEstado("en_transito")}>🚚 En tránsito</Button>
              <Button size="lg" variant={i.estado === "entregado" ? "default" : "outline"} onClick={() => cambiarEstado("entregado")}>✅ Entregado</Button>
            </div>
            {maps && <a href={maps} target="_blank" rel="noreferrer"><Button size="lg" variant="outline" className="w-full">📍 Hospital en mapa</Button></a>}

            <Separator /><p className="text-sm font-semibold">Donar 💜</p>
            <Input value={donante} onChange={(e) => setDonante(e.target.value)} placeholder="Tu nombre / ONG" className={inputCls} />
            <Button size="lg" variant="outline" onClick={() => cambiarEstado("en_transito")} className="w-full">Donar este insumo</Button>
            <div className="flex gap-2">
              <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" placeholder="$ monto" className={`${inputCls} flex-1`} />
              <Button size="lg" variant="outline" onClick={donar}>Donación $</Button>
            </div>

            {eventos.length > 0 && (
              <><Separator /><div><p className="text-sm font-medium mb-1">Eventos</p>
                {eventos.map((e) => <p key={e.id} className="text-sm text-muted-foreground">• {e.estado.replace("_", " ")} {e.actor ? `· ${e.actor}` : ""}</p>)}
              </div></>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="lg" onClick={borrar} className="text-destructive sm:mr-auto">Eliminar</Button>
          <Button size="lg" onClick={guardar} className="px-8">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
