"use server";

// Búsqueda en FUENTES EXTERNAS de personas (ingresados en hospitales / desaparecidos).
// Se consulta EN VIVO cuando no tenemos el dato local. Solo lectura, uso humanitario.
// La anon key de hospitalesenvenezuela.com va embebida en su propio cliente público.

const HEV_URL = "https://ozuxfepfkvnxkywdsqxy.supabase.co";
const HEV_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dXhmZXBma3ZueGt5d2RzcXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjI5NTEsImV4cCI6MjA5Nzk5ODk1MX0.YhW0GalGkQZdO2NJTg_01C5XhdMmJ6RbNSNXXC0xG4o";
const HEV_SITE = "https://hospitalesenvenezuela.com/";
const VTB_SITE = "https://venezuelatebusca.com/";

export type ResultadoExterno = {
  fuente: string;
  nombre: string;
  detalle?: string | null;   // edad / zona
  centro?: string | null;    // hospital
  ciudad?: string | null;
  cedula?: string | null;
  registrado?: string | null;
  url: string;               // a dónde ir a ver/confirmar
};

// hospitalesenvenezuela.com — ingresados en hospitales (RPC pública buscar_paciente).
async function buscarHEV(term: string): Promise<ResultadoExterno[]> {
  try {
    const r = await fetch(`${HEV_URL}/rest/v1/rpc/buscar_paciente`, {
      method: "POST",
      headers: { apikey: HEV_ANON, Authorization: `Bearer ${HEV_ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_term: term }),
      cache: "no-store",
    });
    if (!r.ok) return [];
    const data = (await r.json()) as any[];
    return (data ?? []).slice(0, 8).map((p) => ({
      fuente: "Hospitales en Venezuela",
      nombre: p.nombre, detalle: p.detalle, centro: p.centro, ciudad: p.ciudad,
      cedula: p.cedula, registrado: p.registrado, url: HEV_SITE,
    }));
  } catch { return []; }
}

// Busca en todas las fuentes externas + arma los enlaces de referencia (clicables).
export async function buscarExterno(term: string): Promise<{ resultados: ResultadoExterno[]; enlaces: { titulo: string; url: string }[] }> {
  const q = term?.trim();
  if (!q) return { resultados: [], enlaces: [] };
  const [hev] = await Promise.all([buscarHEV(q)]);
  const enlaces = [
    { titulo: "Hospitales en Venezuela (ingresados)", url: HEV_SITE },
    { titulo: "Venezuela te busca (desaparecidos)", url: `${VTB_SITE}?query=${encodeURIComponent(q)}` },
  ];
  return { resultados: hev, enlaces };
}
