import { redirect } from "next/navigation";

// La gestión de personas quedó desactivada: esta plataforma ahora solo gestiona
// donaciones, inventario y distribución. Mantenemos la ruta para no romper enlaces
// viejos, pero redirige al inicio. El componente/datos de desaparecidos NO se borra.
export const dynamic = "force-dynamic";

export default function DesaparecidosPage() {
  redirect("/");
}
