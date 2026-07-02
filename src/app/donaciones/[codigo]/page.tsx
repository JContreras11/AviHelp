import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDonacionPublica } from "@/app/actions/entregas";
import { CompartirDonacion } from "@/components/donaciones/CompartirDonacion";
import { CopyableText } from "@/components/donaciones/CopyableText";
import { MapaRuta } from "@/components/refugios/MapaRuta";
import { rubricaDonacion, emojiRubrica, nombreDonacion } from "../rubrica";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, { label: string; cls: string; emoji: string }> = {
  registrada:        { label: "Registrada", cls: "bg-sky-100 text-sky-700", emoji: "📝" },
  en_camino_acopio:  { label: "En camino al acopio", cls: "bg-amber-100 text-amber-700", emoji: "🚚" },
  en_acopio:         { label: "En el centro de acopio", cls: "bg-purple-100 text-purple-700", emoji: "📦" },
  en_camino_hospital:{ label: "En camino al hospital", cls: "bg-amber-100 text-amber-700", emoji: "🚚" },
  recibido:          { label: "Recibida y confirmada", cls: "bg-emerald-100 text-emerald-700", emoji: "✅" },
  rechazado:         { label: "No recibida", cls: "bg-red-100 text-red-700", emoji: "⚠️" },
  cancelado:         { label: "Cancelada", cls: "bg-muted text-muted-foreground", emoji: "✖️" },
  // compat con valores viejos
  pendiente:         { label: "Registrada", cls: "bg-sky-100 text-sky-700", emoji: "📝" },
  en_transito:       { label: "En camino al hospital", cls: "bg-amber-100 text-amber-700", emoji: "🚚" },
};
// Progreso 0..3 por estado + etiquetas de la línea de tiempo (4 hitos del ciclo).
const ORDEN: Record<string, number> = { registrada: 0, pendiente: 0, en_camino_acopio: 0, en_acopio: 1, en_camino_hospital: 2, en_transito: 2, recibido: 3 };
const PASOS = [
  { k: "registrada", label: "Registrada" },
  { k: "en_acopio", label: "En acopio" },
  { k: "en_camino_hospital", label: "En camino" },
  { k: "recibido", label: "Recibida" },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }): Promise<Metadata> {
  const { codigo } = await params;
  const d = await getDonacionPublica(codigo);
  if (!d) return { title: "Donación — AviHelp" };
  const t = `Donación ${codigo} — ${ESTADO[d.estado]?.label ?? "en proceso"}`;
  return { title: t, description: `Estado de la donación ${d.oferta?.descripcion ?? ""} en AviHelp.`, openGraph: { title: t } };
}

export default async function EstadoDonacion({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const d = await getDonacionPublica(codigo);
  if (!d) notFound();
  const e = ESTADO[d.estado] ?? ESTADO.registrada;
  const pasoActual = ORDEN[d.estado] ?? 0;
  // FIX 10: nombre del donante + rúbrica; código como subtexto copiable (también el nombre).
  const rubrica = rubricaDonacion(d.oferta?.tipo, `${d.oferta?.descripcion ?? ""} ${d.area ?? ""}`);
  const donante = nombreDonacion(d.oferta?.contacto_nombre ?? null);
  // FIX 5: voluntariado usa lenguaje de PRESENTARSE, no de entrega física.
  const esVol = d.oferta?.tipo === "personal_humano";

  return (
    <main className="min-h-screen px-4 py-8 max-w-lg mx-auto w-full flex flex-col gap-5">
      <header className="text-center flex flex-col items-center gap-1">
        <span className="text-3xl">{emojiRubrica(rubrica)}</span>
        <h1 className="text-xl font-bold"><CopyableText value={donante} /></h1>
        <p className="text-xs text-muted-foreground">{rubrica} · <CopyableText value={codigo} mono className="text-[11px]" /></p>
        <span className={`mt-1 px-2.5 py-0.5 rounded-full text-sm font-semibold ${e.cls}`}>{e.emoji} {e.label}</span>
      </header>

      {/* Línea de tiempo de trazabilidad */}
      {d.estado !== "rechazado" && d.estado !== "cancelado" && (
        <ol className="flex items-center gap-1">
          {PASOS.map((p, i) => {
            const hecho = pasoActual >= i;
            return (
              <li key={p.k} className="flex-1 flex flex-col items-center gap-1">
                <div className={`size-7 grid place-items-center rounded-full text-xs font-bold ${hecho ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
                <span className={`text-[11px] text-center ${hecho ? "text-foreground" : "text-muted-foreground"}`}>{p.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      <section className="rounded-2xl border p-4 flex flex-col gap-2 text-sm">
        {d.oferta && <p><span className="text-muted-foreground">{esVol ? "Ofrecimiento:" : "Qué:"}</span> <span className="font-medium capitalize">{d.oferta.descripcion}</span>{d.cantidad ? ` · ${d.cantidad}` : ""}</p>}
        {d.insumo?.nombre && <p><span className="text-muted-foreground">Cubre necesidad:</span> <span className="font-medium">{d.insumo.nombre}</span>{d.area ? ` · ${d.area}` : ""}</p>}
        {d.hospital?.nombre && <p><span className="text-muted-foreground">Hospital:</span> <span className="font-medium">{d.hospital.nombre}</span>{d.hospital.ubicacion ? ` — ${d.hospital.ubicacion}` : ""}</p>}
        {d.oferta?.created_at && <p className="text-xs text-muted-foreground">Registrada el {new Date(d.oferta.created_at).toLocaleDateString("es-VE")}</p>}
      </section>

      {/* FIX 7: lugar seleccionado + mapa + Cómo llegar (mismo trato para donación física y voluntariado). */}
      {d.refugio?.nombre && (
        <section className="rounded-2xl border p-4 flex flex-col gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{esVol ? "Dónde vas a ayudar" : "Punto de entrega"}</p>
            <p className="font-medium">{esVol ? "🩺" : "📦"} {d.refugio.nombre}{d.refugio.ubicacion ? ` — ${d.refugio.ubicacion}` : ""}</p>
          </div>
          {d.refugio.gps_lat != null && d.refugio.gps_lng != null ? (
            <>
              <MapaRuta destino={{ nombre: d.refugio.nombre, gps_lat: d.refugio.gps_lat, gps_lng: d.refugio.gps_lng }} />
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${d.refugio.gps_lat},${d.refugio.gps_lng}`} target="_blank" rel="noreferrer"
                className="text-center rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted">🧭 Cómo llegar</a>
            </>
          ) : (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.refugio.nombre} ${d.refugio.ubicacion ?? ""} Venezuela`)}`} target="_blank" rel="noreferrer"
              className="text-center rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted">🗺️ Ver en el mapa</a>
          )}
        </section>
      )}

      {/* Evidencia de la recepción (trazabilidad cerrada) */}
      {d.estado === "recibido" && (
        <section className="rounded-2xl border bg-emerald-50 p-4 flex flex-col gap-2 text-sm">
          <p className="font-semibold text-emerald-800">✅ Recepción confirmada</p>
          {d.recibido_por_nombre && <p><span className="text-muted-foreground">Recibió:</span> {d.recibido_por_nombre}</p>}
          {d.recibido_at && <p><span className="text-muted-foreground">Cuándo:</span> {new Date(d.recibido_at).toLocaleString("es-VE")}</p>}
          {d.lugar && <p><span className="text-muted-foreground">Dónde:</span> {d.lugar}</p>}
          {d.nota && <p className="text-muted-foreground italic">“{d.nota}”</p>}
          {d.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.foto_url} alt="Foto de la recepción" className="rounded-lg border w-full object-cover max-h-72" />
          )}
        </section>
      )}

      {d.estado === "rechazado" && (
        <p className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">El centro indicó que esta donación no fue recibida{d.nota ? `: “${d.nota}”` : "."}. Si crees que es un error, contáctanos.</p>
      )}

      <div className="flex flex-col gap-2">
        <CompartirDonacion codigo={codigo} />
        {!["recibido", "rechazado", "cancelado"].includes(d.estado) && (
          <Link href={`/donaciones/recibir/${codigo}`} className="text-center rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted">
            🏥 ¿Eres del hospital? Confirmar recepción
          </Link>
        )}
        <Link href="/donaciones/crear" className="text-center rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted">{esVol ? "🩺 Ofrecer más ayuda" : "💜 Donar algo más"}</Link>
        <Link href="/donaciones" className="text-center text-sm text-primary underline">Ir a mis donaciones</Link>
      </div>
      <p className="text-center text-xs text-muted-foreground">AviHelp — trazabilidad de la ayuda.</p>
    </main>
  );
}
