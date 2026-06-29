import Link from "next/link";
import { listarDesaparecidos } from "@/app/actions/listas";
import { Desaparecidos } from "@/components/desaparecidos/Desaparecidos";

export const metadata = { title: "Personas desaparecidas | AviHelp" };
export const dynamic = "force-dynamic";

export default async function DesaparecidosPage() {
  const personas = await listarDesaparecidos();

  return (
    <main className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">Personas desaparecidas</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Reportes de la comunidad. Si reconoces a alguien, contacta a quien lo reportó. ¿No aparece aquí? Pregúntale a <Link href="/chat" className="text-primary underline">Avi</Link>, que también busca en fuentes externas (hospitales y registros).
      </p>
      <Desaparecidos personas={personas} />
      <p className="text-xs text-muted-foreground mt-6 border-t pt-3">
        Datos aportados por la comunidad; AviHelp no garantiza su exactitud. Para denunciar o reportar un desaparecido también existen registros oficiales como venezuelatebusca.com.
      </p>
    </main>
  );
}
