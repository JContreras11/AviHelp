import { createAdminClient } from "@/lib/supabase/server";
import { fechaHora } from "@/lib/format";
import { BotonImprimir } from "./BotonImprimir";

export const dynamic = "force-dynamic";

const PRIO_ORD: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

// Vista limpia, lista para imprimir o guardar como PDF (Ctrl/Cmd+P).
export default async function PrintHospital({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = createAdminClient();
  const [{ data: hospital }, { data: insumos }] = await Promise.all([
    s.from("hospitales").select("*").eq("id", id).single(),
    s.from("insumos").select("nombre,cantidad,unidad,presentacion,area,prioridad")
      .eq("hospital_id", id).in("estado", ["solicitado", "en_transito"]),
  ]);

  if (!hospital) return <main className="p-8">Hospital no encontrado.</main>;

  const lista = insumos ?? [];
  const porArea = lista.reduce((acc: Record<string, any[]>, i: any) => {
    (acc[i.area || "General"] ??= []).push(i); return acc;
  }, {});

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 1.5cm; } }`}</style>

      <div className="no-print mb-4 flex justify-end"><BotonImprimir /></div>

      <header className="border-b-2 border-black pb-2 mb-4">
        <h1 className="text-2xl font-bold">Lista de insumos requeridos</h1>
        <p className="text-lg">🏥 {hospital.nombre}{hospital.ubicacion ? ` — ${hospital.ubicacion}` : ""}</p>
        <p className="text-sm">Actualizado: {fechaHora(new Date().toISOString())} · {lista.length} insumos pendientes</p>
      </header>

      {lista.length === 0 ? (
        <p>No hay insumos pendientes para este hospital.</p>
      ) : (
        Object.entries(porArea).map(([area, items]) => (
          <section key={area} className="mb-4 break-inside-avoid">
            <h2 className="text-base font-bold uppercase border-b border-gray-400 mb-1">{area}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-300">
                  <th className="py-1 w-8">#</th><th>Insumo</th><th>Cant.</th><th>Tipo</th><th>Prioridad</th><th className="w-24">Recibido</th>
                </tr>
              </thead>
              <tbody>
                {(items as any[])
                  .sort((a, b) => (PRIO_ORD[a.prioridad] ?? 9) - (PRIO_ORD[b.prioridad] ?? 9))
                  .map((i, n) => (
                    <tr key={n} className="border-b border-gray-200">
                      <td className="py-1">{n + 1}</td>
                      <td>{i.nombre}</td>
                      <td>{i.cantidad ?? ""}{i.unidad ? ` ${i.unidad}` : ""}</td>
                      <td>{i.presentacion ?? ""}</td>
                      <td className={i.prioridad === "critica" || i.prioridad === "alta" ? "font-bold" : ""}>{i.prioridad}</td>
                      <td>☐</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      <footer className="mt-8 text-xs text-gray-500 break-inside-avoid">
        Generado por AviHelp · {fechaHora(new Date().toISOString())}
        {hospital.responsable_recepcion_nombre && (
          <span> · Responsable de recepción: {hospital.responsable_recepcion_nombre}</span>
        )}
      </footer>
    </main>
  );
}
