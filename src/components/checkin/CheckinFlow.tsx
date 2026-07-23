"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  buscarDonantePorFiscal,
  crearDonante,
} from "@/app/actions/catalogo";
import {
  crearIngreso,
  listarIngresos,
  getIngreso,
  extraerDeFoto,
  extraerDeAudio,
  type ItemIngreso,
} from "@/app/actions/checkin";

// ── Tipos locales (no dependen de tipos exportados por otras lanes) ──
type Categoria = { id: string; nombre: string; orden: number };
type Centro = { id: string; nombre: string };
type Item = {
  nombre: string;
  cantidad: string;
  unidad: string;
  presentacion: string;
};
type Donante = {
  id: string;
  nombre?: string | null;
  apellido?: string | null;
  razon_social?: string | null;
} | null;

const PREFIJOS_FISCAL = [
  { value: "V", label: "V — Venezolano" },
  { value: "E", label: "E — Extranjero" },
  { value: "J", label: "J — Jurídico (empresa)" },
  { value: "G", label: "G — Gobierno" },
  { value: "P", label: "P — Pasaporte" },
];
const PREFIJOS_WA = [
  { value: "+58", label: "🇻🇪 +58" },
  { value: "+57", label: "🇨🇴 +57" },
  { value: "+1", label: "🇺🇸 +1" },
  { value: "+34", label: "🇪🇸 +34" },
  { value: "+55", label: "🇧🇷 +55" },
];

const itemVacio = (): Item => ({ nombre: "", cantidad: "", unidad: "", presentacion: "" });

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-VE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CheckinFlow({
  categorias,
  centros,
  esAdmin,
}: {
  categorias: Categoria[];
  centros: Centro[];
  esAdmin: boolean;
}) {
  const [tab, setTab] = React.useState<"registrar" | "auditoria">("registrar");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList className="mb-4">
        <TabsTrigger value="registrar">Registrar</TabsTrigger>
        <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
      </TabsList>
      <TabsContent value="registrar">
        <Registrar categorias={categorias} centros={centros} esAdmin={esAdmin} />
      </TabsContent>
      <TabsContent value="auditoria">
        <Auditoria categorias={categorias} />
      </TabsContent>
    </Tabs>
  );
}

// ─────────────────────────────────────────────────────────────
// FLUJO DE REGISTRO (wizard de 6 pasos)
// ─────────────────────────────────────────────────────────────
function Registrar({
  categorias,
  centros,
  esAdmin,
}: {
  categorias: Categoria[];
  centros: Centro[];
  esAdmin: boolean;
}) {
  // paso: 0 donante · 1 categorías · 2..(1+N) detalle por categoría · confirmación aparte
  const [paso, setPaso] = React.useState(0);
  const [enviando, setEnviando] = React.useState(false);

  // ── Donante ──
  const [prefijo, setPrefijo] = React.useState<string | null>("V");
  const [numero, setNumero] = React.useState("");
  const [buscando, setBuscando] = React.useState(false);
  const [donante, setDonante] = React.useState<Donante>(null);
  const [esOrg, setEsOrg] = React.useState(false);
  const [nombre, setNombre] = React.useState("");
  const [apellido, setApellido] = React.useState("");
  const [razonSocial, setRazonSocial] = React.useState("");
  const [waPrefijo, setWaPrefijo] = React.useState<string | null>("+58");
  const [waNumero, setWaNumero] = React.useState("");

  // ── Categorías + centro ──
  const [catsSel, setCatsSel] = React.useState<string[]>([]);
  const [centroId, setCentroId] = React.useState<string | null>(
    centros.length === 1 ? centros[0].id : null,
  );
  const [detalle, setDetalle] = React.useState("");

  // ── Ítems por categoría ──
  const [itemsPorCat, setItemsPorCat] = React.useState<Record<string, Item[]>>({});
  const [mediaPaths, setMediaPaths] = React.useState<{
    foto_path?: string | null;
    audio_path?: string | null;
    doc_path?: string | null;
  }>({});
  const [raw, setRaw] = React.useState<any>(null);

  // ── Resultado ──
  const [resultado, setResultado] = React.useState<{ id: string; created_at: string; items: number } | null>(null);

  const catsOrdenadas = React.useMemo(
    () => categorias.filter((c) => catsSel.includes(c.id)),
    [categorias, catsSel],
  );
  const totalPasos = 2 + catsOrdenadas.length;
  const catActual = paso >= 2 ? catsOrdenadas[paso - 2] : null;

  async function resolverDonante() {
    if (!prefijo || !numero.trim()) {
      setDonante(null);
      return;
    }
    setBuscando(true);
    try {
      const d = (await buscarDonantePorFiscal(prefijo, numero.trim())) as Donante;
      setDonante(d ?? null);
      if (d) {
        setEsOrg(!!d.razon_social);
        setNombre(d.nombre ?? "");
        setApellido(d.apellido ?? "");
        setRazonSocial(d.razon_social ?? "");
      }
    } catch {
      /* búsqueda best-effort */
    } finally {
      setBuscando(false);
    }
  }

  function setItems(catId: string, items: Item[]) {
    setItemsPorCat((prev) => ({ ...prev, [catId]: items }));
  }

  async function avanzarDonante() {
    // Si escribió una cédula/RIF nueva sin nombre, crea el donante ahora.
    if (numero.trim() && !donante) {
      if (!nombre.trim() && !razonSocial.trim()) {
        toast.error("Indica el nombre o razón social del donante.");
        return;
      }
      const r = await crearDonante({
        id_fiscal_prefijo: prefijo,
        id_fiscal_numero: numero.trim(),
        nombre: esOrg ? null : nombre.trim() || null,
        apellido: esOrg ? null : apellido.trim() || null,
        razon_social: esOrg ? razonSocial.trim() || null : null,
        whatsapp_prefijo: waNumero.trim() ? waPrefijo : null,
        whatsapp_numero: waNumero.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setDonante(r.donante as Donante);
    }
    setPaso(1);
  }

  async function enviar() {
    setEnviando(true);
    try {
      const items: ItemIngreso[] = [];
      for (const c of catsOrdenadas) {
        for (const it of itemsPorCat[c.id] ?? []) {
          if (!it.nombre.trim()) continue;
          items.push({
            categoria_id: c.id,
            nombre: it.nombre.trim(),
            cantidad: it.cantidad ? Number(it.cantidad) : null,
            unidad: it.unidad.trim() || null,
            presentacion: it.presentacion.trim() || null,
          });
        }
      }
      if (items.length === 0) {
        toast.error("Agrega al menos un ítem recibido.");
        setEnviando(false);
        return;
      }
      const r = await crearIngreso({
        donante_id: donante?.id ?? null,
        centro_id: centroId,
        categorias: catsSel,
        detalle: detalle.trim() || null,
        foto_path: mediaPaths.foto_path ?? null,
        audio_path: mediaPaths.audio_path ?? null,
        doc_path: mediaPaths.doc_path ?? null,
        raw_extraccion: raw,
        items,
      });
      if (!r.ok) {
        toast.error(r.error);
        setEnviando(false);
        return;
      }
      setResultado({ id: r.id, created_at: r.created_at, items: r.items });
    } finally {
      setEnviando(false);
    }
  }

  function reiniciar() {
    setResultado(null);
    setPaso(0);
    setPrefijo("V");
    setNumero("");
    setDonante(null);
    setEsOrg(false);
    setNombre("");
    setApellido("");
    setRazonSocial("");
    setWaPrefijo("+58");
    setWaNumero("");
    setCatsSel([]);
    setDetalle("");
    setItemsPorCat({});
    setMediaPaths({});
    setRaw(null);
  }

  // ── PASO 5: Confirmación ──
  if (resultado) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-4">
          <div className="text-4xl">✅</div>
          <div>
            <p className="font-semibold text-lg">Recepción registrada</p>
            <p className="text-sm text-muted-foreground">
              {resultado.items} ítem{resultado.items === 1 ? "" : "s"} en inventario (por revisar).
            </p>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">ID del ingreso</div>
            <div className="font-mono break-all">{resultado.id}</div>
            <div className="mt-2 text-muted-foreground text-xs uppercase tracking-wide">Fecha y hora</div>
            <div>{fmtFecha(resultado.created_at)}</div>
          </div>
          <Button onClick={reiniciar} className="w-full">
            Registrar otra recepción
          </Button>
        </CardContent>
      </Card>
    );
  }

  const donanteLabel = donante
    ? donante.razon_social || [donante.nombre, donante.apellido].filter(Boolean).join(" ")
    : null;

  return (
    <div className="space-y-4">
      {/* Progreso */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalPasos }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= paso ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Paso {paso + 1} de {totalPasos}
      </p>

      {/* PASO 0 — DONANTE */}
      {paso === 0 && (
        <Card>
          <CardContent className="py-5 space-y-4">
            <div>
              <h2 className="font-semibold mb-1">Donante</h2>
              <p className="text-xs text-muted-foreground">Cédula o RIF de quien entrega. Opcional.</p>
            </div>
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <SearchableSelect
                options={PREFIJOS_FISCAL}
                value={prefijo}
                onChange={setPrefijo}
                placeholder="Tipo"
              />
              <Input
                inputMode="numeric"
                placeholder="Número"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                onBlur={resolverDonante}
              />
            </div>

            {buscando && <p className="text-xs text-muted-foreground">Buscando…</p>}

            {donante ? (
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Donante registrado</div>
                <div className="font-medium">{donanteLabel || "(sin nombre)"}</div>
                <Badge className="mt-1">Existente</Badge>
              </div>
            ) : numero.trim() ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={esOrg}
                    onChange={(e) => setEsOrg(e.target.checked)}
                  />
                  Es una empresa / organización
                </label>
                {esOrg ? (
                  <Input
                    placeholder="Razón social"
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Nombre"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                    />
                    <Input
                      placeholder="Apellido"
                      value={apellido}
                      onChange={(e) => setApellido(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">WhatsApp (opcional)</div>
                  <div className="grid grid-cols-[7rem_1fr] gap-2">
                    <SearchableSelect
                      options={PREFIJOS_WA}
                      value={waPrefijo}
                      onChange={setWaPrefijo}
                      placeholder="Cód."
                    />
                    <Input
                      inputMode="numeric"
                      placeholder="Número"
                      value={waNumero}
                      onChange={(e) => setWaNumero(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <Button className="w-full" onClick={avanzarDonante}>
              Siguiente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* PASO 1 — CATEGORÍAS + CENTRO */}
      {paso === 1 && (
        <Card>
          <CardContent className="py-5 space-y-4">
            <div>
              <h2 className="font-semibold mb-1">¿Qué se recibió?</h2>
              <p className="text-xs text-muted-foreground">Marca las categorías que aplican.</p>
            </div>

            {(esAdmin || centros.length > 1) && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Centro de acopio</div>
                <SearchableSelect
                  options={centros.map((c) => ({ value: c.id, label: c.nombre }))}
                  value={centroId}
                  onChange={setCentroId}
                  placeholder="Selecciona el centro…"
                />
              </div>
            )}

            <div className="space-y-2">
              {categorias.map((c) => {
                const on = catsSel.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer ${
                      on ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setCatsSel((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                        )
                      }
                    />
                    <span className="text-sm font-medium">{c.nombre}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPaso(0)}>
                Atrás
              </Button>
              <Button
                className="flex-1"
                disabled={catsSel.length === 0}
                onClick={() => setPaso(2)}
              >
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PASOS 2..N — DETALLE POR CATEGORÍA */}
      {catActual && (
        <DetalleCategoria
          key={catActual.id}
          categoria={catActual}
          indice={paso - 1}
          total={catsOrdenadas.length}
          items={itemsPorCat[catActual.id] ?? [itemVacio()]}
          onItems={(its) => setItems(catActual.id, its)}
          onMedia={(m, r) => {
            setMediaPaths((prev) => ({ ...prev, ...m }));
            if (r) setRaw(r);
          }}
          detalle={detalle}
          onDetalle={setDetalle}
          esUltima={paso === totalPasos - 1}
          onAtras={() => setPaso(paso - 1)}
          onSiguiente={() => setPaso(paso + 1)}
          onEnviar={enviar}
          enviando={enviando}
        />
      )}
    </div>
  );
}

// ── Un paso de detalle por categoría ──
function DetalleCategoria({
  categoria,
  indice,
  total,
  items,
  onItems,
  onMedia,
  detalle,
  onDetalle,
  esUltima,
  onAtras,
  onSiguiente,
  onEnviar,
  enviando,
}: {
  categoria: Categoria;
  indice: number;
  total: number;
  items: Item[];
  onItems: (its: Item[]) => void;
  onMedia: (
    m: { foto_path?: string | null; audio_path?: string | null; doc_path?: string | null },
    raw?: any,
  ) => void;
  detalle: string;
  onDetalle: (v: string) => void;
  esUltima: boolean;
  onAtras: () => void;
  onSiguiente: () => void;
  onEnviar: () => void;
  enviando: boolean;
}) {
  const [analizando, setAnalizando] = React.useState(false);
  const fotoRef = React.useRef<HTMLInputElement>(null);
  const audioRef = React.useRef<HTMLInputElement>(null);

  const upd = (i: number, patch: Partial<Item>) =>
    onItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const agregar = () => onItems([...items, itemVacio()]);
  const quitar = (i: number) => onItems(items.length > 1 ? items.filter((_, j) => j !== i) : items);

  async function analizar(file: File, tipo: "foto" | "audio") {
    setAnalizando(true);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const res = tipo === "foto" ? await extraerDeFoto(fd) : await extraerDeAudio(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const nuevos: Item[] = res.items.map((x) => ({
        nombre: x.nombre,
        cantidad: x.cantidad != null ? String(x.cantidad) : "",
        unidad: x.unidad ?? "",
        presentacion: x.presentacion ?? "",
      }));
      const base = items.filter((it) => it.nombre.trim());
      onItems(nuevos.length ? [...base, ...nuevos] : items);
      onMedia(
        tipo === "foto" ? { foto_path: res.foto_path } : { audio_path: res.audio_path },
        res.raw,
      );
      toast.success(
        nuevos.length
          ? `${nuevos.length} ítem(s) sugerido(s), revísalos.`
          : "Archivo adjuntado.",
      );
    } finally {
      setAnalizando(false);
    }
  }

  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <div>
          <h2 className="font-semibold mb-1">{categoria.nombre}</h2>
          <p className="text-xs text-muted-foreground">
            Categoría {indice} de {total}. Añade cada ítem recibido.
          </p>
        </div>

        {/* Prefill por foto/audio */}
        <div className="flex gap-2">
          <input
            ref={fotoRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) analizar(f, "foto");
              e.target.value = "";
            }}
          />
          <input
            ref={audioRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) analizar(f, "audio");
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={analizando}
            onClick={() => fotoRef.current?.click()}
          >
            📷 Foto/Doc
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={analizando}
            onClick={() => audioRef.current?.click()}
          >
            🎙️ Audio
          </Button>
          {analizando && <span className="text-xs text-muted-foreground self-center">Analizando…</span>}
        </div>

        {/* Ítems */}
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Nombre del ítem"
                  value={it.nombre}
                  onChange={(e) => upd(i, { nombre: e.target.value })}
                  className="flex-1"
                />
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => quitar(i)}>
                    ✕
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="Cantidad"
                  value={it.cantidad}
                  onChange={(e) => upd(i, { cantidad: e.target.value })}
                />
                <Input
                  placeholder="Unidad"
                  value={it.unidad}
                  onChange={(e) => upd(i, { unidad: e.target.value })}
                />
                <Input
                  placeholder="Presentación"
                  value={it.presentacion}
                  onChange={(e) => upd(i, { presentacion: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={agregar} className="w-full">
          + Añadir ítem
        </Button>

        {esUltima && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Nota general (opcional)</div>
            <Textarea
              placeholder="Observaciones de la recepción…"
              value={detalle}
              onChange={(e) => onDetalle(e.target.value)}
              rows={2}
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onAtras}>
            Atrás
          </Button>
          {esUltima ? (
            <Button className="flex-1" onClick={onEnviar} disabled={enviando}>
              {enviando ? "Registrando…" : "Registrar recepción"}
            </Button>
          ) : (
            <Button className="flex-1" onClick={onSiguiente}>
              Siguiente
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// PASO 6 — AUDITORÍA
// ─────────────────────────────────────────────────────────────
function Auditoria({ categorias }: { categorias: Categoria[] }) {
  const catNombre = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categorias) m.set(c.id, c.nombre);
    return m;
  }, [categorias]);

  const [rows, setRows] = React.useState<any[]>([]);
  const [cargando, setCargando] = React.useState(false);
  const [desde, setDesde] = React.useState("");
  const [hasta, setHasta] = React.useState("");
  const [idFiltro, setIdFiltro] = React.useState("");
  const [detalle, setDetalle] = React.useState<any | null>(null);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      const r = await listarIngresos({
        desde: desde ? new Date(desde).toISOString() : undefined,
        hasta: hasta ? new Date(hasta + "T23:59:59").toISOString() : undefined,
        id: idFiltro.trim() || undefined,
      });
      setRows(r);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, idFiltro]);

  React.useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function abrir(id: string) {
    const d = await getIngreso(id);
    setDetalle(d);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Desde</div>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Hasta</div>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>
          <Input
            placeholder="Filtrar por ID de ingreso"
            value={idFiltro}
            onChange={(e) => setIdFiltro(e.target.value)}
          />
          <Button onClick={cargar} className="w-full" disabled={cargando}>
            {cargando ? "Buscando…" : "Aplicar filtros"}
          </Button>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {cargando ? "Cargando…" : "Sin recepciones registradas."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Fecha · Hora</th>
                <th className="p-2">ID</th>
                <th className="p-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t cursor-pointer hover:bg-muted/30"
                  onClick={() => abrir(r.id)}
                >
                  <td className="p-2 whitespace-nowrap">{fmtFecha(r.created_at)}</td>
                  <td className="p-2 font-mono text-xs">{r.id.slice(0, 8)}…</td>
                  <td className="p-2">
                    {r.donante_nombre ? <span className="font-medium">{r.donante_nombre} · </span> : null}
                    {r.detalle || `${r.items} ítem(s)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle de una recepción */}
      {detalle && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-2"
          onClick={() => setDetalle(null)}
        >
          <Card className="w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">Recepción</h3>
                  <p className="text-xs text-muted-foreground">{fmtFecha(detalle.ingreso.created_at)}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDetalle(null)}>
                  ✕
                </Button>
              </div>
              <div className="text-xs font-mono break-all text-muted-foreground">{detalle.ingreso.id}</div>
              {detalle.ingreso.donante_nombre && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Donante: </span>
                  {detalle.ingreso.donante_nombre}
                </div>
              )}
              {detalle.ingreso.detalle && <p className="text-sm">{detalle.ingreso.detalle}</p>}
              <div className="flex flex-wrap gap-1">
                {(detalle.ingreso.categorias ?? []).map((cid: string) => (
                  <Badge key={cid} variant="secondary">
                    {catNombre.get(cid) ?? cid}
                  </Badge>
                ))}
              </div>
              <div className="space-y-1.5">
                {detalle.items.map((it: any) => (
                  <div key={it.id} className="rounded border p-2 text-sm flex justify-between gap-2">
                    <span>{it.nombre}</span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {[it.cantidad, it.unidad, it.presentacion].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ))}
                {detalle.items.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin ítems.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
