import { redirect } from "next/navigation";
import { getSesion } from "@/lib/supabase/server";
import { NecesidadVista } from "@/components/NecesidadVista";

export const dynamic = "force-dynamic";

export default async function NecesidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSesion();
  if (!s) redirect(`/login?next=/necesidad/${id}`);
  return <main className="flex-1">{<NecesidadVista id={id} />}</main>;
}
