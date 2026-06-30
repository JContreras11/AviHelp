import { redirect } from "next/navigation";

// El antiguo /ofrecer se migró al módulo de Donaciones (nunca "oferta" en URLs).
export default async function OfrecerRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const hospital = typeof sp.hospital === "string" ? sp.hospital : undefined;
  redirect(hospital ? `/donaciones/crear?hospital=${hospital}` : "/donaciones/crear");
}
