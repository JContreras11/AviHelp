"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Plus, Pencil, Trash2, Users, MapPin } from "lucide-react";
import {
  crearReceptor, actualizarReceptor, eliminarReceptor,
  buscarReceptorPorFiscal, asignarReceptorAEntrega, type Receptor,
} from "@/app/actions/receptores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const PREFIJOS = [
  { value: "V", label: "V — Venezolano" },
  { value: "E", label: "E — Extranjero" },
  { value: "J", label: "J — Jurídico" },
  { value: "G", label: "G — Gobierno" },
  { value: "P", label: "P — Pasaporte" },
];

const PRIO: Record<string, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
  alta: { label: "Prioridad alta", variant: "destructive" },
  media: { label: "Prioridad media", variant: "secondary" },
  baja: { label: "Prioridad baja", variant: "outline" },
};
const PRIO_OPCIONES = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

type Form = Partial<Receptor>;
const VACIO: Form = { id_fiscal_prefijo: "V", prioridad: "media" };

function nombreDe(r: Receptor | Form): string {
  return (r.nombre?.trim() || r.razon_social?.trim() || "Receptor sin nombre");
}
function fiscalDe(r: Receptor | Form): string | null {
  return r.id_fiscal_prefijo && r.id_fiscal_numero ? `${r.id_fiscal_prefijo}-${r.id_fiscal_numero}` : null;
}

export function Receptores({ inicial }: { inicial: Receptor[] }) {
  const [lista, setLista] = useState<Receptor[]>(inicial);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Form | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const filtrada = useMemo(() => {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return lista;
    return lista.filter((r) => {
      const hay = norm([r.nombre, r.razon_social, r.id_fiscal_prefijo, r.id_fiscal_numero, r.ubicacion_estado, r.ubicacion_direccion].filter(Boolean).join(" "));
      return toks.every((t) => hay.includes(t));
    });
  }, [lista, q]);

  const abrirNuevo = () => setEditando({ ...VACIO });
  const abrirEditar = (r: Receptor) => setEditando({ ...r });
  const set = (k: keyof Receptor, v: any) => setEditando((f) => (f ? { ...f, [k]: v } : f));

  // Autocompleta si ya existe un receptor con esa identificación fiscal (evita duplicar).
  async function chequearFiscal() {
    if (!editando || editando.id || !editando.id_fiscal_prefijo || !editando.id_fiscal_numero?.trim()) return;
    const dup = await buscarReceptorPorFiscal(editando.id_fiscal_prefijo, editando.id_fiscal_numero.trim());
    if (dup) {
      toast.info("Ya existe un receptor con esa identificación. Cargamos sus datos para editar.");
      setEditando({ ...dup });
    }
  }

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    const r = editando.id
      ? await actualizarReceptor(editando.id, editando)
      : await crearReceptor(editando);
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    const rec = (r as any).receptor as Receptor;
    setLista((prev) => {
      const existe = prev.some((x) => x.id === rec.id);
      return existe ? prev.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...prev];
    });
    toast.success(editando.id ? "Receptor actualizado." : "Receptor creado.");
    setEditando(null);
  }

  async function borrar(id: string) {
    setEliminando(id);
    const r = await eliminarReceptor(id);
    setEliminando(null);
    if (!r.ok) { toast.error(r.error); return; }
    setLista((prev) => prev.filter((x) => x.id !== id));
    toast.success("Receptor eliminado.");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Asignar receptor a una entrega por código */}
      <AsignarPanel receptores={lista} />

      {/* Lista + búsqueda */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Receptores ({lista.length})</h2>
          <Button onClick={abrirNuevo} size="lg"><Plus /> Nuevo</Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            type="search" aria-label="Buscar receptor"
            placeholder="Buscar por nombre, identificación o ubicación…"
            className="w-full h-11 pl-9 pr-3 rounded-xl border bg-background text-base"
          />
        </div>

        {filtrada.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            {lista.length === 0 ? "Aún no hay receptores registrados." : "Sin resultados con esa búsqueda."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtrada.map((r) => {
              const prio = PRIO[r.prioridad ?? "media"] ?? PRIO.media;
              const fiscal = fiscalDe(r);
              return (
                <li key={r.id} className="rounded-2xl border bg-card p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight truncate">{nombreDe(r)}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {fiscal && <span>ID: {fiscal}</span>}
                        {r.ubicacion_estado && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" />{r.ubicacion_estado}</span>}
                        {r.tamano_personas != null && <span className="inline-flex items-center gap-0.5"><Users className="size-3" />{r.tamano_personas}</span>}
                      </div>
                    </div>
                    <Badge variant={prio.variant} className="shrink-0">{prio.label}</Badge>
                  </div>
                  {(r.ubicacion_direccion || r.responsable_nombre) && (
                    <p className="text-xs text-muted-foreground">
                      {r.ubicacion_direccion}
                      {r.ubicacion_direccion && r.responsable_nombre ? " · " : ""}
                      {r.responsable_nombre && `Responsable: ${r.responsable_nombre}`}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => abrirEditar(r)}><Pencil /> Editar</Button>
                    <Button variant="destructive" size="sm" disabled={eliminando === r.id} onClick={() => borrar(r.id)}>
                      <Trash2 /> {eliminando === r.id ? "Eliminando…" : "Eliminar"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Formulario crear/editar */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar receptor" : "Nuevo receptor"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="flex flex-col gap-3 max-h-[65vh] overflow-auto pr-1">
              <Campo label="Identificación fiscal">
                <div className="flex gap-2">
                  <div className="w-28 shrink-0">
                    <SearchableSelect
                      options={PREFIJOS}
                      value={editando.id_fiscal_prefijo ?? null}
                      onChange={(v) => set("id_fiscal_prefijo", v)}
                      placeholder="Tipo"
                    />
                  </div>
                  <Input
                    value={editando.id_fiscal_numero ?? ""}
                    onChange={(e) => set("id_fiscal_numero", e.target.value)}
                    onBlur={chequearFiscal}
                    inputMode="numeric" placeholder="Número"
                  />
                </div>
              </Campo>

              <Campo label="Nombre / persona">
                <Input value={editando.nombre ?? ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre del beneficiario" />
              </Campo>
              <Campo label="Razón social (institución/comunidad)">
                <Input value={editando.razon_social ?? ""} onChange={(e) => set("razon_social", e.target.value)} placeholder="Ej. Comunidad El Valle" />
              </Campo>

              <Campo label="WhatsApp">
                <div className="flex gap-2">
                  <Input className="w-24 shrink-0" value={editando.whatsapp_prefijo ?? ""} onChange={(e) => set("whatsapp_prefijo", e.target.value)} placeholder="+58" />
                  <Input value={editando.whatsapp_numero ?? ""} onChange={(e) => set("whatsapp_numero", e.target.value)} inputMode="tel" placeholder="Número" />
                </div>
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Estado / zona">
                  <Input value={editando.ubicacion_estado ?? ""} onChange={(e) => set("ubicacion_estado", e.target.value)} placeholder="Estado" />
                </Campo>
                <Campo label="Personas">
                  <Input type="number" min={0} value={editando.tamano_personas ?? ""} onChange={(e) => set("tamano_personas", e.target.value === "" ? null : Number(e.target.value))} placeholder="0" />
                </Campo>
              </div>
              <Campo label="Dirección">
                <Input value={editando.ubicacion_direccion ?? ""} onChange={(e) => set("ubicacion_direccion", e.target.value)} placeholder="Dirección" />
              </Campo>

              <Campo label="Prioridad">
                <SearchableSelect
                  options={PRIO_OPCIONES}
                  value={editando.prioridad ?? "media"}
                  onChange={(v) => set("prioridad", v ?? "media")}
                  placeholder="Prioridad"
                />
              </Campo>

              <div className="grid grid-cols-1 gap-3 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">Responsable de recepción</p>
                <Campo label="Nombre">
                  <Input value={editando.responsable_nombre ?? ""} onChange={(e) => set("responsable_nombre", e.target.value)} placeholder="Nombre" />
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Correo">
                    <Input type="email" value={editando.responsable_correo ?? ""} onChange={(e) => set("responsable_correo", e.target.value)} placeholder="correo@ej.com" />
                  </Campo>
                  <Campo label="WhatsApp">
                    <Input value={editando.responsable_whatsapp ?? ""} onChange={(e) => set("responsable_whatsapp", e.target.value)} inputMode="tel" placeholder="Número" />
                  </Campo>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// Asigna un receptor final a una entrega existente por su código rastreable.
function AsignarPanel({ receptores }: { receptores: Receptor[] }) {
  const [codigo, setCodigo] = useState("");
  const [receptorId, setReceptorId] = useState<string | null>(null);
  const [asignando, setAsignando] = useState(false);

  const opciones = useMemo(
    () => receptores.map((r) => ({
      value: r.id,
      label: nombreDe(r),
      keywords: [fiscalDe(r), r.ubicacion_estado].filter(Boolean).join(" "),
    })),
    [receptores]
  );

  async function asignar() {
    if (!codigo.trim()) { toast.error("Escribe el código de la entrega."); return; }
    if (!receptorId) { toast.error("Elige el receptor final."); return; }
    setAsignando(true);
    const r = await asignarReceptorAEntrega(codigo.trim(), receptorId);
    setAsignando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Receptor asignado a la entrega.");
    setCodigo("");
    setReceptorId(null);
  }

  return (
    <section className="rounded-2xl border bg-card p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Asignar receptor a una entrega</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Escribe el código de una entrega existente y elige a quién se despachó finalmente.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Código de entrega">
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Ej. AB2C3D" className="uppercase" />
        </Campo>
        <Campo label="Receptor final">
          <SearchableSelect options={opciones} value={receptorId} onChange={setReceptorId} placeholder="Elige un receptor…" />
        </Campo>
      </div>
      <div>
        <Button onClick={asignar} disabled={asignando}>{asignando ? "Asignando…" : "Asignar receptor"}</Button>
      </div>
    </section>
  );
}
