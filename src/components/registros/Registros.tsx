"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buscarRegistros } from "@/app/actions/buscar";
import {
  actualizarPersona, eliminarPersona, getPersona,
  actualizarInsumo, eliminarInsumo, cambiarEstadoInsumo, getInsumo, registrarDonacion,
} from "@/app/actions/crud";

const ESTADO_DOT: Record<string, string> = {
  herido: "bg-amber-400", desaparecido: "bg-red-500", detenido: "bg-purple-500",
  fallecido: "bg-gray-400", vivo: "bg-green-500", desconocido: "bg-muted-foreground/40",
};
const ESTADOS = ["vivo", "herido", "desaparecido", "detenido", "fallecido", "desconocido"];
const ESTADOS_INSUMO = ["solicitado", "en_transito", "entregado", "cancelado"];

function iniciales(n: string) {
  return n.split(" ").slice(0, 2).map((x) => x[0]).join("").toUpperCase();
}
function mapsUrl(lat?: number | null, lng?: number | null, q?: string | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps?q=${lat},${lng}`;
  if (q) return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
  return null;
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

  return (
    <div className="max-w-5xl mx-auto w-full">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Buscar persona, cédula, ubicación o insumo…"
        className="h-11 mb-6"
      />

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-semibold mb-3">Personas {q && `(${personas.length})`}</h2>
          <div className="space-y-2">
            {personas.map((p) => (
              <button key={p.id} onClick={() => setSel({ tipo: "persona", id: p.id })}
                className="w-full text-left flex items-center gap-3 border rounded-xl px-3 py-2.5 hover:bg-muted/50 hover:border-primary/40 transition">
                <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold shrink-0">
                  {iniciales(p.nombre)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[p.edad && `${p.edad}a`, p.ubicacion, p.cedula].filter(Boolean).join(" · ") || "Sin detalles"}
                  </p>
                </div>
                <span className={`size-2.5 rounded-full ${ESTADO_DOT[p.estado_salud] ?? "bg-muted"}`} title={p.estado_salud} />
              </button>
            ))}
            {!personas.length && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-3">Insumos {q && `(${insumos.length})`}</h2>
          <div className="space-y-2">
            {insumos.map((i) => (
              <button key={i.id} onClick={() => setSel({ tipo: "insumo", id: i.id })}
                className="w-full text-left flex items-center gap-3 border rounded-xl px-3 py-2.5 hover:bg-muted/50 hover:border-primary/40 transition">
                <div className="size-9 rounded-full bg-accent grid place-items-center text-sm shrink-0">📦</div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{i.nombre}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[i.cantidad && `${i.cantidad} ${i.unidad ?? ""}`, i.hospitales?.nombre].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">{i.estado?.replace("_", " ")}</Badge>
              </button>
            ))}
            {!insumos.length && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
          </div>
        </section>
      </div>

      {sel?.tipo === "persona" && (
        <PersonaDialog id={sel.id} onClose={() => setSel(null)} onChanged={() => { router.refresh(); setQ((x) => x); }} />
      )}
      {sel?.tipo === "insumo" && (
        <InsumoDialog id={sel.id} onClose={() => setSel(null)} onChanged={() => { router.refresh(); setQ((x) => x); }} />
      )}
    </div>
  );
}

function Campo({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-8 mt-0.5 text-sm text-foreground" />
    </label>
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
    if (r.ok) { toast.success("Persona actualizada"); onChanged(); onClose(); } else toast.error(r.error);
  }
  async function borrar() {
    if (!confirm("¿Eliminar esta persona?")) return;
    const r = await eliminarPersona(id);
    if (r.ok) { toast.success("Eliminada"); onChanged(); onClose(); } else toast.error(r.error);
  }

  const maps = p && mapsUrl(p.gps_lat, p.gps_lng, p.ubicacion);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle>{p?.nombre ?? "Cargando…"}</DialogTitle></DialogHeader>
        {p && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Nombre" value={p.nombre} onChange={(v) => setP({ ...p, nombre: v })} />
              <Campo label="Cédula" value={p.cedula} onChange={(v) => setP({ ...p, cedula: v })} />
              <Campo label="Edad" value={p.edad} onChange={(v) => setP({ ...p, edad: v ? Number(v) : null })} />
              <label className="text-xs text-muted-foreground">Estado
                <select value={p.estado_salud} onChange={(e) => setP({ ...p, estado_salud: e.target.value })}
                  className="h-8 mt-0.5 w-full border rounded-md px-2 text-sm bg-background">
                  {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <Campo label="Ubicación" value={p.ubicacion} onChange={(v) => setP({ ...p, ubicacion: v })} />
              <Campo label="Teléfono" value={p.telefono_contacto} onChange={(v) => setP({ ...p, telefono_contacto: v })} />
            </div>
            <Campo label="Descripción física" value={p.descripcion_fisica} onChange={(v) => setP({ ...p, descripcion_fisica: v })} />
            <Campo label="Notas" value={p.notas} onChange={(v) => setP({ ...p, notas: v })} />

            {p.fotos?.length > 0 && <p className="text-xs text-muted-foreground">📷 {p.fotos.length} foto(s) en archivo</p>}
            {historial.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium mb-1">Historial</p>
                  {historial.map((h) => (
                    <p key={h.id} className="text-xs text-muted-foreground">• {h.estado_salud} {h.ubicacion ? `· ${h.ubicacion}` : ""}</p>
                  ))}
                </div>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {p.telefono_contacto && <a href={`tel:${p.telefono_contacto}`}><Button variant="outline" size="sm">📞 Llamar</Button></a>}
              {maps && <a href={maps} target="_blank" rel="noreferrer"><Button variant="outline" size="sm">📍 Ver en mapa</Button></a>}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={borrar} className="text-destructive mr-auto">Eliminar</Button>
          <Button size="sm" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</Button>
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
    if (r.ok) { toast.success(`Marcado: ${estado.replace("_", " ")}`); cargar(); onChanged(); } else toast.error(r.error);
  }
  async function guardar() {
    const r = await actualizarInsumo(id, i);
    if (r.ok) { toast.success("Insumo actualizado"); onChanged(); } else toast.error(r.error);
  }
  async function borrar() {
    if (!confirm("¿Eliminar este insumo?")) return;
    const r = await eliminarInsumo(id);
    if (r.ok) { toast.success("Eliminado"); onChanged(); onClose(); } else toast.error(r.error);
  }
  async function donar() {
    const m = Number(monto);
    if (!m || !i?.hospital_id) return toast.error("Monto inválido o sin hospital");
    const r = await registrarDonacion(i.hospital_id, m, donante || "Anónimo");
    if (r.ok) { toast.success(`Donación de $${m} registrada`); setMonto(""); } else toast.error(r.error);
  }

  const h = i?.hospitales;
  const maps = h && mapsUrl(h.gps_lat, h.gps_lng, h.nombre);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle>{i?.nombre ?? "Cargando…"}</DialogTitle></DialogHeader>
        {i && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Nombre" value={i.nombre} onChange={(v) => setI({ ...i, nombre: v })} />
              <Campo label="Cantidad" value={i.cantidad} onChange={(v) => setI({ ...i, cantidad: v ? Number(v) : null })} />
              <Campo label="Unidad" value={i.unidad} onChange={(v) => setI({ ...i, unidad: v })} />
              <label className="text-xs text-muted-foreground">Estado
                <select value={i.estado} onChange={(e) => setI({ ...i, estado: e.target.value })}
                  className="h-8 mt-0.5 w-full border rounded-md px-2 text-sm bg-background capitalize">
                  {ESTADOS_INSUMO.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </label>
            </div>
            {h && <p className="text-sm">🏥 {h.nombre} {h.ubicacion ? `· ${h.ubicacion}` : ""}</p>}

            <Separator />
            <p className="text-xs font-medium">Tracking</p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant={i.estado === "en_transito" ? "default" : "outline"} onClick={() => cambiarEstado("en_transito")}>🚚 En tránsito</Button>
              <Button size="sm" variant={i.estado === "entregado" ? "default" : "outline"} onClick={() => cambiarEstado("entregado")}>✅ Entregado</Button>
              {maps && <a href={maps} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">📍 Hospital en mapa</Button></a>}
            </div>

            <Separator />
            <p className="text-xs font-medium">Donar</p>
            <div className="flex gap-2 flex-wrap items-end">
              <Input value={donante} onChange={(e) => setDonante(e.target.value)} placeholder="Tu nombre / ONG" className="h-8 text-sm flex-1 min-w-[120px]" />
              <Button size="sm" variant="outline" onClick={() => cambiarEstado("en_transito")}>Donar este insumo</Button>
            </div>
            <div className="flex gap-2 flex-wrap items-end">
              <Input value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$ monto" className="h-8 text-sm w-28" />
              <Button size="sm" variant="outline" onClick={donar}>💜 Donación monetaria</Button>
            </div>

            {eventos.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium mb-1">Eventos</p>
                  {eventos.map((e) => <p key={e.id} className="text-xs text-muted-foreground">• {e.estado.replace("_", " ")} {e.actor ? `· ${e.actor}` : ""}</p>)}
                </div>
              </>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={borrar} className="text-destructive mr-auto">Eliminar</Button>
          <Button size="sm" onClick={guardar}>Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
