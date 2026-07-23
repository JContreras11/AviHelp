"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  crearCamion, actualizarCamion, eliminarCamion,
  crearCamionero, actualizarCamionero, eliminarCamionero,
  asignarCamionAEntrega, avanzarEntregaCamionero,
  listarCamiones, listarCamioneros, listarEntregasAsignables, misEntregasCamionero,
  type CamionConCarga,
} from "@/app/actions/camiones";

// LANE T — UI de flota (mobile-first): camiones con indicador de capacidad
// (lleno / con espacio), camioneros, asignación camión+chofer a una entrega por código,
// y la HOJA DE RUTA del camionero (avanzar estado + foto de evidencia).

type Centro = { id: string; nombre: string; zona?: string | null };
type Camionero = { id: string; nombre: string; telefono: string | null; licencia: string | null; centro_id: string | null; activo: boolean; centro?: { nombre: string | null } | null };
type EntregaAsignable = {
  id: string; codigo: string; estado: string; cantidad: number | null;
  camion_id: string | null; camionero_id: string | null;
  hospital?: { nombre: string | null } | null; refugio?: { nombre: string | null } | null;
  insumos?: { nombre: string | null } | null; ofertas?: { descripcion: string | null } | null;
};
type MiEntrega = {
  id: string; codigo: string; estado: string; cantidad: number | null; siguiente: string | null;
  hospital?: { nombre: string | null; ubicacion: string | null } | null;
  refugio?: { nombre: string | null; ubicacion: string | null } | null;
  insumos?: { nombre: string | null } | null; ofertas?: { descripcion: string | null } | null;
  camion?: { placa: string | null; modelo: string | null } | null;
};

const ESTADO_ENTREGA: Record<string, string> = {
  registrada: "Registrada",
  en_camino_acopio: "En camino al acopio",
  en_acopio: "En el acopio",
  en_camino_hospital: "En camino al hospital",
  recibido: "Recibida ✅",
};
const ACCION_SIGUIENTE: Record<string, string> = {
  en_camino_acopio: "🚚 Salir hacia el acopio",
  en_acopio: "📦 Llegué al acopio",
  en_camino_hospital: "🚚 Salir hacia el hospital",
  recibido: "✅ Entregada en mano (recibido)",
};

export function Camiones({ esLogistica, soyCamionero, camiones: camionesInicial, camioneros: camionerosInicial, centros, entregas: entregasInicial, misEntregas: misInicial }: {
  esLogistica: boolean; soyCamionero: boolean;
  camiones: CamionConCarga[]; camioneros: Camionero[]; centros: Centro[];
  entregas: EntregaAsignable[]; misEntregas: MiEntrega[];
}) {
  const [camiones, setCamiones] = useState(camionesInicial);
  const [camioneros, setCamioneros] = useState(camionerosInicial);
  const [entregas, setEntregas] = useState(entregasInicial);
  const [mis, setMis] = useState(misInicial);

  const centroOpts = useMemo(() => centros.map((c) => ({ value: c.id, label: c.nombre, keywords: c.zona ?? "" })), [centros]);

  async function refrescarFlota() {
    const [ca, cs, en] = await Promise.all([listarCamiones(), listarCamioneros(), listarEntregasAsignables()]);
    setCamiones(ca); setCamioneros(cs as Camionero[]); setEntregas(en as EntregaAsignable[]);
  }

  return (
    <div className="flex flex-col gap-8">
      {soyCamionero && (
        <MisEntregas mis={mis} onRefresh={async () => setMis((await misEntregasCamionero()) as MiEntrega[])} />
      )}
      {esLogistica && (
        <>
          <AsignarEntrega camiones={camiones} camioneros={camioneros} entregas={entregas} onDone={refrescarFlota} />
          <SeccionCamiones camiones={camiones} centroOpts={centroOpts} onChange={refrescarFlota} />
          <SeccionCamioneros camioneros={camioneros} centroOpts={centroOpts} onChange={refrescarFlota} />
        </>
      )}
    </div>
  );
}

// ── Camiones: lista con capacidad + alta/edición ──
function SeccionCamiones({ camiones, centroOpts, onChange }: {
  camiones: CamionConCarga[]; centroOpts: { value: string; label: string }[]; onChange: () => Promise<void>;
}) {
  const [editando, setEditando] = useState<CamionConCarga | null>(null);
  const [creando, setCreando] = useState(false);

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este camión? Las entregas asignadas quedan sin camión.")) return;
    const r = await eliminarCamion(id);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Camión eliminado."); await onChange();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">🚛 Camiones</h2>
        <Button size="sm" onClick={() => { setCreando((v) => !v); setEditando(null); }}>
          {creando ? "Cerrar" : "＋ Añadir camión"}
        </Button>
      </div>
      {(creando || editando) && (
        <FormCamion
          key={editando?.id ?? "nuevo"}
          camion={editando}
          centroOpts={centroOpts}
          onDone={async () => { setCreando(false); setEditando(null); await onChange(); }}
          onCancel={() => { setCreando(false); setEditando(null); }}
        />
      )}
      {!camiones.length && !creando && (
        <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          Aún no hay camiones registrados.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {camiones.map((c) => {
          const cap = c.capacidad != null ? Number(c.capacidad) : null;
          const pct = cap ? Math.min(100, Math.round((c.usado / cap) * 100)) : 0;
          return (
            <div key={c.id} className="rounded-xl border p-4 bg-card text-card-foreground flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {c.placa || "Sin placa"}{c.modelo ? ` · ${c.modelo}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.centro?.nombre ?? "Sin centro asignado"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {!c.activo && <Badge variant="outline">Inactivo</Badge>}
                  {cap != null ? (
                    c.lleno
                      ? <Badge variant="destructive">Lleno</Badge>
                      : <Badge className="bg-emerald-100 text-emerald-700">Con espacio</Badge>
                  ) : <Badge variant="secondary">Sin capacidad definida</Badge>}
                </div>
              </div>
              {cap != null && (
                <div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${c.lleno ? "bg-destructive" : "bg-emerald-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.usado} / {cap} {c.capacidad_unidad ?? "kg"} en curso · libre: {c.disponible} {c.capacidad_unidad ?? "kg"}
                  </p>
                </div>
              )}
              {c.notas && <p className="text-xs text-muted-foreground">{c.notas}</p>}
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant="outline" onClick={() => setEditando(c)}>Editar</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => eliminar(c.id)}>Eliminar</Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FormCamion({ camion, centroOpts, onDone, onCancel }: {
  camion: CamionConCarga | null; centroOpts: { value: string; label: string }[];
  onDone: () => Promise<void>; onCancel: () => void;
}) {
  const [placa, setPlaca] = useState(camion?.placa ?? "");
  const [modelo, setModelo] = useState(camion?.modelo ?? "");
  const [capacidad, setCapacidad] = useState(camion?.capacidad != null ? String(camion.capacidad) : "");
  const [unidad, setUnidad] = useState(camion?.capacidad_unidad ?? "kg");
  const [centroId, setCentroId] = useState<string | null>(camion?.centro_id ?? null);
  const [activo, setActivo] = useState(camion?.activo ?? true);
  const [notas, setNotas] = useState(camion?.notas ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const campos = {
      placa: placa.trim() || null, modelo: modelo.trim() || null,
      capacidad: capacidad.trim() ? Number(capacidad) : null,
      capacidad_unidad: unidad.trim() || "kg", centro_id: centroId, activo, notas: notas.trim() || null,
    };
    const r = camion ? await actualizarCamion(camion.id, campos) : await crearCamion(campos);
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(camion ? "Camión actualizado." : "Camión creado.");
    await onDone();
  }

  return (
    <div className="rounded-xl border p-4 mb-4 flex flex-col gap-3 bg-card">
      <p className="font-medium text-sm">{camion ? "Editar camión" : "Nuevo camión"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Placa" value={placa} onChange={(e) => setPlaca(e.target.value)} />
        <Input placeholder="Modelo (ej. NPR cava)" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        <Input placeholder="Capacidad total" type="number" inputMode="decimal" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} />
        <SearchableSelect
          options={[{ value: "kg", label: "kg" }, { value: "m3", label: "m³" }, { value: "unidades", label: "unidades" }, { value: "cajas", label: "cajas" }]}
          value={unidad} onChange={(v) => setUnidad(v ?? "kg")} placeholder="Unidad de capacidad"
        />
        <SearchableSelect options={centroOpts} value={centroId} onChange={setCentroId} placeholder="Centro de acopio (opcional)" className="sm:col-span-2" />
        <Input placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} className="sm:col-span-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

// ── Camioneros: lista + alta/edición ──
function SeccionCamioneros({ camioneros, centroOpts, onChange }: {
  camioneros: Camionero[]; centroOpts: { value: string; label: string }[]; onChange: () => Promise<void>;
}) {
  const [editando, setEditando] = useState<Camionero | null>(null);
  const [creando, setCreando] = useState(false);

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este camionero?")) return;
    const r = await eliminarCamionero(id);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Camionero eliminado."); await onChange();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">🧑‍✈️ Camioneros</h2>
        <Button size="sm" onClick={() => { setCreando((v) => !v); setEditando(null); }}>
          {creando ? "Cerrar" : "＋ Añadir camionero"}
        </Button>
      </div>
      {(creando || editando) && (
        <FormCamionero
          key={editando?.id ?? "nuevo"}
          camionero={editando}
          centroOpts={centroOpts}
          onDone={async () => { setCreando(false); setEditando(null); await onChange(); }}
          onCancel={() => { setCreando(false); setEditando(null); }}
        />
      )}
      {!camioneros.length && !creando && (
        <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          Aún no hay camioneros registrados.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {camioneros.map((c) => (
          <div key={c.id} className="rounded-xl border p-4 bg-card flex flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium truncate">{c.nombre}</p>
              {!c.activo && <Badge variant="outline">Inactivo</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {c.telefono ? `📞 ${c.telefono}` : "Sin teléfono"}{c.licencia ? ` · Lic. ${c.licencia}` : ""}
            </p>
            <p className="text-xs text-muted-foreground truncate">{c.centro?.nombre ?? "Sin centro asignado"}</p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={() => setEditando(c)}>Editar</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => eliminar(c.id)}>Eliminar</Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FormCamionero({ camionero, centroOpts, onDone, onCancel }: {
  camionero: Camionero | null; centroOpts: { value: string; label: string }[];
  onDone: () => Promise<void>; onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(camionero?.nombre ?? "");
  const [telefono, setTelefono] = useState(camionero?.telefono ?? "");
  const [licencia, setLicencia] = useState(camionero?.licencia ?? "");
  const [centroId, setCentroId] = useState<string | null>(camionero?.centro_id ?? null);
  const [activo, setActivo] = useState(camionero?.activo ?? true);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!nombre.trim()) { toast.error("El nombre es obligatorio."); return; }
    setGuardando(true);
    const campos = { nombre: nombre.trim(), telefono: telefono.trim() || null, licencia: licencia.trim() || null, centro_id: centroId, activo };
    const r = camionero ? await actualizarCamionero(camionero.id, campos) : await crearCamionero(campos);
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(camionero ? "Camionero actualizado." : "Camionero creado.");
    await onDone();
  }

  return (
    <div className="rounded-xl border p-4 mb-4 flex flex-col gap-3 bg-card">
      <p className="font-medium text-sm">{camionero ? "Editar camionero" : "Nuevo camionero"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Nombre *" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Input placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <Input placeholder="Licencia" value={licencia} onChange={(e) => setLicencia(e.target.value)} />
        <SearchableSelect options={centroOpts} value={centroId} onChange={setCentroId} placeholder="Centro de acopio (opcional)" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo
      </label>
      <p className="text-xs text-muted-foreground">
        Si el camionero tiene cuenta en AviHelp, un admin puede ligar su usuario (columna user_id)
        para que vea sus entregas al entrar a esta página.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

// ── Asignar camión + camionero a una entrega ──
function AsignarEntrega({ camiones, camioneros, entregas, onDone }: {
  camiones: CamionConCarga[]; camioneros: Camionero[]; entregas: EntregaAsignable[]; onDone: () => Promise<void>;
}) {
  const [entregaCodigo, setEntregaCodigo] = useState<string | null>(null);
  const [camionId, setCamionId] = useState<string | null>(null);
  const [camioneroId, setCamioneroId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const entregaOpts = useMemo(() => entregas.map((e) => ({
    value: e.codigo,
    label: `${e.codigo} · ${e.insumos?.nombre ?? e.ofertas?.descripcion ?? "Donación"} → ${e.hospital?.nombre ?? "hospital por definir"}`,
    keywords: `${e.estado} ${e.refugio?.nombre ?? ""}`,
  })), [entregas]);
  const camionOpts = useMemo(() => camiones.filter((c) => c.activo).map((c) => ({
    value: c.id,
    label: `${c.placa || c.modelo || "Camión"}${c.lleno ? " · LLENO" : c.disponible != null ? ` · libre ${c.disponible} ${c.capacidad_unidad ?? "kg"}` : ""}`,
    keywords: `${c.modelo ?? ""} ${c.centro?.nombre ?? ""}`,
  })), [camiones]);
  const camioneroOpts = useMemo(() => camioneros.filter((c) => c.activo).map((c) => ({
    value: c.id, label: c.nombre, keywords: c.centro?.nombre ?? "",
  })), [camioneros]);

  const sel = entregas.find((e) => e.codigo === entregaCodigo);

  async function asignar() {
    if (!entregaCodigo) { toast.error("Selecciona la entrega."); return; }
    if (!camionId && !camioneroId) { toast.error("Selecciona camión y/o camionero."); return; }
    setGuardando(true);
    const r = await asignarCamionAEntrega(entregaCodigo, { camionId, camioneroId });
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    if (r.aviso) toast.warning(r.aviso);
    toast.success("Asignación guardada.");
    setEntregaCodigo(null); setCamionId(null); setCamioneroId(null);
    await onDone();
  }

  return (
    <section className="rounded-xl border p-4 bg-card flex flex-col gap-3">
      <h2 className="text-lg font-semibold">📦 Cargar camión (asignar a entrega)</h2>
      <p className="text-xs text-muted-foreground">
        Elige una entrega en curso y asígnale camión y chofer. El indicador muestra si el camión
        va lleno o con espacio.
      </p>
      <SearchableSelect options={entregaOpts} value={entregaCodigo} onChange={setEntregaCodigo} placeholder="Entrega (por código)…" />
      {sel && (
        <p className="text-xs text-muted-foreground">
          Estado: <span className="font-medium">{ESTADO_ENTREGA[sel.estado] ?? sel.estado}</span>
          {sel.cantidad != null && <> · cantidad: {sel.cantidad}</>}
          {sel.camion_id && <> · ya tiene camión asignado</>}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <SearchableSelect options={camionOpts} value={camionId} onChange={setCamionId} placeholder="Camión…" />
        <SearchableSelect options={camioneroOpts} value={camioneroId} onChange={setCamioneroId} placeholder="Camionero…" />
      </div>
      <Button onClick={asignar} disabled={guardando} className="self-start">
        {guardando ? "Asignando…" : "Asignar"}
      </Button>
    </section>
  );
}

// ── Vista del CAMIONERO: sus entregas, avanzar estado + evidencia ──
function MisEntregas({ mis, onRefresh }: { mis: MiEntrega[]; onRefresh: () => Promise<void> }) {
  const [avanzando, setAvanzando] = useState<string | null>(null);
  const fotoRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function avanzar(e: MiEntrega) {
    if (!e.siguiente) return;
    setAvanzando(e.codigo);
    const fd = new FormData();
    fd.set("codigo", e.codigo);
    const file = fotoRefs.current[e.codigo]?.files?.[0];
    if (file) fd.set("foto", file);
    const r = await avanzarEntregaCamionero(fd);
    setAvanzando(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.estado === "recibido" ? "Entrega marcada como RECIBIDA. ¡Gracias!" : "Estado actualizado.");
    await onRefresh();
  }

  const activas = mis.filter((m) => m.estado !== "recibido");
  const cerradas = mis.filter((m) => m.estado === "recibido");

  return (
    <section className="rounded-xl border p-4 bg-card flex flex-col gap-3">
      <h2 className="text-lg font-semibold">🗺️ Mis entregas (camionero)</h2>
      {!activas.length && (
        <p className="text-sm text-muted-foreground">No tienes entregas asignadas en curso.</p>
      )}
      <div className="flex flex-col gap-3">
        {activas.map((e) => (
          <div key={e.id} className="rounded-lg border p-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {e.insumos?.nombre ?? e.ofertas?.descripcion ?? "Donación"}
                  {e.cantidad != null && <span className="text-muted-foreground"> · {e.cantidad}</span>}
                </p>
                <p className="text-xs text-muted-foreground font-mono">{e.codigo}</p>
              </div>
              <Badge variant="secondary">{ESTADO_ENTREGA[e.estado] ?? e.estado}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {e.refugio?.nombre && <>Acopio: {e.refugio.nombre} · </>}
              Destino: {e.hospital?.nombre ?? "por definir"}
              {e.camion && <> · 🚛 {e.camion.placa || e.camion.modelo}</>}
            </p>
            {e.siguiente && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  ref={(el) => { fotoRefs.current[e.codigo] = el; }}
                  type="file" accept="image/*" capture="environment"
                  className="text-xs file:mr-2 file:rounded-md file:border file:px-2 file:py-1 file:text-xs"
                  aria-label="Foto de evidencia"
                />
                <Button size="sm" onClick={() => avanzar(e)} disabled={avanzando === e.codigo}>
                  {avanzando === e.codigo ? "Guardando…" : (ACCION_SIGUIENTE[e.siguiente] ?? "Avanzar")}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!!cerradas.length && (
        <details>
          <summary className="text-sm text-muted-foreground cursor-pointer">
            Entregadas recientemente ({cerradas.length})
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {cerradas.map((e) => (
              <p key={e.id} className="text-xs text-muted-foreground">
                ✅ <span className="font-mono">{e.codigo}</span> · {e.insumos?.nombre ?? e.ofertas?.descripcion ?? "Donación"} → {e.hospital?.nombre ?? "—"}
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export default Camiones;
