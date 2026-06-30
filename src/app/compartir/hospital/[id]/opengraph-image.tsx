import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/server";
import { BrandOG, ogSize, ogContentType } from "@/lib/og";
import { tituloCompacto } from "@/lib/share";

export const alt = "Centro que necesita insumos médicos — AviHelp";
export const size = ogSize;
export const contentType = ogContentType;

export default async function OG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let nombre: string | null = null;
  let insumos: { nombre?: string | null }[] = [];
  try {
    const a = createAdminClient();
    const [{ data: h }, { data: ins }] = await Promise.all([
      a.from("hospitales").select("nombre").eq("id", id).maybeSingle(),
      a.from("insumos").select("nombre").eq("hospital_id", id).in("estado", ["solicitado", "en_transito"]).limit(5),
    ]);
    nombre = h?.nombre ?? null;
    insumos = ins ?? [];
  } catch {
    /* sin datos: usamos fallback */
  }
  const title = nombre ? tituloCompacto(nombre, insumos) : "Centro que necesita insumos médicos";

  return new ImageResponse(
    <BrandOG badge="Necesita insumos" title={title} subtitle="Ayuda a cubrir o comparte esta necesidad" />,
    { ...size },
  );
}
