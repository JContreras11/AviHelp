import { redirect } from "next/navigation";

// "Mis donaciones" se unificó dentro del módulo /donaciones.
export default function MisDonacionesRedirect() {
  redirect("/donaciones");
}
